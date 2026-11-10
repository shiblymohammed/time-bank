import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import {
  DocumentReviewStatus,
  MembershipStatus,
  OrganizationStatus,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipDocument } from '../memberships/entities/membership-document.entity';
import { Ward } from './entities/ward.entity';
import { CreateWardDto, UpdateWardDto } from './dto/ward.dto';
import { DocumentStorage, NOC_MAX_BYTES, detectDocumentType } from './noc-storage';

export const WARD_NOC = 'WARD_NOC';

/** What a member sees of a ward: never the representative's phone (owner's decision). */
export function publicWard(ward: Ward | null | undefined) {
  if (!ward) return null;
  return {
    id: ward.id,
    wardNumber: ward.wardNumber,
    name: ward.name,
    representativeTitle: ward.representativeTitle,
    representativeName: ward.representativeName,
    officeAddress: ward.officeAddress ?? null,
    status: ward.status,
  };
}

export function staffWard(ward: Ward) {
  return { ...publicWard(ward)!, representativePhone: ward.representativePhone ?? null };
}

/** The member's current ward NOC is the newest one; older ones are history. */
export function currentNoc(documents: MembershipDocument[] | undefined) {
  const nocs = (documents ?? [])
    .filter((d) => d.documentType === WARD_NOC)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return nocs[0] ?? null;
}

export function nocView(document: MembershipDocument | null) {
  if (!document) return null;
  return {
    id: document.id,
    status: document.reviewStatus,
    notes: document.reviewNotes ?? null,
    wardId: document.wardId ?? null,
    contentType: document.contentType ?? null,
    sizeBytes: document.sizeBytes ?? null,
    uploadedAt: document.createdAt,
    reviewedAt: document.reviewedAt ?? null,
  };
}

const byNumber = (a: Ward, b: Ward) =>
  a.wardNumber.localeCompare(b.wardNumber, 'en', { numeric: true });

/** Statuses in which a member may still choose a ward or send a NOC. */
const OPEN_STATUSES = [
  MembershipStatus.APPLIED,
  MembershipStatus.PENDING_REVIEW,
  MembershipStatus.REJECTED,
  MembershipStatus.APPROVED,
];

const STAFF = [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN];

/**
 * Wards of a municipality, the ward each member chose, and the NOC they upload from that ward's
 * councillor or ward member.
 */
