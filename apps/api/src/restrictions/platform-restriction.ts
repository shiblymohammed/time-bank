import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  RoleGrantStatus,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { User } from '../identity/entities/user.entity';

export async function holdsSuperAdmin(m: EntityManager, userId: string): Promise<boolean> {
  const rows: unknown[] = await m.query(
    `SELECT 1 FROM membership_role_grants g
     JOIN organization_memberships om ON om.id = g.membership_id
     WHERE om.user_id = $1 AND g.role = $2 AND g.status = $3 LIMIT 1`,
    [userId, UserRole.SUPER_ADMIN, RoleGrantStatus.ACTIVE],
  );
  return rows.length > 0;
}

/** People who can act as Super Admin right now, leaving out a user or one grant. */
export async function countSuperAdmins(
  m: EntityManager,
  without: { userId?: string; grantId?: string },
): Promise<number> {
  const rows: { remaining: number }[] = await m.query(
    `SELECT COUNT(DISTINCT om.user_id)::int AS remaining
     FROM membership_role_grants g
     JOIN organization_memberships om ON om.id = g.membership_id
     JOIN users u ON u.id = om.user_id
     WHERE g.role = $1 AND g.status = $2 AND om.status = $3 AND u.status = $4
       AND ($5::uuid IS NULL OR om.user_id <> $5::uuid)
       AND ($6::uuid IS NULL OR g.id <> $6::uuid)
       AND NOT EXISTS (SELECT 1 FROM global_account_restrictions r
         WHERE r.user_id = u.id AND r.status = $7)`,
    [
      UserRole.SUPER_ADMIN,
      RoleGrantStatus.ACTIVE,
      MembershipStatus.APPROVED,
      AccountStatus.ACTIVE,
      without.userId ?? null,
      without.grantId ?? null,
      GlobalRestrictionStatus.ACTIVE,
    ],
  );
  return rows[0]?.remaining ?? 0;
}

/**
 * Refuses a change that would leave no one able to act as Super Admin. Changes are
 * taken one at a time, so two admins cannot remove each other at the same moment.
 */
export async function assertSuperAdminRemains(
  m: EntityManager,
  without: { userId?: string; grantId?: string },
): Promise<void> {
  await m.query(`SELECT pg_advisory_xact_lock(hashtext('ktb:super-admins'))`);
  if (!(await countSuperAdmins(m, without))) {
    throw new ConflictException(
      'This would leave no active Super Admin. Make someone else a Super Admin first.',
    );
  }
}

/** Blocks a person in every community. Money stops by itself while this row is active. */
export async function applyPlatformRestriction(
  m: EntityManager,
  audit: AuditService,
  params: {
    user: User;
    restrictionType: GlobalRestrictionType;
    reasonCode: string;
    actorId: string;
    ipAddress?: string | undefined;
  },
): Promise<GlobalAccountRestriction> {
  const { user, restrictionType, reasonCode, actorId, ipAddress } = params;
  if ([AccountStatus.DECEASED_CLOSED, AccountStatus.DUPLICATE_CLOSED].includes(user.status)) {
    throw new ConflictException(
      'This account is closed. Reopen the closure before restricting it.',
    );
  }
  // Every restriction type removes access, including a Super Admin's.
  if (await holdsSuperAdmin(m, user.id)) await assertSuperAdminRemains(m, { userId: user.id });

  const restrictions = m.getRepository(GlobalAccountRestriction);
  const saved = await restrictions.save(
    restrictions.create({
      userId: user.id,
      restrictionType,
      reasonCode,
      status: GlobalRestrictionStatus.ACTIVE,
      authorizedBy: actorId,
    }),
  );

  // A ban outranks a suspension already in place, never the other way round.
  if (restrictionType === GlobalRestrictionType.PERMANENT_BAN) {
    user.status = AccountStatus.PERMANENTLY_BANNED;
    await m.getRepository(User).save(user);
  } else if (
    restrictionType === GlobalRestrictionType.TEMPORARY_SUSPENSION &&
    user.status === AccountStatus.ACTIVE
  ) {
    user.status = AccountStatus.SUSPENDED;
    await m.getRepository(User).save(user);
  }
  // Stop push to the person's phones; they register again after signing back in.
  await m.query('DELETE FROM push_devices WHERE user_id = $1', [user.id]);

  await audit.logEvent(
    {
      eventType: 'GLOBAL_RESTRICTION_IMPOSED',
      actorId,
      targetId: saved.id,
      targetType: 'GLOBAL_ACCOUNT_RESTRICTION',
      ipAddress,
      payload: { userId: user.id, restrictionType, reasonCode },
    },
    m,
  );
  return saved;
}

/** Ends one restriction. Access comes back only if no other restriction is left. */
export async function liftPlatformRestriction(
  m: EntityManager,
  audit: AuditService,
  params: {
    restriction: GlobalAccountRestriction;
    status: GlobalRestrictionStatus.RESOLVED | GlobalRestrictionStatus.OVERTURNED_ON_APPEAL;
    actorId: string;
    notes: string;
    ipAddress?: string | undefined;
  },
): Promise<{ saved: GlobalAccountRestriction; accessRestored: boolean }> {
  const { restriction: requested, status, actorId, notes, ipAddress } = params;
  const users = m.getRepository(User);
  // Serialize reinstatement with closure/reopening, before changing restriction rows.
  const user = await users.findOne({
    where: { id: requested.userId },
    lock: { mode: 'for_no_key_update' },
  });
  const restrictions = m.getRepository(GlobalAccountRestriction);
  // Older callers may have read the row before entering this transaction. A
  // concurrent resolution must not rerun its audit and frozen-credit release.
  const restriction = await restrictions.findOne({
    where: { id: requested.id },
    lock: { mode: 'pessimistic_write' },
  });
  if (!restriction || restriction.status !== GlobalRestrictionStatus.ACTIVE) {
    throw new ConflictException('This restriction is no longer active');
  }
  restriction.status = status;
  restriction.resolvedAt = new Date();
  restriction.resolvedBy = actorId;
  restriction.resolutionNotes = notes;
  const saved = await restrictions.save(restriction);

  const remaining = await restrictions.count({
    where: { userId: restriction.userId, status: GlobalRestrictionStatus.ACTIVE },
  });
  if (user) {
    const blocked = [AccountStatus.SUSPENDED, AccountStatus.PERMANENTLY_BANNED].includes(
      user.status,
    );
    if (remaining === 0 && blocked) {
      user.status = AccountStatus.ACTIVE;
      await users.save(user);
    } else if (remaining > 0 && user.status === AccountStatus.PERMANENTLY_BANNED) {
      const bans = await restrictions.count({
        where: {
          userId: restriction.userId,
          status: GlobalRestrictionStatus.ACTIVE,
          restrictionType: GlobalRestrictionType.PERMANENT_BAN,
        },
      });
      if (bans === 0) {
        user.status = AccountStatus.SUSPENDED;
        await users.save(user);
      }
    }
  }

  await audit.logEvent(
    {
      eventType: 'GLOBAL_RESTRICTION_RESOLVED',
      actorId,
      targetId: saved.id,
      targetType: 'GLOBAL_ACCOUNT_RESTRICTION',
      ipAddress,
      payload: { userId: restriction.userId, status },
    },
    m,
  );
  return { saved, accessRestored: remaining === 0 };
}
