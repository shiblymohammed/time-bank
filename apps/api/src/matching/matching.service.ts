import {
  Logger,
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, LessThan, In, IsNull, Not } from 'typeorm';
import {
  AccountStatus,
  CancellerRole,
  GlobalRestrictionStatus,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  SkillVerificationStatus,
  UserRole,
  VolunteerAssignmentStatus,
  UrgencyType,
  MatchingRoundStatus,
  OrganizationStatus,
} from '@ktb/shared-types';

import { VolunteerSkill } from './entities/volunteer-skill.entity';
import { VolunteerAvailability } from './entities/volunteer-availability.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { OperationalZone } from './entities/operational-zone.entity';
import { VolunteerZoneAssignment } from './entities/volunteer-zone-assignment.entity';
import { MatchingRound } from './entities/matching-round.entity';
import { RequestRescheduleHistory } from '../requests/entities/request-reschedule.entity';
import { RequestCancellation } from '../requests/entities/request-cancellation.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { User } from '../identity/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { MatchingConfigService } from './matching-config.service';
import { assignmentSchedule } from './assignment-schedule';
import {
  FINISH_REMINDER_GRACE_MINUTES,
  NO_SHOW_GRACE_MINUTES,
  TEAM_FINISH_WAIT_MINUTES,
  UNFILLED_GRACE_MINUTES,
  openHelpCount,
  workedMinutes,
} from './booking-recovery';
import { safetyState } from '../requests/request-view';
import {
  CANDIDATE_RANKING_STRATEGY,
  CandidateRankingStrategy,
  CandidateMatchProfile,
} from './ranking/ranking-strategy.interface';

import { UpdateVolunteerAvailabilityDto } from './dto/update-volunteer-availability.dto';
import { VerifyVolunteerSkillDto } from './dto/verify-volunteer-skill.dto';
import { AcceptVolunteerOfferDto } from './dto/accept-volunteer-offer.dto';
import { DeclineVolunteerOfferDto } from './dto/decline-volunteer-offer.dto';
import { WithdrawVolunteerAssignmentDto } from './dto/withdraw-volunteer-assignment.dto';
import { FinishVolunteerAssignmentDto } from './dto/finish-volunteer-assignment.dto';
import { VisitOperationDto } from './dto/visit-operation.dto';
import {
  alreadyDone,
  fingerprint,
  latest,
  phoneTime,
  PhoneTime,
  recordOperation,
} from './visit-operations';
import { HandOverVisitDto, InviteTeammateDto, LeaveTeamVisitDto } from './dto/team-visit.dto';
import { CoordinatorDispatchDto } from './dto/coordinator-dispatch.dto';
import { DispatchVolunteerQueryDto } from './dto/dispatch-volunteer-query.dto';
import { OrganizationServiceCatalog } from '../catalogue/entities/organization-service-catalog.entity';
import { CreateOperationalZoneDto } from './dto/create-operational-zone.dto';
import { UpdateOperationalZoneDto } from './dto/update-operational-zone.dto';
import { AssignVolunteerZoneDto } from './dto/assign-volunteer-zone.dto';

/** A volunteer may start this long before the scheduled time (travel, early arrival). */
export const START_EARLY_MINUTES = 60;
/** The longest single service a volunteer can report. */
export const MAX_SERVICE_MINUTES = 720;

/** Unfilled requests handled per worker run; the next run picks up any remainder. */
const PROGRESSION_BATCH_SIZE = 50;
/** How many teammates one volunteer can invite to a visit. */
const MAX_INVITES_PER_VISIT = 5;
/** Booked: taking up a place, whether or not they have started. */
const BOOKED_STATUSES = [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS];

/**
 * SQL over an assignment aliased `a`: its volunteer would no longer pass lockVolunteer.
 * Keep the two in step.
 */
/** A caregiver confirms visits for their beneficiary, so they never serve that beneficiary. */
const NOT_THEIR_CAREGIVER = `NOT EXISTS (SELECT 1 FROM caregiver_authorizations ca
  WHERE ca.caregiver_membership_id = m.id AND ca.beneficiary_membership_id = :careFor
    AND ca.status = 'APPROVED')`;

