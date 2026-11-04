import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AccountClosureStatus,
  AccountClosureType,
  AccountStatus,
  AppealStatus,
  AppealSubjectType,
  ComplaintStatus,
  ComplaintTargetRole,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  SafetyAlertStatus,
  UserRole,
} from '@ktb/shared-types';

import { SafetyAlert } from './entities/safety-alert.entity';
import { Complaint } from './entities/complaint.entity';
import { Appeal } from './entities/appeal.entity';
import { DeathNominee } from './entities/death-nominee.entity';
import { AccountClosure } from './entities/account-closure.entity';
import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

import { RaiseSafetyAlertDto } from './dto/raise-safety-alert.dto';
import { SubmitComplaintDto } from './dto/submit-complaint.dto';
import { ResolveComplaintDto } from './dto/resolve-complaint.dto';
import { SubmitAppealDto } from './dto/submit-appeal.dto';
import { ReviewAppealDto } from './dto/review-appeal.dto';
import { SetNomineeDto } from './dto/set-nominee.dto';
import { RequestClosureDto } from './dto/request-closure.dto';
import { ReviewClosureDto } from './dto/review-closure.dto';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(SafetyAlert) private readonly alertRepo: Repository<SafetyAlert>,
    @InjectRepository(Complaint) private readonly complaintRepo: Repository<Complaint>,
    @InjectRepository(Appeal) private readonly appealRepo: Repository<Appeal>,
    @InjectRepository(DeathNominee) private readonly nomineeRepo: Repository<DeathNominee>,
    @InjectRepository(AccountClosure) private readonly closureRepo: Repository<AccountClosure>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UniversalTimeWallet) private readonly walletRepo: Repository<UniversalTimeWallet>,
    @InjectRepository(GlobalAccountRestriction) private readonly restrictionRepo: Repository<GlobalAccountRestriction>,
    @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(ServiceRequest) private readonly requestRepo: Repository<ServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  // ─── Safety Alerts (FR-SAFE-01, FR-SAFE-02) ──────────────────────────────────

  /**
   * Raises a confidential safety alert during an active service.
   * Routes to the assigned coordinator only (D#71, NFR-09).
   */
  async raiseSafetyAlert(
    orgId: string,
    callerUserId: string,
    dto: RaiseSafetyAlertDto,
    ipAddress?: string,
  ): Promise<SafetyAlert> {
    const request = await this.requestRepo.findOne({
      where: { id: dto.serviceRequestId, organizationId: orgId },
    });
    if (!request) throw new NotFoundException('Service request not found');

    if (request.status !== 'IN_PROGRESS') {
      throw new ConflictException('Safety alerts can only be raised during an active (IN_PROGRESS) service');
    }

    const alert = this.alertRepo.create({
      organizationId: orgId,
      serviceRequestId: dto.serviceRequestId,
      raisedByUserId: callerUserId,
      raisedByRole: dto.raisedByRole,
      status: SafetyAlertStatus.RAISED,
      description: dto.description,
      coordinatorId: request.assignedCoordinatorId ?? null,
    });
    const saved = await this.alertRepo.save(alert);

    await this.auditService.logEvent({
      eventType: 'SAFETY_ALERT_RAISED',
      actorId: callerUserId,
      targetId: saved.id,
      targetType: 'safety_alerts',
      organizationId: orgId,
      payload: { serviceRequestId: dto.serviceRequestId, role: dto.raisedByRole },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /** Coordinator acknowledges the alert. */
  async acknowledgeAlert(orgId: string, alertId: string, coordinatorId: string): Promise<SafetyAlert> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId, organizationId: orgId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status !== SafetyAlertStatus.RAISED) throw new ConflictException(`Alert is already ${alert.status}`);

    alert.status = SafetyAlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();
    return this.alertRepo.save(alert);
  }

  /** Coordinator pauses the service associated with the alert (BR-10). */
  async pauseService(orgId: string, alertId: string, coordinatorId: string): Promise<SafetyAlert> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId, organizationId: orgId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (
      alert.status !== SafetyAlertStatus.RAISED &&
      alert.status !== SafetyAlertStatus.ACKNOWLEDGED
    ) throw new ConflictException('Alert is not in a pauseable state');

    alert.status = SafetyAlertStatus.SERVICE_PAUSED;
    alert.servicePausedAt = new Date();
    const saved = await this.alertRepo.save(alert);

    await this.auditService.logEvent({
      eventType: 'SAFETY_SERVICE_PAUSED',
      actorId: coordinatorId,
      targetId: alert.id,
      targetType: 'safety_alerts',
      organizationId: orgId,
      payload: { serviceRequestId: alert.serviceRequestId },
    });

    return saved;
  }

  /** Coordinator resolves the alert (D#74). */
  async resolveAlert(
    orgId: string,
    alertId: string,
    coordinatorId: string,
    resolutionNotes: string,
    ipAddress?: string,
  ): Promise<SafetyAlert> {
    await this.assertCoordinator(orgId, coordinatorId);
    const alert = await this.alertRepo.findOne({ where: { id: alertId, organizationId: orgId } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.status === SafetyAlertStatus.RESOLVED) throw new ConflictException('Already resolved');

    alert.status = SafetyAlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedByUserId = coordinatorId;
    alert.resolutionNotes = resolutionNotes;
    const saved = await this.alertRepo.save(alert);

    await this.auditService.logEvent({
      eventType: 'SAFETY_ALERT_RESOLVED',
      actorId: coordinatorId,
      targetId: alert.id,
      targetType: 'safety_alerts',
      organizationId: orgId,
      payload: { resolutionNotes },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listAlerts(orgId: string): Promise<SafetyAlert[]> {
    return this.alertRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ─── Complaints (FR-SAFE-03, D#75, D#76) ─────────────────────────────────────

  /**
   * Submit a confidential complaint. Auto-routes to the correct authority:
   *  - Against COORDINATOR → assigned to Municipality Admin (D#75)
   *  - Against MUNICIPALITY_ADMIN → assigned to Super Admin (D#76)
   */
  async submitComplaint(
    orgId: string,
    complainantId: string,
    dto: SubmitComplaintDto,
    ipAddress?: string,
  ): Promise<Complaint> {
    if (complainantId === dto.targetUserId) {
      throw new BadRequestException('Cannot submit a complaint against yourself');
    }

    const target = await this.userRepo.findOne({ where: { id: dto.targetUserId } });
    if (!target) throw new NotFoundException('Target user not found');

    // Routing: coordinator complaints go to Municipality Admin; admin complaints go to Super Admin
    // We record targetRole so the dashboard knows where to route it — the actual reviewer
    // is assigned when a staff member picks it up.
    const complaint = this.complaintRepo.create({
      organizationId: orgId,
      complainantUserId: complainantId,
      targetUserId: dto.targetUserId,
      targetRole: dto.targetRole,
      subject: dto.subject,
      description: dto.description,
      status: ComplaintStatus.SUBMITTED,
    });
    const saved = await this.complaintRepo.save(complaint);

    await this.auditService.logEvent({
      eventType: 'COMPLAINT_SUBMITTED',
      actorId: complainantId,
      targetId: saved.id,
      targetType: 'complaints',
      organizationId: orgId,
      payload: { targetRole: dto.targetRole, subject: dto.subject },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /** Assigned reviewer resolves, dismisses, or escalates a complaint. */
  async resolveComplaint(
    orgId: string,
    complaintId: string,
    reviewerId: string,
    dto: ResolveComplaintDto,
    ipAddress?: string,
  ): Promise<Complaint> {
    const complaint = await this.complaintRepo.findOne({
      where: { id: complaintId, organizationId: orgId },
    });
    if (!complaint) throw new NotFoundException('Complaint not found');
    if (complaint.status !== ComplaintStatus.SUBMITTED && complaint.status !== ComplaintStatus.UNDER_REVIEW) {
      throw new ConflictException(`Complaint is already ${complaint.status}`);
    }

    // Verify reviewer authority based on target role
    if (complaint.targetRole === ComplaintTargetRole.COORDINATOR) {
      await this.assertAdmin(orgId, reviewerId);
    } else {
      await this.assertSuperAdmin(reviewerId);
    }

    complaint.status = dto.status;
    complaint.resolutionNotes = dto.resolutionNotes ?? null;
    complaint.resolvedAt = new Date();
    complaint.resolvedByUserId = reviewerId;
    const saved = await this.complaintRepo.save(complaint);

    await this.auditService.logEvent({
      eventType: 'COMPLAINT_RESOLVED',
      actorId: reviewerId,
      targetId: saved.id,
      targetType: 'complaints',
      organizationId: orgId,
      payload: { status: dto.status, resolutionNotes: dto.resolutionNotes ?? null },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listComplaints(orgId: string): Promise<Complaint[]> {
    return this.complaintRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  // ─── Appeals (FR-SAFE-04, D#77, D#78, BR-11) ────────────────────────────────

  /** Submit an appeal against a suspension, ban, or adverse decision. */
  async submitAppeal(
    orgId: string,
    appellantId: string,
    dto: SubmitAppealDto,
    ipAddress?: string,
  ): Promise<Appeal> {
    // Prevent duplicate open appeals for the same subject
    const existing = await this.appealRepo.findOne({
      where: {
        subjectReferenceId: dto.subjectReferenceId,
        status: AppealStatus.SUBMITTED,
      },
    });
    if (existing) throw new ConflictException('An open appeal already exists for this subject');

    const appeal = this.appealRepo.create({
      organizationId: orgId,
      appellantUserId: appellantId,
      subjectType: dto.subjectType,
      subjectReferenceId: dto.subjectReferenceId,
      grounds: dto.grounds,
      status: AppealStatus.SUBMITTED,
    });
    const saved = await this.appealRepo.save(appeal);

    await this.auditService.logEvent({
      eventType: 'APPEAL_SUBMITTED',
      actorId: appellantId,
      targetId: saved.id,
      targetType: 'appeals',
      organizationId: orgId,
      payload: { subjectType: dto.subjectType, subjectReferenceId: dto.subjectReferenceId },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Super Admin reviews appeal. If UPHELD:
   *   - BAN subject: resolve the restriction + restore user status (BR-11, D#85)
   *   - SUSPENSION subject: resolve the restriction
   */
  async reviewAppeal(
    orgId: string,
    appealId: string,
    reviewerId: string,
    dto: ReviewAppealDto,
    ipAddress?: string,
  ): Promise<Appeal> {
    await this.assertSuperAdmin(reviewerId);

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const appeal = await manager.findOne(Appeal, {
        where: { id: appealId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appeal) throw new NotFoundException('Appeal not found');
      if (appeal.status !== AppealStatus.SUBMITTED && appeal.status !== AppealStatus.UNDER_REVIEW) {
        throw new ConflictException(`Appeal is already ${appeal.status}`);
      }

      appeal.status = dto.status;
      appeal.reviewedByUserId = reviewerId;
      appeal.reviewedAt = new Date();
      appeal.outcomeNotes = dto.outcomeNotes ?? null;
      const saved = await manager.save(Appeal, appeal);

      // If UPHELD and subject is a BAN or SUSPENSION — auto-restore access (BR-11, D#85)
      if (
        dto.status === AppealStatus.UPHELD &&
        (appeal.subjectType === AppealSubjectType.BAN || appeal.subjectType === AppealSubjectType.SUSPENSION)
      ) {
        const restriction = await manager.findOne(GlobalAccountRestriction, {
          where: { id: appeal.subjectReferenceId },
        });
        if (restriction && restriction.status === GlobalRestrictionStatus.ACTIVE) {
          restriction.status = GlobalRestrictionStatus.RESOLVED;
          restriction.resolvedAt = new Date();
          restriction.resolvedBy = reviewerId;
          restriction.resolutionNotes = `Appeal ${appealId} upheld — automatic restoration (BR-11)`;
          await manager.save(GlobalAccountRestriction, restriction);

          // Check remaining active restrictions
          const remaining = await manager.count(GlobalAccountRestriction, {
            where: { userId: restriction.userId, status: GlobalRestrictionStatus.ACTIVE },
          });
          if (remaining === 0) {
            const user = await manager.findOne(User, { where: { id: restriction.userId } });
            if (user && user.status !== AccountStatus.ACTIVE) {
              user.status = AccountStatus.ACTIVE;
              await manager.save(User, user);
              // Also unfreeze the universal wallet
              await manager.update(UniversalTimeWallet, { userId: user.id }, { status: 'ACTIVE' });
              this.logger.log(`User ${user.id} restored to ACTIVE after upheld appeal ${appealId}`);
            }
          }
        }
      }

      await this.auditService.logEvent(
        {
          eventType: 'APPEAL_REVIEWED',
          actorId: reviewerId,
          targetId: saved.id,
          targetType: 'appeals',
          organizationId: orgId,
          payload: { status: dto.status, outcomeNotes: dto.outcomeNotes ?? null },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return saved;
    });
  }

  async listAppeals(orgId: string): Promise<Appeal[]> {
    return this.appealRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  // ─── Death Nominees (FR-IDENT-06, D#44, D#45) ────────────────────────────────

  async setNominee(userId: string, dto: SetNomineeDto, ipAddress?: string): Promise<DeathNominee> {
    let nominee = await this.nomineeRepo.findOne({ where: { userId } });
    if (nominee) {
      nominee.nomineeName = dto.nomineeName;
      nominee.nomineePhone = dto.nomineePhone;
      nominee.updatedByOtp = true;
    } else {
      nominee = this.nomineeRepo.create({
        userId,
        nomineeName: dto.nomineeName,
        nomineePhone: dto.nomineePhone,
        verified: false,
        updatedByOtp: true,
      });
    }
    const saved = await this.nomineeRepo.save(nominee);

    await this.auditService.logEvent({
      eventType: 'DEATH_NOMINEE_UPDATED',
      actorId: userId,
      targetId: saved.id,
      targetType: 'death_nominees',
      payload: { nomineePhone: dto.nomineePhone.slice(0, 5) + '****' },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async getMyNominee(userId: string): Promise<DeathNominee | null> {
    return this.nomineeRepo.findOne({ where: { userId } });
  }

  // ─── Account Closures (FR-IDENT-07, FR-IDENT-08) ─────────────────────────────

  /**
   * Request account closure — death or duplicate.
   * Coordinator/Admin submits; Municipality Admin reviews and approves.
   */
  async requestClosure(
    orgId: string,
    targetUserId: string,
    requesterId: string,
    dto: RequestClosureDto,
    ipAddress?: string,
  ): Promise<AccountClosure> {
    await this.assertCoordinator(orgId, requesterId);

    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Target user not found');

    // Only one closure per user at a time
    const existing = await this.closureRepo.findOne({ where: { userId: targetUserId } });
    if (existing) throw new ConflictException('A closure request already exists for this user');

    if (dto.closureType === AccountClosureType.DUPLICATE && !dto.duplicatePrimaryUserId) {
      throw new BadRequestException('DUPLICATE closure requires duplicatePrimaryUserId');
    }

    const closure = this.closureRepo.create({
      userId: targetUserId,
      organizationId: orgId,
      closureType: dto.closureType,
      status: AccountClosureStatus.PENDING_REVIEW,
      requestedByUserId: requesterId,
      duplicatePrimaryUserId: dto.duplicatePrimaryUserId ?? null,
      notes: dto.notes ?? null,
    });
    const saved = await this.closureRepo.save(closure);

    await this.auditService.logEvent({
      eventType: 'ACCOUNT_CLOSURE_REQUESTED',
      actorId: requesterId,
      targetId: saved.id,
      targetType: 'account_closures',
      organizationId: orgId,
      payload: { closureType: dto.closureType, targetUserId },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Municipality Admin approves or rejects a closure request.
   *
   * On APPROVED:
   *   DECEASED: freeze user, freeze wallets, transfer time credits to nominee
   *   DUPLICATE: freeze user, freeze wallets — no credit transfer (D#89, D#90)
   */
  async reviewClosure(
    orgId: string,
    closureId: string,
    reviewerId: string,
    dto: ReviewClosureDto,
    ipAddress?: string,
  ): Promise<AccountClosure> {
    await this.assertAdmin(orgId, reviewerId);

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const closure = await manager.findOne(AccountClosure, {
        where: { id: closureId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!closure) throw new NotFoundException('Closure request not found');
      if (closure.status !== AccountClosureStatus.PENDING_REVIEW) {
        throw new ConflictException(`Closure is already ${closure.status}`);
      }
      if (dto.status === AccountClosureStatus.REJECTED && !dto.rejectionReason) {
        throw new BadRequestException('Rejection reason required');
      }

      closure.status = dto.status;
      closure.reviewedByUserId = reviewerId;
      closure.reviewedAt = new Date();
      closure.rejectionReason = dto.rejectionReason ?? null;

      if (dto.status === AccountClosureStatus.APPROVED) {
        // Freeze the user account
        await manager.update(User, { id: closure.userId }, { status: AccountStatus.PERMANENTLY_BANNED });

        // Freeze both wallets
        await manager.update(UniversalTimeWallet, { userId: closure.userId }, { status: 'FROZEN' });

        if (closure.closureType === AccountClosureType.DECEASED) {
          // Transfer time credits to nominee if one is registered (D#44, D#46)
          const nominee = await manager.findOne(DeathNominee, { where: { userId: closure.userId } });
          if (nominee?.nomineeUserId) {
            // The actual ledger transfer is recorded as an audit event for now;
            // full ledger implementation integrates with TimeLedgerService
            this.logger.log(`DECEASED closure for ${closure.userId}: nominee transfer to ${nominee.nomineeUserId} pending ledger processing`);
            closure.nomineeTransferTxId = null; // set by ledger service in production
          }
          closure.archivedAt = new Date();
        }
        // DUPLICATE: balances stay frozen inside closed account — no transfer (D#89, D#90)

        // Add a global restriction record to block platform access
        const restriction = manager.create(GlobalAccountRestriction, {
          userId: closure.userId,
          restrictionType:
            closure.closureType === AccountClosureType.DECEASED
              ? GlobalRestrictionType.PERMANENT_BAN
              : GlobalRestrictionType.PERMANENT_BAN,
          reasonCode: closure.closureType === AccountClosureType.DECEASED ? 'ACCOUNT_DECEASED' : 'ACCOUNT_DUPLICATE_CLOSED',
          status: GlobalRestrictionStatus.ACTIVE,
          authorizedBy: reviewerId,
        });
        await manager.save(GlobalAccountRestriction, restriction);
      }

      const saved = await manager.save(AccountClosure, closure);

      await this.auditService.logEvent(
        {
          eventType: 'ACCOUNT_CLOSURE_REVIEWED',
          actorId: reviewerId,
          targetId: saved.id,
          targetType: 'account_closures',
          organizationId: orgId ?? '',
          payload: { status: dto.status, closureType: closure.closureType },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return saved;
    });
  }

  async listClosures(orgId: string): Promise<AccountClosure[]> {
    return this.closureRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ─── Reports (FR-REPORT-01, FR-REPORT-02) ────────────────────────────────────

  /**
   * Organization-scoped dashboard metrics for Municipality Admin (D#49, FR-REPORT-01).
   * Privacy-safe: no individual beneficiary or volunteer records exposed (FR-REPORT-02).
   */
  async getOrgDashboard(orgId: string) {
    const [
      totalMembers,
      activeVolunteers,
      totalRequests,
      completedRequests,
      pendingRequests,
      openAlerts,
      pendingClosures,
    ] = await Promise.all([
      this.membershipRepo.count({ where: { organizationId: orgId, status: MembershipStatus.APPROVED } }),
      this.membershipRepo.createQueryBuilder('m')
        .innerJoin('m.roleGrants', 'rg', "rg.role = 'VOLUNTEER' AND rg.status = 'ACTIVE'")
        .where('m.organizationId = :orgId', { orgId })
        .andWhere("m.status = 'APPROVED'")
        .getCount(),
      this.requestRepo.count({ where: { organizationId: orgId } }),
      this.requestRepo.count({ where: { organizationId: orgId, status: 'COMPLETED' as any } }),
      this.requestRepo.count({ where: { organizationId: orgId, status: 'MATCHING_ACTIVE' as any } }),
      this.alertRepo.count({ where: { organizationId: orgId, status: SafetyAlertStatus.RAISED } }),
      this.closureRepo.count({ where: { organizationId: orgId, status: AccountClosureStatus.PENDING_REVIEW } }),
    ]);

    return {
      organizationId: orgId,
      generatedAt: new Date().toISOString(),
      members: { total: totalMembers, activeVolunteers },
      requests: { total: totalRequests, completed: completedRequests, pending: pendingRequests },
      safety: { openAlerts },
      governance: { pendingClosures },
    };
  }

  /**
   * Super Admin cross-organization aggregate metrics (FR-REPORT-01, D#49).
   */
  async getGlobalDashboard() {
    const [totalUsers, totalOrgs, totalRequests, completedRequests, openAlerts, pendingClosures, pendingAppeals] =
      await Promise.all([
        this.userRepo.count({ where: { status: AccountStatus.ACTIVE } }),
        this.membershipRepo.createQueryBuilder('m').select('COUNT(DISTINCT m.organizationId)', 'c').getRawOne().then((r) => parseInt(r?.c ?? '0', 10)),
        this.requestRepo.count(),
        this.requestRepo.count({ where: { status: 'COMPLETED' as any } }),
        this.alertRepo.count({ where: { status: SafetyAlertStatus.RAISED } }),
        this.closureRepo.count({ where: { status: AccountClosureStatus.PENDING_REVIEW } }),
        this.appealRepo.count({ where: { status: AppealStatus.SUBMITTED } }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      users: { active: totalUsers },
      organizations: { total: totalOrgs },
      requests: { total: totalRequests, completed: completedRequests },
      safety: { openAlerts },
      governance: { pendingClosures, pendingAppeals },
    };
  }

  /**
   * CSV export of volunteer service hours for a given organization.
   * Returns rows suitable for streaming as text/csv (FR-REPORT-01, FR-REPORT-02).
   */
  async exportVolunteerHoursCsv(orgId: string): Promise<string> {
    const rows = await this.requestRepo
      .createQueryBuilder('req')
      .select([
        'req.requestNumber as request_number',
        'req.scheduledStartTime as scheduled_date',
        'req.status as status',
        'req.expectedDurationMinutes as expected_minutes',
      ])
      .where('req.organizationId = :orgId', { orgId })
      .andWhere("req.status = 'COMPLETED'")
      .orderBy('req.scheduledStartTime', 'DESC')
      .limit(5000)
      .getRawMany();

    const header = 'request_number,scheduled_date,status,expected_minutes';
    const lines = rows.map((r) =>
      `${r.request_number},${r.scheduled_date},${r.status},${r.expected_minutes}`,
    );
    return [header, ...lines].join('\n');
  }

  // ─── Authorization helpers ────────────────────────────────────────────────────

  private async assertCoordinator(orgId: string, actorId: string): Promise<void> {
    const ctx = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (
      !ctx.isSuperAdmin &&
      !ctx.roles.some((r) => [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(r))
    ) throw new ForbiddenException('Coordinator authority required');
  }

  private async assertAdmin(orgId: string, actorId: string): Promise<void> {
    const ctx = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (!ctx.isSuperAdmin && !ctx.roles.includes(UserRole.MUNICIPALITY_ADMIN)) {
      throw new ForbiddenException('Municipality Admin authority required');
    }
  }

  private async assertSuperAdmin(actorId: string): Promise<void> {
    const ctx = await this.authorizationService.evaluateGlobalAccess(actorId);
    if (!ctx.isSuperAdmin) throw new ForbiddenException('Super Admin authority required');
  }
}