@Injectable()
export class WardsService {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(Ward) private readonly wards: Repository<Ward>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(MembershipDocument)
    private readonly documents: Repository<MembershipDocument>,
    private readonly storage: DocumentStorage,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
  ) {}

  /** Active wards, for someone choosing theirs while joining. */
  async listForMembers(organizationId: string) {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throw new NotFoundException('Community not found');
    }
    const wards = await this.wards.find({ where: { organizationId, status: 'ACTIVE' } });
    return wards.sort(byNumber).map(publicWard);
  }

  async listForStaff(organizationId: string) {
    const wards = await this.wards.find({ where: { organizationId } });
    return wards.sort(byNumber).map(staffWard);
  }

  async create(organizationId: string, actorId: string, dto: CreateWardDto, ipAddress?: string) {
    const organization = await this.organizations.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organization not found');
    await this.assertNumberFree(organizationId, dto.wardNumber);
    const saved = await this.wards.save(
      this.wards.create({
        organizationId,
        wardNumber: dto.wardNumber,
        name: dto.name,
        representativeTitle: dto.representativeTitle,
        representativeName: dto.representativeName,
        representativePhone: dto.representativePhone ?? null,
        officeAddress: dto.officeAddress ?? null,
        status: 'ACTIVE',
        createdByUserId: actorId,
      }),
    );
    await this.audit.logEvent({
      eventType: 'WARD_CREATED',
      actorId,
      targetId: saved.id,
      targetType: 'WARD',
      organizationId,
      ipAddress,
      payload: { wardNumber: saved.wardNumber, name: saved.name },
    });
    return staffWard(saved);
  }

  /** Edits a ward. A ward is switched off rather than deleted, so old records keep it. */
  async update(
    organizationId: string,
    wardId: string,
    actorId: string,
    dto: UpdateWardDto,
    ipAddress?: string,
  ) {
    const ward = await this.wards.findOne({ where: { id: wardId, organizationId } });
    if (!ward) throw new NotFoundException('Ward not found');
    if (dto.wardNumber !== undefined && dto.wardNumber !== ward.wardNumber) {
      await this.assertNumberFree(organizationId, dto.wardNumber);
    }
    const before = staffWard(ward);
    for (const key of [
      'wardNumber',
      'name',
      'representativeTitle',
      'representativeName',
      'representativePhone',
      'officeAddress',
      'status',
    ] as const) {
      if (dto[key] !== undefined) Object.assign(ward, { [key]: dto[key] });
    }
    const saved = await this.wards.save(ward);
    const after = staffWard(saved);
    await this.audit.logEvent({
      eventType: 'WARD_UPDATED',
      actorId,
      targetId: saved.id,
      targetType: 'WARD',
      organizationId,
      ipAddress,
      payload: {
        changed: Object.keys(after).filter(
          (key) => before[key as keyof typeof before] !== after[key as keyof typeof after],
        ),
      },
    });
    return after;
  }

  private async assertNumberFree(organizationId: string, wardNumber: string) {
    const taken = await this.wards
      .createQueryBuilder('w')
      .where('w.organization_id = :organizationId', { organizationId })
      .andWhere('lower(w.ward_number) = lower(:wardNumber)', { wardNumber })
      .getOne();
    if (taken) throw new ConflictException(`Ward ${wardNumber} is already listed`);
  }

  /** The member's own membership in a state where they may still change their ward or NOC. */
  private async ownMembership(organizationId: string, membershipId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: { id: membershipId, organizationId },
      relations: ['documents'],
    });
    if (!membership || membership.userId !== userId) {
      throw new NotFoundException('Membership not found');
    }
    if (!OPEN_STATUSES.includes(membership.status)) {
      throw new ConflictException('This membership is closed. Please contact your coordinator.');
    }
    return membership;
  }

  /** An active ward of this organization. */
  async activeWard(organizationId: string, wardId: string) {
    const ward = await this.wards.findOne({ where: { id: wardId, organizationId } });
    if (!ward || ward.status !== 'ACTIVE') {
      throw new BadRequestException('Choose one of your community’s wards');
    }
    return ward;
  }

  /** The member picks or changes their ward, until a NOC for it has been accepted. */
  async chooseWard(
    organizationId: string,
    membershipId: string,
    userId: string,
    wardId: string,
    ipAddress?: string,
  ) {
    const membership = await this.ownMembership(organizationId, membershipId, userId);
    const ward = await this.activeWard(organizationId, wardId);
    const noc = currentNoc(membership.documents);
    if (membership.wardId === ward.id) return { ward: publicWard(ward), noc: nocView(noc) };
    if (noc?.reviewStatus === DocumentReviewStatus.APPROVED) {
      throw new ConflictException(
        'Your NOC has been accepted for your ward. Ask your coordinator to change your ward.',
      );
    }
    await this.db.transaction(async (m) => {
      await m.update(OrganizationMembership, { id: membership.id }, { wardId: ward.id });
      // A NOC still waiting was signed for the old ward, so it no longer counts.
      await m.update(
        MembershipDocument,
        { membershipId: membership.id, documentType: WARD_NOC, reviewStatus: 'PENDING' },
        { reviewStatus: DocumentReviewStatus.SUPERSEDED },
      );
      await this.audit.logEvent(
        {
          eventType: 'MEMBERSHIP_WARD_CHOSEN',
          actorId: userId,
          targetId: membership.id,
          targetType: 'ORGANIZATION_MEMBERSHIP',
          organizationId,
          ipAddress,
          payload: { wardId: ward.id, previousWardId: membership.wardId ?? null },
        },
        m,
      );
    });
    const after = await this.documents.find({ where: { membershipId: membership.id } });
    return { ward: publicWard(ward), noc: nocView(currentNoc(after)) };
  }

  /** Stores the signed NOC the member photographed or scanned, for a coordinator to check. */
  async uploadNoc(
    organizationId: string,
    membershipId: string,
    userId: string,
    file: { buffer: Buffer; size: number } | undefined,
    ipAddress?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Add a photo or PDF of your NOC');
    if (file.size > NOC_MAX_BYTES || file.buffer.length > NOC_MAX_BYTES) {
      throw new PayloadTooLargeException('The file is larger than 5 MB');
    }
    const type = detectDocumentType(file.buffer);
    if (!type) throw new BadRequestException('Send a photo (JPG or PNG) or a PDF');
    const membership = await this.ownMembership(organizationId, membershipId, userId);
    if (!membership.wardId) {
      const listed = await this.wards.count({ where: { organizationId, status: 'ACTIVE' } });
      if (listed) throw new BadRequestException('Choose your ward first');
    }
    if (currentNoc(membership.documents)?.reviewStatus === DocumentReviewStatus.APPROVED) {
      throw new ConflictException('Your NOC has already been accepted');
    }
    const id = randomUUID();
    const storageKey = `${organizationId}/${id}.${type.extension}`;
    await this.storage.save(storageKey, file.buffer);
    try {
      const saved = await this.db.transaction(async (m) => {
        // Only the newest NOC is reviewed; one still waiting is replaced.
        await m.update(
          MembershipDocument,
          { membershipId: membership.id, documentType: WARD_NOC, reviewStatus: 'PENDING' },
          { reviewStatus: DocumentReviewStatus.SUPERSEDED },
        );
        const document = await m.save(
          m.create(MembershipDocument, {
            id,
            membershipId: membership.id,
            documentType: WARD_NOC,
            storageKey,
            reviewStatus: DocumentReviewStatus.PENDING,
            wardId: membership.wardId ?? null,
            contentType: type.contentType,
            sizeBytes: file.buffer.length,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          }),
        );
        await this.audit.logEvent(
          {
            eventType: 'MEMBERSHIP_DOCUMENT_UPLOADED',
            actorId: userId,
            targetId: document.id,
            targetType: 'MEMBERSHIP_DOCUMENT',
            organizationId,
            ipAddress,
            payload: {
              documentType: WARD_NOC,
              wardId: document.wardId,
              contentType: type.contentType,
              sizeBytes: document.sizeBytes,
            },
          },
          m,
        );
        return document;
      });
      return nocView(saved);
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** The file, for the member who sent it or staff of this organization. Every view is logged. */
  async readFile(organizationId: string, documentId: string, viewerId: string, ipAddress?: string) {
    const document = await this.documents.findOne({
      where: { id: documentId },
      relations: ['membership'],
    });
    const owner = document?.membership?.userId === viewerId;
    if (
      !document?.contentType ||
      document.membership?.organizationId !== organizationId ||
      (!owner && !(await this.authorization.hasRoleInOrganization(viewerId, organizationId, STAFF)))
    ) {
      throw new NotFoundException('Document not found');
    }
    const bytes = await this.storage.read(document.storageKey);
    await this.audit.logEvent({
      eventType: 'MEMBERSHIP_DOCUMENT_VIEWED',
      actorId: viewerId,
      targetId: document.id,
      targetType: 'MEMBERSHIP_DOCUMENT',
      organizationId,
      ipAddress,
      payload: { documentType: document.documentType, byOwner: owner },
    });
    const extension = document.storageKey.split('.').pop();
    return {
      bytes,
      contentType: document.contentType,
      filename: `${document.documentType.toLowerCase().replace(/_/g, '-')}-${document.id.slice(0, 8)}.${extension}`,
    };
  }
}
