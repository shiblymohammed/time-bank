import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  OrganizationStatus,
  MembershipStatus,
  RoleGrantStatus,
  UserRole,
  MembershipApprovalAction,
} from '@ktb/shared-types';
import { Organization } from './entities/organization.entity';
import { OrganizationBranding } from './entities/organization-branding.entity';
import { OrganizationAppBuild } from './entities/organization-app-build.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { MembershipApproval } from '../memberships/entities/membership-approval.entity';
import { AuditService } from '../audit/audit.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { CreateAppBuildDto } from './dto/create-app-build.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationBranding)
    private readonly brandingRepo: Repository<OrganizationBranding>,
    @InjectRepository(OrganizationAppBuild)
    private readonly appBuildRepo: Repository<OrganizationAppBuild>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Provisions a new municipality or corporation organization (D#1, D#2, D#52, ITB-010).
   * Transactionally creates organization, branding, and appoints initial Municipality Admin if specified.
   */
  async createOrganization(
    dto: CreateOrganizationDto,
    creatorUserId?: string,
  ): Promise<Organization> {
    const existing = await this.orgRepo.findOne({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Organization with code '${dto.code}' already exists`);
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Create Organization
      const org = manager.create(Organization, {
        code: dto.code.toUpperCase(),
        name: dto.name,
        type: dto.type,
        stateCode: dto.stateCode ?? 'KL',
        district: dto.district,
        createdBy: creatorUserId ?? null,
        status: OrganizationStatus.ACTIVE,
      });

      const savedOrg = await manager.save(Organization, org);

      // 2. Create Branding
      const branding = manager.create(OrganizationBranding, {
        organizationId: savedOrg.id,
        appDisplayName: dto.branding?.appDisplayName ?? `${dto.name} Time Bank`,
        primaryColor: dto.branding?.primaryColor ?? '#0D5C75',
        secondaryColor: dto.branding?.secondaryColor ?? '#F59E0B',
        supportEmail: dto.branding?.supportEmail ?? null,
        themeConfig: dto.branding?.themeConfig ?? {},
        version: 1,
      });

      await manager.save(OrganizationBranding, branding);
      savedOrg.branding = branding;

      // 3. Appoint initial Municipality Admin if phone is supplied
      if (dto.adminPhone) {
        let adminUser = await manager.findOne(User, {
          where: { phoneE164: dto.adminPhone },
        });

        if (!adminUser) {
          adminUser = manager.create(User, {
            phoneE164: dto.adminPhone,
            primaryOrgId: savedOrg.id,
          });
          adminUser = await manager.save(User, adminUser);
        }

        const membership = manager.create(OrganizationMembership, {
          organizationId: savedOrg.id,
          userId: adminUser.id,
          status: MembershipStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: creatorUserId ?? adminUser.id,
        });

        const savedMembership = await manager.save(OrganizationMembership, membership);

        const roleGrant = manager.create(MembershipRoleGrant, {
          membershipId: savedMembership.id,
          role: UserRole.MUNICIPALITY_ADMIN,
          status: RoleGrantStatus.ACTIVE,
          grantedBy: creatorUserId ?? adminUser.id,
        });

        await manager.save(MembershipRoleGrant, roleGrant);

        const approvalLog = manager.create(MembershipApproval, {
          membershipId: savedMembership.id,
          action: MembershipApprovalAction.ROLE_GRANTED,
          actorId: creatorUserId ?? adminUser.id,
          notes: 'Initial Municipality Admin provisioned during organization onboarding',
        });

        await manager.save(MembershipApproval, approvalLog);
      }

      // 4. Record Audit Event
      await this.auditService.logEvent({
        eventType: 'ORGANIZATION_CREATED',
        actorId: creatorUserId,
        targetId: savedOrg.id,
        targetType: 'ORGANIZATION',
        organizationId: savedOrg.id,
        payload: {
          code: savedOrg.code,
          name: savedOrg.name,
          type: savedOrg.type,
          adminPhone: dto.adminPhone,
        },
      });

      return savedOrg;
    });
  }

  /**
   * Lists organizations. Super Admin sees all; regular users see active public summaries.
   */
  async findAll(isSuperAdmin = false): Promise<Organization[]> {
    if (isSuperAdmin) {
      return this.orgRepo.find({
        relations: ['branding', 'appBuilds'],
        order: { name: 'ASC' },
      });
    }

    return this.orgRepo.find({
      where: { status: OrganizationStatus.ACTIVE },
      relations: ['branding'],
      order: { name: 'ASC' },
    });
  }

  /**
   * Retrieves an organization by ID.
   */
  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({
      where: { id },
      relations: ['branding', 'appBuilds'],
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID '${id}' not found`);
    }

    return org;
  }

  /**
   * Retrieves an organization by canonical code (e.g. 'KOZHIKODE').
   */
  async findByCode(code: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({
      where: { code: code.toUpperCase() },
      relations: ['branding'],
    });

    if (!org) {
      throw new NotFoundException(`Organization with code '${code}' not found`);
    }

    return org;
  }

  /**
   * Updates organization metadata or status (Super Admin only).
   */
  async updateOrganization(
    id: string,
    dto: UpdateOrganizationDto,
    actorUserId?: string,
  ): Promise<Organization> {
    const org = await this.findById(id);

    if (dto.name !== undefined) org.name = dto.name;
    if (dto.status !== undefined) org.status = dto.status;
    if (dto.district !== undefined) org.district = dto.district;

    const saved = await this.orgRepo.save(org);

    await this.auditService.logEvent({
      eventType: 'ORGANIZATION_UPDATED',
      actorId: actorUserId,
      targetId: org.id,
      targetType: 'ORGANIZATION',
      organizationId: org.id,
      payload: { ...dto },
    });

    return saved;
  }

  /**
   * Retrieves organization branding configuration for tenant bootstrap (public/unauthenticated).
   */
  async getBranding(organizationId: string): Promise<OrganizationBranding> {
    const branding = await this.brandingRepo.findOne({
      where: { organizationId },
    });

    if (!branding) {
      throw new NotFoundException(`Branding for organization '${organizationId}' not found`);
    }

    return branding;
  }

  /**
   * Updates branding theme and tokens (Super Admin or Municipality Admin).
   */
  async updateBranding(
    organizationId: string,
    dto: UpdateBrandingDto,
    actorUserId?: string,
  ): Promise<OrganizationBranding> {
    const branding = await this.getBranding(organizationId);

    if (dto.appDisplayName !== undefined) branding.appDisplayName = dto.appDisplayName;
    if (dto.logoKey !== undefined) branding.logoKey = dto.logoKey;
    if (dto.primaryColor !== undefined) branding.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined) branding.secondaryColor = dto.secondaryColor;
    if (dto.supportEmail !== undefined) branding.supportEmail = dto.supportEmail;
    if (dto.themeConfig !== undefined) branding.themeConfig = dto.themeConfig;

    branding.version += 1;

    const saved = await this.brandingRepo.save(branding);

    await this.auditService.logEvent({
      eventType: 'ORGANIZATION_BRANDING_UPDATED',
      actorId: actorUserId,
      targetId: branding.id,
      targetType: 'ORGANIZATION_BRANDING',
      organizationId,
      payload: { version: saved.version, ...dto },
    });

    return saved;
  }

  /**
   * Registers or updates a branded mobile application release build (ITB-011).
   */
  async createOrUpdateAppBuild(
    organizationId: string,
    dto: CreateAppBuildDto,
    actorUserId?: string,
  ): Promise<OrganizationAppBuild> {
    await this.findById(organizationId);

    const platform = (dto.platform ?? 'ANDROID').toUpperCase();
    let appBuild = await this.appBuildRepo.findOne({
      where: { platform, applicationId: dto.applicationId },
    });

    if (!appBuild) {
      appBuild = this.appBuildRepo.create({
        organizationId,
        platform,
        applicationId: dto.applicationId,
        buildVersion: dto.buildVersion ?? '1.0.0',
        minSupportedVersion: dto.minSupportedVersion ?? '1.0.0',
        releaseStatus: dto.releaseStatus ?? 'DRAFT',
      });
    } else {
      appBuild.organizationId = organizationId;
      if (dto.buildVersion) appBuild.buildVersion = dto.buildVersion;
      if (dto.minSupportedVersion) appBuild.minSupportedVersion = dto.minSupportedVersion;
      if (dto.releaseStatus) appBuild.releaseStatus = dto.releaseStatus;
    }

    const saved = await this.appBuildRepo.save(appBuild);

    await this.auditService.logEvent({
      eventType: 'ORGANIZATION_APP_BUILD_SAVED',
      actorId: actorUserId,
      targetId: saved.id,
      targetType: 'ORGANIZATION_APP_BUILD',
      organizationId,
      payload: { platform, applicationId: saved.applicationId, version: saved.buildVersion },
    });

    return saved;
  }

  /**
   * Retrieves all app builds registered for an organization.
   */
  async getAppBuilds(organizationId: string): Promise<OrganizationAppBuild[]> {
    return this.appBuildRepo.find({
      where: { organizationId },
      order: { platform: 'ASC', buildVersion: 'DESC' },
    });
  }
}
