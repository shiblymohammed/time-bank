import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ProfilePhotoService } from '../identity/profile-photo.service';
import { CommunityService } from './community.service';

type Preferences = { displayName: string | null; sharePhoto: boolean; photoVersion?: string };

@Injectable()
export class CommunityVisibilityService {
  constructor(
    private readonly db: DataSource,
    private readonly community: CommunityService,
    private readonly photos: ProfilePhotoService,
    private readonly audit: AuditService,
  ) {}

  async settings(org: string, user: string) {
    const actor = await this.community.actor(org, user);
    const [row] = await this.db.query(
      `SELECT v.display_name AS "displayName",
        coalesce(v.shared_photo_id=u.profile_photo_id,false) AS "sharePhoto", u.profile_photo_id AS "photoVersion"
      FROM users u LEFT JOIN community_visibility v ON v.organization_id=$1 AND v.membership_id=$2
      WHERE u.id=$3`,
      [org, actor.membershipId, user],
    );
    return row;
  }

  async update(org: string, user: string, dto: Preferences) {
    const actor = await this.community.actor(org, user);
    const name = dto.displayName?.trim() ?? null;
    if (name === '' || (name !== null && /[\u0000-\u001f\u007f]/.test(name)))
      throw new BadRequestException('Enter a display name on one line');
    return this.db.transaction(async (manager) => {
      const [account] = await manager.query(
        'SELECT profile_photo_id FROM users WHERE id=$1 FOR UPDATE',
        [user],
      );
      if (!account) throw new NotFoundException('Member not found');
      if (
        dto.sharePhoto &&
        (!account.profile_photo_id || account.profile_photo_id !== dto.photoVersion)
      ) {
        throw new ConflictException(
          'Your profile photo changed. Refresh these settings and choose what to share again',
        );
      }
      const result = await manager.query(
        `INSERT INTO community_visibility(organization_id,membership_id,display_name,shared_photo_id)
        VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,membership_id) DO UPDATE
        SET display_name=EXCLUDED.display_name,shared_photo_id=EXCLUDED.shared_photo_id
        WHERE (community_visibility.display_name,community_visibility.shared_photo_id)
          IS DISTINCT FROM (EXCLUDED.display_name,EXCLUDED.shared_photo_id) RETURNING membership_id`,
        [org, actor.membershipId, name, dto.sharePhoto ? account.profile_photo_id : null],
      );
      if (result.length)
        await this.audit.logEvent(
          {
            eventType: 'COMMUNITY_VISIBILITY_UPDATED',
            actorId: user,
            organizationId: org,
            targetType: 'ORGANIZATION_MEMBERSHIP',
            targetId: actor.membershipId,
            payload: { sharesDisplayName: name !== null, sharesPhoto: dto.sharePhoto },
          },
          manager,
        );
      return {
        displayName: name,
        sharePhoto: dto.sharePhoto,
        photoVersion: account.profile_photo_id,
      };
    });
  }

  async photo(org: string, user: string, post: string, version: string) {
    const actor = await this.community.actor(org, user);
    const find = async () => {
      const [row] = await this.db.query(
        `SELECT u.id FROM community_posts p
        JOIN organization_memberships m ON m.organization_id=p.organization_id AND m.id=p.author_membership_id
        JOIN users u ON u.id=m.user_id
        JOIN community_visibility v ON v.organization_id=p.organization_id AND v.membership_id=m.id
        LEFT JOIN loyalty_ledger award ON award.id=p.achievement_id AND award.organization_id=p.organization_id
          AND award.user_id=m.user_id AND award.tx_type='MILESTONE_EARNED'
        LEFT JOIN loyalty_wallets wallet ON wallet.id=award.wallet_id
        WHERE p.organization_id=$1 AND p.id=$2 AND p.status='PUBLISHED' AND m.status='APPROVED' AND u.status='ACTIVE'
          AND v.shared_photo_id=$4 AND u.profile_photo_id=$4
          AND (p.achievement_id IS NULL OR (award.id IS NOT NULL AND wallet.status='ACTIVE'
            AND wallet.verified_minutes >= (award.details->>'minutes')::bigint))
          AND NOT EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE')
          AND NOT EXISTS(SELECT 1 FROM community_member_blocks b WHERE b.organization_id=$1
            AND b.blocker_id=$3 AND b.blocked_id=m.id)`,
        [org, post, actor.membershipId, version],
      );
      if (!row) throw new NotFoundException('Community photo not found');
      return row.id as string;
    };
    const owner = await find();
    const bytes = await this.photos.readVersion(owner, version);
    await find();
    return bytes;
  }
}
