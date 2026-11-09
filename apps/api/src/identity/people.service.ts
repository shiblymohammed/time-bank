import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import {
  IdentityDocumentType,
  IdentityVerificationLevel,
  IdentityVerificationStatus,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { cleanPersonName } from './person-name';

export type IdentityDecision = 'VERIFY' | 'REJECT';

/** Upper-case letters and digits only, so "1234 5678-9012" and "123456789012" match. */
export function normalizeDocumentNumber(type: string, raw: unknown): string {
  const number = typeof raw === 'string' ? raw.toUpperCase().replace(/[\s\-./]/g, '') : '';
  if (!/^[A-Z0-9]{4,30}$/.test(number)) {
    throw new BadRequestException('Enter the document number as printed (letters and digits)');
  }
  if (type === IdentityDocumentType.AADHAAR_CARD && !/^\d{12}$/.test(number)) {
    throw new BadRequestException('An Aadhaar number has 12 digits');
  }
  return number;
}

/**
 * Names, and identity verification by a coordinator who has checked a person's ID document
 * (FR-IDENT-02). A person is verified once for every community. The full document number is never
 * kept: only its type, its last 4 characters, and a keyed fingerprint to catch one document
 * verifying two accounts.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private fingerprint(type: string, number: string): string {
    const secret =
      this.config.get<string>('IDENTITY_FINGERPRINT_SECRET') ||
      (this.config.get<string>('NODE_ENV') === 'production'
        ? undefined
        : this.config.get<string>('JWT_SECRET'));
    if (!secret) {
      throw new ServiceUnavailableException(
        'Identity checks are not set up on this server. Ask the administrator to set IDENTITY_FINGERPRINT_SECRET.',
      );
    }
    return crypto.createHmac('sha256', secret).update(`identity:${type}:${number}`).digest('hex');
  }

  async setOwnName(userId: string, rawName: unknown) {
    const fullName = cleanPersonName(rawName);
    await this.dataSource.query(
      'UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1',
      [userId, fullName],
    );
    return { fullName };
  }

  /** A member of this organization, with the person behind it. */
  private async member(orgId: string, membershipId: string) {
    const [row] = await this.dataSource.query(
      `SELECT m.id, m.user_id, m.membership_number, u.full_name
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [membershipId, orgId],
    );
    if (!row) throw new NotFoundException('Member not found in this organization');
    return row as {
      id: string;
      user_id: string;
      membership_number: string | null;
      full_name: string | null;
    };
  }

  async setMemberName(
    orgId: string,
    membershipId: string,
    actorId: string,
    rawName: unknown,
    ip?: string,
  ) {
    const fullName = cleanPersonName(rawName);
    const member = await this.member(orgId, membershipId);
    await this.dataSource.transaction(async (m) => {
      await m.query('UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1', [
        member.user_id,
        fullName,
      ]);
      await this.audit.logEvent(
        {
          eventType: 'MEMBER_NAME_CHANGED',
          actorId,
          targetId: member.user_id,
          targetType: 'USER',
          organizationId: orgId,
          ipAddress: ip ?? null,
          payload: { membershipId, previous: member.full_name, current: fullName },
        },
        m,
      );
    });
    return { membershipId, fullName };
  }

  async decideIdentity(
    orgId: string,
    membershipId: string,
    actorId: string,
    input: {
      decision: IdentityDecision;
      documentType?: string;
      documentNumber?: string;
      notes?: string;
      reason?: string;
    },
    ip?: string,
  ) {
    const member = await this.member(orgId, membershipId);
    if (member.user_id === actorId) {
      throw new ForbiddenException('Ask another coordinator to verify your own identity');
    }

    if (input.decision === 'REJECT') {
      const reason = input.reason?.trim();
      if (!reason) throw new BadRequestException('Give a reason for not verifying');
      return this.dataSource.transaction(async (m) => {
        await m.query(
          `UPDATE verified_identities
           SET verification_status = $2, verification_level = $3, rejection_reason = $4,
               verified_at = NULL, verified_by = $5, document_type = NULL, document_last4 = NULL,
               document_fingerprint = NULL, verification_notes = NULL, updated_at = now()
           WHERE user_id = $1`,
          [
            member.user_id,
            IdentityVerificationStatus.REJECTED,
            IdentityVerificationLevel.BASIC,
            reason,
            actorId,
          ],
        );
        await this.audit.logEvent(
          {
            eventType: 'IDENTITY_REJECTED',
            actorId,
            targetId: member.user_id,
            targetType: 'USER',
            organizationId: orgId,
            ipAddress: ip ?? null,
            payload: { membershipId, reason },
          },
          m,
        );
        return { verificationStatus: IdentityVerificationStatus.REJECTED, rejectionReason: reason };
      });
    }

    const documentType = input.documentType ?? '';
    if (!(Object.values(IdentityDocumentType) as string[]).includes(documentType)) {
      throw new BadRequestException('Choose the kind of document you checked');
    }
    const number = normalizeDocumentNumber(documentType, input.documentNumber);
    const fingerprint = this.fingerprint(documentType, number);
    const last4 = number.slice(-4);
    const notes = input.notes?.trim().slice(0, 500) || null;

    try {
      return await this.dataSource.transaction(async (m) => {
        const [other] = await m.query(
          `SELECT v.user_id,
                  (SELECT membership_number FROM organization_memberships om
                   WHERE om.user_id = v.user_id ORDER BY (om.organization_id = $3) DESC, om.created_at
                   LIMIT 1) AS membership_number
           FROM verified_identities v
           WHERE v.document_fingerprint = $1 AND v.user_id <> $2`,
          [fingerprint, member.user_id, orgId],
        );
        if (other) {
          throw new ConflictException(
            `This document already verifies another account (membership ${other.membership_number ?? 'without a number'}). ` +
              'If this is one person with two accounts, report the extra one under Account closures.',
          );
        }
        const updated = await m.query(
          `UPDATE verified_identities
           SET verification_status = $2, verification_level = $3, verified_at = now(), verified_by = $4,
               rejection_reason = NULL, document_type = $5, document_last4 = $6,
               document_fingerprint = $7, verification_notes = $8, updated_at = now()
           WHERE user_id = $1
           RETURNING verified_at`,
          [
            member.user_id,
            IdentityVerificationStatus.VERIFIED,
            IdentityVerificationLevel.DOCUMENT_VERIFIED,
            actorId,
            documentType,
            last4,
            fingerprint,
            notes,
          ],
        );
        const rows = Array.isArray(updated[0]) ? updated[0] : updated;
        if (!rows.length) {
          await m.query(
            `INSERT INTO verified_identities
               (user_id, verification_status, verification_level, verified_at, verified_by,
                document_type, document_last4, document_fingerprint, verification_notes)
             VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8)`,
            [
              member.user_id,
              IdentityVerificationStatus.VERIFIED,
              IdentityVerificationLevel.DOCUMENT_VERIFIED,
              actorId,
              documentType,
              last4,
              fingerprint,
              notes,
            ],
          );
        }
        await this.audit.logEvent(
          {
            eventType: 'IDENTITY_VERIFIED',
            actorId,
            targetId: member.user_id,
            targetType: 'USER',
            organizationId: orgId,
            ipAddress: ip ?? null,
            payload: { membershipId, documentType, documentLast4: last4 },
          },
          m,
        );
        return {
          verificationStatus: IdentityVerificationStatus.VERIFIED,
          verificationLevel: IdentityVerificationLevel.DOCUMENT_VERIFIED,
          documentType,
          documentLast4: last4,
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        await this.audit.logEvent({
          eventType: 'IDENTITY_DUPLICATE_DOCUMENT',
          actorId,
          targetId: member.user_id,
          targetType: 'USER',
          organizationId: orgId,
          ipAddress: ip ?? null,
          payload: { membershipId, documentType, documentLast4: last4 },
        });
        throw error;
      }
      // Two coordinators verifying the same document at the same moment.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('This document already verifies another account.');
      }
      throw error;
    }
  }
}
