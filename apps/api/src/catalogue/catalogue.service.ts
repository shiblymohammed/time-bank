import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceProposalStatus } from '@ktb/shared-types';

import { ServiceCategory } from './entities/service-category.entity';
import { GlobalServiceDefinition } from './entities/global-service-definition.entity';
import { OrganizationServiceCatalog } from './entities/organization-service-catalog.entity';
import { OrganizationServiceProposal } from './entities/organization-service-proposal.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AuditService } from '../audit/audit.service';

import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateGlobalServiceDefinitionDto } from './dto/create-global-service.dto';
import { UpdateGlobalServiceDefinitionDto } from './dto/update-global-service.dto';
import { ConfigureOrgCatalogueDto } from './dto/configure-org-catalogue.dto';
import { CreateOrgProposalDto } from './dto/create-proposal.dto';
import { ReviewOrgProposalDto } from './dto/review-proposal.dto';

@Injectable()
export class CatalogueService {
  private skillPolicy(requiresSkills: boolean, codes: string[]): string[] {
    const normalized = [...new Set(codes.map((code) => code.trim()))];
    if (normalized.some((code) => !code || code.length > 50) || normalized.length > 50)
      throw new BadRequestException(
        'Provide at most 50 non-empty skill codes, each at most 50 characters',
      );
    if (requiresSkills && !normalized.length)
      throw new BadRequestException(
        'At least one required skill code is needed when skills are required',
      );
    return normalized;
  }
  constructor(
    @InjectRepository(ServiceCategory)
    private readonly categoryRepo: Repository<ServiceCategory>,
    @InjectRepository(GlobalServiceDefinition)
    private readonly globalServiceRepo: Repository<GlobalServiceDefinition>,
    @InjectRepository(OrganizationServiceCatalog)
    private readonly orgCatalogRepo: Repository<OrganizationServiceCatalog>,
    @InjectRepository(OrganizationServiceProposal)
    private readonly proposalRepo: Repository<OrganizationServiceProposal>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly auditService: AuditService,
  ) {}

  // ─── Categories (Central Super Admin) ───────────────────────────────────────
  async createCategory(
    dto: CreateCategoryDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<ServiceCategory> {
    const existing = await this.categoryRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Service category with code '${dto.code}' already exists`);
    }

    const category = this.categoryRepo.create({
      code: dto.code,
      nameEn: dto.nameEn,
      nameMl: dto.nameMl,
      descriptionEn: dto.descriptionEn ?? null,
      descriptionMl: dto.descriptionMl ?? null,
      iconKey: dto.iconKey ?? null,
      displayOrder: dto.displayOrder ?? 0,
      isActive: true,
    });

    const saved = await this.categoryRepo.save(category);

    await this.auditService.logEvent({
      eventType: 'SERVICE_CATEGORY_CREATED',
      actorId: actorId ?? null,
      targetId: saved.id,
      targetType: 'service_categories',
      payload: { code: saved.code, nameEn: saved.nameEn },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<ServiceCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category '${id}' not found`);
    }

    if (dto.nameEn !== undefined) category.nameEn = dto.nameEn;
    if (dto.nameMl !== undefined) category.nameMl = dto.nameMl;
    if (dto.descriptionEn !== undefined) category.descriptionEn = dto.descriptionEn ?? null;
    if (dto.descriptionMl !== undefined) category.descriptionMl = dto.descriptionMl ?? null;
    if (dto.iconKey !== undefined) category.iconKey = dto.iconKey ?? null;
    if (dto.displayOrder !== undefined) category.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    const saved = await this.categoryRepo.save(category);