const INELIGIBLE_VOLUNTEER = `NOT EXISTS (
  SELECT 1 FROM organization_memberships vm
  JOIN users vu ON vu.id = vm.user_id
  WHERE vm.id = a.volunteer_membership_id
    AND vm.status = 'APPROVED'
    AND vu.status = 'ACTIVE'
    AND EXISTS (SELECT 1 FROM membership_role_grants vg
      WHERE vg.membership_id = vm.id AND vg.role = 'VOLUNTEER' AND vg.status = 'ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM global_account_restrictions vr
      WHERE vr.user_id = vu.id AND vr.status = 'ACTIVE'))`;

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectRepository(VolunteerSkill)
    private readonly skillRepo: Repository<VolunteerSkill>,
    @InjectRepository(VolunteerAvailability)
    private readonly availabilityRepo: Repository<VolunteerAvailability>,
    @InjectRepository(VolunteerAssignment)
    private readonly assignmentRepo: Repository<VolunteerAssignment>,
    @InjectRepository(OperationalZone)
    private readonly zoneRepo: Repository<OperationalZone>,
    @InjectRepository(VolunteerZoneAssignment)
    private readonly zoneAssignRepo: Repository<VolunteerZoneAssignment>,
    @InjectRepository(MatchingRound)
    private readonly roundRepo: Repository<MatchingRound>,
    @InjectRepository(ServiceRequest)
    private readonly requestRepo: Repository<ServiceRequest>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(GlobalAccountRestriction)
    private readonly restrictionRepo: Repository<GlobalAccountRestriction>,
    @Inject(CANDIDATE_RANKING_STRATEGY)
    private readonly rankingStrategy: CandidateRankingStrategy,
    private readonly matchingConfig: MatchingConfigService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Operational Zones (Coordinator-Managed) ─────────────────────────────────
  async createZone(
    orgId: string,
    dto: CreateOperationalZoneDto,
    coordinatorId: string,
    ipAddress?: string,
  ): Promise<OperationalZone> {
    const existing = await this.zoneRepo.findOne({
      where: { organizationId: orgId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Operational zone with code '${dto.code}' already exists`);
    }

    const zone = this.zoneRepo.create({
      organizationId: orgId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      wardNumbers: dto.wardNumbers,
      centerLat: dto.centerLat ?? null,
      centerLng: dto.centerLng ?? null,
      radiusKm: dto.radiusKm ?? 5.0,
      isActive: dto.isActive ?? true,
      createdByUserId: coordinatorId,
    });

    const saved = await this.zoneRepo.save(zone);

    await this.auditService.logEvent({
      eventType: 'OPERATIONAL_ZONE_CREATED',
      actorId: coordinatorId,
      targetId: saved.id,
      targetType: 'operational_zones',
      organizationId: orgId,
      payload: { code: saved.code, name: saved.name, wards: saved.wardNumbers },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async updateZone(
    orgId: string,
    zoneId: string,
    dto: UpdateOperationalZoneDto,
  ): Promise<OperationalZone> {
    const zone = await this.zoneRepo.findOne({
      where: { id: zoneId, organizationId: orgId },
    });
    if (!zone) {
      throw new NotFoundException(`Operational zone '${zoneId}' not found`);
    }

    if (dto.name !== undefined) zone.name = dto.name;
    if (dto.description !== undefined) zone.description = dto.description ?? null;
    if (dto.wardNumbers !== undefined) zone.wardNumbers = dto.wardNumbers;
    if (dto.centerLat !== undefined) zone.centerLat = dto.centerLat ?? null;
    if (dto.centerLng !== undefined) zone.centerLng = dto.centerLng ?? null;
    if (dto.radiusKm !== undefined) zone.radiusKm = dto.radiusKm;
    if (dto.isActive !== undefined) zone.isActive = dto.isActive;

    return this.zoneRepo.save(zone);
  }

  async listZones(orgId: string): Promise<OperationalZone[]> {
    return this.zoneRepo.find({
      where: { organizationId: orgId },
      order: { name: 'ASC' },
    });
  }

  async getZone(orgId: string, zoneId: string): Promise<OperationalZone> {
    const zone = await this.zoneRepo.findOne({
      where: { id: zoneId, organizationId: orgId },
      relations: ['volunteerAssignments', 'volunteerAssignments.membership'],
    });
    if (!zone) {
      throw new NotFoundException(`Operational zone '${zoneId}' not found`);
    }
    return zone;
  }

  async assignVolunteerToZone(
    orgId: string,
    zoneId: string,
    dto: AssignVolunteerZoneDto,
    coordinatorId: string,
    ipAddress?: string,
  ): Promise<VolunteerZoneAssignment> {
    const zone = await this.zoneRepo.findOne({
      where: { id: zoneId, organizationId: orgId },
    });
    if (!zone) {
      throw new NotFoundException(`Operational zone '${zoneId}' not found`);
    }

    const membership = await this.membershipRepo.findOne({
      where: { id: dto.membershipId, organizationId: orgId },
    });
    if (!membership || membership.status !== MembershipStatus.APPROVED) {
      throw new NotFoundException('Volunteer membership not found or not approved');
    }

    let assignment = await this.zoneAssignRepo.findOne({
      where: { membershipId: dto.membershipId, zoneId },
    });

    if (!assignment) {
      assignment = this.zoneAssignRepo.create({
        organizationId: orgId,
        membershipId: dto.membershipId,
        zoneId,
        isPrimary: dto.isPrimary ?? false,
        assignedByUserId: coordinatorId,
      });
    } else {
      if (dto.isPrimary !== undefined) assignment.isPrimary = dto.isPrimary;
      assignment.assignedByUserId = coordinatorId;
      assignment.assignedAt = new Date();
    }

    const saved = await this.zoneAssignRepo.save(assignment);

    await this.auditService.logEvent({
      eventType: 'VOLUNTEER_ZONE_ASSIGNED',
      actorId: coordinatorId,
      targetId: saved.id,
      targetType: 'volunteer_zone_assignments',
      organizationId: orgId,
      payload: { zoneId, membershipId: dto.membershipId, isPrimary: saved.isPrimary },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async removeVolunteerFromZone(
    orgId: string,
    zoneId: string,
    membershipId: string,
    coordinatorId?: string,
    ipAddress?: string,
  ): Promise<void> {
    const assignment = await this.zoneAssignRepo.findOne({
      where: { organizationId: orgId, zoneId, membershipId },
    });
    if (!assignment) {
      throw new NotFoundException('Volunteer zone assignment not found');
    }

    await this.zoneAssignRepo.remove(assignment);

    await this.auditService.logEvent({
      eventType: 'VOLUNTEER_ZONE_REMOVED',
      actorId: coordinatorId ?? null,
      targetId: assignment.id,
      targetType: 'volunteer_zone_assignments',
      organizationId: orgId,
      payload: { zoneId, membershipId },
      ipAddress: ipAddress ?? null,
    });
  }

  async listVolunteerZones(
    orgId: string,
    membershipId: string,
    actorId: string,
  ): Promise<VolunteerZoneAssignment[]> {
    await this.authorizationService.assertMembershipAccess(actorId, orgId, membershipId);
    return this.zoneAssignRepo.find({
      where: { organizationId: orgId, membershipId },
      relations: ['zone'],
    });
  }

  // ─── Volunteer Availability Preferences ─────────────────────────────────────
  async updateAvailability(
    orgId: string,
    membershipId: string,
    dto: UpdateVolunteerAvailabilityDto,
    actorId: string,
  ): Promise<VolunteerAvailability> {
    await this.authorizationService.assertMembershipAccess(actorId, orgId, membershipId);
    let avail = await this.availabilityRepo.findOne({
      where: { organizationId: orgId, membershipId },
    });

    if (!avail) {
      avail = this.availabilityRepo.create({
        organizationId: orgId,
        membershipId,
        isAvailableImmediate: dto.isAvailableImmediate ?? true,
        maxTravelRadiusKm: dto.maxTravelRadiusKm ?? 5.0,
        preferredWardNumbers: dto.preferredWardNumbers ?? [],
        transientLat: dto.transientLat ?? null,
        transientLng: dto.transientLng ?? null,
        transientUpdatedAt: dto.transientLat ? new Date() : null,
        isGpsConsented: dto.isGpsConsented ?? true,
        residentialAddressText: dto.residentialAddressText ?? null,
        residentialWardNumber: dto.residentialWardNumber ?? null,
        residentialPostalCode: dto.residentialPostalCode ?? null,
        residentialLat: dto.residentialLat ?? null,
        residentialLng: dto.residentialLng ?? null,
      });
    } else {
      if (dto.isAvailableImmediate !== undefined)
        avail.isAvailableImmediate = dto.isAvailableImmediate;
      if (dto.maxTravelRadiusKm !== undefined) avail.maxTravelRadiusKm = dto.maxTravelRadiusKm;
      if (dto.preferredWardNumbers !== undefined)
        avail.preferredWardNumbers = dto.preferredWardNumbers;
      if (dto.transientLat !== undefined) {
        avail.transientLat = dto.transientLat;
        avail.transientLng = dto.transientLng ?? null;
        avail.transientUpdatedAt = new Date();
      }
      if (dto.isGpsConsented !== undefined) avail.isGpsConsented = dto.isGpsConsented;
      if (dto.residentialAddressText !== undefined)
        avail.residentialAddressText = dto.residentialAddressText ?? null;
      if (dto.residentialWardNumber !== undefined)
        avail.residentialWardNumber = dto.residentialWardNumber ?? null;
      if (dto.residentialPostalCode !== undefined)
        avail.residentialPostalCode = dto.residentialPostalCode ?? null;
      if (dto.residentialLat !== undefined) avail.residentialLat = dto.residentialLat ?? null;
      if (dto.residentialLng !== undefined) avail.residentialLng = dto.residentialLng ?? null;
    }

    return this.availabilityRepo.save(avail);
  }

  async getAvailability(
    orgId: string,
    membershipId: string,
    actorId: string,
  ): Promise<VolunteerAvailability> {
    await this.authorizationService.assertMembershipAccess(actorId, orgId, membershipId);
    let avail = await this.availabilityRepo.findOne({
      where: { organizationId: orgId, membershipId },
    });
    if (!avail) {
      avail = this.availabilityRepo.create({
        organizationId: orgId,
        membershipId,
        isAvailableImmediate: true,
        maxTravelRadiusKm: 5.0,
        preferredWardNumbers: [],
        isGpsConsented: true,
      });
      avail = await this.availabilityRepo.save(avail);
    }
    return avail;
  }

  // ─── Volunteer Skills ───────────────────────────────────────────────────────
  async verifySkill(
    orgId: string,
    dto: VerifyVolunteerSkillDto,
    coordinatorId: string,
    ipAddress?: string,
  ): Promise<VolunteerSkill> {
    const membership = await this.membershipRepo.findOne({
      where: { id: dto.membershipId, organizationId: orgId },
    });
    if (!membership || membership.status !== MembershipStatus.APPROVED) {
      throw new NotFoundException('Volunteer membership not found or not approved');
    }
    this.authorizationService.assertNoSelfEscalation(coordinatorId, membership.userId);

    let skill = await this.skillRepo.findOne({
      where: { membershipId: dto.membershipId, skillCode: dto.skillCode },
    });

    if (!skill) {
      skill = this.skillRepo.create({
        organizationId: orgId,
        membershipId: dto.membershipId,
        skillCode: dto.skillCode,
        status: dto.status,
        verificationNotes: dto.verificationNotes ?? null,
        verifiedByUserId: coordinatorId,
        verifiedAt: new Date(),
        documentId: dto.documentId ?? null,
      });
    } else {
      skill.status = dto.status;
      if (dto.verificationNotes !== undefined) {
        skill.verificationNotes = dto.verificationNotes ?? null;
      }
      skill.verifiedByUserId = coordinatorId;
      skill.verifiedAt = new Date();
      if (dto.documentId !== undefined) skill.documentId = dto.documentId ?? null;
    }

    const saved = await this.skillRepo.save(skill);

    await this.auditService.logEvent({
      eventType: 'VOLUNTEER_SKILL_VERIFIED',
      actorId: coordinatorId,
      targetId: saved.id,
      targetType: 'volunteer_skills',
      organizationId: orgId,
      payload: {
        membershipId: saved.membershipId,
        skillCode: saved.skillCode,
        status: saved.status,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listVolunteerSkills(
    orgId: string,
    membershipId: string,
    actorId: string,
  ): Promise<VolunteerSkill[]> {
    await this.authorizationService.assertMembershipAccess(actorId, orgId, membershipId);
    return this.skillRepo.find({
      where: { organizationId: orgId, membershipId },
    });
  }

  // ─── Proximity & Policy-Driven Candidate Matching Dispatch ───────────────────
  async listMyAssignments(orgId: string, actorId: string) {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (!context.roles.includes(UserRole.VOLUNTEER)) {
      throw new ForbiddenException('Approved volunteer role required');
    }
    const assignments = await this.assignmentRepo.find({
      where: { organizationId: orgId, volunteerMembershipId: context.membershipId },
      relations: [
        'serviceRequest',
        'serviceRequest.reschedules',
        'serviceRequest.beneficiaryMembership',
        'serviceRequest.beneficiaryMembership.user',
        'serviceRequest.serviceCatalog',
        'serviceRequest.serviceCatalog.globalService',
        'reschedule',
        'invitedByMembership',
        'invitedByMembership.user',
      ],
      order: { offeredAt: 'DESC' },
      take: 100,
    });
    // The address goes only to the volunteer who has taken the booking, and only while
    // the visit is ahead of them. An offer is sent to several people.
    const needsAddress = (status: VolunteerAssignmentStatus) =>
      status === VolunteerAssignmentStatus.ACCEPTED ||
      status === VolunteerAssignmentStatus.IN_PROGRESS;
    const openRequestIds = assignments
      .filter((assignment) => needsAddress(assignment.status))
      .map((assignment) => assignment.serviceRequestId);
    const booked = openRequestIds.length
      ? await this.assignmentRepo.find({
          where: { serviceRequestId: In(openRequestIds), status: In(BOOKED_STATUSES) },
          relations: ['volunteerMembership', 'volunteerMembership.user'],
        })
      : [];
    return assignments.map((assignment) => ({
      id: assignment.id,
      organizationId: assignment.organizationId,
      serviceRequestId: assignment.serviceRequestId,
      volunteerMembershipId: assignment.volunteerMembershipId,
      status: assignment.status,
      offeredAt: assignment.offeredAt,
      offerExpiresAt: assignment.offerExpiresAt,
      acceptedAt: assignment.acceptedAt,
      arrivedAt: assignment.arrivedAt ?? null,
      startedAt: assignment.startedAt ?? null,
      finishedAt: assignment.finishedAt ?? null,
      reportedMinutes: assignment.reportedMinutes ?? null,
      confirmedAt: assignment.confirmedAt ?? null,
      confirmedMinutes: assignment.confirmedMinutes ?? null,
      invitedByName: assignment.invitedByMembership?.user?.fullName ?? null,
      team: needsAddress(assignment.status) ? teamView(assignment, booked) : null,
      ...safetyState(assignment),
      scheduledStartTime: assignmentSchedule(assignment),
      reschedule: assignment.reschedule
        ? {
            id: assignment.reschedule.id,
            previousStartTime: assignment.reschedule.previousStartTime,
            newStartTime: assignment.reschedule.newStartTime,
          }
        : null,
      serviceRequest: assignment.serviceRequest
        ? {
            id: assignment.serviceRequest.id,
            requestNumber: assignment.serviceRequest.requestNumber,
            status: assignment.serviceRequest.status,
            scheduledStartTime: assignment.serviceRequest.scheduledStartTime,
            expectedDurationMinutes: assignment.serviceRequest.expectedDurationMinutes,
            locationAddressText: needsAddress(assignment.status)
              ? assignment.serviceRequest.locationAddressText
              : null,
            // Who they are helping, and how to call them, once the visit is theirs.
            beneficiary: needsAddress(assignment.status)
              ? {
                  fullName: assignment.serviceRequest.beneficiaryMembership?.user?.fullName ?? null,
                  phoneE164:
                    assignment.serviceRequest.beneficiaryMembership?.user?.phoneE164 ?? null,
                }
              : null,
            locationWardNumber: assignment.serviceRequest.locationWardNumber,
          }
        : null,
    }));
  }

  async findCandidatesAndDispatchOffers(
    request: ServiceRequest,
    _targetTier?: number,
    manager?: EntityManager,
  ): Promise<VolunteerAssignment[]> {
    if (!manager)
      return this.dataSource.transaction('READ COMMITTED', (transaction) =>
        this.findCandidatesAndDispatchOffers(request, _targetTier, transaction),
      );
    const repo = manager.getRepository(ServiceRequest);
    const locked = await repo.findOne({
      where: { id: request.id, organizationId: request.organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new NotFoundException('Service request not found');
    if (
      ![
        ServiceRequestStatus.MATCHING_ACTIVE,
        ServiceRequestStatus.PARTIALLY_ACCEPTED,
        ServiceRequestStatus.FULLY_MATCHED,
      ].includes(locked.status) &&
      !isShortMidVisit(locked)
    )
      return [];
    const current = await repo.findOne({
      where: { id: locked.id, organizationId: locked.organizationId },
      relations: ['serviceCatalog', 'serviceCatalog.globalService'],
    });
    if (!current?.serviceCatalog?.globalService)
      throw new BadRequestException('Service catalogue policies are required before matching');
    return this.dispatchCandidates(current, manager);
  }

  async reopenForReschedule(
    manager: EntityManager,
    request: ServiceRequest,
    history: RequestRescheduleHistory,
  ): Promise<void> {
    const assignments = manager.getRepository(VolunteerAssignment);
    const previous = await assignments.find({ where: { serviceRequestId: request.id } });
    if (previous.some((a) => a.status === VolunteerAssignmentStatus.IN_PROGRESS))
      throw new ConflictException('A volunteer has already started this request');
    const targets = new Map(
      previous
        .filter(
          (a) =>
            a.status === VolunteerAssignmentStatus.ACCEPTED ||
            (a.status === VolunteerAssignmentStatus.OFFERED && a.rescheduleId),
        )
        .map((a) => [a.volunteerMembershipId, a]),
    );
    await assignments.update(
      {
        serviceRequestId: request.id,
        status: In([VolunteerAssignmentStatus.OFFERED, VolunteerAssignmentStatus.ACCEPTED]),
      },
      { status: VolunteerAssignmentStatus.CANCELLED },
    );
    const rounds = manager.getRepository(MatchingRound);
    await rounds.update(
      { serviceRequestId: request.id, status: MatchingRoundStatus.ACTIVE },
      { status: MatchingRoundStatus.EXPIRED },
    );
    const latest = await rounds.findOne({
      where: { serviceRequestId: request.id },
      order: { roundNumber: 'DESC' },
    });
    request.matchingRadiusKm = this.matchingConfig.getRadiusForTier(1);
    await manager.save(ServiceRequest, request);
    const round = await rounds.save(
      rounds.create({
        organizationId: request.organizationId,
        serviceRequestId: request.id,
        roundNumber: (latest?.roundNumber ?? 0) + 1,
        tier: 1,
        searchRadiusKm: request.matchingRadiusKm,
        status: MatchingRoundStatus.ACTIVE,
        expiresAt: this.matchingConfig.getRoundExpiresAt(
          request.urgency,
          1,
          request.scheduledStartTime,
        ),
        offersDispatchedCount: targets.size,
        offersAcceptedCount: 0,
      }),
    );
    let slot = 1;
    for (const old of targets.values()) {
      await assignments.save(
        assignments.create({
          organizationId: request.organizationId,
          serviceRequestId: request.id,
          matchingRoundId: round.id,
          volunteerMembershipId: old.volunteerMembershipId,
          slotNumber: slot++,
          status: VolunteerAssignmentStatus.OFFERED,
          offeredAt: new Date(),
          offerExpiresAt: this.matchingConfig.getOfferExpiresAt(
            request.urgency,
            request.scheduledStartTime,
          ),
          rescheduleId: history.id,
          assignedByCoordinatorId: old.assignedByCoordinatorId ?? null,
        }),
      );
    }
    await this.notifications.notifyMemberships(manager, [...targets.keys()], {
      organizationId: request.organizationId,
      requestId: request.id,
      type: 'BOOKING_TIME_CHANGED',
      title: 'Visit time changed',
      body: 'Open the app and confirm whether you can still help at the new time.',
    });
    await this.findCandidatesAndDispatchOffers(request, 1, manager);
  }

  private async dispatchCandidates(
    request: ServiceRequest,
    manager: EntityManager,
  ): Promise<VolunteerAssignment[]> {
    const orgId = request.organizationId;
    const isImmediate = request.urgency === UrgencyType.IMMEDIATE;
    if (
      request.serviceCatalog?.isEnabled === false ||
      request.serviceCatalog?.globalService?.isActive === false
    )
      return [];

    // Check sensitive service flags (D#7: requiresCoordinatorDispatch)
    if (request.serviceCatalog?.requiresCoordinatorDispatch) {
      await this.auditService.logEvent(
        {
          eventType: 'MATCHING_SKIPPED_SENSITIVE_SERVICE',
          actorId: null,
          targetId: request.id,
          targetType: 'service_requests',
          organizationId: orgId,
          payload: {
            reason: 'Service item requires manual coordinator dispatch',
            catalogId: request.serviceCatalogId,
          },
        },
        manager,
      );
      return [];
    }

    const requiredSkills: string[] =
      request.serviceCatalog?.globalService?.requiredSkillCodes ?? [];
    const requiresSkills = request.serviceCatalog?.globalService?.requiresSkills ?? false;

    // Determine current matching tier and radius
    const currentTier = request.matchingTier ?? 1;
    const searchRadiusKm = this.matchingConfig.getRadiusForTier(currentTier);

    request.matchingTier = currentTier;
    request.matchingRadiusKm = searchRadiusKm;
    await manager.getRepository(ServiceRequest).save(request);

    // Create or find durable matching round
    const existingRounds = await manager.getRepository(MatchingRound).find({
      where: { serviceRequestId: request.id },
      order: { roundNumber: 'DESC' },
    });

    let currentRound: MatchingRound;
    const latestRound = existingRounds[0];
    if (
      latestRound &&
      latestRound.tier === currentTier &&
      latestRound.status === MatchingRoundStatus.ACTIVE
    ) {
      currentRound = latestRound;
    } else {
      const nextRoundNumber = latestRound ? latestRound.roundNumber + 1 : 1;
      const roundExpiresAt = this.matchingConfig.getRoundExpiresAt(
        request.urgency,
        currentTier,
        request.scheduledStartTime,
      );

      currentRound = manager.getRepository(MatchingRound).create({
        organizationId: orgId,
        serviceRequestId: request.id,
        roundNumber: nextRoundNumber,
        tier: currentTier,
        searchRadiusKm,
        status: MatchingRoundStatus.ACTIVE,
        expiresAt: roundExpiresAt,
        offersDispatchedCount: 0,
        offersAcceptedCount: 0,
      });
      currentRound = await manager.getRepository(MatchingRound).save(currentRound);
    }

    // 1. Query candidate memberships with active VOLUNTEER role grant
    const query = manager
      .getRepository(OrganizationMembership)
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.user', 'u')
      .innerJoin('m.roleGrants', 'rg')
      .leftJoinAndSelect('u.restrictions', 'rst')
      .where('m.status = :mStatus', { mStatus: MembershipStatus.APPROVED })
      .andWhere('u.status = :uStatus', { uStatus: AccountStatus.ACTIVE })
      .andWhere('rg.role = :role', { role: UserRole.VOLUNTEER })
      .andWhere('rg.status = :rgStatus', { rgStatus: RoleGrantStatus.ACTIVE });

    // Accepting and every later step need a membership here, so nobody else gets an offer.
    query.andWhere('m.organizationId = :orgId', { orgId });

    // Do not match beneficiary themselves as volunteer
    query.andWhere('m.id != :benMemId', { benMemId: request.beneficiaryMembershipId });
    query.andWhere(NOT_THEIR_CAREGIVER, { careFor: request.beneficiaryMembershipId });

    const eligibleMemberships = await query.getMany();

    // Already assigned/offered volunteers in any active status for this request
    const existingAssignments = await manager.getRepository(VolunteerAssignment).find({
      where: { serviceRequestId: request.id },
    });
    // Someone who passed on this booking is not asked again each round, but a new time
    // after rescheduling is a new question.
    const passedOn = [
      VolunteerAssignmentStatus.DECLINED,
      VolunteerAssignmentStatus.TIMED_OUT,
      VolunteerAssignmentStatus.WITHDRAWN,
    ];
    // Someone who handed this visit over has already said they cannot carry on.
    const alreadyHandledMemIds = new Set(
      existingAssignments
        .filter(
          (a) =>
            [
              VolunteerAssignmentStatus.OFFERED,
              VolunteerAssignmentStatus.ACCEPTED,
              VolunteerAssignmentStatus.IN_PROGRESS,
              VolunteerAssignmentStatus.COMPLETED,
              VolunteerAssignmentStatus.REPLACED,
            ].includes(a.status) ||
            (passedOn.includes(a.status) &&
              (a.rescheduleId ?? null) === (request.latestRescheduleId ?? null)),
        )
        .map((a) => a.volunteerMembershipId),
    );

    // Offer expiry duration
    const offerExpiresAt = this.matchingConfig.getOfferExpiresAt(
      request.urgency,
      request.scheduledStartTime,
    );

    const candidateProfiles: CandidateMatchProfile[] = [];

    // Schedule window for conflict checking
    const requestStartTime = new Date(request.scheduledStartTime).getTime();
    const requestEndTime = requestStartTime + (request.expectedDurationMinutes ?? 60) * 60 * 1000;

    for (const member of eligibleMemberships) {
      if (alreadyHandledMemIds.has(member.id)) {
        continue;
      }

      // Check active global restrictions (D#79, D#82)
      const hasActiveRestrictions = member.user?.restrictions?.some(
        (r) => r.status === GlobalRestrictionStatus.ACTIVE,
      );
      if (hasActiveRestrictions) {
        continue;
      }

      // Check verified skills if required (D#11, AT-M3-09)
      const verifiedSkills = await manager.getRepository(VolunteerSkill).find({
        where: {
          membershipId: member.id,
          status: SkillVerificationStatus.VERIFIED,
        },
      });

      if (requiresSkills && requiredSkills.length > 0) {
        const verifiedCodes = new Set(verifiedSkills.map((s) => s.skillCode));
        const hasAll = requiredSkills.every((code) => verifiedCodes.has(code));
        if (!hasAll) continue;
      }

      // Check volunteer availability
      const availability = await manager.getRepository(VolunteerAvailability).findOne({
        where: { membershipId: member.id },
      });

      if (isImmediate && availability && !availability.isAvailableImmediate) {
        continue;
      }

      // Schedule conflict checking: check overlapping active assignments
      const candidateAssignments = await manager.getRepository(VolunteerAssignment).find({
        where: {
          volunteerMembershipId: member.id,
        },
        relations: ['serviceRequest'],
      });

      const hasScheduleConflict = candidateAssignments.some((a) => {
        if (
          a.status !== VolunteerAssignmentStatus.ACCEPTED &&
          a.status !== VolunteerAssignmentStatus.IN_PROGRESS
        ) {
          return false;
        }
        if (!a.serviceRequest?.scheduledStartTime) return false;
        const aStart = new Date(a.serviceRequest.scheduledStartTime).getTime();
        const aEnd = aStart + (a.serviceRequest.expectedDurationMinutes ?? 60) * 60 * 1000;
        return aStart < requestEndTime && aEnd > requestStartTime;
      });

      if (hasScheduleConflict) {
        continue;
      }

      // Resolve volunteer location: Consented transient GPS (<2h) or verified residential address
      let volunteerLat: number | null = null;
      let volunteerLng: number | null = null;

      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (
        availability?.isGpsConsented &&
        availability.transientLat &&
        availability.transientLng &&
        availability.transientUpdatedAt &&
        new Date(availability.transientUpdatedAt).getTime() >= twoHoursAgo
      ) {
        volunteerLat = Number(availability.transientLat);
        volunteerLng = Number(availability.transientLng);
      } else if (availability?.residentialLat && availability?.residentialLng) {
        volunteerLat = Number(availability.residentialLat);
        volunteerLng = Number(availability.residentialLng);
      }

      // Distance calculation
      let distanceKm: number | null = null;
      if (
        request.locationLat &&
        request.locationLng &&
        volunteerLat !== null &&
        volunteerLng !== null
      ) {
        distanceKm = this.calculateHaversineDistance(
          Number(request.locationLat),
          Number(request.locationLng),
          volunteerLat,
          volunteerLng,
        );
      }

      // Zone & Ward check
      const assignedZones = await manager.getRepository(VolunteerZoneAssignment).find({
        where: { membershipId: member.id },
        relations: ['zone'],
      });

      const isInAssignedOperationalZone = assignedZones.some(
        (za) => za.zone?.isActive && za.zone?.wardNumbers?.includes(request.locationWardNumber),
      );

      const isSameWard =
        (availability?.preferredWardNumbers?.includes(request.locationWardNumber) ?? false) ||
        availability?.residentialWardNumber === request.locationWardNumber;

      const maxTravelRadius = Number(availability?.maxTravelRadiusKm ?? 5.0);

      // Permitted geography check:
      // Candidate qualifies if same ward, or assigned operational zone,
      // OR distance is within both search radius and volunteer's travel radius.
      const isGeographicallyEligible =
        isSameWard ||
        isInAssignedOperationalZone ||
        (distanceKm !== null && distanceKm <= searchRadiusKm && distanceKm <= maxTravelRadius) ||
        (distanceKm === null && !request.locationLat); // fallback if coordinates are not provided

      if (!isGeographicallyEligible) {
        continue;
      }

      const activeAssignmentCount = candidateAssignments.filter((a) =>
        [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS].includes(
          a.status,
        ),
      ).length;

      candidateProfiles.push({
        membershipId: member.id,
        userId: member.userId,
        organizationId: member.organizationId,
        isSameOrganization: member.organizationId === orgId,
        isSameWard,
        isInAssignedOperationalZone,
        distanceKm,
        verifiedSkillCount: verifiedSkills?.length ?? 0,
        activeAssignmentCount,
        isAvailableImmediate: availability?.isAvailableImmediate ?? true,
      });
    }

    // Rank candidates deterministically
    const rankedCandidates = this.rankingStrategy.rankCandidates(candidateProfiles, {
      urgency: request.urgency,
      locationWardNumber: request.locationWardNumber,
      searchRadiusKm,
    });

    const maxOffers = request.preferredVolunteers * this.matchingConfig.getMaxOffersPerSlot();
    const selectedCandidates = rankedCandidates.slice(0, maxOffers);

    const dispatchedAssignments: VolunteerAssignment[] = [];
    let slotCounter = 1;

    for (const ranked of selectedCandidates) {
      const assignment = manager.getRepository(VolunteerAssignment).create({
        organizationId: request.organizationId,
        serviceRequestId: request.id,
        matchingRoundId: currentRound.id,
        volunteerMembershipId: ranked.profile.membershipId,
        slotNumber: slotCounter++,
        status: VolunteerAssignmentStatus.OFFERED,
        offeredAt: new Date(),
        offerExpiresAt,
        rescheduleId: request.latestRescheduleId ?? null,
      });

      const saved = await manager.getRepository(VolunteerAssignment).save(assignment);
      dispatchedAssignments.push(saved);
      await this.notifications.enqueue(manager, {
        userId: ranked.profile.userId,
        type: 'VOLUNTEER_OFFER',
        title: 'New help request',
        body: 'Someone nearby needs help. Open the app to respond.',
        data: { assignmentId: saved.id, organizationId: request.organizationId },
        expiresAt: offerExpiresAt,
      });
    }

    // Update round stats
    currentRound.offersDispatchedCount += dispatchedAssignments.length;
    await manager.getRepository(MatchingRound).save(currentRound);

    await this.auditService.logEvent(
      {
        eventType: 'MATCHING_ROUND_DISPATCHED',
        actorId: null,
        targetId: currentRound.id,
        targetType: 'matching_rounds',
        organizationId: orgId,
        payload: {
          requestId: request.id,
          roundNumber: currentRound.roundNumber,
          tier: currentRound.tier,
          searchRadiusKm,
          dispatchedCount: dispatchedAssignments.length,
        },
      },
      manager,
    );

    return dispatchedAssignments;
  }

  // ─── Transactionally Safe Offer Acceptance (D#12, D#64, BR-06) ──────────────
  private async lockVolunteer(manager: EntityManager, orgId: string, membershipId: string) {
    const identity = await manager.findOne(OrganizationMembership, {
      where: { id: membershipId, organizationId: orgId },
    });
    if (!identity) throw new NotFoundException('Volunteer membership not found');

    // Lock the human, not just one tenant membership. Every booking writer takes
    // this lock before its request lock, so cross-organization races serialize too.
    const user = await manager.findOne(User, {
      where: { id: identity.userId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Volunteer account is not active');
    }
    const membership = await manager.findOne(OrganizationMembership, {
      where: { id: membershipId, organizationId: orgId },
      relations: ['roleGrants'],
    });
    if (
      membership?.status !== MembershipStatus.APPROVED ||
      !membership.roleGrants?.some(
        (grant) => grant.role === UserRole.VOLUNTEER && grant.status === RoleGrantStatus.ACTIVE,
      )
    ) {
      throw new ForbiddenException('Approved volunteer role required');
    }
    const restriction = await manager.findOne(GlobalAccountRestriction, {
      where: { userId: user.id, status: GlobalRestrictionStatus.ACTIVE },
    });
    if (restriction) throw new ForbiddenException('Volunteer account is restricted');
    return membership;
  }

  private assertBookable(request: ServiceRequest, manual = false): void {
    const states = [
      ServiceRequestStatus.MATCHING_ACTIVE,
      ServiceRequestStatus.PARTIALLY_ACCEPTED,
      ServiceRequestStatus.FULLY_MATCHED,
    ];
    if (manual) states.push(ServiceRequestStatus.ESCALATED_TO_COORDINATOR);
    if (!states.includes(request.status) && !isShortMidVisit(request)) {
      throw new ConflictException('This request is no longer accepting volunteer assignments');
    }
  }

  private async assertNoScheduleConflict(
    manager: EntityManager,
    userId: string,
    request: ServiceRequest,
    assignmentId?: string,
  ): Promise<void> {
    const start = new Date(request.scheduledStartTime);
    const duration = request.expectedDurationMinutes;
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(duration) || duration <= 0) {
      throw new ConflictException('Request has an invalid scheduled interval');
    }
    const end = new Date(start.getTime() + duration * 60_000);
    const query = manager
      .getRepository(VolunteerAssignment)
      .createQueryBuilder('booking')
      .innerJoin('booking.volunteerMembership', 'member')
      .innerJoin('booking.serviceRequest', 'service')
      .where('member.userId = :userId', { userId })
      .andWhere('booking.status IN (:...busy)', {
        busy: [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS],
      })
      .andWhere('service.status NOT IN (:...finished)', {
        finished: [ServiceRequestStatus.CANCELLED, ServiceRequestStatus.COMPLETED],
      })
      .andWhere('service.scheduledStartTime < :end', { end })
      .andWhere(
        "service.scheduledStartTime + service.expectedDurationMinutes * interval '1 minute' > :start",
        { start },
      );
    if (assignmentId) query.andWhere('booking.id <> :assignmentId', { assignmentId });
    if (await query.getExists()) {
      throw new ConflictException(
        'Volunteer already has an overlapping accepted or active assignment',
      );
    }
  }

  async acceptOffer(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: AcceptVolunteerOfferDto,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    const outcome = await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // 1. Find and validate assignment
      let assignment = await manager.findOne(VolunteerAssignment, {
        where: {
          id: assignmentId,
          organizationId: orgId,
          volunteerMembershipId,
        },
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment offer '${assignmentId}' not found`);
      }

      const volunteer = await this.lockVolunteer(manager, orgId, volunteerMembershipId);

      // 2. Lock the service request row for atomic slot count check
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: assignment.serviceRequestId })
        .andWhere('req.organizationId = :orgId', { orgId })
        .getOne();

      if (!request) {
        throw new NotFoundException('Associated service request not found');
      }

      // A concurrent acceptance may have committed while this transaction waited.
      assignment = await manager.findOne(VolunteerAssignment, {
        where: { id: assignmentId, organizationId: orgId, volunteerMembershipId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) throw new NotFoundException('Assignment offer not found');
      if ((assignment.rescheduleId ?? null) !== (request.latestRescheduleId ?? null))
        throw new ConflictException(
          'The request time has changed; refresh and confirm the new offer',
        );
      if (
        dto.clientOperationId &&
        assignment.idempotencyKey === dto.clientOperationId &&
        assignment.status === VolunteerAssignmentStatus.ACCEPTED
      )
        return { assignment };
      // Offers close the moment a visit fills, so this is an ordinary thing to run into.
      if (assignment.status === VolunteerAssignmentStatus.CANCELLED) {
        throw new ConflictException('This offer is no longer open');
      }
      if (assignment.status !== VolunteerAssignmentStatus.OFFERED) {
        throw new BadRequestException(
          `Assignment is not in OFFERED status (current: ${assignment.status})`,
        );
      }
      this.assertBookable(request);
      if (new Date() >= new Date(assignment.offerExpiresAt)) {
        assignment.status = VolunteerAssignmentStatus.TIMED_OUT;
        await manager.save(VolunteerAssignment, assignment);
        return { error: new ConflictException('Offer has expired (D#12)') };
      }

      // 3. Count the places already taken, including volunteers who have started
      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, status: In(BOOKED_STATUSES) },
      });

      if (acceptedCount >= request.preferredVolunteers) {
        assignment.status = VolunteerAssignmentStatus.DECLINED;
        assignment.declineReason = 'SLOT_FILLED';
        await manager.save(VolunteerAssignment, assignment);
        return {
          error: new ConflictException('All positions for this service have already been filled'),
        };
      }

      await this.assertRequiredSkills(manager, request, volunteer.id);
      await this.assertNoScheduleConflict(manager, volunteer.userId, request, assignment.id);

      // 4. Accept position & record idempotency key
      assignment.status = VolunteerAssignmentStatus.ACCEPTED;
      assignment.acceptedAt = new Date();
      if (dto.clientOperationId) {
        assignment.idempotencyKey = dto.clientOperationId;
      }
      const savedAssignment = await manager.save(VolunteerAssignment, assignment);

      // 5. Update round stats
      if (assignment.matchingRoundId) {
        await manager.increment(
          MatchingRound,
          { id: assignment.matchingRoundId },
          'offersAcceptedCount',
          1,
        );
      }

      // 6. Update request status
      const newAcceptedCount = acceptedCount + 1;
      if (newAcceptedCount >= request.minVolunteers && assignment.matchingRoundId) {
        await manager.update(
          MatchingRound,
          { id: assignment.matchingRoundId },
          { status: MatchingRoundStatus.COMPLETED },
        );
      }
      await this.settleAfterBooking(manager, request, savedAssignment, newAcceptedCount);
      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: orgId,
        requestId: request.id,
        type: 'VOLUNTEER_ACCEPTED',
        title: 'A volunteer is coming',
        body: 'A volunteer accepted your request. Open the app for details.',
      });

      // Audit log
      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_OFFER_ACCEPTED',
          actorId: volunteer.userId,
          targetId: savedAssignment.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            volunteerMembershipId,
            slotNumber: savedAssignment.slotNumber,
            requestStatus: request.status,
            clientOperationId: dto.clientOperationId ?? null,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return { assignment: savedAssignment };
    });
    if ('error' in outcome) throw outcome.error;
    return outcome.assignment;
  }

  // ─── Decline Offer ──────────────────────────────────────────────────────────
  async declineOffer(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: DeclineVolunteerOfferDto,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    // The same request-then-assignment locks as acceptance, so a decline can never
    // overwrite an acceptance that committed a moment earlier.
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const { assignment } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        volunteerMembershipId,
      );
      if (assignment.status !== VolunteerAssignmentStatus.OFFERED) {
        throw new BadRequestException(`Cannot decline assignment in status '${assignment.status}'`);
      }

      assignment.status = VolunteerAssignmentStatus.DECLINED;
      assignment.declinedAt = new Date();
      assignment.declineReason = dto.declineReason ?? 'Declined by volunteer';
      const saved = await manager.save(VolunteerAssignment, assignment);

      const volunteer = await manager.findOne(OrganizationMembership, {
        where: { id: volunteerMembershipId, organizationId: orgId },
      });
      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_OFFER_DECLINED',
          actorId: volunteer?.userId ?? null,
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: { reason: saved.declineReason },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return saved;
    });
  }

  // ─── Volunteer Withdrawal (D#31, D#32, BR-06) ──────────────────────────────
  async withdrawAssignment(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: WithdrawVolunteerAssignmentDto,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction(async (manager) => {
      let assignment = await manager.findOne(VolunteerAssignment, {
        where: {
          id: assignmentId,
          organizationId: orgId,
          volunteerMembershipId,
        },
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment '${assignmentId}' not found`);
      }

      // Lock request and recalculate
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: assignment.serviceRequestId })
        .getOne();

      assignment = await manager.findOne(VolunteerAssignment, {
        where: { id: assignmentId, organizationId: orgId, volunteerMembershipId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) throw new NotFoundException('Assignment not found');
      if (assignment.status !== VolunteerAssignmentStatus.ACCEPTED) {
        throw new BadRequestException(
          `Can only withdraw from ACCEPTED status (current: ${assignment.status})`,
        );
      }

      assignment.status = VolunteerAssignmentStatus.WITHDRAWN;
      assignment.withdrawnAt = new Date();
      assignment.withdrawalReason = dto.withdrawalReason;
      const savedAssignment = await manager.save(VolunteerAssignment, assignment);

      if (request) {
        await this.settleAfterDeparture(manager, request);
        await this.notifications.notifyRequestOwners(manager, request, {
          organizationId: orgId,
          requestId: request.id,
          type: 'VOLUNTEER_WITHDREW',
          title: 'Your volunteer cannot come',
          body:
            request.status === ServiceRequestStatus.MATCHING_ACTIVE ||
            request.status === ServiceRequestStatus.PARTIALLY_ACCEPTED
              ? 'We are looking for someone else. Open the app for details.'
              : 'Open the app for details.',
        });
      }

      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_ASSIGNMENT_WITHDRAWN',
          actorId: await this.volunteerUserId(manager, orgId, volunteerMembershipId),
          targetId: savedAssignment.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: assignment.serviceRequestId,
            reason: dto.withdrawalReason,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedAssignment;
    });
  }

  // ─── Service Start and Finish ───────────────────────────────────────────────
  // Locks the request, then the volunteer's own assignment, in the same order
  // as withdrawal and acceptance so concurrent changes cannot interleave.
  /**
   * Recalculates a request after a volunteer leaves it. Once anyone has started, the visit
   * stays under way: reopening it would send new offers and allow a cancellation around
   * the person still helping.
   */
  private async settleAfterDeparture(
    manager: EntityManager,
    request: ServiceRequest,
  ): Promise<void> {
    const count = (statuses: VolunteerAssignmentStatus[]) =>
      manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, status: In(statuses) },
      });
    const started = await count([
      VolunteerAssignmentStatus.IN_PROGRESS,
      VolunteerAssignmentStatus.COMPLETED,
      VolunteerAssignmentStatus.REPLACED,
    ]);
    if (started > 0) {
      if (request.belowMinimumAt) {
        // The person coming to fill the place has dropped out, so it goes back on offer.
        const booked = await count(BOOKED_STATUSES);
        if (request.belowMinimumAlertedAt && booked < request.minVolunteers) {
          await this.raiseShortage(manager, request, new Date());
        }
        return;
      }
      const open = await openHelpCount(manager, request.id);
      if (open === 0 && (await count([VolunteerAssignmentStatus.COMPLETED])) === 0) {
        // Only handovers are left, so no help was delivered: a coordinator has to decide.
        request.belowMinimumAt = new Date();
        await this.raiseShortage(manager, request, new Date());
        return;
      }
      if (open === 0) {
        request.status = ServiceRequestStatus.COMPLETED;
        await manager.save(ServiceRequest, request);
      }
      return;
    }
    const accepted = await count([VolunteerAssignmentStatus.ACCEPTED]);
    if (accepted < request.minVolunteers) {
      request.status =
        accepted > 0
          ? ServiceRequestStatus.PARTIALLY_ACCEPTED
          : ServiceRequestStatus.MATCHING_ACTIVE;
      await manager.save(ServiceRequest, request);
    }
  }

  /**
   * After a place is taken. Offers stay open until the preferred team is booked or the visit
   * starts. During a visit the status does not change, and whoever comes takes over from the
   * volunteer who handed over.
   */
  private async settleAfterBooking(
    manager: EntityManager,
    request: ServiceRequest,
    assignment: VolunteerAssignment,
    booked: number,
  ): Promise<void> {
    if (request.status === ServiceRequestStatus.IN_PROGRESS) {
      const handedOver = await manager.findOne(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: VolunteerAssignmentStatus.REPLACED,
          replacedByAssignmentId: IsNull(),
        },
        order: { finishedAt: 'ASC' },
      });
      if (handedOver) {
        handedOver.replacedByAssignmentId = assignment.id;
        await manager.save(VolunteerAssignment, handedOver);
      }
    } else {
      request.status =
        booked >= request.minVolunteers
          ? ServiceRequestStatus.FULLY_MATCHED
          : ServiceRequestStatus.PARTIALLY_ACCEPTED;
      await manager.save(ServiceRequest, request);
    }
    await this.closeStaleOffers(manager, request.id);
  }

  /** The person behind a volunteer membership, for the audit log. */
  private async volunteerUserId(
    manager: EntityManager,
    orgId: string,
    volunteerMembershipId: string,
  ): Promise<string | null> {
    const volunteer = await manager.findOne(OrganizationMembership, {
      where: { id: volunteerMembershipId, organizationId: orgId },
    });
    return volunteer?.userId ?? null;
  }

  private async lockOwnAssignment(
    manager: EntityManager,
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
  ): Promise<{ assignment: VolunteerAssignment; request: ServiceRequest }> {
    const found = await manager.findOne(VolunteerAssignment, {
      where: { id: assignmentId, organizationId: orgId, volunteerMembershipId },
    });
    if (!found) throw new NotFoundException(`Assignment '${assignmentId}' not found`);
    const request = await manager
      .createQueryBuilder(ServiceRequest, 'req')
      .setLock('pessimistic_write')
      .where('req.id = :id AND req.organizationId = :orgId', {
        id: found.serviceRequestId,
        orgId,
      })
      .getOne();
    if (!request) throw new NotFoundException('Associated service request not found');
    const assignment = await manager.findOne(VolunteerAssignment, {
      where: { id: assignmentId, organizationId: orgId, volunteerMembershipId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return { assignment, request };
  }

  async startAssignment(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    ipAddress?: string,
    now = new Date(),
    dto: VisitOperationDto = {},
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // A banned or removed volunteer may not begin a visit at someone's home.
      await this.lockVolunteer(manager, orgId, volunteerMembershipId);
      const { assignment, request } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        volunteerMembershipId,
      );
      const print = fingerprint({ action: 'START', assignmentId, at: dto.occurredAt ?? null });
      const operation = dto.clientOperationId;
      if (
        await alreadyDone(manager, volunteerMembershipId, operation, 'START', assignmentId, print)
      ) {
        return assignment;
      }
      const time = phoneTime(dto.occurredAt, now);
      const saved = await this.beginVisit(manager, assignment, request, time, ipAddress);
      await recordOperation(manager, {
        organizationId: orgId,
        membershipId: volunteerMembershipId,
        operationId: operation,
        action: 'START',
        assignmentId,
        print,
        time,
        now,
      });
      return saved;
    });
  }

  /** Starts one volunteer's visit, or records their arrival at a team visit (FR-TEAM-04). */
  private async beginVisit(
    manager: EntityManager,
    assignment: VolunteerAssignment,
    request: ServiceRequest,
    time: PhoneTime,
    ipAddress: string | undefined,
  ): Promise<VolunteerAssignment> {
    const orgId = request.organizationId;
    const volunteerMembershipId = assignment.volunteerMembershipId;
    // A start sent late can never count from before the offer was accepted.
    let at = time.receivedLate ? latest(time.at, assignment.acceptedAt) : time.at;
    if (assignment.status !== VolunteerAssignmentStatus.ACCEPTED) {
      throw new ConflictException(
        `Only an accepted assignment can be started (current: ${assignment.status})`,
      );
    }
    const isTeam = request.minVolunteers > 1;
    if (
      ![
        ServiceRequestStatus.PARTIALLY_ACCEPTED,
        ServiceRequestStatus.FULLY_MATCHED,
        ServiceRequestStatus.IN_PROGRESS,
        // A coordinator may still be finding the rest of a team while this one is on site.
        ...(isTeam ? [ServiceRequestStatus.ESCALATED_TO_COORDINATOR] : []),
      ].includes(request.status)
    ) {
      throw new ConflictException(`This request cannot be started (status: ${request.status})`);
    }
    const start = new Date(request.scheduledStartTime).getTime();
    if (at.getTime() < start - START_EARLY_MINUTES * 60_000) {
      throw new ConflictException(
        `The service can be started from ${START_EARLY_MINUTES} minutes before its scheduled time`,
      );
    }

    // FR-TEAM-04: a team starts once its safe minimum is on site. After that, each late
    // arrival simply starts their own timer.
    if (isTeam && request.status !== ServiceRequestStatus.IN_PROGRESS) {
      return this.recordTeamArrival(manager, request, assignment, ipAddress, time, at);
    }

    if (await this.isSafetyPaused(manager, request.id)) {
      throw new ConflictException('This visit is paused. A coordinator will contact you.');
    }
    if (isTeam) {
      // An arrival sent late still cannot start before the team itself did.
      const [first] = await manager.query(
        `SELECT min(started_at) AS first FROM volunteer_assignments
            WHERE service_request_id = $1 AND started_at IS NOT NULL`,
        [request.id],
      );
      at = latest(at, first?.first ? new Date(first.first) : null);
    }
    assignment.status = VolunteerAssignmentStatus.IN_PROGRESS;
    assignment.startedAt = at;
    assignment.startReceivedAt = time.receivedLate;
    const saved = await manager.save(VolunteerAssignment, assignment);
    if (request.status !== ServiceRequestStatus.IN_PROGRESS) {
      request.status = ServiceRequestStatus.IN_PROGRESS;
      await manager.save(ServiceRequest, request);
      await this.closeStaleOffers(manager, request.id);
    }
    if (request.belowMinimumAt) await this.clearShortageIfStaffed(manager, request);
    await this.auditService.logEvent(
      {
        eventType: 'SERVICE_STARTED',
        actorId: await this.volunteerUserId(manager, orgId, volunteerMembershipId),
        targetId: saved.id,
        targetType: 'volunteer_assignments',
        organizationId: orgId,
        payload: {
          serviceRequestId: request.id,
          volunteerMembershipId,
          startedAt: at.toISOString(),
          ...(time.receivedLate ? { recordedOffline: true } : {}),
        },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
    return saved;
  }

  async finishAssignment(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: FinishVolunteerAssignmentDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const { assignment, request } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        volunteerMembershipId,
      );
      const print = fingerprint({
        action: 'FINISH',
        assignmentId,
        at: dto.occurredAt ?? null,
        minutes: dto.minutes ?? null,
        notes: dto.notes?.trim() || null,
      });
      const operation = dto.clientOperationId;
      if (
        await alreadyDone(manager, volunteerMembershipId, operation, 'FINISH', assignmentId, print)
      ) {
        return assignment;
      }
      const time = phoneTime(dto.occurredAt, now);
      if (assignment.status !== VolunteerAssignmentStatus.IN_PROGRESS || !assignment.startedAt) {
        throw new ConflictException(
          `Only a started assignment can be finished (current: ${assignment.status})`,
        );
      }
      if (assignment.pausedAt) {
        throw new ConflictException('This visit is paused. A coordinator will contact you.');
      }
      const end = latest(time.at, assignment.startedAt);
      const elapsed = workedMinutes(assignment, end);
      // A volunteer who pressed Start late may report up to the expected duration.
      const allowed = Math.min(
        MAX_SERVICE_MINUTES,
        Math.max(elapsed, request.expectedDurationMinutes),
      );
      const minutes = dto.minutes ?? Math.min(elapsed, MAX_SERVICE_MINUTES);
      if (minutes > allowed) {
        throw new BadRequestException(
          `At most ${allowed} minutes can be reported for this service`,
        );
      }

      assignment.status = VolunteerAssignmentStatus.COMPLETED;
      assignment.finishedAt = end;
      assignment.finishReceivedAt = time.receivedLate;
      assignment.reportedMinutes = minutes;
      assignment.completionNotes = dto.notes?.trim() || null;
      const saved = await manager.save(VolunteerAssignment, assignment);
      await this.afterVolunteerStopped(manager, request, now);
      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: orgId,
        requestId: request.id,
        type: 'SERVICE_FINISHED',
        title: 'Please confirm the help',
        body: 'A volunteer finished. Open the app to confirm or report a problem.',
      });
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_FINISHED',
          actorId: await this.volunteerUserId(manager, orgId, volunteerMembershipId),
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            volunteerMembershipId,
            minutes,
            finishedAt: end.toISOString(),
            ...(time.receivedLate ? { recordedOffline: true } : {}),
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      await recordOperation(manager, {
        organizationId: orgId,
        membershipId: volunteerMembershipId,
        operationId: operation,
        action: 'FINISH',
        assignmentId,
        print,
        time,
        now,
      });
      return saved;
    });
  }

  // ─── Teams and Handovers (FR-TEAM, D#31 to D#34, D#63 to D#69) ──────────────
  private async recordTeamArrival(
    manager: EntityManager,
    request: ServiceRequest,
    assignment: VolunteerAssignment,
    ipAddress: string | undefined,
    time: PhoneTime,
    at: Date,
  ): Promise<VolunteerAssignment> {
    const notice = { organizationId: request.organizationId, requestId: request.id };
    if (!assignment.arrivedAt) {
      assignment.arrivedAt = at;
      assignment.startReceivedAt = time.receivedLate;
    }
    const saved = await manager.save(VolunteerAssignment, assignment);
    const arrived = await manager.find(VolunteerAssignment, {
      where: {
        serviceRequestId: request.id,
        status: VolunteerAssignmentStatus.ACCEPTED,
        arrivedAt: Not(IsNull()),
      },
    });
    if (arrived.length < request.minVolunteers) {
      await this.auditService.logEvent(
        {
          eventType: 'TEAM_MEMBER_ARRIVED',
          actorId: await this.volunteerUserId(
            manager,
            request.organizationId,
            assignment.volunteerMembershipId,
          ),
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: request.organizationId,
          payload: { serviceRequestId: request.id, arrived: arrived.length },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return saved;
    }

    // The team started when the last of them arrived, even if that arrival was sent late.
    const teamStart = latest(...arrived.map((member) => member.arrivedAt));
    for (const member of arrived) {
      member.status = VolunteerAssignmentStatus.IN_PROGRESS;
      member.startedAt = teamStart;
      await manager.save(VolunteerAssignment, member);
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_STARTED',
          actorId: await this.volunteerUserId(
            manager,
            request.organizationId,
            member.volunteerMembershipId,
          ),
          targetId: member.id,
          targetType: 'volunteer_assignments',
          organizationId: request.organizationId,
          payload: {
            serviceRequestId: request.id,
            volunteerMembershipId: member.volunteerMembershipId,
            teamStart: true,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
    }
    request.status = ServiceRequestStatus.IN_PROGRESS;
    await manager.save(ServiceRequest, request);
    await this.closeStaleOffers(manager, request.id);
    await this.notifications.notifyMemberships(
      manager,
      arrived.map((member) => member.volunteerMembershipId),
      {
        ...notice,
        type: 'TEAM_STARTED',
        title: 'Your team is here',
        body: 'Enough volunteers have arrived, so your time has started.',
      },
    );
    return arrived.find((member) => member.id === assignment.id) ?? saved;
  }

  private isSafetyPaused(manager: EntityManager, requestId: string): Promise<boolean> {
    return manager.exists(VolunteerAssignment, {
      where: {
        serviceRequestId: requestId,
        status: VolunteerAssignmentStatus.IN_PROGRESS,
        pausedAt: Not(IsNull()),
      },
    });
  }

  /**
   * Someone stopped working. Teammates usually finish within minutes of each other, so being
   * short is only noted here. The worker raises it if nobody else stops soon.
   */
  async afterVolunteerStopped(
    manager: EntityManager,
    request: ServiceRequest,
    now: Date,
  ): Promise<void> {
    const onSite = await manager.count(VolunteerAssignment, {
      where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.IN_PROGRESS },
    });
    if (onSite === 0) {
      if (request.belowMinimumAt) await this.clearShortage(manager, request);
      return;
    }
    if (onSite < request.minVolunteers && !request.belowMinimumAt) {
      request.belowMinimumAt = now;
      await manager.save(ServiceRequest, request);
    }
  }

  private async clearShortage(manager: EntityManager, request: ServiceRequest): Promise<void> {
    request.belowMinimumAt = null;
    request.belowMinimumAlertedAt = null;
    request.replacementEscalatedAt = null;
    await manager.save(ServiceRequest, request);
    await this.closeStaleOffers(manager, request.id);
  }

  private async clearShortageIfStaffed(
    manager: EntityManager,
    request: ServiceRequest,
  ): Promise<void> {
    const onSite = await manager.find(VolunteerAssignment, {
      where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.IN_PROGRESS },
    });
    if (onSite.length < request.minVolunteers) return;
    const wasAlerted = Boolean(request.belowMinimumAlertedAt);
    await this.clearShortage(manager, request);
    if (wasAlerted) {
      const notice = {
        organizationId: request.organizationId,
        requestId: request.id,
        type: 'TEAM_STAFFED',
        title: 'Enough volunteers are here',
        body: 'This visit has enough people again.',
      };
      await this.notifications.notifyMemberships(
        manager,
        onSite.map((visit) => visit.volunteerMembershipId),
        notice,
      );
      await this.notifications.notifyCoordinators(manager, notice);
    }
  }

  /**
   * D#69, BR-07: tell the coordinator, tell whoever is on site what to stop, and put the open
   * place back on offer. D#32: sensitive and urgent visits go only to a coordinator.
   */
  private async raiseShortage(
    manager: EntityManager,
    request: ServiceRequest,
    now: Date,
  ): Promise<void> {
    const catalogue = await manager.getRepository(OrganizationServiceCatalog).findOne({
      where: { id: request.serviceCatalogId, organizationId: request.organizationId },
      relations: ['globalService'],
    });
    const hazardous = catalogue?.globalService?.isHazardousPhysical ?? false;
    // Nobody new is sent into a visit paused by a safety alert.
    const coordinatorOnly =
      Boolean(catalogue?.requiresCoordinatorDispatch) ||
      request.urgency === UrgencyType.IMMEDIATE ||
      (await this.isSafetyPaused(manager, request.id));
    request.belowMinimumAlertedAt = now;
    request.replacementEscalatedAt = null;
    await manager.save(ServiceRequest, request);

    const notice = { organizationId: request.organizationId, requestId: request.id };
    const onSite = await manager.find(VolunteerAssignment, {
      where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.IN_PROGRESS },
    });
    await this.notifications.notifyMemberships(
      manager,
      onSite.map((visit) => visit.volunteerMembershipId),
      {
        ...notice,
        type: 'TEAM_SHORT',
        title: hazardous ? 'Stop heavy or risky work' : 'Your team is short',
        body: hazardous
          ? 'Too few volunteers are here. Carry on with safe tasks only until someone joins you.'
          : 'A volunteer has left. Carry on safely. We are looking for someone to join you.',
      },
    );

    const booked = await manager.count(VolunteerAssignment, {
      where: { serviceRequestId: request.id, status: In(BOOKED_STATUSES) },
    });
    const stillNeeded = booked < request.minVolunteers;
    const offers =
      stillNeeded && !coordinatorOnly
        ? await this.findCandidatesAndDispatchOffers(request, undefined, manager)
        : [];
    if (stillNeeded && offers.length === 0) {
      request.replacementEscalatedAt = now;
      await manager.save(ServiceRequest, request);
    }
    await this.notifications.notifyCoordinators(manager, {
      ...notice,
      type: 'TEAM_SHORT',
      title: 'A visit under way is short of volunteers',
      body:
        stillNeeded && offers.length === 0
          ? 'Nobody has been offered the place. Please arrange someone in the admin panel.'
          : 'Open the admin panel to check this visit.',
    });
    await this.auditService.logEvent(
      {
        eventType: 'TEAM_BELOW_MINIMUM',
        actorId: null,
        targetId: request.id,
        targetType: 'service_requests',
        organizationId: request.organizationId,
        payload: { onSite: onSite.length, booked, offers: offers.length, hazardous },
      },
      manager,
    );
  }

  /** A team member goes early. Their own time still counts, and is confirmed in the usual way. */
  async leaveTeamVisit(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: LeaveTeamVisitDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const { assignment, request } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        volunteerMembershipId,
      );
      const print = fingerprint({
        action: 'LEAVE',
        assignmentId,
        at: dto.occurredAt ?? null,
        reason: dto.reason.trim(),
      });
      const operation = dto.clientOperationId;
      if (
        await alreadyDone(manager, volunteerMembershipId, operation, 'LEAVE', assignmentId, print)
      ) {
        return assignment;
      }
      const time = phoneTime(dto.occurredAt, now);
      this.assertWorking(assignment);
      const others = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: VolunteerAssignmentStatus.IN_PROGRESS,
          id: Not(assignment.id),
        },
      });
      if (others === 0) {
        throw new ConflictException('You are the only one here. Finish or hand over this visit.');
      }

      const end = latest(time.at, assignment.startedAt);
      assignment.status = VolunteerAssignmentStatus.COMPLETED;
      assignment.finishedAt = end;
      assignment.finishReceivedAt = time.receivedLate;
      assignment.reportedMinutes = Math.min(workedMinutes(assignment, end), MAX_SERVICE_MINUTES);
      assignment.withdrawalReason = dto.reason.trim();
      const saved = await manager.save(VolunteerAssignment, assignment);

      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: orgId,
        requestId: request.id,
        type: 'SERVICE_FINISHED',
        title: 'Please confirm the help',
        body: 'A volunteer had to leave. Open the app to confirm their time.',
      });
      if (others < request.minVolunteers) {
        request.belowMinimumAt = request.belowMinimumAt ?? now;
        await this.raiseShortage(manager, request, now);
      }
      await this.auditService.logEvent(
        {
          eventType: 'TEAM_MEMBER_LEFT',
          actorId: await this.volunteerUserId(manager, orgId, volunteerMembershipId),
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            reason: saved.withdrawalReason,
            minutes: saved.reportedMinutes,
            stillOnSite: others,
            ...(time.receivedLate ? { recordedOffline: true } : {}),
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      await recordOperation(manager, {
        organizationId: orgId,
        membershipId: volunteerMembershipId,
        operationId: operation,
        action: 'LEAVE',
        assignmentId,
        print,
        time,
        now,
      });
      return saved;
    });
  }

  /**
   * FR-TEAM-07, D#33, BR-06: the last volunteer on site passes the visit on. Only the volunteer
   * who finishes it earns credits, so this one's time is kept on record but never paid.
   */
  async handOverVisit(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: HandOverVisitDto,
    ipAddress?: string,
    now = new Date(),
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const { assignment, request } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        volunteerMembershipId,
      );
      this.assertWorking(assignment);
      const others = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: VolunteerAssignmentStatus.IN_PROGRESS,
          id: Not(assignment.id),
        },
      });
      if (others > 0) {
        throw new ConflictException('Your team is still here. Choose "I have to leave" instead.');
      }

      assignment.status = VolunteerAssignmentStatus.REPLACED;
      assignment.finishedAt = now;
      assignment.reportedMinutes = Math.min(workedMinutes(assignment, now), MAX_SERVICE_MINUTES);
      assignment.withdrawnAt = now;
      assignment.withdrawalReason = dto.reason.trim();
      const saved = await manager.save(VolunteerAssignment, assignment);

      request.belowMinimumAt = request.belowMinimumAt ?? now;
      await this.raiseShortage(manager, request, now);
      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: orgId,
        requestId: request.id,
        type: 'VISIT_HANDED_OVER',
        title: 'Your volunteer had to leave',
        body: 'We are arranging someone else to carry on. Open the app for details.',
      });
      await this.auditService.logEvent(
        {
          eventType: 'VISIT_HANDED_OVER',
          actorId: await this.volunteerUserId(manager, orgId, volunteerMembershipId),
          targetId: saved.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            reason: saved.withdrawalReason,
            minutes: saved.reportedMinutes,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return saved;
    });
  }

  private assertWorking(assignment: VolunteerAssignment): void {
    if (assignment.status !== VolunteerAssignmentStatus.IN_PROGRESS || !assignment.startedAt) {
      throw new ConflictException('This visit is not under way for you');
    }
    if (assignment.pausedAt) {
      throw new ConflictException('This visit is paused. A coordinator will contact you.');
    }
  }

  /**
   * FR-TEAM-02, D#65: a volunteer invites a teammate they know, by exact number. Every refusal
   * about the person reads the same, so this cannot be used to find out who is a member.
   */
  async inviteTeammate(
    orgId: string,
    assignmentId: string,
    callerMembershipId: string,
    dto: InviteTeammateDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    const refusal = () =>
      new ConflictException(
        'That member cannot be invited to this visit. Check the number, or ask your coordinator.',
      );
    const value = dto.memberNumberOrPhone.trim();
    const number = /^\d{10}$/.test(value) ? `+91${value}` : value;
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const target = await manager
        .getRepository(OrganizationMembership)
        .createQueryBuilder('m')
        .innerJoin('m.user', 'u')
        .where('m.organizationId = :orgId', { orgId })
        .andWhere('(m.membershipNumber = :number OR u.phoneE164 = :number)', { number })
        .getOne();
      if (!target || target.id === callerMembershipId) throw refusal();
      // The usual lock order: the volunteer first, then the request.
      const volunteer = await this.lockVolunteer(manager, orgId, target.id).catch(() => {
        throw refusal();
      });
      const { assignment: mine, request } = await this.lockOwnAssignment(
        manager,
        orgId,
        assignmentId,
        callerMembershipId,
      );
      if (!BOOKED_STATUSES.includes(mine.status)) {
        throw new ConflictException('You can invite someone only to a visit you are on');
      }
      const catalogue = await manager.getRepository(OrganizationServiceCatalog).findOne({
        where: { id: request.serviceCatalogId, organizationId: orgId },
      });
      if (catalogue?.requiresCoordinatorDispatch) {
        throw new ConflictException('A coordinator arranges volunteers for this service');
      }
      this.assertBookable(request);
      const booked = await manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, status: In(BOOKED_STATUSES) },
      });
      const places = isShortMidVisit(request) ? request.minVolunteers : request.preferredVolunteers;
      if (booked >= places) throw new ConflictException('This visit has no open places');
      const sent = await manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, invitedByMembershipId: callerMembershipId },
      });
      if (sent >= MAX_INVITES_PER_VISIT) {
        throw new ConflictException('You have invited as many people as you can to this visit');
      }

      if (target.id === request.beneficiaryMembershipId) throw refusal();
      const [caregiver]: unknown[] = await manager.query(
        `SELECT 1 FROM caregiver_authorizations
         WHERE caregiver_membership_id = $1 AND beneficiary_membership_id = $2
           AND status = 'APPROVED'`,
        [target.id, request.beneficiaryMembershipId],
      );
      if (caregiver) throw refusal();
      const earlier = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          volunteerMembershipId: target.id,
          rescheduleId: request.latestRescheduleId ?? IsNull(),
          // An offer that closed by itself is not an answer from this person.
          status: Not(VolunteerAssignmentStatus.CANCELLED),
        },
      });
      if (earlier > 0) throw refusal();
      await this.assertRequiredSkills(manager, request, target.id).catch(() => {
        throw refusal();
      });
      await this.assertNoScheduleConflict(manager, volunteer.userId, request).catch(() => {
        throw refusal();
      });

      const offerExpiresAt = this.matchingConfig.getOfferExpiresAt(
        request.urgency,
        request.scheduledStartTime,
      );
      const offer = await manager.save(
        VolunteerAssignment,
        manager.create(VolunteerAssignment, {
          organizationId: orgId,
          serviceRequestId: request.id,
          volunteerMembershipId: target.id,
          slotNumber: booked + 1,
          status: VolunteerAssignmentStatus.OFFERED,
          offeredAt: now,
          offerExpiresAt,
          rescheduleId: request.latestRescheduleId ?? null,
          invitedByMembershipId: callerMembershipId,
        }),
      );
      await this.notifications.enqueue(manager, {
        userId: volunteer.userId,
        type: 'VOLUNTEER_OFFER',
        title: 'A volunteer invited you to help',
        body: 'Open the app to respond.',
        data: { assignmentId: offer.id, organizationId: orgId },
        expiresAt: offerExpiresAt,
      });
      await this.auditService.logEvent(
        {
          eventType: 'TEAMMATE_INVITED',
          actorId: await this.volunteerUserId(manager, orgId, callerMembershipId),
          targetId: offer.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: { serviceRequestId: request.id, invitedMembershipId: target.id },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      // Nothing about the person: the caller already knows who they asked.
      return { status: VolunteerAssignmentStatus.OFFERED, offerExpiresAt };
    });
  }

  /**
   * A coordinator decides nobody else is coming. Whoever is on site carries on. With nobody
   * left to wait for, the request ends: cancelled if no help was delivered.
   */
  async stopReplacementSearch(
    orgId: string,
    requestId: string,
    actorId: string,
    notes: string,
    ipAddress?: string,
  ) {
    await this.assertMatchingStaff(orgId, actorId);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Service request not found in this organization');
      if (!isShortMidVisit(request)) {
        throw new ConflictException('This visit is not looking for a replacement');
      }
      await this.clearShortage(manager, request);
      if ((await openHelpCount(manager, request.id)) === 0) {
        const delivered = await manager.count(VolunteerAssignment, {
          where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.COMPLETED },
        });
        request.status = delivered
          ? ServiceRequestStatus.COMPLETED
          : ServiceRequestStatus.CANCELLED;
        await manager.save(ServiceRequest, request);
        await this.closeStaleOffers(manager, request.id);
        if (!delivered) {
          await manager.save(
            RequestCancellation,
            manager.create(RequestCancellation, {
              organizationId: orgId,
              serviceRequestId: request.id,
              cancelledByUserId: actorId,
              cancellerRole: CancellerRole.COORDINATOR,
              reasonCode: 'NO_REPLACEMENT_FOUND',
              notes,
              hoursBeforeStart: 0,
            }),
          );
        }
      }
      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: orgId,
        requestId: request.id,
        type: 'REPLACEMENT_STOPPED',
        title: 'Nobody else is coming today',
        body: 'Your coordinator will contact you. Open the app for details.',
      });
      await this.auditService.logEvent(
        {
          eventType: 'REPLACEMENT_SEARCH_STOPPED',
          actorId,
          targetId: request.id,
          targetType: 'service_requests',
          organizationId: orgId,
          payload: { notes, requestStatus: request.status },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return { id: request.id, status: request.status };
    });
  }

  /** The wait after a teammate pressed Finish has passed, and the team is still short. */
  async alertBelowMinimum(requestId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || !isShortMidVisit(request) || request.belowMinimumAlertedAt) return;
      const due = new Date(request.belowMinimumAt!).getTime() + TEAM_FINISH_WAIT_MINUTES * 60_000;
      if (now.getTime() < due) return;
      // Staff are already on a paused visit. This waits until it restarts.
      if (await this.isSafetyPaused(manager, request.id)) return;
      await this.raiseShortage(manager, request, now);
    });
  }

  /** Every offer for the open place has run out, so a coordinator has to step in. */
  async escalateUnfilledReplacement(requestId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !request ||
        !isShortMidVisit(request) ||
        !request.belowMinimumAlertedAt ||
        request.replacementEscalatedAt
      )
        return;
      request.replacementEscalatedAt = now;
      await manager.save(ServiceRequest, request);
      await this.closeStaleOffers(manager, request.id);
      await this.notifications.notifyCoordinators(manager, {
        organizationId: request.organizationId,
        requestId: request.id,
        type: 'REPLACEMENT_NOT_FOUND',
        title: 'Nobody took the open place',
        body: 'A visit under way still needs a volunteer. Open the admin panel.',
      });
    });
  }

  private async assertMatchingStaff(orgId: string, actorId: string): Promise<void> {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (
      !context.isSuperAdmin &&
      !context.roles.some((role) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(role),
      )
    ) {
      throw new ForbiddenException('Coordinator authority required');
    }
  }

  async getRequestMatching(orgId: string, requestId: string, actorId: string) {
    await this.assertMatchingStaff(orgId, actorId);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId, organizationId: orgId },
        relations: [
          'serviceCatalog',
          'serviceCatalog.globalService',
          'beneficiaryMembership',
          'beneficiaryMembership.user',
        ],
      });
      if (!request) throw new NotFoundException('Service request not found in this organization');
      const assignments = await manager.getRepository(VolunteerAssignment).find({
        where: { serviceRequestId: requestId, organizationId: orgId },
        relations: [
          'volunteerMembership',
          'volunteerMembership.user',
          'reschedule',
          'invitedByMembership',
          'invitedByMembership.user',
        ],
        order: { offeredAt: 'DESC', id: 'DESC' },
      });
      const rounds = await manager.getRepository(MatchingRound).find({
        where: { serviceRequestId: requestId, organizationId: orgId },
        order: { roundNumber: 'DESC' },
      });
      const reschedules = await manager.getRepository(RequestRescheduleHistory).find({
        where: { serviceRequestId: requestId, organizationId: orgId },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      return {
        request: {
          id: request.id,
          requestNumber: request.requestNumber,
          status: request.status,
          urgency: request.urgency,
          scheduledStartTime: request.scheduledStartTime,
          expectedDurationMinutes: request.expectedDurationMinutes,
          minVolunteers: request.minVolunteers,
          preferredVolunteers: request.preferredVolunteers,
          matchingTier: request.matchingTier,
          matchingRadiusKm: request.matchingRadiusKm,
          locationAddressText: request.locationAddressText,
          locationWardNumber: request.locationWardNumber,
          locationPostalCode: request.locationPostalCode,
          beneficiaryNotes: request.beneficiaryNotes,
          beneficiaryMembershipNumber: request.beneficiaryMembership?.membershipNumber ?? null,
          beneficiaryName: request.beneficiaryMembership?.user?.fullName ?? null,
          serviceName:
            request.serviceCatalog?.customLabelEn ??
            request.serviceCatalog?.globalService?.nameEn ??
            'Service',
          requiredSkills: request.serviceCatalog?.globalService?.requiresSkills
            ? request.serviceCatalog.globalService.requiredSkillCodes
            : [],
          requiresCoordinatorDispatch: request.serviceCatalog?.requiresCoordinatorDispatch ?? false,
          requiresReconfirmation: Boolean(request.latestRescheduleId),
          latestRescheduleId: request.latestRescheduleId ?? null,
          belowMinimumAt: request.belowMinimumAt ?? null,
          belowMinimumAlertedAt: request.belowMinimumAlertedAt ?? null,
          replacementEscalatedAt: request.replacementEscalatedAt ?? null,
        },
        acceptedCount: assignments.filter((assignment) =>
          BOOKED_STATUSES.includes(assignment.status),
        ).length,
        pendingCount: assignments.filter(
          (assignment) => assignment.status === VolunteerAssignmentStatus.OFFERED,
        ).length,
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          volunteerMembershipId: assignment.volunteerMembershipId,
          membershipNumber: assignment.volunteerMembership?.membershipNumber ?? null,
          fullName: assignment.volunteerMembership?.user?.fullName ?? null,
          phone: assignment.volunteerMembership?.user?.phoneE164 ?? null,
          status: assignment.status,
          offeredAt: assignment.offeredAt,
          offerExpiresAt: assignment.offerExpiresAt,
          acceptedAt: assignment.acceptedAt ?? null,
          arrivedAt: assignment.arrivedAt ?? null,
          startedAt: assignment.startedAt ?? null,
          finishedAt: assignment.finishedAt ?? null,
          reportedMinutes: assignment.reportedMinutes ?? null,
          completionNotes: assignment.completionNotes ?? null,
          leavingReason: assignment.withdrawalReason ?? null,
          invitedByName: assignment.invitedByMembership?.user?.fullName ?? null,
          confirmedAt: assignment.confirmedAt ?? null,
          reviewReason: assignment.reviewReason ?? null,
          reviewNotes: assignment.reviewNotes ?? null,
          reviewMinutes: assignment.reviewMinutes ?? null,
          reviewRequestedAt: assignment.reviewRequestedAt ?? null,
          reviewResolvedAt: assignment.reviewResolvedAt ?? null,
          reviewOutcome: assignment.reviewOutcome ?? null,
          pausedAt: assignment.pausedAt ?? null,
          restartAllowedAt: assignment.restartAllowedAt ?? null,
          scheduledStartTime: assignmentSchedule(
            { ...assignment, serviceRequest: request },
            reschedules,
          ),
          rescheduleId: assignment.rescheduleId ?? null,
          confirmedSchedule: assignment.reschedule?.newStartTime ?? null,
        })),
        rounds: rounds.map((round) => ({
          id: round.id,
          roundNumber: round.roundNumber,
          tier: round.tier,
          searchRadiusKm: round.searchRadiusKm,
          status: round.status,
          expiresAt: round.expiresAt,
          offersDispatchedCount: round.offersDispatchedCount,
          offersAcceptedCount: round.offersAcceptedCount,
        })),
        reschedules: reschedules.map((record) => ({
          id: record.id,
          previousStartTime: record.previousStartTime,
          newStartTime: record.newStartTime,
          reason: record.reason,
          createdAt: record.createdAt,
        })),
      };
    });
  }

  private async dispatchPolicy(manager: EntityManager, request: ServiceRequest) {
    const catalogue = await manager.getRepository(OrganizationServiceCatalog).findOne({
      where: { id: request.serviceCatalogId, organizationId: request.organizationId },
      relations: ['globalService'],
    });
    if (
      !catalogue?.globalService ||
      !catalogue.isEnabled ||
      catalogue.globalService.isActive === false
    )
      throw new BadRequestException(
        'An enabled service catalogue with current policies is required for dispatch',
      );
    return catalogue.globalService.requiresSkills
      ? (catalogue.globalService.requiredSkillCodes ?? [])
      : [];
  }

  private async assertRequiredSkills(
    manager: EntityManager,
    request: ServiceRequest,
    membershipId: string,
  ) {
    const required = await this.dispatchPolicy(manager, request);
    if (!required.length) return;
    const verified = await manager.getRepository(VolunteerSkill).find({
      where: { membershipId, status: SkillVerificationStatus.VERIFIED },
    });
    const codes = new Set(verified.map((skill) => skill.skillCode));
    if (!required.every((skill) => codes.has(skill)))
      throw new ConflictException('Volunteer does not hold all required verified skills');
  }

  async listDispatchVolunteers(
    orgId: string,
    requestId: string,
    actorId: string,
    options: DispatchVolunteerQueryDto,
  ) {
    await this.assertMatchingStaff(orgId, actorId);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const request = await manager
        .getRepository(ServiceRequest)
        .findOne({ where: { id: requestId, organizationId: orgId } });
      if (!request) throw new NotFoundException('Service request not found in this organization');
      this.assertBookable(request, true);
      const skills = await this.dispatchPolicy(manager, request);
      const start = new Date(request.scheduledStartTime),
        end = new Date(start.getTime() + request.expectedDurationMinutes * 60000);
      const query = manager
        .getRepository(OrganizationMembership)
        .createQueryBuilder('m')
        .innerJoinAndSelect('m.user', 'u')
        .innerJoin(
          'm.roleGrants',
          'grant',
          'grant.role = :volunteerRole AND grant.status = :activeGrant',
          { volunteerRole: UserRole.VOLUNTEER, activeGrant: RoleGrantStatus.ACTIVE },
        )
        .leftJoin('u.restrictions', 'restriction', 'restriction.status = :activeRestriction', {
          activeRestriction: GlobalRestrictionStatus.ACTIVE,
        })
        .select(['m.id', 'm.membershipNumber', 'u.id', 'u.phoneE164', 'u.fullName'])
        .where(
          'm.organizationId = :orgId AND m.status = :approved AND u.status = :activeUser AND restriction.id IS NULL',
          { orgId, approved: MembershipStatus.APPROVED, activeUser: AccountStatus.ACTIVE },
        )
        .andWhere('m.id != :beneficiary', { beneficiary: request.beneficiaryMembershipId })
        .andWhere(NOT_THEIR_CAREGIVER, { careFor: request.beneficiaryMembershipId })
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM volunteer_assignments a JOIN organization_memberships booked ON booked.id = a.volunteer_membership_id JOIN service_requests r ON r.id = a.service_request_id WHERE booked.user_id = u.id AND a.status IN (:...busy) AND r.status NOT IN (:...terminal) AND r.scheduled_start_time < :end AND r.scheduled_start_time + r.expected_duration_minutes * INTERVAL '1 minute' > :start)`,
          {
            busy: [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS],
            terminal: [ServiceRequestStatus.CANCELLED, ServiceRequestStatus.COMPLETED],
            start,
            end,
          },
        );
      if (skills.length)
        query.andWhere(
          `NOT EXISTS (SELECT 1 FROM unnest(CAST(:skills AS text[])) AS required(skill_code) WHERE NOT EXISTS (SELECT 1 FROM volunteer_skills skill WHERE skill.membership_id = m.id AND skill.skill_code = required.skill_code AND skill.status = :verified))`,
          { skills, verified: SkillVerificationStatus.VERIFIED },
        );
      if (options.search?.trim())
        query.andWhere(
          '(m.membershipNumber ILIKE :search OR u.phoneE164 ILIKE :search OR u.fullName ILIKE :search)',
          { search: `%${options.search.trim()}%` },
        );
      const page = options.page ?? 1,
        limit = options.limit ?? 20;
      const [memberships, total] = await query
        .orderBy('m.membershipNumber', 'ASC', 'NULLS LAST')
        .addOrderBy('m.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      return {
        volunteers: memberships.map((member) => ({
          id: member.id,
          membershipNumber: member.membershipNumber ?? null,
          fullName: member.user.fullName ?? null,
          phone: member.user.phoneE164,
        })),
        total,
        page,
        limit,
      };
    });
  }

  // ─── Coordinator Manual Dispatch (D#7, D#30) ────────────────────────────────
  async coordinatorDispatch(
    orgId: string,
    requestId: string,
    dto: CoordinatorDispatchDto,
    coordinatorId: string,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const volunteer = await this.lockVolunteer(manager, orgId, dto.volunteerMembershipId);
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: requestId })
        .andWhere('req.organizationId = :orgId', { orgId })
        .getOne();

      if (!request) {
        throw new NotFoundException(`Service request '${requestId}' not found`);
      }
      if (dto.volunteerMembershipId === request.beneficiaryMembershipId) {
        throw new BadRequestException('The person receiving help cannot be their own volunteer');
      }
      if (volunteer.userId === coordinatorId) {
        throw new ForbiddenException('A coordinator cannot assign themselves as the volunteer');
      }

      const existing = await manager.findOne(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          volunteerMembershipId: dto.volunteerMembershipId,
          status: In([
            VolunteerAssignmentStatus.OFFERED,
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
          ]),
        },
      });
      if (
        existing?.status === VolunteerAssignmentStatus.ACCEPTED ||
        // Already working on this visit: dispatching them again must not touch their timer.
        existing?.status === VolunteerAssignmentStatus.IN_PROGRESS
      )
        return existing;
      this.assertBookable(request, true);
      await this.assertRequiredSkills(manager, request, volunteer.id);
      if (request.latestRescheduleId) {
        if (
          existing?.status === VolunteerAssignmentStatus.OFFERED &&
          existing.rescheduleId === request.latestRescheduleId &&
          new Date(existing.offerExpiresAt).getTime() > Date.now()
        )
          return existing;
        if (existing)
          await manager.update(VolunteerAssignment, existing.id, {
            status: VolunteerAssignmentStatus.CANCELLED,
          });
        const pending = manager.create(VolunteerAssignment, {
          organizationId: orgId,
          serviceRequestId: request.id,
          volunteerMembershipId: dto.volunteerMembershipId,
          status: VolunteerAssignmentStatus.OFFERED,
          slotNumber: 1,
          offeredAt: new Date(),
          offerExpiresAt: this.matchingConfig.getOfferExpiresAt(
            request.urgency,
            request.scheduledStartTime,
          ),
          rescheduleId: request.latestRescheduleId,
          assignedByCoordinatorId: coordinatorId,
        });
        const saved = await manager.save(VolunteerAssignment, pending);
        await this.auditService.logEvent(
          {
            eventType: 'COORDINATOR_RECONFIRMATION_OFFERED',
            actorId: coordinatorId,
            targetId: saved.id,
            targetType: 'volunteer_assignments',
            organizationId: orgId,
            payload: {
              requestId,
              rescheduleId: request.latestRescheduleId,
              volunteerMembershipId: dto.volunteerMembershipId,
            },
            ipAddress: ipAddress ?? null,
          },
          manager,
        );
        return saved;
      }

      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, status: In(BOOKED_STATUSES) },
      });

      if (acceptedCount >= request.preferredVolunteers) {
        throw new ConflictException('All positions for this service have already been filled');
      }

      await this.assertNoScheduleConflict(manager, volunteer.userId, request, existing?.id);

      let assignment: VolunteerAssignment;
      if (existing) {
        existing.status = VolunteerAssignmentStatus.ACCEPTED;
        existing.acceptedAt = new Date();
        existing.assignedByCoordinatorId = coordinatorId;
        assignment = await manager.save(VolunteerAssignment, existing);
      } else {
        assignment = manager.create(VolunteerAssignment, {
          organizationId: orgId,
          serviceRequestId: request.id,
          volunteerMembershipId: dto.volunteerMembershipId,
          slotNumber: acceptedCount + 1,
          status: VolunteerAssignmentStatus.ACCEPTED,
          offeredAt: new Date(),
          offerExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          acceptedAt: new Date(),
          assignedByCoordinatorId: coordinatorId,
        });
        assignment = await manager.save(VolunteerAssignment, assignment);
      }

      await this.settleAfterBooking(manager, request, assignment, acceptedCount + 1);

      await this.notifications.enqueue(manager, {
        userId: volunteer.userId,
        type: 'VOLUNTEER_ASSIGNED',
        title: 'You have a new assignment',
        body: 'A coordinator assigned you to help. Open the app for details.',
        data: { assignmentId: assignment.id, organizationId: orgId },
        expiresAt: new Date(request.scheduledStartTime),
      });

      await this.auditService.logEvent(
        {
          eventType: 'COORDINATOR_DISPATCH_ASSIGNED',
          actorId: coordinatorId,
          targetId: assignment.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            requestId: request.id,
            volunteerMembershipId: dto.volunteerMembershipId,
            notes: dto.dispatchNotes,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return assignment;
    });
  }

  // ─── Offer Expiry & Progression Processing (D#7, D#12, D#13) ────────────────
  /**
   * Offers go to several volunteers at once. Once a request no longer needs volunteers (the
   * preferred team is booked, or it has started, finished, been cancelled or given up), the offers
   * nobody took are closed, so they leave volunteers' lists. A visit under way that is short
   * keeps its offers until enough people are booked. Expired offers on such requests are timed out
   * as well; open requests time out their own offers during progression. Offers asking an accepted
   * volunteer to confirm a new time belong to a reschedule and are left to it.
   */
  async closeStaleOffers(manager?: EntityManager, requestId?: string): Promise<number> {
    const run = manager ?? this.dataSource.manager;
    const one = requestId ? 'AND a.service_request_id = $1' : '';
    const params = requestId ? [requestId] : [];
    const booked = `(SELECT COUNT(*) FROM volunteer_assignments b
      WHERE b.service_request_id = r.id AND b.status IN ('ACCEPTED', 'IN_PROGRESS'))`;
    const [, cancelled] = await run.query(
      `UPDATE volunteer_assignments a SET status = 'CANCELLED', updated_at = now()
       FROM service_requests r
       WHERE r.id = a.service_request_id AND a.status = 'OFFERED' AND a.reschedule_id IS NULL
         AND (r.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED_UNMATCHED')
           OR (r.status = 'FULLY_MATCHED' AND ${booked} >= r.preferred_volunteers)
           OR (r.status = 'IN_PROGRESS'
             AND (r.below_minimum_at IS NULL OR ${booked} >= r.min_volunteers)))
         ${one}`,
      params,
    );
    const [, timedOut] = await run.query(
      `UPDATE volunteer_assignments a SET status = 'TIMED_OUT', updated_at = now()
       FROM service_requests r
       WHERE r.id = a.service_request_id AND a.status = 'OFFERED' AND a.offer_expires_at < now()
         AND r.status NOT IN ('MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED')
         ${one}`,
      params,
    );
    return Number(cancelled ?? 0) + Number(timedOut ?? 0);
  }

  async processExpiredOffers(requestId?: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(VolunteerAssignment) : this.assignmentRepo;
    const result = await repo.update(
      {
        status: VolunteerAssignmentStatus.OFFERED,
        offerExpiresAt: LessThan(new Date()),
        ...(requestId ? { serviceRequestId: requestId } : {}),
      },
      { status: VolunteerAssignmentStatus.TIMED_OUT },
    );
    return result.affected ?? 0;
  }

  /**
   * Unfilled requests with nothing left to wait for: no offer is still open, or the
   * round's time ran out. A withdrawal reopens a request, so replacement arrives here too.
   */
  async findRequestsDueForProgression(): Promise<{ id: string; organizationId: string }[]> {
    return this.requestRepo
      .createQueryBuilder('request')
      .select('request.id', 'id')
      .addSelect('request.organizationId', 'organizationId')
      .innerJoin('request.organization', 'organization', 'organization.status = :activeOrg', {
        activeOrg: OrganizationStatus.ACTIVE,
      })
      .where('request.status IN (:...statuses)', {
        statuses: [ServiceRequestStatus.MATCHING_ACTIVE, ServiceRequestStatus.PARTIALLY_ACCEPTED],
      })
      .andWhere(
        `(SELECT COUNT(*) FROM volunteer_assignments accepted
          WHERE accepted.service_request_id = request.id
            AND accepted.status = :accepted) < request.min_volunteers`,
        { accepted: VolunteerAssignmentStatus.ACCEPTED },
      )
      .andWhere(
        `(NOT EXISTS (SELECT 1 FROM volunteer_assignments open_offer
            WHERE open_offer.service_request_id = request.id
              AND open_offer.status = :offered
              AND open_offer.offer_expires_at > NOW())
          OR EXISTS (SELECT 1 FROM matching_rounds round
            WHERE round.service_request_id = request.id
              AND round.status = :activeRound
              AND round.expires_at < NOW()))`,
        { offered: VolunteerAssignmentStatus.OFFERED, activeRound: MatchingRoundStatus.ACTIVE },
      )
      .orderBy('request.createdAt', 'ASC')
      .limit(PROGRESSION_BATCH_SIZE)
      .getRawMany();
  }

  private async noticeEscalation(manager: EntityManager, request: ServiceRequest): Promise<void> {
    const notice = { organizationId: request.organizationId, requestId: request.id };
    await this.notifications.notifyCoordinators(manager, {
      ...notice,
      type: 'REQUEST_ESCALATED',
      title: 'A request needs a volunteer',
      body: 'Automatic matching could not fill this request. Open the admin panel.',
    });
    await this.notifications.notifyRequestOwners(manager, request, {
      ...notice,
      type: 'REQUEST_ESCALATED',
      title: 'Your coordinator is helping',
      body: 'We could not find a volunteer yet, so your coordinator will arrange this.',
    });
  }

  /** Each booking is handled alone, so one bad row cannot hold up the rest. */
  async recoverBookings(now = new Date()): Promise<void> {
    const activeOrganization = `JOIN organizations o ON o.id = r.organization_id AND o.status = 'ACTIVE'`;
    const assignments = (condition: string): Promise<{ id: string }[]> =>
      this.dataSource.query(
        `SELECT a.id FROM volunteer_assignments a
         JOIN service_requests r ON r.id = a.service_request_id ${activeOrganization}
         WHERE ${condition} ORDER BY a.created_at LIMIT ${PROGRESSION_BATCH_SIZE}`,
        [now],
      );
    const attempt = async (
      rows: { id: string }[],
      label: string,
      handler: (id: string, at: Date) => Promise<void>,
    ) => {
      for (const { id } of rows) {
        await handler(id, now).catch((error) =>
          this.logger.error(`Could not ${label} (${id})`, error),
        );
      }
    };

    // First, so the freed places go back into matching on this same tick.
    await attempt(
      await assignments(
        `a.status IN ('OFFERED', 'ACCEPTED') AND $1::timestamptz IS NOT NULL
         AND ${INELIGIBLE_VOLUNTEER}`,
      ),
      'release an ineligible volunteer',
      (id, at) => this.releaseIneligibleVolunteer(id, at),
    );
    await attempt(
      await assignments(
        `a.status = 'ACCEPTED' AND a.arrived_at IS NULL
         AND r.status IN ('PARTIALLY_ACCEPTED', 'FULLY_MATCHED', 'IN_PROGRESS')
         AND GREATEST(r.scheduled_start_time, a.accepted_at)
           + interval '${NO_SHOW_GRACE_MINUTES} minutes' < $1`,
      ),
      'mark a no-show',
      (id, at) => this.markNoShow(id, at),
    );
    await attempt(
      await assignments(
        `a.status = 'IN_PROGRESS' AND a.paused_at IS NULL
         AND a.started_at + a.paused_seconds * interval '1 second'
           + interval '${MAX_SERVICE_MINUTES} minutes' < $1`,
      ),
      'close an unfinished visit',
      (id, at) => this.closeUnfinishedVisit(id, at),
    );
    await attempt(
      await assignments(
        `a.status = 'IN_PROGRESS' AND a.finish_reminded_at IS NULL AND a.paused_at IS NULL
         AND a.started_at + a.paused_seconds * interval '1 second'
           + (r.expected_duration_minutes + ${FINISH_REMINDER_GRACE_MINUTES})
           * interval '1 minute' < $1`,
      ),
      'send a finish reminder',
      (id, at) => this.remindToFinish(id, at),
    );
    await attempt(
      await this.dataSource.query(
        `SELECT r.id FROM service_requests r ${activeOrganization}
         WHERE r.status IN ('MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED', 'ESCALATED_TO_COORDINATOR')
           AND r.scheduled_start_time + interval '${UNFILLED_GRACE_MINUTES} minutes' < $1
           AND NOT EXISTS (SELECT 1 FROM volunteer_assignments a
             WHERE a.service_request_id = r.id
               AND a.status IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED'))
         ORDER BY r.scheduled_start_time LIMIT ${PROGRESSION_BATCH_SIZE}`,
        [now],
      ),
      'expire an unfilled request',
      (id, at) => this.expireUnfilledRequest(id, at),
    );
    await attempt(
      await this.dataSource.query(
        `SELECT r.id FROM service_requests r ${activeOrganization}
         WHERE r.status = 'IN_PROGRESS' AND r.below_minimum_alerted_at IS NULL
           AND r.below_minimum_at + interval '${TEAM_FINISH_WAIT_MINUTES} minutes' < $1
           AND NOT EXISTS (SELECT 1 FROM volunteer_assignments p WHERE p.service_request_id = r.id
             AND p.status = 'IN_PROGRESS' AND p.paused_at IS NOT NULL)
         ORDER BY r.below_minimum_at LIMIT ${PROGRESSION_BATCH_SIZE}`,
        [now],
      ),
      'alert a short team',
      (id, at) => this.alertBelowMinimum(id, at),
    );
    await attempt(
      await this.dataSource.query(
        `SELECT r.id FROM service_requests r ${activeOrganization}
         WHERE r.status = 'IN_PROGRESS' AND r.below_minimum_alerted_at IS NOT NULL
           AND r.replacement_escalated_at IS NULL
           AND (SELECT COUNT(*) FROM volunteer_assignments b WHERE b.service_request_id = r.id
             AND b.status IN ('ACCEPTED', 'IN_PROGRESS')) < r.min_volunteers
           AND NOT EXISTS (SELECT 1 FROM volunteer_assignments o WHERE o.service_request_id = r.id
             AND o.status = 'OFFERED' AND o.offer_expires_at > $1)
         ORDER BY r.below_minimum_alerted_at LIMIT ${PROGRESSION_BATCH_SIZE}`,
        [now],
      ),
      'escalate an unfilled replacement',
      (id, at) => this.escalateUnfilledReplacement(id, at),
    );
  }

  private async lockForRecovery(
    manager: EntityManager,
    assignmentId: string,
    expected: VolunteerAssignmentStatus | VolunteerAssignmentStatus[],
  ): Promise<{ assignment: VolunteerAssignment; request: ServiceRequest } | null> {
    const allowed = Array.isArray(expected) ? expected : [expected];
    const found = await manager.findOne(VolunteerAssignment, { where: { id: assignmentId } });
    if (!found) return null;
    const request = await manager
      .createQueryBuilder(ServiceRequest, 'req')
      .setLock('pessimistic_write')
      .where('req.id = :id', { id: found.serviceRequestId })
      .getOne();
    const assignment = await manager.findOne(VolunteerAssignment, {
      where: { id: assignmentId },
      lock: { mode: 'pessimistic_write' },
    });
    return request && assignment && allowed.includes(assignment.status)
      ? { assignment, request }
      : null;
  }

  /**
   * A volunteer who was banned, suspended, restricted, removed or lost the volunteer
   * role gives up their offers and upcoming visits, and the request is matched again.
   * Visits already under way are left to the coordinator.
   */
  async releaseIneligibleVolunteer(assignmentId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const locked = await this.lockForRecovery(manager, assignmentId, [
        VolunteerAssignmentStatus.OFFERED,
        VolunteerAssignmentStatus.ACCEPTED,
      ]);
      if (!locked) return;
      const { assignment, request } = locked;
      const stillIneligible: unknown[] = await manager.query(
        `SELECT 1 FROM volunteer_assignments a WHERE a.id = $1 AND ${INELIGIBLE_VOLUNTEER}`,
        [assignment.id],
      );
      if (stillIneligible.length === 0) return;

      const wasAccepted = assignment.status === VolunteerAssignmentStatus.ACCEPTED;
      assignment.status = wasAccepted
        ? VolunteerAssignmentStatus.WITHDRAWN
        : VolunteerAssignmentStatus.CANCELLED;
      assignment.withdrawnAt = now;
      assignment.withdrawalReason = 'Volunteer is no longer available';
      await manager.save(VolunteerAssignment, assignment);

      if (wasAccepted) {
        await this.settleAfterDeparture(manager, request);
        const notice = { organizationId: request.organizationId, requestId: request.id };
        const searching = [
          ServiceRequestStatus.MATCHING_ACTIVE,
          ServiceRequestStatus.PARTIALLY_ACCEPTED,
        ].includes(request.status);
        await this.notifications.notifyRequestOwners(manager, request, {
          ...notice,
          type: 'VOLUNTEER_WITHDREW',
          title: 'Your volunteer cannot come',
          body: searching
            ? 'We are looking for someone else. Open the app for details.'
            : 'Open the app for details.',
        });
        await this.notifications.notifyCoordinators(manager, {
          ...notice,
          type: 'VOLUNTEER_RELEASED',
          title: 'A volunteer was taken off a visit',
          body: 'Their account or volunteer role is no longer active. Open the admin panel.',
        });
      }
      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_RELEASED_INELIGIBLE',
          actorId: null,
          targetId: assignment.id,
          targetType: 'volunteer_assignments',
          organizationId: request.organizationId,
          payload: {
            serviceRequestId: request.id,
            previousStatus: wasAccepted
              ? VolunteerAssignmentStatus.ACCEPTED
              : VolunteerAssignmentStatus.OFFERED,
            requestStatus: request.status,
          },
        },
        manager,
      );
    });
  }

  /** The time has passed, so a coordinator takes over rather than another matching round. */
  async markNoShow(assignmentId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const locked = await this.lockForRecovery(
        manager,
        assignmentId,
        VolunteerAssignmentStatus.ACCEPTED,
      );
      // Someone on site waiting for their team has not missed anything.
      if (!locked || locked.assignment.arrivedAt) return;
      const { assignment, request } = locked;
      assignment.status = VolunteerAssignmentStatus.NO_SHOW;
      assignment.withdrawnAt = now;
      assignment.withdrawalReason = 'Did not start the visit';
      await manager.save(VolunteerAssignment, assignment);
      await this.settleAfterDeparture(manager, request);

      const notice = { organizationId: request.organizationId, requestId: request.id };
      await this.notifications.notifyMemberships(manager, [assignment.volunteerMembershipId], {
        ...notice,
        type: 'VISIT_MISSED',
        title: 'Visit marked as missed',
        body: 'You did not start this visit. Contact your coordinator if this is wrong.',
      });
      const uncovered = [
        ServiceRequestStatus.MATCHING_ACTIVE,
        ServiceRequestStatus.PARTIALLY_ACCEPTED,
      ].includes(request.status);
      const accepted = await manager.count(VolunteerAssignment, {
        where: { serviceRequestId: request.id, status: VolunteerAssignmentStatus.ACCEPTED },
      });
      if (uncovered && accepted === 0) {
        request.status = ServiceRequestStatus.ESCALATED_TO_COORDINATOR;
        request.escalatedAt = now;
        await manager.save(ServiceRequest, request);
        await manager.update(
          VolunteerAssignment,
          { serviceRequestId: request.id, status: VolunteerAssignmentStatus.OFFERED },
          { status: VolunteerAssignmentStatus.CANCELLED },
        );
        await this.noticeEscalation(manager, request);
      } else {
        await this.notifications.notifyCoordinators(manager, {
          ...notice,
          type: 'VISIT_MISSED',
          title: 'A volunteer missed a visit',
          body: 'One volunteer did not start. Open the admin panel to check this request.',
        });
      }
      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_NO_SHOW',
          actorId: null,
          targetId: assignment.id,
          targetType: 'volunteer_assignments',
          organizationId: request.organizationId,
          payload: { serviceRequestId: request.id, requestStatus: request.status },
        },
        manager,
      );
    });
  }

  async remindToFinish(assignmentId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const locked = await this.lockForRecovery(
        manager,
        assignmentId,
        VolunteerAssignmentStatus.IN_PROGRESS,
      );
      if (!locked || locked.assignment.pausedAt) return;
      const { assignment, request } = locked;
      assignment.finishRemindedAt = now;
      await manager.save(VolunteerAssignment, assignment);
      await this.notifications.notifyMemberships(manager, [assignment.volunteerMembershipId], {
        organizationId: request.organizationId,
        requestId: request.id,
        type: 'FINISH_REMINDER',
        title: 'Have you finished?',
        body: 'Your visit is still running. Open the app and press Finish when you are done.',
      });
    });
  }

  /** Records the expected time, not the 12 hours on the clock. The member still confirms it. */
  async closeUnfinishedVisit(assignmentId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const locked = await this.lockForRecovery(
        manager,
        assignmentId,
        VolunteerAssignmentStatus.IN_PROGRESS,
      );
      if (!locked || locked.assignment.pausedAt) return;
      const { assignment, request } = locked;
      assignment.status = VolunteerAssignmentStatus.COMPLETED;
      assignment.finishedAt = now;
      assignment.reportedMinutes = Math.min(request.expectedDurationMinutes, MAX_SERVICE_MINUTES);
      assignment.completionNotes = 'Closed automatically because Finish was not pressed.';
      await manager.save(VolunteerAssignment, assignment);
      await this.afterVolunteerStopped(manager, request, now);
      const notice = { organizationId: request.organizationId, requestId: request.id };
      await this.notifications.notifyMemberships(manager, [assignment.volunteerMembershipId], {
        ...notice,
        type: 'VISIT_CLOSED',
        title: 'Your visit was closed',
        body: 'Finish was not pressed, so the expected time was recorded.',
      });
      await this.notifications.notifyRequestOwners(manager, request, {
        ...notice,
        type: 'SERVICE_FINISHED',
        title: 'Please confirm the help',
        body: 'A visit was closed. Open the app to confirm or report a problem.',
      });
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_CLOSED_AUTOMATICALLY',
          actorId: null,
          targetId: assignment.id,
          targetType: 'volunteer_assignments',
          organizationId: request.organizationId,
          payload: { serviceRequestId: request.id, minutes: assignment.reportedMinutes },
        },
        manager,
      );
    });
  }

  async expireUnfilledRequest(requestId: string, now = new Date()): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !request ||
        ![
          ServiceRequestStatus.MATCHING_ACTIVE,
          ServiceRequestStatus.PARTIALLY_ACCEPTED,
          ServiceRequestStatus.ESCALATED_TO_COORDINATOR,
        ].includes(request.status)
      )
        return;
      const cutoff = new Date(request.scheduledStartTime).getTime();
      if (now.getTime() <= cutoff + UNFILLED_GRACE_MINUTES * 60_000) return;
      const helping = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: In([
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
            VolunteerAssignmentStatus.COMPLETED,
          ]),
        },
      });
      if (helping > 0) return;
      request.status = ServiceRequestStatus.EXPIRED_UNMATCHED;
      await manager.save(ServiceRequest, request);
      await manager.update(
        VolunteerAssignment,
        { serviceRequestId: request.id, status: VolunteerAssignmentStatus.OFFERED },
        { status: VolunteerAssignmentStatus.CANCELLED },
      );
      await manager.update(
        MatchingRound,
        { serviceRequestId: request.id, status: MatchingRoundStatus.ACTIVE },
        { status: MatchingRoundStatus.EXPIRED },
      );
      await this.notifications.notifyRequestOwners(manager, request, {
        organizationId: request.organizationId,
        requestId: request.id,
        type: 'REQUEST_EXPIRED',
        title: 'No volunteer was found',
        body: 'We could not find anyone for this request. You can ask again in the app.',
      });
      await this.auditService.logEvent(
        {
          eventType: 'SERVICE_REQUEST_EXPIRED',
          actorId: null,
          targetId: request.id,
          targetType: 'service_requests',
          organizationId: request.organizationId,
          payload: { scheduledStartTime: request.scheduledStartTime },
        },
        manager,
      );
    });
  }

  async evaluateRoundProgression(orgId: string, requestId: string): Promise<ServiceRequest> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException(`Service request '${requestId}' not found`);
      }

      if (
        ![ServiceRequestStatus.MATCHING_ACTIVE, ServiceRequestStatus.PARTIALLY_ACCEPTED].includes(
          request.status,
        )
      ) {
        return request;
      }

      // Process expired offers first
      await this.processExpiredOffers(requestId, manager);

      // Get current active round
      const activeRound = await manager.getRepository(MatchingRound).findOne({
        where: { serviceRequestId: requestId, status: MatchingRoundStatus.ACTIVE },
        order: { roundNumber: 'DESC' },
      });

      // Check count of pending offers in current round
      const pendingOffersCount = activeRound
        ? await manager.getRepository(VolunteerAssignment).count({
            where: {
              matchingRoundId: activeRound.id,
              status: VolunteerAssignmentStatus.OFFERED,
            },
          })
        : 0;

      const acceptedCount = await manager.getRepository(VolunteerAssignment).count({
        where: {
          serviceRequestId: requestId,
          status: VolunteerAssignmentStatus.ACCEPTED,
        },
      });

      // If still unfilled and no pending offers remain or round has expired
      const isRoundExpired = activeRound ? new Date() > new Date(activeRound.expiresAt) : false;
      if (acceptedCount < request.minVolunteers && (pendingOffersCount === 0 || isRoundExpired)) {
        if (activeRound) {
          activeRound.status = MatchingRoundStatus.EXPIRED;
          await manager.getRepository(MatchingRound).save(activeRound);
        }

        if (request.matchingTier < 3) {
          // Progress to next tier
          request.matchingTier = request.matchingTier + 1;
          await manager.getRepository(ServiceRequest).save(request);
          await this.findCandidatesAndDispatchOffers(request, request.matchingTier, manager);
        } else {
          // Tier 3 exhausted -> escalate to coordinator
          if (activeRound) {
            activeRound.status = MatchingRoundStatus.ESCALATED;
            await manager.getRepository(MatchingRound).save(activeRound);
          }
          request.status = ServiceRequestStatus.ESCALATED_TO_COORDINATOR;
          request.escalatedAt = new Date();
          await manager.getRepository(ServiceRequest).save(request);
          await this.noticeEscalation(manager, request);

          await this.auditService.logEvent(
            {
              eventType: 'REQUEST_ESCALATED_TO_COORDINATOR',
              actorId: null,
              targetId: request.id,
              targetType: 'service_requests',
              organizationId: request.organizationId,
              payload: {
                reason: 'Matching rounds exhausted without filling minimum volunteer headcount',
                finalTier: request.matchingTier,
              },
            },
            manager,
          );
        }
      }

      return request;
    });
  }

  // ─── Search Radius Expansion & Escalation (D#7, D#13) ────────────────────────
  async expandSearchRadius(orgId: string, requestId: string): Promise<ServiceRequest> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await manager.getRepository(ServiceRequest).findOne({
        where: { id: requestId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException(`Service request '${requestId}' not found`);
      }

      if (
        request.status !== ServiceRequestStatus.MATCHING_ACTIVE &&
        request.status !== ServiceRequestStatus.PARTIALLY_ACCEPTED
      ) {
        return request;
      }

      if (request.matchingTier === 1) {
        request.matchingTier = 2;
        request.matchingRadiusKm = this.matchingConfig.getRadiusForTier(2);
      } else if (request.matchingTier === 2) {
        request.matchingTier = 3;
        request.matchingRadiusKm = this.matchingConfig.getRadiusForTier(3);
      } else {
        // Tier 3 exhausted -> escalate to coordinator
        request.status = ServiceRequestStatus.ESCALATED_TO_COORDINATOR;
        request.escalatedAt = new Date();
      }

      const saved = await manager.getRepository(ServiceRequest).save(request);

      if (saved.status === ServiceRequestStatus.ESCALATED_TO_COORDINATOR) {
        await this.noticeEscalation(manager, saved);
      }
      if (saved.status !== ServiceRequestStatus.ESCALATED_TO_COORDINATOR) {
        // Dispatch new offers to wider pool
        await this.findCandidatesAndDispatchOffers(saved, saved.matchingTier, manager);
      } else {
        await this.auditService.logEvent(
          {
            eventType: 'REQUEST_ESCALATED_TO_COORDINATOR',
            actorId: null,
            targetId: saved.id,
            targetType: 'service_requests',
            organizationId: saved.organizationId,
            payload: {
              reason: 'Tier 3 search radius exhausted',
              finalRadiusKm: saved.matchingRadiusKm,
            },
          },
          manager,
        );
      }

      return saved;
    });
  }

  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

