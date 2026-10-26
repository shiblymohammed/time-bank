import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan } from 'typeorm';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  SkillVerificationStatus,
  UserRole,
  VolunteerAssignmentStatus,
  UrgencyType,
  MatchingRoundStatus,
} from '@ktb/shared-types';

import { VolunteerSkill } from './entities/volunteer-skill.entity';
import { VolunteerAvailability } from './entities/volunteer-availability.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { OperationalZone } from './entities/operational-zone.entity';
import { VolunteerZoneAssignment } from './entities/volunteer-zone-assignment.entity';
import { MatchingRound } from './entities/matching-round.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { AuditService } from '../audit/audit.service';
import { MatchingConfigService } from './matching-config.service';
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
import { CoordinatorDispatchDto } from './dto/coordinator-dispatch.dto';
import { CreateOperationalZoneDto } from './dto/create-operational-zone.dto';
import { UpdateOperationalZoneDto } from './dto/update-operational-zone.dto';
import { AssignVolunteerZoneDto } from './dto/assign-volunteer-zone.dto';

@Injectable()
export class MatchingService {
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

  async listVolunteerZones(orgId: string, membershipId: string): Promise<VolunteerZoneAssignment[]> {
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
  ): Promise<VolunteerAvailability> {
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
      if (dto.isAvailableImmediate !== undefined) avail.isAvailableImmediate = dto.isAvailableImmediate;
      if (dto.maxTravelRadiusKm !== undefined) avail.maxTravelRadiusKm = dto.maxTravelRadiusKm;
      if (dto.preferredWardNumbers !== undefined) avail.preferredWardNumbers = dto.preferredWardNumbers;
      if (dto.transientLat !== undefined) {
        avail.transientLat = dto.transientLat;
        avail.transientLng = dto.transientLng ?? null;
        avail.transientUpdatedAt = new Date();
      }
      if (dto.isGpsConsented !== undefined) avail.isGpsConsented = dto.isGpsConsented;
      if (dto.residentialAddressText !== undefined) avail.residentialAddressText = dto.residentialAddressText ?? null;
      if (dto.residentialWardNumber !== undefined) avail.residentialWardNumber = dto.residentialWardNumber ?? null;
      if (dto.residentialPostalCode !== undefined) avail.residentialPostalCode = dto.residentialPostalCode ?? null;
      if (dto.residentialLat !== undefined) avail.residentialLat = dto.residentialLat ?? null;
      if (dto.residentialLng !== undefined) avail.residentialLng = dto.residentialLng ?? null;
    }

