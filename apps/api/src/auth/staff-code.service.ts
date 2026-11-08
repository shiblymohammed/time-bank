import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { EmailService, MOCK_EMAIL_CODE } from './email/email.service';
import { staffCodeRequired } from './guards/auth.guard';
import { STAFF_ROLES } from './staff-context';

export const STAFF_CODE_TTL_MS = 10 * 60_000;
export const STAFF_CODE_RESEND_SECONDS = 60;
export const STAFF_CODE_MAX_ATTEMPTS = 5;

/** Shows enough of an address to recognise it: "a***@example.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
}

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Enter a valid email address');
  }
  return email;
}

/**
 * The second sign-in step for staff: a 6-digit code emailed to the address on file. Until a
 * sign-in passes it, that sign-in has no Coordinator, Municipality Admin or Super Admin powers.
 */
@Injectable()
export class StaffCodeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
  ) {}

  private hash(sessionId: string, code: string): string {
    return crypto
      .createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`staff-code:${sessionId}:${code}`)
      .digest('hex');
  }

  /** Whether the user holds any staff role, read straight from current grants. */
  private async holdsStaffRole(userId: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM membership_role_grants g
       JOIN organization_memberships m ON m.id = g.membership_id
       WHERE m.user_id = $1 AND m.status = 'APPROVED' AND g.status = 'ACTIVE'
         AND g.role = ANY($2::text[]) LIMIT 1`,
      [userId, STAFF_ROLES],
    );
    return rows.length > 0;
  }

  private requireSession(sessionId?: string): string {
    if (!sessionId) throw new UnauthorizedException('Sign in again to continue');
    return sessionId;
  }

  async status(userId: string, sessionId?: string) {
    const staff = await this.holdsStaffRole(userId);
    const required = staff && staffCodeRequired(this.config);
    const [user] = await this.dataSource.query('SELECT email FROM users WHERE id = $1', [userId]);
    const [session] = sessionId
      ? await this.dataSource.query(
          `SELECT staff_verified_at FROM authentication_sessions
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
          [sessionId, userId],
        )
      : [];
    return {
      staff,
      required,
      verified: !required || Boolean(session?.staff_verified_at),
      hasEmail: Boolean(user?.email),
      maskedEmail: user?.email ? maskEmail(user.email) : null,
    };
  }

  async request(userId: string, rawSessionId?: string, ipAddress?: string) {
    const sessionId = this.requireSession(rawSessionId);
    if (!(await this.holdsStaffRole(userId))) {
      throw new ForbiddenException('Only staff sign-ins need an email code');
    }
    const [user] = await this.dataSource.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!user?.email) {
      throw new ConflictException(
        'No email address is on file for your account. Ask a Super Admin to add one.',
      );
    }
    const code = this.email.usesMock()
      ? MOCK_EMAIL_CODE
      : crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    // One code a minute per sign-in; the update only lands when the wait has passed.
    const updated: unknown[] = await this.dataSource.query(
      `UPDATE authentication_sessions
       SET staff_code_hash = $3, staff_code_expires_at = now() + ($4 || ' milliseconds')::interval,
           staff_code_sent_at = now(), staff_code_attempts = 0
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
         AND staff_verified_at IS NULL
         AND (staff_code_sent_at IS NULL
              OR staff_code_sent_at < now() - ($5 || ' seconds')::interval)
       RETURNING id`,
      [sessionId, userId, this.hash(sessionId, code), String(STAFF_CODE_TTL_MS), String(STAFF_CODE_RESEND_SECONDS)],
    );
    // TypeORM returns [rows, count] for an UPDATE ... RETURNING on Postgres.
    const updatedRows = Array.isArray(updated[0]) ? (updated[0] as unknown[]) : updated;
    if (!updatedRows.length) {
      const [session] = await this.dataSource.query(
        `SELECT staff_verified_at FROM authentication_sessions
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
        [sessionId, userId],
      );
      if (!session) throw new UnauthorizedException('Sign in again to continue');
      if (session.staff_verified_at) return { sent: false, verified: true };
      throw new HttpException('Wait a minute before asking for another code', HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      await this.email.sendStaffCode(user.email, code);
    } catch (error) {
      // Let them try again straight away when the email never left.
      await this.dataSource.query(
        `UPDATE authentication_sessions SET staff_code_hash = NULL, staff_code_sent_at = NULL
         WHERE id = $1`,
        [sessionId],
      );
      throw error;
    }
    await this.audit.logEvent({
      eventType: 'STAFF_EMAIL_CODE_SENT',
      actorId: userId,
      targetId: sessionId,
      targetType: 'AUTHENTICATION_SESSION',
      ipAddress,
    });
    return {
      sent: true,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: STAFF_CODE_TTL_MS / 1000,
      resendInSeconds: STAFF_CODE_RESEND_SECONDS,
    };
  }

  async verify(userId: string, rawSessionId: string | undefined, code: string, ipAddress?: string) {
    const sessionId = this.requireSession(rawSessionId);
    if (!/^\d{6}$/.test(code ?? '')) throw new BadRequestException('Enter the 6-digit code');

    const outcome = await this.dataSource.transaction(async (m) => {
      const [session] = await m.query(
        `SELECT staff_verified_at, staff_code_hash, staff_code_expires_at, staff_code_attempts
         FROM authentication_sessions
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [sessionId, userId],
      );
      if (!session) return 'NO_SESSION' as const;
      if (session.staff_verified_at) return 'VERIFIED' as const;
      if (!session.staff_code_hash || new Date(session.staff_code_expires_at) <= new Date()) {
        return 'EXPIRED' as const;
      }
      if (session.staff_code_attempts >= STAFF_CODE_MAX_ATTEMPTS) return 'LOCKED' as const;
      const expected = Buffer.from(session.staff_code_hash, 'hex');
      const given = Buffer.from(this.hash(sessionId, code), 'hex');
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        await m.query(
          'UPDATE authentication_sessions SET staff_code_attempts = staff_code_attempts + 1 WHERE id = $1',
          [sessionId],
        );
        return session.staff_code_attempts + 1 >= STAFF_CODE_MAX_ATTEMPTS
          ? ('NOW_LOCKED' as const)
          : ('WRONG' as const);
      }
      await m.query(
        `UPDATE authentication_sessions
         SET staff_verified_at = now(), staff_code_hash = NULL, staff_code_expires_at = NULL
         WHERE id = $1`,
        [sessionId],
      );
      await this.audit.logEvent(
        {
          eventType: 'STAFF_EMAIL_CODE_VERIFIED',
          actorId: userId,
          targetId: sessionId,
          targetType: 'AUTHENTICATION_SESSION',
          ipAddress,
        },
        m,
      );
      return 'OK' as const;
    });

    switch (outcome) {
      case 'OK':
      case 'VERIFIED':
        return { verified: true };
      case 'NO_SESSION':
        throw new UnauthorizedException('Sign in again to continue');
      case 'EXPIRED':
        throw new BadRequestException('This code has expired. Ask for a new one.');
      case 'NOW_LOCKED':
        await this.audit.logEvent({
          eventType: 'STAFF_EMAIL_CODE_LOCKED',
          actorId: userId,
          targetId: sessionId,
          targetType: 'AUTHENTICATION_SESSION',
          ipAddress,
        });
        throw new HttpException('Too many wrong codes. Ask for a new one.', HttpStatus.TOO_MANY_REQUESTS);
      case 'LOCKED':
        throw new HttpException('Too many wrong codes. Ask for a new one.', HttpStatus.TOO_MANY_REQUESTS);
      default:
        // 400, not 401: a wrong code must not read as an expired sign-in.
        throw new BadRequestException('That code is not right');
    }
  }

  /** Super Admin sets or clears a person's email for staff codes. */
  async setEmail(adminId: string, userId: string, rawEmail: string | null, ipAddress?: string) {
    const authority = await this.authorization.evaluateGlobalAccess(adminId);
    if (!authority.isSuperAdmin) throw new ForbiddenException('Current Super Admin authority required');
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const [user] = await this.dataSource.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundException('User not found');
    if (email) {
      const [taken] = await this.dataSource.query(
        'SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2',
        [email, userId],
      );
      if (taken) throw new ConflictException('Another account already uses this email');
    }
    await this.dataSource.transaction(async (m) => {
      await m.query('UPDATE users SET email = $2 WHERE id = $1', [userId, email]);
      // A changed address must be proven again, so this person's other sign-ins lose staff powers.
      await m.query(
        `UPDATE authentication_sessions SET staff_verified_at = NULL
         WHERE user_id = $1 AND staff_verified_at IS NOT NULL`,
        [userId],
      );
      await this.audit.logEvent(
        {
          eventType: 'STAFF_EMAIL_SET',
          actorId: adminId,
          targetId: userId,
          targetType: 'USER',
          ipAddress,
          payload: {
            previous: user.email ? maskEmail(user.email) : null,
            current: email ? maskEmail(email) : null,
          },
        },
        m,
      );
    });
    return { userId, maskedEmail: email ? maskEmail(email) : null };
  }
}
