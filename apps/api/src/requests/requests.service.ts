import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CancellerRole,
  CreationChannel,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';

import { ServiceRequest } from './entities/service-request.entity';
import { RequestCancellation } from './entities/request-cancellation.entity';
import { RequestRescheduleHistory } from './entities/request-reschedule.entity';
import { OrganizationServiceCatalog } from '../catalogue/entities/organization-service-catalog.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { MatchingService } from '../matching/matching.service';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';

import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { CancelServiceRequestDto } from './dto/cancel-service-request.dto';
import { RescheduleServiceRequestDto } from './dto/reschedule-service-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private readonly requestRepo: Repository<ServiceRequest>,
    @InjectRepository(RequestCancellation)
    private readonly cancellationRepo: Repository<RequestCancellation>,
    @InjectRepository(RequestRescheduleHistory)
    private readonly rescheduleRepo: Repository<RequestRescheduleHistory>,
    @InjectRepository(OrganizationServiceCatalog)
    private readonly catalogRepo: Repository<OrganizationServiceCatalog>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(VolunteerAssignment)
    private readonly assignmentRepo: Repository<VolunteerAssignment>,
    private readonly beneficiariesService: BeneficiariesService,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Create Service Request (D#8, D#59, D#60, D#61) ─────────────────────────
  async createRequest(
    orgId: string,
    callingUserId: string,
    dto: CreateServiceRequestDto,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException(`Organization '${orgId}' not found`);
    }

    // 0. Check idempotency if key provided
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.requestRepo.findOne({
        where: { organizationId: orgId, idempotencyKey },
        relations: [
          'serviceCatalog',
          'serviceCatalog.globalService',
          'beneficiaryMembership',
          'beneficiaryMembership.user',
        ],
      });
      if (existing) {
        if (existing.createdByUserId !== callingUserId) {
          throw new ConflictException('Idempotency key is already in use');
        }
        return existing;
      }
    }

    // 1. Verify catalogue item enablement
    const catalogItem = await this.catalogRepo.findOne({
      where: { id: dto.serviceCatalogId, organizationId: orgId },
      relations: ['globalService', 'globalService.category'],
    });

    if (
      !catalogItem ||
      !catalogItem.isEnabled ||
      catalogItem.globalService?.isActive === false ||
      catalogItem.globalService?.category?.isActive === false
    ) {
      throw new BadRequestException('Selected service is not enabled in this organization (D#10)');
    }

    // 2. Resolve Beneficiary Membership and Creation Channel
    let beneficiaryMembershipId: string;
    const creationChannel = dto.creationChannel ?? CreationChannel.DIRECT_BENEFICIARY;
    let caregiverAuthId: string | null = null;

    if (creationChannel === CreationChannel.DIRECT_BENEFICIARY) {
      // Find calling user's membership in this organization
      const callerMembership = await this.membershipRepo.findOne({
        where: { userId: callingUserId, organizationId: orgId },
        relations: ['roleGrants'],
      });

      if (!callerMembership || callerMembership.status !== MembershipStatus.APPROVED) {
        throw new ForbiddenException(
          'Approved organization membership required to create requests',
        );
      }

      const hasBeneficiaryRole = callerMembership.roleGrants?.some(
        (rg) => rg.role === UserRole.BENEFICIARY && rg.status === RoleGrantStatus.ACTIVE,
      );

      if (!hasBeneficiaryRole) {
        throw new ForbiddenException(
          'Caller must hold approved BENEFICIARY role to submit requests directly',
        );
      }

      beneficiaryMembershipId = callerMembership.id;
    } else if (creationChannel === CreationChannel.CAREGIVER_PROXY) {
      if (!dto.beneficiaryMembershipId) {
        throw new BadRequestException(
          'beneficiaryMembershipId is required for caregiver proxy requests',
        );
      }

      // Find caregiver's membership in this org
      const caregiverMembership = await this.membershipRepo.findOne({
        where: { userId: callingUserId, organizationId: orgId },
      });

      if (!caregiverMembership || caregiverMembership.status !== MembershipStatus.APPROVED) {
        throw new ForbiddenException('Caregiver is not an approved member of this organization');
      }

      const caregiverAuth = await this.beneficiariesService.verifyCaregiverProxyAccess(
        orgId,
        caregiverMembership.id,
        dto.beneficiaryMembershipId,
      );

      beneficiaryMembershipId = dto.beneficiaryMembershipId;
      caregiverAuthId = caregiverAuth.id;
    } else if (creationChannel === CreationChannel.COORDINATOR_ON_BEHALF) {
      if (!dto.beneficiaryMembershipId) {
        throw new BadRequestException(
          'beneficiaryMembershipId is required for coordinator submissions',
        );
      }
      beneficiaryMembershipId = dto.beneficiaryMembershipId;
    } else {
      throw new BadRequestException(`Unsupported creation channel '${creationChannel}'`);
    }

    // 3. Verify Beneficiary Eligibility and Frequency Quota (D#24, D#26, FR-BEN-04)
    await this.beneficiariesService.checkEligibilityAndQuota(
      orgId,
      beneficiaryMembershipId,
      catalogItem.globalService?.categoryId,
    );

    // 4. Duplicate active request check for safety
    const existingDuplicate = await this.requestRepo.findOne({
      where: {
        organizationId: orgId,
        beneficiaryMembershipId,
        serviceCatalogId: catalogItem.id,
        scheduledStartTime: new Date(dto.scheduledStartTime),
        status: ServiceRequestStatus.MATCHING_ACTIVE,
      },
    });
    if (existingDuplicate) {
      throw new ConflictException(
        'An identical active service request already exists for this beneficiary at the specified scheduled time',
      );
    }

    // 5. Generate unique human-readable request number: REQ-<ORG_CODE>-<YYYYMM>-<SEQ>
    const requestNumber = await this.generateRequestNumber(org.code);

    // 6. Create Service Request record
    const request = this.requestRepo.create({
      organizationId: orgId,
      requestNumber,
      idempotencyKey: idempotencyKey ?? null,
      beneficiaryMembershipId,
      serviceCatalogId: catalogItem.id,
      serviceCatalog: catalogItem,
      createdByUserId: callingUserId,
      creationChannel,
      caregiverAuthorizationId: caregiverAuthId,
      urgency: dto.urgency,
      status: ServiceRequestStatus.MATCHING_ACTIVE,
      scheduledStartTime: new Date(dto.scheduledStartTime),
      expectedDurationMinutes: dto.expectedDurationMinutes ?? 60,
      minVolunteers: Math.max(
        catalogItem.minVolunteers,
        catalogItem.globalService?.defaultMinVolunteers ?? 1,
      ),
      preferredVolunteers: Math.max(
        catalogItem.preferredVolunteers,
        catalogItem.minVolunteers,
        catalogItem.globalService?.defaultMinVolunteers ?? 1,
      ),
      locationAddressText: dto.locationAddressText,
      locationWardNumber: dto.locationWardNumber,
      locationLandmark: dto.locationLandmark ?? null,
      locationPostalCode: dto.locationPostalCode,
      locationLat: dto.locationLat ?? null,
      locationLng: dto.locationLng ?? null,
      beneficiaryNotes: dto.beneficiaryNotes ?? null,
      matchingRadiusKm: 3.0,
      matchingTier: 1,
      allowsCrossOrgVolunteers: dto.allowsCrossOrgVolunteers ?? false,
    });

    const saved = await this.requestRepo.save(request);

    // 7. Mandatory Immediate Candidate Matching Dispatch (D#60, D#61)
    // Runs candidate search and sends offers immediately for BOTH immediate and scheduled requests
    await this.matchingService.findCandidatesAndDispatchOffers(saved);

    await this.auditService.logEvent({
      eventType: 'SERVICE_REQUEST_CREATED',
      actorId: callingUserId,
      targetId: saved.id,
      targetType: 'service_requests',
      organizationId: orgId,
      payload: {
        requestNumber: saved.requestNumber,
        urgency: saved.urgency,
        creationChannel: saved.creationChannel,
        beneficiaryMembershipId: saved.beneficiaryMembershipId,
        idempotencyKey: saved.idempotencyKey,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  // ─── List & Get Requests Scoped to User & Organization ───────────────────────
  async listRequests(
    orgId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext | undefined,
    query: RequestQueryDto,
  ): Promise<{ data: ServiceRequest[]; total: number }> {
    const qb = this.requestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.serviceCatalog', 'cat')
      .leftJoinAndSelect('cat.globalService', 'gs')
      .leftJoinAndSelect('req.beneficiaryMembership', 'bm')
      .leftJoinAndSelect('bm.user', 'u')
      .where('req.organizationId = :orgId', { orgId });

    const isCoordOrAdmin =
      membershipContext?.isSuperAdmin ||
      membershipContext?.roles.includes(UserRole.COORDINATOR) ||
      membershipContext?.roles.includes(UserRole.MUNICIPALITY_ADMIN);

    if (!isCoordOrAdmin && membershipContext?.membershipId) {
      if (membershipContext.roles.includes(UserRole.CAREGIVER)) {
        const careRecipients = await this.beneficiariesService.listCareRecipientsForCaregiver(
          orgId,
          membershipContext.membershipId,
        );
        const recipientIds = careRecipients.map((c) => c.beneficiaryMembershipId);
        recipientIds.push(membershipContext.membershipId);

        if (query.beneficiaryMembershipId) {
          if (!recipientIds.includes(query.beneficiaryMembershipId)) {
            throw new ForbiddenException(
              'You are not authorized to view requests for another beneficiary',
            );
          }
          qb.andWhere('req.beneficiaryMembershipId = :bId', { bId: query.beneficiaryMembershipId });
        } else {
          qb.andWhere('req.beneficiaryMembershipId IN (:...recipientIds)', { recipientIds });
        }
      } else {
        // Beneficiary only
        if (
          query.beneficiaryMembershipId &&
          query.beneficiaryMembershipId !== membershipContext.membershipId
        ) {
          throw new ForbiddenException(
            'You are not authorized to view requests for another beneficiary',
          );
        }
        qb.andWhere('req.beneficiaryMembershipId = :bId', { bId: membershipContext.membershipId });
      }
    } else if (query.beneficiaryMembershipId) {
      qb.andWhere('req.beneficiaryMembershipId = :bId', { bId: query.beneficiaryMembershipId });
    }

    if (query.status) {
      qb.andWhere('req.status = :status', { status: query.status });
    }
    if (query.urgency) {
      qb.andWhere('req.urgency = :urgency', { urgency: query.urgency });
    }
    if (query.ward) {
      qb.andWhere('req.locationWardNumber = :ward', { ward: query.ward });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    qb.orderBy('req.scheduledStartTime', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getRequestById(
    orgId: string,
    requestId: string,
    callingUserId?: string,
    membershipContext?: EvaluatedMembershipContext,
  ): Promise<ServiceRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, organizationId: orgId },
      relations: [
        'serviceCatalog',
        'serviceCatalog.globalService',
        'beneficiaryMembership',
        'beneficiaryMembership.user',
        'assignments',
        'assignments.volunteerMembership',
        'assignments.volunteerMembership.user',
        'cancellations',
        'reschedules',
      ],
    });

    if (!request) {
      throw new NotFoundException(`Service request '${requestId}' not found`);
    }

    // Scoping authorization check if membershipContext provided
    if (membershipContext) {
      const isCoordOrAdmin =
        membershipContext.isSuperAdmin ||
        membershipContext.roles.includes(UserRole.COORDINATOR) ||
        membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);

      const isBeneficiary =
        request.beneficiaryMembershipId === membershipContext.membershipId ||
        request.createdByUserId === callingUserId;

      if (!isCoordOrAdmin && !isBeneficiary) {
        const isCaregiver = await this.beneficiariesService
          .verifyCaregiverProxyAccess(
            orgId,
            membershipContext.membershipId,
            request.beneficiaryMembershipId,
          )
          .catch(() => null);

        if (!isCaregiver) {
          throw new ForbiddenException('You do not have permission to view this service request');
        }
      }
    }

    return request;
  }

  // ─── Cancel Request (D#29, D#62, FR-SVC-04) ─────────────────────────────────
  async cancelRequest(
    orgId: string,
    requestId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext | CancellerRole,
    dto: CancelServiceRequestDto,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, organizationId: orgId },
      relations: ['assignments', 'beneficiaryMembership'],
    });

    if (!request) {
      throw new NotFoundException(`Service request '${requestId}' not found`);
    }

    let cancellerRole = CancellerRole.BENEFICIARY;

    if (typeof membershipContext === 'string') {
      cancellerRole = membershipContext as CancellerRole;
    } else {
      const isCoordOrAdmin =
        membershipContext.isSuperAdmin ||
        membershipContext.roles.includes(UserRole.COORDINATOR) ||
        membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);

      if (isCoordOrAdmin) {
        cancellerRole = CancellerRole.COORDINATOR;
      } else if (
        request.beneficiaryMembershipId === membershipContext.membershipId ||
        request.createdByUserId === callingUserId
      ) {
        cancellerRole = CancellerRole.BENEFICIARY;
      } else {
        const isCaregiver = await this.beneficiariesService
          .verifyCaregiverProxyAccess(
            orgId,
            membershipContext.membershipId,
            request.beneficiaryMembershipId,
          )
          .catch(() => null);

        if (isCaregiver) {
          cancellerRole = CancellerRole.CAREGIVER;
        } else {
          throw new ForbiddenException('You do not have permission to cancel this service request');
        }
      }
    }

    if (
      request.status === ServiceRequestStatus.IN_PROGRESS ||
      request.status === ServiceRequestStatus.COMPLETED
    ) {
      throw new BadRequestException(`Cannot cancel request in status '${request.status}'`);
    }

    if (request.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Request is already cancelled');
    }

    // Compute hours before start for reliability scoring
    const nowMs = Date.now();
    const startMs = new Date(request.scheduledStartTime).getTime();
    const hoursBeforeStart = Math.max(0, (startMs - nowMs) / (1000 * 60 * 60));

    request.status = ServiceRequestStatus.CANCELLED;
    const saved = await this.requestRepo.save(request);

    // Cancel all offered / accepted assignments
    if (request.assignments && request.assignments.length > 0) {
      for (const assignment of request.assignments) {
        if (
          assignment.status === VolunteerAssignmentStatus.OFFERED ||
          assignment.status === VolunteerAssignmentStatus.ACCEPTED
        ) {
          assignment.status = VolunteerAssignmentStatus.CANCELLED;
          await this.assignmentRepo.save(assignment);
        }
      }
    }

    const cancellation = this.cancellationRepo.create({
      organizationId: orgId,
      serviceRequestId: request.id,
      cancelledByUserId: callingUserId,
      cancellerRole,
      reasonCode: dto.reasonCode,
      notes: dto.notes,
      hoursBeforeStart: Number(hoursBeforeStart.toFixed(2)),
    });
    await this.cancellationRepo.save(cancellation);

    await this.auditService.logEvent({
      eventType: 'SERVICE_REQUEST_CANCELLED',
      actorId: callingUserId,
      targetId: saved.id,
      targetType: 'service_requests',
      organizationId: orgId,
      payload: {
        reasonCode: dto.reasonCode,
        hoursBeforeStart: cancellation.hoursBeforeStart,
        cancellerRole,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  // ─── Reschedule Request (D#62) ──────────────────────────────────────────────
  async rescheduleRequest(
    orgId: string,
    requestId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext | undefined,
    dto: RescheduleServiceRequestDto,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId, organizationId: orgId },
      relations: ['serviceCatalog', 'serviceCatalog.globalService', 'beneficiaryMembership'],
    });

    if (!request) {
      throw new NotFoundException(`Service request '${requestId}' not found`);
    }

    if (membershipContext) {
      const isCoordOrAdmin =
        membershipContext.isSuperAdmin ||
        membershipContext.roles.includes(UserRole.COORDINATOR) ||
        membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);

      const isBeneficiary =
        request.beneficiaryMembershipId === membershipContext.membershipId ||
        request.createdByUserId === callingUserId;

      if (!isCoordOrAdmin && !isBeneficiary) {
        const isCaregiver = await this.beneficiariesService
          .verifyCaregiverProxyAccess(
            orgId,
            membershipContext.membershipId,
            request.beneficiaryMembershipId,
          )
          .catch(() => null);

        if (!isCaregiver) {
          throw new ForbiddenException(
            'You do not have permission to reschedule this service request',
          );
        }
      }
    }

    if (
      request.status === ServiceRequestStatus.IN_PROGRESS ||
      request.status === ServiceRequestStatus.COMPLETED ||
      request.status === ServiceRequestStatus.CANCELLED
    ) {
      throw new BadRequestException(`Cannot reschedule request in status '${request.status}'`);
    }

    const previousStartTime = request.scheduledStartTime;
    request.scheduledStartTime = new Date(dto.newStartTime);
    request.status = ServiceRequestStatus.MATCHING_ACTIVE;
    const saved = await this.requestRepo.save(request);

    const rescheduleRecord = this.rescheduleRepo.create({
      organizationId: orgId,
      serviceRequestId: request.id,
      rescheduledByUserId: callingUserId,
      previousStartTime,
      newStartTime: request.scheduledStartTime,
      reason: dto.reason,
    });
    await this.rescheduleRepo.save(rescheduleRecord);

    // Cancel existing volunteer offers and trigger fresh matching for new time
    const assignments = await this.assignmentRepo.find({
      where: { serviceRequestId: request.id },
    });
    for (const a of assignments) {
      if (
        a.status === VolunteerAssignmentStatus.OFFERED ||
        a.status === VolunteerAssignmentStatus.ACCEPTED
      ) {
        a.status = VolunteerAssignmentStatus.CANCELLED;
        await this.assignmentRepo.save(a);
      }
    }

    await this.matchingService.findCandidatesAndDispatchOffers(saved);

    await this.auditService.logEvent({
      eventType: 'SERVICE_REQUEST_RESCHEDULED',
      actorId: callingUserId,
      targetId: saved.id,
      targetType: 'service_requests',
      organizationId: orgId,
      payload: {
        previousStartTime,
        newStartTime: request.scheduledStartTime,
        reason: dto.reason,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  private async generateRequestNumber(orgCode: string): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    return `REQ-${orgCode.toUpperCase()}-${yearMonth}-${randomSuffix}`;
  }
}