    return this.availabilityRepo.save(avail);
  }

  async getAvailability(orgId: string, membershipId: string): Promise<VolunteerAvailability> {
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

  async listVolunteerSkills(orgId: string, membershipId: string): Promise<VolunteerSkill[]> {
    return this.skillRepo.find({
      where: { organizationId: orgId, membershipId },
      relations: ['verifier', 'document'],
    });
  }

  // ─── Proximity & Policy-Driven Candidate Matching Dispatch ───────────────────
  async findCandidatesAndDispatchOffers(
    request: ServiceRequest,
    targetTier?: number,
  ): Promise<VolunteerAssignment[]> {
    const orgId = request.organizationId;
    const isImmediate = request.urgency === UrgencyType.IMMEDIATE;

    // Check sensitive service flags (D#7: requiresCoordinatorDispatch)
    if (request.serviceCatalog?.requiresCoordinatorDispatch) {
      await this.auditService.logEvent({
        eventType: 'MATCHING_SKIPPED_SENSITIVE_SERVICE',
        actorId: null,
        targetId: request.id,
        targetType: 'service_requests',
        organizationId: orgId,
        payload: {
          reason: 'Service item requires manual coordinator dispatch',
          catalogId: request.serviceCatalogId,
        },
      });
      return [];
    }

    const requiredSkills: string[] = request.serviceCatalog?.globalService?.requiredSkillCodes ?? [];
    const requiresSkills = request.serviceCatalog?.globalService?.requiresSkills ?? false;

    // Determine current matching tier and radius
    const currentTier = targetTier ?? request.matchingTier ?? 1;
    const searchRadiusKm = this.matchingConfig.getRadiusForTier(currentTier);

    request.matchingTier = currentTier;
    request.matchingRadiusKm = searchRadiusKm;
    await this.requestRepo.save(request);

    // Create or find durable matching round
    const existingRounds = await this.roundRepo.find({
      where: { serviceRequestId: request.id },
      order: { roundNumber: 'DESC' },
    });

    let currentRound: MatchingRound;
    const latestRound = existingRounds[0];
    if (latestRound && latestRound.tier === currentTier && latestRound.status === MatchingRoundStatus.ACTIVE) {
      currentRound = latestRound;
    } else {
      const nextRoundNumber = latestRound ? latestRound.roundNumber + 1 : 1;
      const roundExpiresAt = this.matchingConfig.getRoundExpiresAt(
        request.urgency,
        currentTier,
        request.scheduledStartTime,
      );

      currentRound = this.roundRepo.create({
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
      currentRound = await this.roundRepo.save(currentRound);
    }

    // 1. Query candidate memberships with active VOLUNTEER role grant
    const query = this.membershipRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.user', 'u')
      .innerJoin('m.roleGrants', 'rg')
      .leftJoinAndSelect('u.restrictions', 'rst')
      .where('m.status = :mStatus', { mStatus: MembershipStatus.APPROVED })
      .andWhere('u.status = :uStatus', { uStatus: AccountStatus.ACTIVE })
      .andWhere('rg.role = :role', { role: UserRole.VOLUNTEER })
      .andWhere('rg.status = :rgStatus', { rgStatus: RoleGrantStatus.ACTIVE });

    if (!request.allowsCrossOrgVolunteers) {
      query.andWhere('m.organizationId = :orgId', { orgId });
    }

    // Do not match beneficiary themselves as volunteer
    query.andWhere('m.id != :benMemId', { benMemId: request.beneficiaryMembershipId });

    const eligibleMemberships = await query.getMany();

    // Already assigned/offered volunteers in any active status for this request
    const existingAssignments = await this.assignmentRepo.find({
      where: { serviceRequestId: request.id },
    });
    const alreadyHandledMemIds = new Set(
      existingAssignments
        .filter((a) =>
          [
            VolunteerAssignmentStatus.OFFERED,
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
            VolunteerAssignmentStatus.COMPLETED,
          ].includes(a.status),
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
      const verifiedSkills = await this.skillRepo.find({
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
      const availability = await this.availabilityRepo.findOne({
        where: { membershipId: member.id },
      });

      if (isImmediate && availability && !availability.isAvailableImmediate) {
        continue;
      }

      // Schedule conflict checking: check overlapping active assignments
      const candidateAssignments = await this.assignmentRepo.find({
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
      const assignedZones = await this.zoneAssignRepo.find({
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
        [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS].includes(a.status),
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
      const assignment = this.assignmentRepo.create({
        organizationId: request.organizationId,
        serviceRequestId: request.id,
        matchingRoundId: currentRound.id,
        volunteerMembershipId: ranked.profile.membershipId,
        slotNumber: slotCounter++,
        status: VolunteerAssignmentStatus.OFFERED,
        offeredAt: new Date(),
        offerExpiresAt,
      });

      const saved = await this.assignmentRepo.save(assignment);
      dispatchedAssignments.push(saved);
    }

    // Update round stats
    currentRound.offersDispatchedCount += dispatchedAssignments.length;
    await this.roundRepo.save(currentRound);

    await this.auditService.logEvent({
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
    });

    return dispatchedAssignments;
  }

  // ─── Transactionally Safe Offer Acceptance (D#12, D#64, BR-06) ──────────────
  async acceptOffer(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: AcceptVolunteerOfferDto,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Find and validate assignment
      const assignment = await manager.findOne(VolunteerAssignment, {
        where: {
          id: assignmentId,
          organizationId: orgId,
          volunteerMembershipId,
        },
        relations: ['matchingRound'],
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment offer '${assignmentId}' not found`);
      }

      // Idempotency check: if already accepted with matching clientOperationId, return saved state
      if (
        dto.clientOperationId &&
        assignment.idempotencyKey === dto.clientOperationId &&
        assignment.status === VolunteerAssignmentStatus.ACCEPTED
      ) {
        return assignment;
      }

      if (assignment.status !== VolunteerAssignmentStatus.OFFERED) {
        throw new BadRequestException(`Assignment is not in OFFERED status (current: ${assignment.status})`);
      }

      if (new Date() > new Date(assignment.offerExpiresAt)) {
        assignment.status = VolunteerAssignmentStatus.TIMED_OUT;
        await manager.save(VolunteerAssignment, assignment);
        throw new ConflictException('Offer has expired (D#12)');
      }

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

      // 3. Count currently accepted assignments
      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: VolunteerAssignmentStatus.ACCEPTED,
        },
      });

      if (acceptedCount >= request.preferredVolunteers) {
        assignment.status = VolunteerAssignmentStatus.DECLINED;
        assignment.declineReason = 'SLOT_FILLED';
        await manager.save(VolunteerAssignment, assignment);
        throw new ConflictException('All positions for this service have already been filled');
      }

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
      if (newAcceptedCount >= request.minVolunteers) {
        request.status = ServiceRequestStatus.FULLY_MATCHED;
        if (assignment.matchingRoundId) {
          await manager.update(
            MatchingRound,
            { id: assignment.matchingRoundId },
            { status: MatchingRoundStatus.COMPLETED },
          );
        }
      } else {
        request.status = ServiceRequestStatus.PARTIALLY_ACCEPTED;
      }
      await manager.save(ServiceRequest, request);

      // Audit log
      await this.auditService.logEvent({
        eventType: 'VOLUNTEER_OFFER_ACCEPTED',
        actorId: null,
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
      });

      return savedAssignment;
    });
  }

  // ─── Decline Offer ──────────────────────────────────────────────────────────
  async declineOffer(
    orgId: string,
    assignmentId: string,
    volunteerMembershipId: string,
    dto: DeclineVolunteerOfferDto,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: {
        id: assignmentId,
        organizationId: orgId,
        volunteerMembershipId,
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Assignment offer '${assignmentId}' not found`);
    }

    if (assignment.status !== VolunteerAssignmentStatus.OFFERED) {
      throw new BadRequestException(`Cannot decline assignment in status '${assignment.status}'`);
    }

    assignment.status = VolunteerAssignmentStatus.DECLINED;
    assignment.declinedAt = new Date();
    assignment.declineReason = dto.declineReason ?? 'Declined by volunteer';

    const saved = await this.assignmentRepo.save(assignment);

    await this.auditService.logEvent({
      eventType: 'VOLUNTEER_OFFER_DECLINED',
      actorId: null,
      targetId: saved.id,
      targetType: 'volunteer_assignments',
      organizationId: orgId,
      payload: { reason: saved.declineReason },
      ipAddress: ipAddress ?? null,
    });

    return saved;
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
      const assignment = await manager.findOne(VolunteerAssignment, {
        where: {
          id: assignmentId,
          organizationId: orgId,
          volunteerMembershipId,
        },
      });

      if (!assignment) {
        throw new NotFoundException(`Assignment '${assignmentId}' not found`);
      }

      if (assignment.status !== VolunteerAssignmentStatus.ACCEPTED) {
        throw new BadRequestException(`Can only withdraw from ACCEPTED status (current: ${assignment.status})`);
      }

      assignment.status = VolunteerAssignmentStatus.WITHDRAWN;
      assignment.withdrawnAt = new Date();
      assignment.withdrawalReason = dto.withdrawalReason;
      const savedAssignment = await manager.save(VolunteerAssignment, assignment);

      // Lock request and recalculate
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: assignment.serviceRequestId })
        .getOne();

      if (request) {
        const remainingAccepted = await manager.count(VolunteerAssignment, {
          where: {
            serviceRequestId: request.id,
            status: VolunteerAssignmentStatus.ACCEPTED,
          },
        });

        if (remainingAccepted < request.minVolunteers) {
          request.status =
            remainingAccepted > 0
              ? ServiceRequestStatus.PARTIALLY_ACCEPTED
              : ServiceRequestStatus.MATCHING_ACTIVE;
          await manager.save(ServiceRequest, request);
        }
      }

      await this.auditService.logEvent({
        eventType: 'VOLUNTEER_ASSIGNMENT_WITHDRAWN',
        actorId: null,
        targetId: savedAssignment.id,
        targetType: 'volunteer_assignments',
        organizationId: orgId,
        payload: {
          serviceRequestId: assignment.serviceRequestId,
          reason: dto.withdrawalReason,
        },
        ipAddress: ipAddress ?? null,
      });

      return savedAssignment;
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
    return this.dataSource.transaction(async (manager) => {
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: requestId })
        .andWhere('req.organizationId = :orgId', { orgId })
        .getOne();

      if (!request) {
        throw new NotFoundException(`Service request '${requestId}' not found`);
      }

      const volunteerMem = await manager.findOne(OrganizationMembership, {
        where: { id: dto.volunteerMembershipId, organizationId: orgId },
      });

      if (!volunteerMem || volunteerMem.status !== MembershipStatus.APPROVED) {
        throw new NotFoundException('Volunteer membership not found or not approved');
      }

      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: VolunteerAssignmentStatus.ACCEPTED,
        },
      });

      if (acceptedCount >= request.preferredVolunteers) {
        throw new ConflictException('All positions for this service have already been filled');
      }

      // Check if volunteer already assigned
      const existing = await manager.findOne(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          volunteerMembershipId: dto.volunteerMembershipId,
        },
      });

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

      // Update request status
      const newAcceptedCount = acceptedCount + 1;
      if (newAcceptedCount >= request.minVolunteers) {
        request.status = ServiceRequestStatus.FULLY_MATCHED;
      } else {
        request.status = ServiceRequestStatus.PARTIALLY_ACCEPTED;
      }
      await manager.save(ServiceRequest, request);

      await this.auditService.logEvent({
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
      });

      return assignment;
    });
  }

  // ─── Offer Expiry & Progression Processing (D#7, D#12, D#13) ────────────────
  async processExpiredOffers(requestId?: string): Promise<number> {
    const whereCondition: any = {
      status: VolunteerAssignmentStatus.OFFERED,
      offerExpiresAt: LessThan(new Date()),
    };
    if (requestId) {
      whereCondition.serviceRequestId = requestId;
    }

    const expiredOffers = await this.assignmentRepo.find({ where: whereCondition });
    for (const offer of expiredOffers) {
      offer.status = VolunteerAssignmentStatus.TIMED_OUT;
      await this.assignmentRepo.save(offer);
    }
    return expiredOffers.length;
  }

  async evaluateRoundProgression(requestId: string): Promise<ServiceRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['serviceCatalog', 'serviceCatalog.globalService'],
    });

    if (!request) {
      throw new NotFoundException(`Service request '${requestId}' not found`);
    }

    if (
      request.status === ServiceRequestStatus.FULLY_MATCHED ||
      request.status === ServiceRequestStatus.COMPLETED ||
      request.status === ServiceRequestStatus.CANCELLED
    ) {
      return request;
    }

    // Process expired offers first
    await this.processExpiredOffers(requestId);

    // Get current active round
    const activeRound = await this.roundRepo.findOne({
      where: { serviceRequestId: requestId, status: MatchingRoundStatus.ACTIVE },
      order: { roundNumber: 'DESC' },
    });

    // Check count of pending offers in current round
    const pendingOffersCount = activeRound
      ? await this.assignmentRepo.count({
          where: {
            matchingRoundId: activeRound.id,
            status: VolunteerAssignmentStatus.OFFERED,
          },
        })
      : 0;

    const acceptedCount = await this.assignmentRepo.count({
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
        await this.roundRepo.save(activeRound);
      }

      if (request.matchingTier < 3) {
        // Progress to next tier
        request.matchingTier = request.matchingTier + 1;
        await this.requestRepo.save(request);
        await this.findCandidatesAndDispatchOffers(request, request.matchingTier);
      } else {
        // Tier 3 exhausted -> escalate to coordinator
        if (activeRound) {
          activeRound.status = MatchingRoundStatus.ESCALATED;
          await this.roundRepo.save(activeRound);
        }
        request.status = ServiceRequestStatus.ESCALATED_TO_COORDINATOR;
        request.escalatedAt = new Date();
        await this.requestRepo.save(request);

        await this.auditService.logEvent({
          eventType: 'REQUEST_ESCALATED_TO_COORDINATOR',
          actorId: null,
          targetId: request.id,
          targetType: 'service_requests',
          organizationId: request.organizationId,
          payload: {
            reason: 'Matching rounds exhausted without filling minimum volunteer headcount',
            finalTier: request.matchingTier,
          },
        });
      }
    }

    return request;
  }

  // ─── Search Radius Expansion & Escalation (D#7, D#13) ────────────────────────
  async expandSearchRadius(requestId: string): Promise<ServiceRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['serviceCatalog', 'serviceCatalog.globalService'],
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

    const saved = await this.requestRepo.save(request);

    if (saved.status !== ServiceRequestStatus.ESCALATED_TO_COORDINATOR) {
      // Dispatch new offers to wider pool
      await this.findCandidatesAndDispatchOffers(saved, saved.matchingTier);
    } else {
      await this.auditService.logEvent({
        eventType: 'REQUEST_ESCALATED_TO_COORDINATOR',
        actorId: null,
        targetId: saved.id,
        targetType: 'service_requests',
        organizationId: saved.organizationId,
        payload: {
          reason: 'Tier 3 search radius exhausted',
          finalRadiusKm: saved.matchingRadiusKm,
        },
      });
    }

    return saved;
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