    await this.auditService.logEvent({
      eventType: 'SERVICE_CATEGORY_UPDATED',
      actorId: actorId ?? null,
      targetId: saved.id,
      targetType: 'service_categories',
      payload: { code: saved.code, isActive: saved.isActive },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listCategories(activeOnly = false): Promise<ServiceCategory[]> {
    const where = activeOnly ? { isActive: true } : {};
    return this.categoryRepo.find({
      where,
      order: { displayOrder: 'ASC', nameEn: 'ASC' },
      relations: ['services'],
    });
  }

  // ─── Global Service Definitions (Central Super Admin) ───────────────────────
  async createGlobalService(
    dto: CreateGlobalServiceDefinitionDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<GlobalServiceDefinition> {
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException(`Category not found with id '${dto.categoryId}'`);
    }

    const existingCode = await this.globalServiceRepo.findOne({ where: { code: dto.code } });
    if (existingCode) {
      throw new ConflictException(`Global service with code '${dto.code}' already exists`);
    }

    if (dto.defaultPreferredVolunteers < dto.defaultMinVolunteers) {
      throw new BadRequestException(
        'Preferred volunteers must be greater than or equal to minimum volunteers',
      );
    }

    const service = this.globalServiceRepo.create({
      categoryId: dto.categoryId,
      code: dto.code,
      nameEn: dto.nameEn,
      nameMl: dto.nameMl,
      descriptionEn: dto.descriptionEn ?? null,
      descriptionMl: dto.descriptionMl ?? null,
      defaultMinVolunteers: dto.defaultMinVolunteers,
      defaultPreferredVolunteers: dto.defaultPreferredVolunteers,
      isHazardousPhysical: dto.isHazardousPhysical ?? false,
      requiresSkills: dto.requiresSkills ?? false,
      requiredSkillCodes: this.skillPolicy(
        dto.requiresSkills ?? false,
        dto.requiredSkillCodes ?? [],
      ),
      isEmergencyProhibited: dto.isEmergencyProhibited ?? true,
      baseCreditRateHourly: dto.baseCreditRateHourly ?? 1.0,
      creditMultiplier: dto.creditMultiplier ?? 1.0,
      allowPartialHours: dto.allowPartialHours ?? true,
      isActive: true,
      createdBy: actorId ?? null,
    });

    const saved = await this.globalServiceRepo.save(service);

    await this.auditService.logEvent({
      eventType: 'GLOBAL_SERVICE_CREATED',
      actorId: actorId ?? null,
      targetId: saved.id,
      targetType: 'global_service_definitions',
      payload: {
        code: saved.code,
        categoryId: saved.categoryId,
        defaultMinVolunteers: saved.defaultMinVolunteers,
        defaultPreferredVolunteers: saved.defaultPreferredVolunteers,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async updateGlobalService(
    id: string,
    dto: UpdateGlobalServiceDefinitionDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<GlobalServiceDefinition> {
    const service = await this.globalServiceRepo.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Global service '${id}' not found`);
    }

    const minVol = dto.defaultMinVolunteers ?? service.defaultMinVolunteers;
    const prefVol = dto.defaultPreferredVolunteers ?? service.defaultPreferredVolunteers;

    if (prefVol < minVol) {
      throw new BadRequestException(
        'Preferred volunteers must be greater than or equal to minimum volunteers',
      );
    }

    const skillCodes = this.skillPolicy(
      dto.requiresSkills ?? service.requiresSkills ?? false,
      dto.requiredSkillCodes ?? service.requiredSkillCodes ?? [],
    );
    if (dto.nameEn !== undefined) service.nameEn = dto.nameEn;
    if (dto.nameMl !== undefined) service.nameMl = dto.nameMl;
    if (dto.descriptionEn !== undefined) service.descriptionEn = dto.descriptionEn ?? null;
    if (dto.descriptionMl !== undefined) service.descriptionMl = dto.descriptionMl ?? null;
    if (dto.defaultMinVolunteers !== undefined)
      service.defaultMinVolunteers = dto.defaultMinVolunteers;
    if (dto.defaultPreferredVolunteers !== undefined) {
      service.defaultPreferredVolunteers = dto.defaultPreferredVolunteers;
    }
    if (dto.isHazardousPhysical !== undefined)
      service.isHazardousPhysical = dto.isHazardousPhysical;
    if (dto.requiresSkills !== undefined) service.requiresSkills = dto.requiresSkills;
    if (dto.requiredSkillCodes !== undefined) service.requiredSkillCodes = skillCodes;
    if (dto.isEmergencyProhibited !== undefined) {
      service.isEmergencyProhibited = dto.isEmergencyProhibited;
    }
    if (dto.baseCreditRateHourly !== undefined) {
      service.baseCreditRateHourly = dto.baseCreditRateHourly;
    }
    if (dto.creditMultiplier !== undefined) service.creditMultiplier = dto.creditMultiplier;
    if (dto.allowPartialHours !== undefined) service.allowPartialHours = dto.allowPartialHours;
    if (dto.isActive !== undefined) service.isActive = dto.isActive;

    const saved = await this.globalServiceRepo.save(service);

    await this.auditService.logEvent({
      eventType: 'GLOBAL_SERVICE_UPDATED',
      actorId: actorId ?? null,
      targetId: saved.id,
      targetType: 'global_service_definitions',
      payload: {
        code: saved.code,
        isActive: saved.isActive,
        requiresSkills: saved.requiresSkills,
        requiredSkillCodes: saved.requiredSkillCodes,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listGlobalServices(
    categoryId?: string,
    activeOnly = true,
  ): Promise<GlobalServiceDefinition[]> {
    const qb = this.globalServiceRepo
      .createQueryBuilder('gs')
      .leftJoinAndSelect('gs.category', 'cat')
      .orderBy('gs.nameEn', 'ASC');

    if (activeOnly) {
      qb.andWhere('gs.isActive = :isActive', { isActive: true });
    }
    if (categoryId) {
      qb.andWhere('gs.categoryId = :categoryId', { categoryId });
    }

    return qb.getMany();
  }

  async getGlobalService(id: string): Promise<GlobalServiceDefinition> {
    const service = await this.globalServiceRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!service) {
      throw new NotFoundException(`Global service '${id}' not found`);
    }
    return service;
  }

  // ─── Organization Service Catalogue (Tenant Customization) ─────────────────
  async configureOrgCatalogue(
    orgId: string,
    dto: ConfigureOrgCatalogueDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<OrganizationServiceCatalog> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException(`Organization '${orgId}' not found`);
    }

    const globalService = await this.globalServiceRepo.findOne({
      where: { id: dto.globalServiceId },
    });
    if (!globalService) {
      throw new NotFoundException(`Global service definition '${dto.globalServiceId}' not found`);
    }

    let entry = await this.orgCatalogRepo.findOne({
      where: { organizationId: orgId, globalServiceId: dto.globalServiceId },
    });
    const enabled = dto.isEnabled ?? entry?.isEnabled ?? true;
    if (enabled && globalService.isActive === false)
      throw new BadRequestException('An inactive central service cannot be enabled locally');
    const minVol = dto.minVolunteers ?? entry?.minVolunteers ?? globalService.defaultMinVolunteers;
    const prefVol =
      dto.preferredVolunteers ??
      entry?.preferredVolunteers ??
      Math.max(minVol, globalService.defaultPreferredVolunteers);

    if (minVol < globalService.defaultMinVolunteers) {
      throw new BadRequestException(
        `minVolunteers (${minVol}) cannot be lower than global safety minimum (${globalService.defaultMinVolunteers})`,
      );
    }

    if (prefVol < minVol) {
      throw new BadRequestException(
        'preferredVolunteers must be greater than or equal to minVolunteers',
      );
    }

    if (!entry) {
      entry = this.orgCatalogRepo.create({
        organizationId: orgId,
        globalServiceId: dto.globalServiceId,
        isEnabled: dto.isEnabled ?? true,
        minVolunteers: minVol,
        preferredVolunteers: prefVol,
        requiresCoordinatorDispatch: dto.requiresCoordinatorDispatch ?? false,
        customLabelEn: dto.customLabelEn ?? null,
        customLabelMl: dto.customLabelMl ?? null,
        localInstructionsEn: dto.localInstructionsEn ?? null,
        localInstructionsMl: dto.localInstructionsMl ?? null,
      });
    } else {
      entry.isEnabled = dto.isEnabled ?? entry.isEnabled;
      entry.minVolunteers = minVol;
      entry.preferredVolunteers = prefVol;
      if (dto.requiresCoordinatorDispatch !== undefined) {
        entry.requiresCoordinatorDispatch = dto.requiresCoordinatorDispatch;
      }
      if (dto.customLabelEn !== undefined) entry.customLabelEn = dto.customLabelEn ?? null;
      if (dto.customLabelMl !== undefined) entry.customLabelMl = dto.customLabelMl ?? null;
      if (dto.localInstructionsEn !== undefined) {
        entry.localInstructionsEn = dto.localInstructionsEn ?? null;
      }
      if (dto.localInstructionsMl !== undefined) {
        entry.localInstructionsMl = dto.localInstructionsMl ?? null;
      }
    }

    const saved = await this.orgCatalogRepo.save(entry);

    await this.auditService.logEvent({
      eventType: 'ORG_CATALOGUE_CONFIGURED',
      actorId: actorId ?? null,
      targetId: saved.id,
      targetType: 'organization_service_catalog',
      organizationId: orgId,
      payload: {
        globalServiceId: saved.globalServiceId,
        isEnabled: saved.isEnabled,
        minVolunteers: saved.minVolunteers,
        preferredVolunteers: saved.preferredVolunteers,
        requiresCoordinatorDispatch: saved.requiresCoordinatorDispatch,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listOrgCatalogue(orgId: string, enabledOnly = true): Promise<OrganizationServiceCatalog[]> {
    const where: { organizationId: string; isEnabled?: boolean } = { organizationId: orgId };
    if (enabledOnly) {
      where.isEnabled = true;
    }

    return this.orgCatalogRepo.find({
      where,
      relations: ['globalService', 'globalService.category'],
      order: { createdAt: 'ASC' },
    });
  }

  async getOrgCatalogueItem(orgId: string, id: string): Promise<OrganizationServiceCatalog> {
    const item = await this.orgCatalogRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['globalService', 'globalService.category'],
    });
    if (!item) {
      throw new NotFoundException(`Catalogue entry '${id}' not found for organization '${orgId}'`);
    }
    return item;
  }

  // ─── Organization Service Proposals ─────────────────────────────────────────
  async createProposal(
    orgId: string,
    dto: CreateOrgProposalDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<OrganizationServiceProposal> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException(`Organization '${orgId}' not found`);
    }

    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException(`Category '${dto.categoryId}' not found`);
    }

    // Verify duplicate proposal handling:
    // Disallow duplicate proposal with identical proposed name pending review in this organization
    const existingPending = await this.proposalRepo.findOne({
      where: {
        organizationId: orgId,
        proposedName: dto.proposedName.trim(),
        status: ServiceProposalStatus.PENDING_REVIEW,
      },
    });

    if (existingPending) {
      throw new ConflictException(
        `A proposal with the name '${dto.proposedName.trim()}' is already pending review for this organization`,
      );
    }

    const proposal = this.proposalRepo.create({
      organizationId: orgId,
      proposedByUserId: actorId,
      proposedName: dto.proposedName.trim(),
      categoryId: dto.categoryId,
      description: dto.description,
      justification: dto.justification,
      suggestedMinVolunteers: dto.suggestedMinVolunteers ?? 1,
      isHazardousPhysical: dto.isHazardousPhysical ?? false,
      status: ServiceProposalStatus.PENDING_REVIEW,
    });

    const saved = await this.proposalRepo.save(proposal);

    await this.auditService.logEvent({
      eventType: 'SERVICE_PROPOSAL_SUBMITTED',
      actorId,
      targetId: saved.id,
      targetType: 'organization_service_proposals',
      organizationId: orgId,
      payload: { proposedName: saved.proposedName, categoryId: saved.categoryId },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listProposals(orgId?: string): Promise<OrganizationServiceProposal[]> {
    const where = orgId ? { organizationId: orgId } : {};
    return this.proposalRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['category', 'proposer', 'reviewer'],
    });
  }

  async reviewProposal(
    proposalId: string,
    dto: ReviewOrgProposalDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<OrganizationServiceProposal> {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['category'],
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal '${proposalId}' not found`);
    }

    // Handle invalid states: Cannot re-review already resolved proposals
    if (proposal.status !== ServiceProposalStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot review proposal with current status '${proposal.status}'. Only pending proposals can be reviewed.`,
      );
    }

    if (dto.status === ServiceProposalStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException(
        'A rejection reason must be provided when rejecting a proposal',
      );
    }

    proposal.status = dto.status;
    proposal.reviewedByUserId = reviewerId;
    proposal.reviewedAt = new Date();
    if (dto.rejectionReason) proposal.rejectionReason = dto.rejectionReason;

    // If approved and resultingGlobalServiceId provided, verify and link
    if (dto.status === ServiceProposalStatus.APPROVED && dto.resultingGlobalServiceId) {
      const globalService = await this.globalServiceRepo.findOne({
        where: { id: dto.resultingGlobalServiceId },
      });
      if (!globalService) {
        throw new NotFoundException(
          `Resulting global service '${dto.resultingGlobalServiceId}' not found`,
        );
      }
      proposal.resultingGlobalServiceId = dto.resultingGlobalServiceId;

      // Automatically enable in the proposing organization's catalogue
      await this.configureOrgCatalogue(
        proposal.organizationId,
        {
          globalServiceId: globalService.id,
          isEnabled: true,
          minVolunteers: proposal.suggestedMinVolunteers,
          preferredVolunteers: proposal.suggestedMinVolunteers,
        },
        reviewerId,
        ipAddress,
      );
    }

    const saved = await this.proposalRepo.save(proposal);

    await this.auditService.logEvent({
      eventType: 'SERVICE_PROPOSAL_REVIEWED',
      actorId: reviewerId,
      targetId: saved.id,
      targetType: 'organization_service_proposals',
      organizationId: saved.organizationId,
      payload: {
        status: saved.status,
        rejectionReason: saved.rejectionReason,
        resultingGlobalServiceId: saved.resultingGlobalServiceId,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }
}