/** A visit under way with an open place to fill. */
function isShortMidVisit(request: ServiceRequest): boolean {
  return request.status === ServiceRequestStatus.IN_PROGRESS && Boolean(request.belowMinimumAt);
}

/**
 * What a volunteer on a visit sees about their team. Teammates' names and numbers are shown only
 * while both are booked or under way (the list is built from booked assignments only).
 */
function teamView(assignment: VolunteerAssignment, booked: VolunteerAssignment[]) {
  const request = assignment.serviceRequest!;
  const team = booked.filter((other) => other.serviceRequestId === assignment.serviceRequestId);
  const teammates = team.filter((other) => other.id !== assignment.id);
  const started = request.status === ServiceRequestStatus.IN_PROGRESS;
  const working = assignment.status === VolunteerAssignmentStatus.IN_PROGRESS;
  const othersWorking = teammates.some(
    (other) => other.status === VolunteerAssignmentStatus.IN_PROGRESS,
  );
  const arrived = team.filter((other) => other.arrivedAt).length;
  const short = Boolean(request.belowMinimumAt);
  const places = short ? request.minVolunteers : request.preferredVolunteers;
  const sensitive = request.serviceCatalog?.requiresCoordinatorDispatch ?? false;
  return {
    minVolunteers: request.minVolunteers,
    preferredVolunteers: request.preferredVolunteers,
    teammates: teammates.map((other) => ({
      fullName: other.volunteerMembership?.user?.fullName ?? null,
      phoneE164: other.volunteerMembership?.user?.phoneE164 ?? null,
      onSite: other.status === VolunteerAssignmentStatus.IN_PROGRESS || Boolean(other.arrivedAt),
    })),
    waitingForTeam: !started && Boolean(assignment.arrivedAt),
    stillNeeded: started ? 0 : Math.max(0, request.minVolunteers - arrived),
    short: short && Boolean(request.belowMinimumAlertedAt),
    stopHazardousWork:
      short &&
      Boolean(request.belowMinimumAlertedAt) &&
      (request.serviceCatalog?.globalService?.isHazardousPhysical ?? false),
    canLeave: working && othersWorking,
    canHandOver: working && !othersWorking,
    canInvite:
      !sensitive &&
      // Once escalated, a coordinator is arranging the rest of the team.
      request.status !== ServiceRequestStatus.ESCALATED_TO_COORDINATOR &&
      (!started || short) &&
      team.length < places,
  };
}
