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
import { EntityManager, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  AssignmentReviewDecision,
  AssignmentReviewReason,
  CancellerRole,
  CreationChannel,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  UserRole,
  UrgencyType,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';

import { ServiceRequest } from './entities/service-request.entity';
import { type ServiceRequestView, toRequestView } from './request-view';
import { RequestCancellation } from './entities/request-cancellation.entity';
import { RequestRescheduleHistory } from './entities/request-reschedule.entity';
import { OrganizationServiceCatalog } from '../catalogue/entities/organization-service-catalog.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { MatchingService } from '../matching/matching.service';
import { awaitingReview, openHelpCount, workedMinutes } from '../matching/booking-recovery';
import { NotificationsService } from '../notifications/notifications.service';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { TimeLedgerService } from '../time-ledger/time-ledger.service';
import {
  AuthorizationService,
  EvaluatedMembershipContext,
} from '../authorization/authorization.service';

import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { CancelServiceRequestDto } from './dto/cancel-service-request.dto';
import { RescheduleServiceRequestDto } from './dto/reschedule-service-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { ConfirmServiceCompletionDto } from './dto/confirm-service-completion.dto';
import { DisputeServiceCompletionDto } from './dto/dispute-service-completion.dto';
import { ResolveServiceReviewDto } from './dto/resolve-service-review.dto';
import { LoyaltyService } from '../loyalty/loyalty.service';

/** A missed Start button should not send every visit to a coordinator. */
/** A request in one of these has no one on the way yet. */
const NOT_STARTED = [
  ServiceRequestStatus.DRAFT,
  ServiceRequestStatus.MATCHING_ACTIVE,
  ServiceRequestStatus.PARTIALLY_ACCEPTED,
  ServiceRequestStatus.FULLY_MATCHED,
  ServiceRequestStatus.RESCHEDULED,
  ServiceRequestStatus.ESCALATED_TO_COORDINATOR,
];
const hasStarted = (assignment: VolunteerAssignment) =>
  [VolunteerAssignmentStatus.IN_PROGRESS, VolunteerAssignmentStatus.COMPLETED].includes(
    assignment.status,
  );

const TIMED_WORK_TOLERANCE_MINUTES = 10;
const EXPECTED_DURATION_TOLERANCE_MINUTES = 60;
const PAIR_LIMIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const pairMonthlyLimitMinutes = () => Number(process.env['CREDIT_PAIR_MONTHLY_MINUTES'] ?? 1200);

/** Requests can be booked or moved at most this far ahead. */
export const MAX_BOOKING_AHEAD_DAYS = 90;
const MAX_BOOKING_AHEAD_MS = MAX_BOOKING_AHEAD_DAYS * 24 * 60 * 60 * 1000;

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
    private readonly authorizationService: AuthorizationService,
    private readonly timeLedgerService: TimeLedgerService,
    private readonly notifications: NotificationsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // ─── Create Service Request (D#8, D#59, D#60, D#61) ─────────────────────────
  async createRequest(
    orgId: string,
    callingUserId: string,
    dto: CreateServiceRequestDto,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      // Serialize creation per organization: retries, duplicate checks and the
      // last monthly quota slot must observe the preceding committed request.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `request-create:${orgId}`,
      ]);
      return this.createRequestInTransaction(orgId, callingUserId, dto, manager, ipAddress);
    });
  }

  private async createRequestInTransaction(
    orgId: string,
    callingUserId: string,
    dto: CreateServiceRequestDto,
    manager: EntityManager,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    const requestRepo = manager.getRepository(ServiceRequest);
    const org = await manager.withRepository(this.orgRepo).findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException(`Organization '${orgId}' not found`);
    }

    const context = await this.authorizationService.evaluateOrganizationAccess(
      callingUserId,
      orgId,
      manager,
    );
    const isStaff =
      context.isSuperAdmin ||
      context.roles.some((role) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(role),
      );
    if (
      (dto.creationChannel === CreationChannel.COORDINATOR_ON_BEHALF ||
        dto.allowsCrossOrgVolunteers) &&
      !isStaff
    ) {
      throw new ForbiddenException('Coordinator authority required for this request option');
    }
    // A volunteer can only act on a booking through a membership in its organization.
    if (dto.allowsCrossOrgVolunteers) {
      throw new BadRequestException('Volunteers from other municipalities are not available yet');
    }

    // 0. Check idempotency if key provided
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey && idempotencyKey.length > 100) {
      throw new BadRequestException('Idempotency key must be at most 100 characters');
    }
    if (idempotencyKey) {
      const existing = await requestRepo.findOne({
        where: { organizationId: orgId, idempotencyKey },
        relations: ['serviceCatalog', 'serviceCatalog.globalService'],
      });
      if (existing) {
        if (existing.createdByUserId !== callingUserId && !isStaff) {
          throw new ForbiddenException('Idempotency key belongs to another request creator');
        }
        // A retry cannot outlive the right to book: a removed caregiver stays removed.
        if (!isStaff && existing.beneficiaryMembershipId !== context.membershipId) {
          const proxy = await this.beneficiariesService
            .verifyCaregiverProxyAccess(
              orgId,
              context.membershipId,
              existing.beneficiaryMembershipId,
            )
            .catch(() => null);
          if (!proxy) {
            throw new ForbiddenException('You can no longer book for this beneficiary');
          }
        }
        // FR-OFF-03: a reused key is a retry only if it asks for the same help.
        if (!sameRequestDetails(existing, dto)) {
          throw new ConflictException('This request key was already used for a different request');
        }
        return existing;
      }
    }

    const start = new Date(dto.scheduledStartTime).getTime();
    // Allow a minute of transport delay for an immediate request submitted now.
    const earliest = Date.now() - (dto.urgency === UrgencyType.IMMEDIATE ? 60_000 : 0);
    if (!Number.isFinite(start) || start <= earliest) {
      throw new BadRequestException('Choose a valid start time that is not in the past');
    }
    if (start > Date.now() + MAX_BOOKING_AHEAD_MS) {
      throw new BadRequestException(
        `Choose a start time within the next ${MAX_BOOKING_AHEAD_DAYS} days`,
      );
    }

    // 1. Verify catalogue item enablement
    const catalogItem = await manager.withRepository(this.catalogRepo).findOne({
      where: { id: dto.serviceCatalogId, organizationId: orgId },
      relations: ['globalService'],
    });

    if (!catalogItem || !catalogItem.isEnabled || catalogItem.globalService?.isActive === false) {
      throw new BadRequestException('Selected service is not enabled in this organization (D#10)');
    }

    // 2. Resolve Beneficiary Membership and Creation Channel
    let beneficiaryMembershipId: string;
    const creationChannel = dto.creationChannel ?? CreationChannel.DIRECT_BENEFICIARY;
    let caregiverAuthId: string | null = null;

    if (creationChannel === CreationChannel.DIRECT_BENEFICIARY) {
      // Find calling user's membership in this organization
      const callerMembership = await manager.withRepository(this.membershipRepo).findOne({
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
      const caregiverMembership = await manager.withRepository(this.membershipRepo).findOne({
        where: { userId: callingUserId, organizationId: orgId },
      });

      if (!caregiverMembership || caregiverMembership.status !== MembershipStatus.APPROVED) {
        throw new ForbiddenException('Caregiver is not an approved member of this organization');
      }

      const caregiverAuth = await this.beneficiariesService.verifyCaregiverProxyAccess(
        orgId,
        caregiverMembership.id,
        dto.beneficiaryMembershipId,
        'initiate',
        manager,
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

    const blocked: unknown[] = await manager.query(
      `SELECT 1 FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND (m.status IN ('SUSPENDED', 'REVOKED') OR u.status <> 'ACTIVE'
         OR EXISTS (SELECT 1 FROM global_account_restrictions r
           WHERE r.user_id = u.id AND r.status = 'ACTIVE'))`,
      [beneficiaryMembershipId],
    );
    if (blocked.length > 0) {
      throw new ForbiddenException('This person cannot be booked for right now');
    }

    // 3. Verify Beneficiary Eligibility and Frequency Quota (D#24, D#26, FR-BEN-04)
    await this.beneficiariesService.checkEligibilityAndQuota(
      orgId,
      beneficiaryMembershipId,
      catalogItem.globalService?.categoryId,
      manager,
    );

    // 4. Duplicate active request check for safety
    const existingDuplicate = await requestRepo.findOne({
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

    // 5. Generate unique human-readable request number: REQ-<SHORT_ORG_CODE>-<YYYYMM>-<RANDOM_ID>
    const requestNumber = await this.generateRequestNumber(org.code);

    // 6. Create Service Request record
    const request = requestRepo.create({
      organizationId: orgId,
      requestNumber,
      idempotencyKey: idempotencyKey ?? null,
      beneficiaryMembershipId,
      serviceCatalogId: catalogItem.id,
      createdByUserId: callingUserId,
      creationChannel,
      caregiverAuthorizationId: caregiverAuthId,
      urgency: dto.urgency,
      status: ServiceRequestStatus.MATCHING_ACTIVE,
      scheduledStartTime: new Date(dto.scheduledStartTime),
      expectedDurationMinutes: dto.expectedDurationMinutes ?? 60,
      minVolunteers: catalogItem.minVolunteers,
      preferredVolunteers: catalogItem.preferredVolunteers,
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

    const saved = await requestRepo.save(request);

    // 7. Mandatory Immediate Candidate Matching Dispatch (D#60, D#61)
    // Runs candidate search and sends offers immediately for BOTH immediate and scheduled requests
    await this.matchingService.findCandidatesAndDispatchOffers(saved, undefined, manager);

    await this.auditService.logEvent(
      {
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
      },
      manager,
    );

    return saved;
  }

  // ─── List & Get Requests Scoped to User & Organization ───────────────────────
  async listRequests(
    orgId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext | undefined,
    query: RequestQueryDto,
  ): Promise<{ data: ServiceRequestView[]; total: number }> {
    const qb = this.requestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.serviceCatalog', 'cat')
      .leftJoinAndSelect('cat.globalService', 'gs')
      .leftJoinAndSelect('req.beneficiaryMembership', 'bm')
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
    if (query.needsReview && isCoordOrAdmin) {
      qb.andWhere(
        `(req.below_minimum_alerted_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM volunteer_assignments review
          WHERE review.service_request_id = req.id
            AND ((review.review_requested_at IS NOT NULL AND review.review_resolved_at IS NULL)
              OR (review.status = 'IN_PROGRESS' AND review.long_visit_alerted_at IS NOT NULL))))`,
      );
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
    // Lists carry no assignments, but each started visit still needs its stage.
    const started = data.filter((r) => r.status === ServiceRequestStatus.IN_PROGRESS);
    const visits = started.length
      ? await this.requestRepo.manager.find(VolunteerAssignment, {
          where: { serviceRequestId: In(started.map((r) => r.id)) },
        })
      : [];
    return {
      data: data.map((request) =>
        toRequestView(
          request,
          Boolean(isCoordOrAdmin),
          visits.filter((visit) => visit.serviceRequestId === request.id),
        ),
      ),
      total,
    };
  }

  async getRequestById(
    orgId: string,
    requestId: string,
    callingUserId?: string,
    membershipContext?: EvaluatedMembershipContext,
    ipAddress?: string,
  ): Promise<ServiceRequestView> {
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
    let isCoordOrAdmin = false;
    if (membershipContext) {
      isCoordOrAdmin =
        membershipContext.isSuperAdmin ||
        membershipContext.roles.includes(UserRole.COORDINATOR) ||
        membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);

      // Creating a request grants nothing lasting: a caregiver's access ends with their
      // authorization, which is checked below.
      const isBeneficiary = request.beneficiaryMembershipId === membershipContext.membershipId;

      if (!isCoordOrAdmin && !isBeneficiary) {
        const isCaregiver = await this.beneficiariesService
          .verifyCaregiverProxyAccess(
            orgId,
            membershipContext.membershipId,
            request.beneficiaryMembershipId,
            'view',
          )
          .catch(() => null);

        if (!isCaregiver) {
          throw new ForbiddenException('You do not have permission to view this service request');
        }
      }
    }

    if (
      isCoordOrAdmin &&
      callingUserId &&
      request.beneficiaryMembershipId !== membershipContext?.membershipId
    ) {
      await this.auditService.logEvent({
        eventType: 'SERVICE_REQUEST_VIEWED',
        actorId: callingUserId,
        targetId: request.id,
        targetType: 'service_requests',
        organizationId: orgId,
        ipAddress: ipAddress ?? null,
      });
    }
    return toRequestView(request, isCoordOrAdmin);
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
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
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
        } else if (request.beneficiaryMembershipId === membershipContext.membershipId) {
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
            throw new ForbiddenException(
              'You do not have permission to cancel this service request',
            );
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

      request.assignments = await manager
        .getRepository(VolunteerAssignment)
        .find({ where: { serviceRequestId: request.id } });
      if (request.assignments.some(hasStarted)) {
        throw new BadRequestException(
          'A volunteer has already started. A coordinator must decide this visit.',
        );
      }
      return this.cancelLocked(manager, request, callingUserId, cancellerRole, dto, ipAddress);
    });
  }

  /**
   * A restricted beneficiary's requests that have not started are cancelled in the transaction
   * that restricts them. A visit under way is returned, for the coordinator to decide.
   */
  async cancelForRestriction(
    manager: EntityManager,
    membershipIds: string[],
    actorId: string,
    ipAddress?: string,
  ): Promise<{ cancelled: number; underWay: { organizationId: string; id: string }[] }> {
    const requests = await manager.getRepository(ServiceRequest).find({
      where: {
        beneficiaryMembershipId: In(membershipIds),
        status: In([...NOT_STARTED, ServiceRequestStatus.IN_PROGRESS]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    const underWay: { organizationId: string; id: string }[] = [];
    let cancelled = 0;
    for (const request of requests) {
      request.assignments = await manager
        .getRepository(VolunteerAssignment)
        .find({ where: { serviceRequestId: request.id } });
      if (
        request.status === ServiceRequestStatus.IN_PROGRESS ||
        request.assignments.some(hasStarted)
      ) {
        underWay.push({ organizationId: request.organizationId, id: request.id });
        continue;
      }
      await this.cancelLocked(
        manager,
        request,
        actorId,
        CancellerRole.SYSTEM,
        // Neutral on purpose: volunteers and caregivers may read why a visit was cancelled.
        { reasonCode: 'ACCOUNT_UNAVAILABLE', notes: 'Cancelled automatically' },
        ipAddress,
      );
      cancelled += 1;
    }
    return { cancelled, underWay };
  }

  /** The caller holds the request's lock, has loaded its assignments and has checked it can end. */
  private async cancelLocked(
    manager: EntityManager,
    request: ServiceRequest,
    callingUserId: string,
    cancellerRole: CancellerRole,
    dto: CancelServiceRequestDto,
    ipAddress?: string,
  ): Promise<ServiceRequest> {
    const orgId = request.organizationId;
    {
      // Compute hours before start for reliability scoring
      const nowMs = Date.now();
      const startMs = new Date(request.scheduledStartTime).getTime();
      const hoursBeforeStart = Math.max(0, (startMs - nowMs) / (1000 * 60 * 60));

      request.status = ServiceRequestStatus.CANCELLED;
      const saved = await manager.getRepository(ServiceRequest).save(request);
      const notice = {
        organizationId: orgId,
        requestId: request.id,
        type: 'REQUEST_CANCELLED',
        title: 'Visit cancelled',
        body: 'This visit was cancelled. You do not need to go.',
      };
      await this.notifications.notifyMemberships(
        manager,
        (request.assignments ?? [])
          .filter((assignment) => assignment.status === VolunteerAssignmentStatus.ACCEPTED)
          .map((assignment) => assignment.volunteerMembershipId),
        notice,
      );
      await this.notifications.notifyRequestOwners(
        manager,
        request,
        { ...notice, body: 'Your request was cancelled. Open the app for details.' },
        callingUserId,
      );
      // Cancel all offered / accepted assignments
      if (request.assignments && request.assignments.length > 0) {
        for (const assignment of request.assignments) {
          if (
            assignment.status === VolunteerAssignmentStatus.OFFERED ||
            assignment.status === VolunteerAssignmentStatus.ACCEPTED
          ) {
            assignment.status = VolunteerAssignmentStatus.CANCELLED;
            await manager.getRepository(VolunteerAssignment).save(assignment);
          }
        }
      }

      const cancellation = manager.getRepository(RequestCancellation).create({
        organizationId: orgId,
        serviceRequestId: request.id,
        cancelledByUserId: callingUserId,
        cancellerRole,
        reasonCode: dto.reasonCode,
        notes: dto.notes,
        hoursBeforeStart: Number(hoursBeforeStart.toFixed(2)),
      });
      await manager.getRepository(RequestCancellation).save(cancellation);

      await this.auditService.logEvent(
        {
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
        },
        manager,
      );

      return saved;
    }
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
    const context = await this.authorizationService.evaluateOrganizationAccess(
      callingUserId,
      orgId,
    );
    membershipContext = context;
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      const requests = manager.getRepository(ServiceRequest);
      const history = manager.getRepository(RequestRescheduleHistory);
      const request = await requests.findOne({
        where: { id: requestId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException(`Service request '${requestId}' not found`);
      {
        const isCoordOrAdmin =
          membershipContext.isSuperAdmin ||
          membershipContext.roles.includes(UserRole.COORDINATOR) ||
          membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);

        const isBeneficiary = request.beneficiaryMembershipId === membershipContext.membershipId;

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
        [
          ServiceRequestStatus.IN_PROGRESS,
          ServiceRequestStatus.COMPLETED,
          ServiceRequestStatus.CANCELLED,
        ].includes(request.status)
      ) {
        throw new BadRequestException(`Cannot reschedule request in status '${request.status}'`);
      }
      const newStartTime = new Date(dto.newStartTime);
      if (!Number.isFinite(newStartTime.getTime()) || newStartTime.getTime() <= Date.now()) {
        throw new BadRequestException('The new start time must be in the future');
      }
      if (newStartTime.getTime() > Date.now() + MAX_BOOKING_AHEAD_MS) {
        throw new BadRequestException(
          `Choose a start time within the next ${MAX_BOOKING_AHEAD_DAYS} days`,
        );
      }
      if (newStartTime.getTime() === new Date(request.scheduledStartTime).getTime()) return request;
      if (request.status === ServiceRequestStatus.EXPIRED_UNMATCHED) {
        // An expired request no longer counts toward the monthly limit, so reopening it is
        // a new booking and must fit the limit and the current eligibility.
        const catalogItem = await manager.withRepository(this.catalogRepo).findOne({
          where: { id: request.serviceCatalogId, organizationId: orgId },
          relations: ['globalService'],
        });
        await this.beneficiariesService.checkEligibilityAndQuota(
          orgId,
          request.beneficiaryMembershipId,
          catalogItem?.globalService?.categoryId,
          manager,
        );
      }
      const previousStartTime = request.scheduledStartTime;
      const record = await history.save(
        history.create({
          organizationId: orgId,
          serviceRequestId: request.id,
          rescheduledByUserId: callingUserId,
          previousStartTime,
          newStartTime,
          reason: dto.reason,
        }),
      );
      request.scheduledStartTime = newStartTime;
      request.latestRescheduleId = record.id;
      request.status = ServiceRequestStatus.MATCHING_ACTIVE;
      request.matchingTier = 1;
      const saved = await requests.save(request);
      await this.matchingService.reopenForReschedule(manager, saved, record);
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_REQUEST_RESCHEDULED',
          actorId: callingUserId,
          targetId: request.id,
          targetType: 'service_requests',
          organizationId: orgId,
          payload: { previousStartTime, newStartTime, reason: dto.reason },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return saved;
    });
  }

  // ─── Confirm Completed Service ──────────────────────────────────────────────
  // The beneficiary, an authorized caregiver or staff confirms a finished
  // assignment. A volunteer never confirms their own service, even as staff.
  async confirmCompletion(
    orgId: string,
    requestId: string,
    assignmentId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext,
    dto: ConfirmServiceCompletionDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<
    VolunteerAssignment & { creditsEarned: number; creditsHeld: boolean; reviewRequired: boolean }
  > {
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      const { request, assignment, volunteer, isStaff, confirmerRole } =
        await this.lockServiceDecision(
          manager,
          orgId,
          requestId,
          assignmentId,
          callingUserId,
          membershipContext,
        );
      if (assignment.confirmedAt) {
        throw new ConflictException('This service has already been confirmed');
      }
      if (
        assignment.status !== VolunteerAssignmentStatus.COMPLETED ||
        !assignment.finishedAt ||
        !assignment.reportedMinutes
      ) {
        throw new ConflictException('The volunteer has not finished this service yet');
      }
      if (awaitingReview(assignment)) {
        throw new ConflictException('A coordinator is reviewing this service');
      }
      const minutes = dto.minutes ?? assignment.reportedMinutes;
      if (minutes > assignment.reportedMinutes) {
        throw new BadRequestException(
          `At most the ${assignment.reportedMinutes} reported minutes can be confirmed`,
        );
      }

      // Two people who agree cannot create credits alone: unusual claims go to staff.
      const independentStaff =
        isStaff && request.beneficiaryMembershipId !== membershipContext.membershipId;
      const reason = independentStaff
        ? null
        : await this.reviewReasonFor(manager, request, assignment, minutes, now);
      if (reason) {
        const saved = await this.sendForReview(manager, request, assignment, {
          reason,
          minutes,
          notes: null,
          requestedBy: callingUserId,
          ipAddress,
          now,
        });
        return Object.assign(saved, {
          creditsEarned: 0,
          creditsHeld: false,
          reviewRequired: true,
        });
      }

      const { saved, credit } = await this.payAssignment(
        manager,
        request,
        assignment,
        volunteer,
        minutes,
        callingUserId,
        now,
      );
      const requestCompleted = await this.closeRequestIfDone(manager, request);

      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_CONFIRMED',
          actorId: callingUserId,
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            confirmerRole,
            reportedMinutes: assignment.reportedMinutes,
            confirmedMinutes: minutes,
            requestCompleted,
            creditsEarned: credit?.amount ?? 0,
            creditsHeld: credit?.held ?? false,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return Object.assign(saved, {
        creditsEarned: credit?.amount ?? 0,
        creditsHeld: credit?.held ?? false,
        reviewRequired: false,
      });
    });
  }

  /** "This did not happen": no credits move until a coordinator decides. */
  async disputeCompletion(
    orgId: string,
    requestId: string,
    assignmentId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext,
    dto: DisputeServiceCompletionDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<VolunteerAssignment> {
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      const { request, assignment } = await this.lockServiceDecision(
        manager,
        orgId,
        requestId,
        assignmentId,
        callingUserId,
        membershipContext,
      );
      if (assignment.status !== VolunteerAssignmentStatus.COMPLETED || assignment.confirmedAt) {
        throw new ConflictException('Only a finished, unconfirmed service can be disputed');
      }
      if (assignment.reviewReason === AssignmentReviewReason.BENEFICIARY_DISPUTE) {
        throw new ConflictException('This service has already been reported');
      }
      if (assignment.reviewResolvedAt) {
        throw new ConflictException('A coordinator has already decided this service');
      }
      if (assignment.reviewReason === AssignmentReviewReason.SAFETY_ALERT) {
        throw new ConflictException('A coordinator is reviewing this service');
      }
      return this.sendForReview(manager, request, assignment, {
        reason: AssignmentReviewReason.BENEFICIARY_DISPUTE,
        minutes: null,
        notes: dto.reason,
        requestedBy: callingUserId,
        ipAddress,
        now,
      });
    });
  }

  /** The coordinator's decision on a reviewed visit, or on one stuck in progress. */
  async resolveServiceReview(
    orgId: string,
    requestId: string,
    assignmentId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext,
    dto: ResolveServiceReviewDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<VolunteerAssignment & { creditsEarned: number; creditsHeld: boolean }> {
    return this.requestRepo.manager.transaction('READ COMMITTED', async (manager) => {
      const { request, assignment, volunteer, isStaff } = await this.lockServiceDecision(
        manager,
        orgId,
        requestId,
        assignmentId,
        callingUserId,
        membershipContext,
      );
      if (!isStaff) throw new ForbiddenException('Coordinator authority required');
      if (
        request.beneficiaryMembershipId === membershipContext.membershipId ||
        assignment.reviewRequestedByUserId === callingUserId
      ) {
        throw new ForbiddenException('Another coordinator must decide this visit');
      }
      const inProgress = assignment.status === VolunteerAssignmentStatus.IN_PROGRESS;
      if (assignment.pausedAt) {
        throw new ConflictException('Handle the safety alert on this visit first');
      }
      if (!inProgress && !awaitingReview(assignment)) {
        throw new ConflictException('This service is not waiting for a decision');
      }

      let credit: { amount: number; held: boolean } | null = null;
      let saved = assignment;
      if (dto.decision === AssignmentReviewDecision.PAY) {
        if (inProgress) {
          if (!dto.minutes) {
            throw new BadRequestException('Enter the minutes to pay for this visit');
          }
          assignment.status = VolunteerAssignmentStatus.COMPLETED;
          assignment.finishedAt = now;
          assignment.reportedMinutes = dto.minutes;
        }
        const minutes =
          dto.minutes ?? assignment.reviewMinutes ?? (assignment.reportedMinutes as number);
        if (minutes > (assignment.reportedMinutes as number)) {
          throw new BadRequestException(
            `At most the ${assignment.reportedMinutes} reported minutes can be paid`,
          );
        }
        assignment.reviewResolvedAt = now;
        assignment.reviewResolvedByUserId = callingUserId;
        assignment.reviewOutcome = dto.decision;
        ({ saved, credit } = await this.payAssignment(
          manager,
          request,
          assignment,
          volunteer,
          minutes,
          callingUserId,
          now,
        ));
      } else {
        assignment.status = VolunteerAssignmentStatus.NOT_DELIVERED;
        assignment.reviewResolvedAt = now;
        assignment.reviewResolvedByUserId = callingUserId;
        assignment.reviewOutcome = dto.decision;
        saved = await manager.getRepository(VolunteerAssignment).save(assignment);
      }

      // The coordinator stopped someone still working, which can leave a team short.
      if (inProgress) await this.matchingService.afterVolunteerStopped(manager, request, now);
      await this.closeRequestIfDone(manager, request, callingUserId, dto.notes);
      const notice = {
        organizationId: orgId,
        requestId: request.id,
        type: 'SERVICE_REVIEWED',
        title: 'Your coordinator made a decision',
        body: 'Open the app to see the result for this visit.',
      };
      await this.notifications.notifyMemberships(
        manager,
        [assignment.volunteerMembershipId],
        notice,
      );
      await this.notifications.notifyRequestOwners(manager, request, notice, callingUserId);
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_REVIEW_RESOLVED',
          actorId: callingUserId,
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            decision: dto.decision,
            reason: assignment.reviewReason ?? null,
            minutes: assignment.confirmedMinutes ?? null,
            notes: dto.notes,
            creditsEarned: credit?.amount ?? 0,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return Object.assign(saved, {
        creditsEarned: credit?.amount ?? 0,
        creditsHeld: credit?.held ?? false,
      });
    });
  }

  /** Locks the request and assignment, and refuses anyone with no say over this visit. */
  private async lockServiceDecision(
    manager: EntityManager,
    orgId: string,
    requestId: string,
    assignmentId: string,
    callingUserId: string,
    membershipContext: EvaluatedMembershipContext,
  ) {
    const request = await manager.getRepository(ServiceRequest).findOne({
      where: { id: requestId, organizationId: orgId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException(`Service request '${requestId}' not found`);

    const isStaff =
      membershipContext.isSuperAdmin ||
      membershipContext.roles.includes(UserRole.COORDINATOR) ||
      membershipContext.roles.includes(UserRole.MUNICIPALITY_ADMIN);
    let confirmerRole = isStaff ? 'COORDINATOR' : 'BENEFICIARY';
    if (!isStaff && request.beneficiaryMembershipId !== membershipContext.membershipId) {
      const caregiver = await this.beneficiariesService
        .verifyCaregiverProxyAccess(
          orgId,
          membershipContext.membershipId,
          request.beneficiaryMembershipId,
          'confirm',
        )
        .catch(() => null);
      if (!caregiver) {
        throw new ForbiddenException('You do not have permission to confirm this service');
      }
      confirmerRole = 'CAREGIVER';
    }

    const assignment = await manager.getRepository(VolunteerAssignment).findOne({
      where: { id: assignmentId, serviceRequestId: request.id, organizationId: orgId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!assignment) throw new NotFoundException(`Assignment '${assignmentId}' not found`);
    const volunteer = await manager.getRepository(OrganizationMembership).findOne({
      where: { id: assignment.volunteerMembershipId },
    });
    if (
      assignment.volunteerMembershipId === membershipContext.membershipId ||
      volunteer?.userId === callingUserId
    ) {
      throw new ForbiddenException('A volunteer cannot confirm their own service');
    }
    return { request, assignment, volunteer: volunteer!, isStaff, confirmerRole };
  }

  private async reviewReasonFor(
    manager: EntityManager,
    request: ServiceRequest,
    assignment: VolunteerAssignment,
    minutes: number,
    now: Date,
  ): Promise<AssignmentReviewReason | null> {
    const timed = workedMinutes(assignment, new Date(assignment.finishedAt!));
    if (minutes > timed + TIMED_WORK_TOLERANCE_MINUTES) {
      return AssignmentReviewReason.MINUTES_OVER_TIMED_WORK;
    }
    if (minutes > request.expectedDurationMinutes + EXPECTED_DURATION_TOLERANCE_MINUTES) {
      return AssignmentReviewReason.MINUTES_OVER_EXPECTED;
    }
    const [pair]: { total: number }[] = await manager.query(
      `SELECT COALESCE(SUM(a.confirmed_minutes), 0)::int AS total
       FROM volunteer_assignments a
       JOIN service_requests r ON r.id = a.service_request_id
       WHERE a.volunteer_membership_id = $1 AND r.beneficiary_membership_id = $2
         AND a.confirmed_at > $3`,
      [
        assignment.volunteerMembershipId,
        request.beneficiaryMembershipId,
        new Date(now.getTime() - PAIR_LIMIT_WINDOW_MS),
      ],
    );
    return (pair?.total ?? 0) + minutes > pairMonthlyLimitMinutes()
      ? AssignmentReviewReason.PAIR_MONTHLY_LIMIT
      : null;
  }

  private async sendForReview(
    manager: EntityManager,
    request: ServiceRequest,
    assignment: VolunteerAssignment,
    review: {
      reason: AssignmentReviewReason;
      minutes: number | null;
      notes: string | null;
      requestedBy: string;
      ipAddress: string | undefined;
      now: Date;
    },
  ): Promise<VolunteerAssignment> {
    assignment.reviewReason = review.reason;
    assignment.reviewMinutes = review.minutes;
    assignment.reviewNotes = review.notes;
    assignment.reviewRequestedAt = review.now;
    assignment.reviewRequestedByUserId = review.requestedBy;
    const saved = await manager.getRepository(VolunteerAssignment).save(assignment);
    await this.notifications.notifyCoordinators(manager, {
      organizationId: request.organizationId,
      requestId: request.id,
      type: 'SERVICE_REVIEW_NEEDED',
      title: 'A visit needs your decision',
      body: 'Open the admin panel to review this visit.',
    });
    await this.auditService.logEvent(
      {
        eventType: 'SERVICE_REVIEW_REQUESTED',
        actorId: review.requestedBy,
        targetId: saved.id,
        targetType: 'volunteer_assignments',
        organizationId: request.organizationId,
        payload: { serviceRequestId: request.id, reason: review.reason, notes: review.notes },
        ipAddress: review.ipAddress ?? null,
      },
      manager,
    );
    return saved;
  }

  /** Pays in the same transaction, so a confirmation and its credits never separate. */
  private async payAssignment(
    manager: EntityManager,
    request: ServiceRequest,
    assignment: VolunteerAssignment,
    volunteer: OrganizationMembership,
    minutes: number,
    confirmedBy: string,
    now: Date,
  ) {
    assignment.confirmedAt = now;
    assignment.confirmedByUserId = confirmedBy;
    assignment.confirmedMinutes = minutes;
    const saved = await manager.getRepository(VolunteerAssignment).save(assignment);
    const credit = await this.timeLedgerService.postServiceEarning(manager, {
      volunteerUserId: volunteer.userId,
      organizationId: request.organizationId,
      serviceRequestId: request.id,
      volunteerAssignmentId: saved.id,
      minutes,
      policy: await this.timeLedgerService.policyForRequest(manager, request.id),
      reference: request.requestNumber,
    });
    await this.loyalty.awardVerifiedService(manager, saved.id);
    await this.notifications.notifyUsers(manager, [volunteer.userId], {
      organizationId: request.organizationId,
      requestId: request.id,
      type: 'SERVICE_CONFIRMED',
      title: 'Your help was confirmed',
      body: 'Thank you. Open the app to see your time credits.',
    });
    return { saved, credit };
  }

  /**
   * The request ends once no helper is still due, working, unconfirmed or under review.
   * If nobody delivered anything, it ends as cancelled, on the record of who decided.
   */
  private async closeRequestIfDone(
    manager: EntityManager,
    request: ServiceRequest,
    decidedBy?: string,
    notes?: string,
  ): Promise<boolean> {
    if ((await openHelpCount(manager, request.id)) > 0) return false;
    if (request.status === ServiceRequestStatus.CANCELLED) return false;
    // Someone must still take over, or a coordinator must stop looking.
    if (request.belowMinimumAt) return false;
    const delivered =
      !decidedBy ||
      (await manager.getRepository(VolunteerAssignment).count({
        where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.COMPLETED },
      })) > 0;
    if (delivered) {
      request.status = ServiceRequestStatus.COMPLETED;
      await manager.getRepository(ServiceRequest).save(request);
      return true;
    }
    request.status = ServiceRequestStatus.CANCELLED;
    await manager.getRepository(ServiceRequest).save(request);
    const cancellations = manager.getRepository(RequestCancellation);
    await cancellations.save(
      cancellations.create({
        organizationId: request.organizationId,
        serviceRequestId: request.id,
        cancelledByUserId: decidedBy,
        cancellerRole: CancellerRole.COORDINATOR,
        reasonCode: 'SERVICE_NOT_DELIVERED',
        notes: notes ?? 'A coordinator decided the help was not given',
        hoursBeforeStart: 0,
      }),
    );
    return false;
  }

  private async generateRequestNumber(orgCode: string): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const suffix = randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    // Organization codes may be 50 characters; request_number is limited to 50.
    return `REQ-${orgCode.toUpperCase().slice(0, 15)}-${yearMonth}-${suffix}`;
  }
}

const sameCoordinate = (saved: unknown, sent: number | undefined): boolean =>
  saved === null || saved === undefined
    ? sent === undefined || sent === null
    : sent !== undefined && sent !== null && Math.abs(Number(saved) - sent) < 1e-7;

/**
 * A retry repeats every detail of the first request. The start time is only compared until a
 * reschedule has moved it, since a retry after that still means the same booking.
 */
export function sameRequestDetails(saved: ServiceRequest, dto: CreateServiceRequestDto): boolean {
  return (
    saved.serviceCatalogId === dto.serviceCatalogId &&
    saved.urgency === dto.urgency &&
    (!dto.beneficiaryMembershipId ||
      saved.beneficiaryMembershipId === dto.beneficiaryMembershipId) &&
    saved.expectedDurationMinutes === (dto.expectedDurationMinutes ?? 60) &&
    saved.locationAddressText === dto.locationAddressText &&
    saved.locationWardNumber === dto.locationWardNumber &&
    (saved.locationLandmark ?? null) === (dto.locationLandmark ?? null) &&
    saved.locationPostalCode === dto.locationPostalCode &&
    (saved.beneficiaryNotes ?? null) === (dto.beneficiaryNotes ?? null) &&
    sameCoordinate(saved.locationLat, dto.locationLat) &&
    sameCoordinate(saved.locationLng, dto.locationLng) &&
    (Boolean(saved.latestRescheduleId) ||
      new Date(saved.scheduledStartTime).getTime() === new Date(dto.scheduledStartTime).getTime())
  );
}
