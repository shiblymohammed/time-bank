import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import {
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  TeamInvitationStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';

import { TeamInvitation } from './entities/team-invitation.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { MatchingConfigService } from './matching-config.service';

import { InviteTeammateDto } from './dto/invite-teammate.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';

/**
 * TeamService — Milestone 5 Team & Transfer Workflows.
 *
 * Responsibilities:
 *   1. Team invitations — an accepted volunteer invites a teammate to fill a
 *      remaining slot (FR-TEAM-02, D#65).
 *   2. Accept invitation — the invitee accepts and gets an ACCEPTED assignment
 *      immediately, bypassing the OFFERED matching round.
 *   3. Sub-minimum mid-service re-matching — when a team member withdraws mid-service
 *      and the active count drops below minVolunteers, trigger re-matching to fill
 *      the gap (FR-TEAM-05, D#69, BR-07).
 *   4. Sequential transfer credit rule — only the finishing volunteer earns credits,
 *      not the one who was replaced (FR-TEAM-07, D#33, BR-06).
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    @InjectRepository(TeamInvitation)
    private readonly invitationRepo: Repository<TeamInvitation>,
    @InjectRepository(VolunteerAssignment)
    private readonly assignmentRepo: Repository<VolunteerAssignment>,
    @InjectRepository(ServiceRequest)
    private readonly requestRepo: Repository<ServiceRequest>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly matchingConfig: MatchingConfigService,
  ) {}

  // ─── Team Invitations (FR-TEAM-02, D#65) ─────────────────────────────────────

  /**
   * An accepted volunteer invites a teammate to fill a remaining slot on a
   * multi-volunteer request.
   *
   * Validation:
   *   - The request must be in an active matching/matched/in-progress state
   *   - The inviter must have an ACCEPTED or IN_PROGRESS assignment on the request
   *   - There must be an unfilled slot (accepted count < preferredVolunteers)
   *   - The invitee must be an approved volunteer in the same org
   *   - The invitee must not already be assigned to this request
   *   - The invitee must not be the beneficiary (D#5)
   */
  async inviteTeammate(
    orgId: string,
    requestId: string,
    dto: InviteTeammateDto,
    inviterUserId: string,
    ipAddress?: string,
  ): Promise<TeamInvitation> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Lock the request
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: requestId })
        .andWhere('req.organizationId = :orgId', { orgId })
        .getOne();

      if (!request) throw new NotFoundException('Service request not found');

      if (
        ![
          ServiceRequestStatus.MATCHING_ACTIVE,
          ServiceRequestStatus.PARTIALLY_ACCEPTED,
          ServiceRequestStatus.FULLY_MATCHED,
          ServiceRequestStatus.IN_PROGRESS,
        ].includes(request.status)
      ) {
        throw new ConflictException(
          `Cannot invite teammates to a request in status '${request.status}'`,
        );
      }

      // Resolve inviter's membership in this org
      const inviterMembership = await manager.findOne(OrganizationMembership, {
        where: { userId: inviterUserId, organizationId: orgId },
      });
      if (!inviterMembership) {
        throw new ForbiddenException('You are not a member of this organization');
      }

      // Verify the inviter has an active assignment on this request
      const inviterAssignment = await manager.findOne(VolunteerAssignment, {
        where: {
          serviceRequestId: requestId,
          volunteerMembershipId: inviterMembership.id,
          status: In([
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
          ]),
        },
      });
      if (!inviterAssignment) {
        throw new ForbiddenException(
          'Only an accepted volunteer on this request can invite teammates',
        );
      }

      // Check for unfilled slots
      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: requestId,
          status: In([
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
          ]),
        },
      });

      if (acceptedCount >= request.preferredVolunteers) {
        throw new ConflictException('All team positions are already filled');
      }

      // Verify invitee is an approved volunteer in this org
      const inviteeMembership = await manager.findOne(OrganizationMembership, {
        where: {
          id: dto.inviteeMembershipId,
          organizationId: orgId,
          status: MembershipStatus.APPROVED,
        },
        relations: ['roleGrants'],
      });
      if (!inviteeMembership) {
        throw new NotFoundException('Invited volunteer not found or not approved in this organization');
      }
      if (
        !inviteeMembership.roleGrants?.some(
          (g) => g.role === UserRole.VOLUNTEER && g.status === RoleGrantStatus.ACTIVE,
        )
      ) {
        throw new BadRequestException('The invited member does not have an active volunteer role');
      }

      // Prevent self-invitation
      if (inviteeMembership.userId === inviterUserId) {
        throw new BadRequestException('Cannot invite yourself');
      }

      // Prevent inviting the beneficiary (D#5)
      if (inviteeMembership.id === request.beneficiaryMembershipId) {
        throw new BadRequestException('Cannot invite the beneficiary as a volunteer');
      }

      // Check the invitee isn't already assigned to this request
      const existingAssignment = await manager.findOne(VolunteerAssignment, {
        where: {
          serviceRequestId: requestId,
          volunteerMembershipId: dto.inviteeMembershipId,
          status: In([
            VolunteerAssignmentStatus.OFFERED,
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
          ]),
        },
      });
      if (existingAssignment) {
        throw new ConflictException('This volunteer is already assigned to this request');
      }

      // Check no pending invitation already exists
      const existingInvitation = await manager.findOne(TeamInvitation, {
        where: {
          serviceRequestId: requestId,
          inviteeMembershipId: dto.inviteeMembershipId,
          status: TeamInvitationStatus.PENDING,
        },
      });
      if (existingInvitation) {
        throw new ConflictException('A pending invitation already exists for this volunteer');
      }

      // Determine the slot number
      const slotNumber =
        dto.slotNumber ?? acceptedCount + 1;

      // Invitation expiry: same as offer expiry for this urgency
      const expiresAt = this.matchingConfig.getOfferExpiresAt(
        request.urgency,
        request.scheduledStartTime,
      );

      const invitation = manager.create(TeamInvitation, {
        organizationId: orgId,
        serviceRequestId: requestId,
        inviterMembershipId: inviterMembership.id,
        inviteeMembershipId: dto.inviteeMembershipId,
        slotNumber,
        status: TeamInvitationStatus.PENDING,
        expiresAt,
      });

      const saved = await manager.save(TeamInvitation, invitation);

      await this.auditService.logEvent(
        {
          eventType: 'TEAM_INVITATION_SENT',
          actorId: inviterUserId,
          targetId: saved.id,
          targetType: 'team_invitations',
          organizationId: orgId,
          payload: {
            serviceRequestId: requestId,
            inviteeMembershipId: dto.inviteeMembershipId,
            slotNumber,
            message: dto.message ?? null,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return saved;
    });
  }

  /**
   * The invitee accepts a team invitation and is immediately assigned as ACCEPTED
   * — no OFFERED round is needed since the inviter vetted them (FR-TEAM-02).
   */
  async acceptInvitation(
    orgId: string,
    invitationId: string,
    inviteeUserId: string,
    ipAddress?: string,
  ): Promise<VolunteerAssignment> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const invitation = await manager.findOne(TeamInvitation, {
        where: { id: invitationId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new NotFoundException('Team invitation not found');

      if (invitation.status !== TeamInvitationStatus.PENDING) {
        throw new ConflictException(`Invitation is already ${invitation.status}`);
      }

      // Verify the caller is the invitee
      const inviteeMembership = await manager.findOne(OrganizationMembership, {
        where: { id: invitation.inviteeMembershipId },
      });
      if (!inviteeMembership || inviteeMembership.userId !== inviteeUserId) {
        throw new ForbiddenException('This invitation is not for you');
      }

      // Check expiry
      if (new Date() > new Date(invitation.expiresAt)) {
        invitation.status = TeamInvitationStatus.EXPIRED;
        await manager.save(TeamInvitation, invitation);
        throw new ConflictException('This invitation has expired');
      }

      // Lock the request and verify it's still bookable
      const request = await manager
        .createQueryBuilder(ServiceRequest, 'req')
        .setLock('pessimistic_write')
        .where('req.id = :id', { id: invitation.serviceRequestId })
        .getOne();
      if (!request) throw new NotFoundException('Service request not found');

      if (
        ![
          ServiceRequestStatus.MATCHING_ACTIVE,
          ServiceRequestStatus.PARTIALLY_ACCEPTED,
          ServiceRequestStatus.FULLY_MATCHED,
          ServiceRequestStatus.IN_PROGRESS,
        ].includes(request.status)
      ) {
        invitation.status = TeamInvitationStatus.CANCELLED;
        await manager.save(TeamInvitation, invitation);
        throw new ConflictException('This request is no longer accepting volunteers');
      }

      // Check slots still available
      const acceptedCount = await manager.count(VolunteerAssignment, {
        where: {
          serviceRequestId: request.id,
          status: In([
            VolunteerAssignmentStatus.ACCEPTED,
            VolunteerAssignmentStatus.IN_PROGRESS,
          ]),
        },
      });
      if (acceptedCount >= request.preferredVolunteers) {
        invitation.status = TeamInvitationStatus.CANCELLED;
        await manager.save(TeamInvitation, invitation);
        throw new ConflictException('All positions have been filled');
      }

      // Create the assignment directly as ACCEPTED
      const assignment = manager.create(VolunteerAssignment, {
        organizationId: orgId,
        serviceRequestId: request.id,
        volunteerMembershipId: invitation.inviteeMembershipId,
        slotNumber: invitation.slotNumber,
        status: VolunteerAssignmentStatus.ACCEPTED,
        offeredAt: new Date(),
        offerExpiresAt: invitation.expiresAt,
        acceptedAt: new Date(),
        assignedByCoordinatorId: null,
      });
      const savedAssignment = await manager.save(VolunteerAssignment, assignment);

      // Mark invitation as accepted
      invitation.status = TeamInvitationStatus.ACCEPTED;
      invitation.acceptedAt = new Date();
      invitation.resultingAssignmentId = savedAssignment.id;
      await manager.save(TeamInvitation, invitation);

      // Update request status
      const newAcceptedCount = acceptedCount + 1;
      if (newAcceptedCount >= request.minVolunteers) {
        request.status = ServiceRequestStatus.FULLY_MATCHED;
      } else {
        request.status = ServiceRequestStatus.PARTIALLY_ACCEPTED;
      }
      await manager.save(ServiceRequest, request);

      await this.auditService.logEvent(
        {
          eventType: 'TEAM_INVITATION_ACCEPTED',
          actorId: inviteeUserId,
          targetId: savedAssignment.id,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            serviceRequestId: request.id,
            invitationId: invitation.id,
            slotNumber: invitation.slotNumber,
            requestStatus: request.status,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedAssignment;
    });
  }

  /**
   * The invitee declines a team invitation.
   */
  async declineInvitation(
    orgId: string,
    invitationId: string,
    inviteeUserId: string,
    dto: RespondInvitationDto,
    ipAddress?: string,
  ): Promise<TeamInvitation> {
    const invitation = await this.invitationRepo.findOne({
      where: { id: invitationId, organizationId: orgId },
    });
    if (!invitation) throw new NotFoundException('Team invitation not found');

    if (invitation.status !== TeamInvitationStatus.PENDING) {
      throw new ConflictException(`Invitation is already ${invitation.status}`);
    }

    const inviteeMembership = await this.membershipRepo.findOne({
      where: { id: invitation.inviteeMembershipId },
    });
    if (!inviteeMembership || inviteeMembership.userId !== inviteeUserId) {
      throw new ForbiddenException('This invitation is not for you');
    }

    invitation.status = TeamInvitationStatus.DECLINED;
    invitation.declinedAt = new Date();
    invitation.declineReason = dto.declineReason ?? null;
    const saved = await this.invitationRepo.save(invitation);

    await this.auditService.logEvent({
      eventType: 'TEAM_INVITATION_DECLINED',
      actorId: inviteeUserId,
      targetId: saved.id,
      targetType: 'team_invitations',
      organizationId: orgId,
      payload: { reason: dto.declineReason ?? null },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Lists pending invitations for the calling volunteer (their inbox).
   */
  async listMyInvitations(orgId: string, userId: string): Promise<TeamInvitation[]> {
    const memberships = await this.membershipRepo.find({
      where: { userId, status: MembershipStatus.APPROVED },
      select: ['id'],
    });
    const membershipIds = memberships.map((m) => m.id);
    if (membershipIds.length === 0) return [];

    return this.invitationRepo.find({
      where: {
        organizationId: orgId,
        inviteeMembershipId: In(membershipIds),
        status: TeamInvitationStatus.PENDING,
      },
      relations: ['serviceRequest', 'inviterMembership', 'inviterMembership.user'],
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Sub-Minimum Mid-Service Re-Matching (FR-TEAM-05, D#69, BR-07) ──────────

  /**
   * When a volunteer withdraws mid-service, checks if the active team dropped
   * below the minimum safe headcount. If so, re-activates matching to fill the gap.
   *
   * Called from MatchingService.withdrawAssignment after a withdrawal is committed.
   * Runs in a separate transaction so it doesn't block the withdrawal response.
   *
   * BR-07: If a hazardous physical service drops below minimum mid-service, the
   * coordinator must be alerted to evaluate whether the remaining volunteers can
   * continue safely or if the service should be paused.
   */
  async handleSubMinimumAfterWithdrawal(
    orgId: string,
    requestId: string,
    withdrawnMembershipId: string,
  ): Promise<void> {
    try {
      await this.dataSource.transaction('READ COMMITTED', async (manager) => {
        const request = await manager
          .createQueryBuilder(ServiceRequest, 'req')
          .setLock('pessimistic_write')
          .where('req.id = :id', { id: requestId })
          .andWhere('req.organizationId = :orgId', { orgId })
          .getOne();

        if (!request) return;
        if (request.status === ServiceRequestStatus.IN_PROGRESS) {
          // Service has started — count active volunteers
          const activeCount = await manager.count(VolunteerAssignment, {
            where: {
              serviceRequestId: requestId,
              status: VolunteerAssignmentStatus.IN_PROGRESS,
            },
          });

          if (activeCount < request.minVolunteers) {
            // Sub-minimum during active service — alert coordinator
            await this.auditService.logEvent(
              {
                eventType: 'TEAM_SUB_MINIMUM_ALERT',
                actorId: null,
                targetId: requestId,
                targetType: 'service_requests',
                organizationId: orgId,
                payload: {
                  activeVolunteers: activeCount,
                  minRequired: request.minVolunteers,
                  withdrawnMembershipId,
                  reason: 'A team member withdrew mid-service, dropping below minimum safe headcount',
                  action: 'Coordinator must evaluate whether the remaining volunteers can continue safely',
                },
              },
              manager,
            );

            // Re-activate matching to try to fill the gap
            request.status = ServiceRequestStatus.PARTIALLY_ACCEPTED;
            request.matchingTier = 1;
            await manager.save(ServiceRequest, request);

            this.logger.warn(
              `Request ${requestId} dropped below minimum (${activeCount}/${request.minVolunteers}) after withdrawal — re-activated matching`,
            );
          }
        } else if (
          request.status === ServiceRequestStatus.FULLY_MATCHED ||
          request.status === ServiceRequestStatus.PARTIALLY_ACCEPTED
        ) {
          // Service hasn't started yet — just count accepted
          const acceptedCount = await manager.count(VolunteerAssignment, {
            where: {
              serviceRequestId: requestId,
              status: In([
                VolunteerAssignmentStatus.ACCEPTED,
                VolunteerAssignmentStatus.IN_PROGRESS,
              ]),
            },
          });

          if (acceptedCount < request.minVolunteers) {
            request.status =
              acceptedCount === 0
                ? ServiceRequestStatus.MATCHING_ACTIVE
                : ServiceRequestStatus.PARTIALLY_ACCEPTED;
            await manager.save(ServiceRequest, request);

            this.logger.log(
              `Request ${requestId} re-activated for matching after withdrawal (${acceptedCount}/${request.minVolunteers})`,
            );
          }
        }
      });
    } catch (err: unknown) {
      // Log but don't throw — this is a side-effect of withdrawal, not the main operation
      this.logger.error(
        `Sub-minimum check failed for request ${requestId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ─── Sequential Transfer Credit Rule (FR-TEAM-07, D#33, BR-06) ──────────────

  /**
   * When a volunteer is replaced mid-service, only the finishing (replacement)
   * volunteer earns credits — NOT the volunteer who was replaced.
   *
   * The `replacedByAssignmentId` column on VolunteerAssignment already tracks the
   * replacement chain. The ledger (TimeLedgerService.postServiceEarning) already
   * only credits the assignment that is confirmed. So the rule is enforced by:
   *
   *   1. The replaced assignment's status is set to REPLACED (not COMPLETED)
   *   2. The replaced assignment is never confirmed → never earns credits
   *   3. The replacement assignment goes through the normal finish → confirm → credit flow
   *
   * This method is the hook that MatchingService calls when a replacement happens,
   * to explicitly mark the old assignment as REPLACED and audit the transfer.
   */
  async recordTransfer(
    orgId: string,
    oldAssignmentId: string,
    newAssignmentId: string,
    actorId: string | null,
  ): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const oldAssignment = await manager.findOne(VolunteerAssignment, {
        where: { id: oldAssignmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!oldAssignment) return;

      oldAssignment.status = VolunteerAssignmentStatus.REPLACED;
      oldAssignment.replacedByAssignmentId = newAssignmentId;
      await manager.save(VolunteerAssignment, oldAssignment);

      await this.auditService.logEvent(
        {
          eventType: 'VOLUNTEER_TRANSFERRED',
          actorId,
          targetId: oldAssignmentId,
          targetType: 'volunteer_assignments',
          organizationId: orgId,
          payload: {
            oldAssignmentId,
            newAssignmentId,
            note: 'Only the finishing replacement volunteer earns credits (FR-TEAM-07, D#33, BR-06)',
          },
        },
        manager,
      );
    });
  }
}
