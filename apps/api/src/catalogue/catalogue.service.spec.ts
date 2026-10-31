import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceProposalStatus } from '@ktb/shared-types';

import { CatalogueService } from './catalogue.service';
import { ServiceCategory } from './entities/service-category.entity';
import { GlobalServiceDefinition } from './entities/global-service-definition.entity';
import { OrganizationServiceCatalog } from './entities/organization-service-catalog.entity';
import { OrganizationServiceProposal } from './entities/organization-service-proposal.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AuditService } from '../audit/audit.service';

describe('CatalogueService', () => {
  let service: CatalogueService;

  const mockCategoryRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'cat-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
  };

  const mockGlobalServiceRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'gs-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOrgCatalogRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'oc-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
  };

  const mockProposalRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'prop-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
  };

  const mockOrgRepo = {
    findOne: jest.fn(),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: getRepositoryToken(ServiceCategory), useValue: mockCategoryRepo },
        { provide: getRepositoryToken(GlobalServiceDefinition), useValue: mockGlobalServiceRepo },
        { provide: getRepositoryToken(OrganizationServiceCatalog), useValue: mockOrgCatalogRepo },
        { provide: getRepositoryToken(OrganizationServiceProposal), useValue: mockProposalRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CatalogueService>(CatalogueService);
  });

  describe('createCategory', () => {
    it('creates a service category successfully (D#10)', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      const result = await service.createCategory({
        code: 'ELDER_CARE',
        nameEn: 'Elder Care',
        nameMl: 'മുതിർന്നവർക്കുള്ള പരിചരണം',
      });

      expect(result.code).toBe('ELDER_CARE');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SERVICE_CATEGORY_CREATED' }),
      );
    });

    it('rejects duplicate category code with ConflictException', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'existing', code: 'ELDER_CARE' });

      await expect(
        service.createCategory({
          code: 'ELDER_CARE',
          nameEn: 'Elder Care',
          nameMl: 'പരിചരണം',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateCategory', () => {
    it('updates service category active state and details', async () => {
      const existing = {
        id: 'cat-1',
        code: 'ELDER_CARE',
        nameEn: 'Elder Care',
        isActive: true,
      };
      mockCategoryRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateCategory('cat-1', {
        nameEn: 'Senior Citizen Care',
        isActive: false,
      });

      expect(result.nameEn).toBe('Senior Citizen Care');
      expect(result.isActive).toBe(false);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SERVICE_CATEGORY_UPDATED' }),
      );
    });

    it('throws NotFoundException when category to update is missing', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.updateCategory('missing-cat', { nameEn: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listCategories', () => {
    it('returns all categories or active only', async () => {
      mockCategoryRepo.find.mockResolvedValue([{ id: 'cat-1', isActive: true }]);

      const result = await service.listCategories(true);
      expect(result).toHaveLength(1);
      expect(mockCategoryRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('createGlobalService (AT-M3-01)', () => {
    it('creates global service definition with headcount invariants and credit metadata', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'cat-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue(null);

      const result = await service.createGlobalService({
        categoryId: 'cat-1',
        code: 'HOSPITAL_ACCOMPANIMENT',
        nameEn: 'Hospital Accompaniment',
        nameMl: 'ആശുപത്രി സഹായം',
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 2,
        baseCreditRateHourly: 1.5,
        creditMultiplier: 1.25,
        allowPartialHours: true,
      });

      expect(result.code).toBe('HOSPITAL_ACCOMPANIMENT');
      expect(result.defaultMinVolunteers).toBe(1);
      expect(result.baseCreditRateHourly).toBe(1.5);
      expect(result.creditMultiplier).toBe(1.25);
      expect(result.allowPartialHours).toBe(true);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'GLOBAL_SERVICE_CREATED' }),
      );
    });

    it('throws NotFoundException if category does not exist', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createGlobalService({
          categoryId: 'missing-cat',
          code: 'CODE',
          nameEn: 'Name',
          nameMl: 'Name',
          defaultMinVolunteers: 1,
          defaultPreferredVolunteers: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if service code already exists', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'cat-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({ id: 'existing-gs', code: 'EXISTING' });

      await expect(
        service.createGlobalService({
          categoryId: 'cat-1',
          code: 'EXISTING',
          nameEn: 'Name',
          nameMl: 'Name',
          defaultMinVolunteers: 1,
          defaultPreferredVolunteers: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if preferred volunteers < min volunteers (D#64)', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'cat-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createGlobalService({
          categoryId: 'cat-1',
          code: 'INVALID_VOLUNTEERS',
          nameEn: 'Invalid',
          nameMl: 'Invalid',
          defaultMinVolunteers: 3,
          defaultPreferredVolunteers: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGlobalService', () => {
    it('rejects requiring skills without any skill codes', async () => {
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-1',
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 1,
        requiresSkills: false,
        requiredSkillCodes: [],
      });
      await expect(service.updateGlobalService('gs-1', { requiresSkills: true })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockGlobalServiceRepo.save).not.toHaveBeenCalled();
    });
    it('updates service rules, credit calculation, and status', async () => {
      const existing = {
        id: 'gs-1',
        code: 'HOSPITAL_ACCOMPANIMENT',
        nameEn: 'Hospital Accompaniment',
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 2,
        baseCreditRateHourly: 1.0,
        creditMultiplier: 1.0,
        allowPartialHours: true,
        isActive: true,
      };
      mockGlobalServiceRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateGlobalService('gs-1', {
        creditMultiplier: 1.5,
        defaultPreferredVolunteers: 3,
        isActive: false,
      });

      expect(result.creditMultiplier).toBe(1.5);
      expect(result.defaultPreferredVolunteers).toBe(3);
      expect(result.isActive).toBe(false);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'GLOBAL_SERVICE_UPDATED' }),
      );
    });

    it('throws NotFoundException if global service does not exist', async () => {
      mockGlobalServiceRepo.findOne.mockResolvedValue(null);

      await expect(service.updateGlobalService('missing-gs', { nameEn: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if updated preferred volunteers < min volunteers', async () => {
      const existing = {
        id: 'gs-1',
        defaultMinVolunteers: 3,
        defaultPreferredVolunteers: 3,
      };
      mockGlobalServiceRepo.findOne.mockResolvedValue(existing);

      await expect(
        service.updateGlobalService('gs-1', { defaultPreferredVolunteers: 2 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGlobalService', () => {
    it('returns global service definition if found', async () => {
      const serviceDef = { id: 'gs-1', code: 'TEST' };
      mockGlobalServiceRepo.findOne.mockResolvedValue(serviceDef);

      const result = await service.getGlobalService('gs-1');
      expect(result).toBe(serviceDef);
    });

    it('throws NotFoundException if global service not found', async () => {
      mockGlobalServiceRepo.findOne.mockResolvedValue(null);

      await expect(service.getGlobalService('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('configureOrgCatalogue (AT-M3-02)', () => {
    it('preserves staffing and dispatch policy when only enablement changes', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-1',
        isActive: true,
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 1,
      });
      mockOrgCatalogRepo.findOne.mockResolvedValue({
        id: 'oc-1',
        isEnabled: true,
        minVolunteers: 3,
        preferredVolunteers: 4,
        requiresCoordinatorDispatch: true,
        customLabelEn: 'Local help',
      });
      const result = await service.configureOrgCatalogue('org-1', {
        globalServiceId: 'gs-1',
        isEnabled: false,
      });
      expect(result).toMatchObject({
        isEnabled: false,
        minVolunteers: 3,
        preferredVolunteers: 4,
        requiresCoordinatorDispatch: true,
        customLabelEn: 'Local help',
      });
      mockOrgCatalogRepo.findOne.mockResolvedValue(null);
    });
    it('rejects enabling a centrally inactive service', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({ id: 'gs-1', isActive: false });
      mockOrgCatalogRepo.findOne.mockResolvedValue(null);
      await expect(
        service.configureOrgCatalogue('org-1', { globalServiceId: 'gs-1', isEnabled: true }),
      ).rejects.toThrow(BadRequestException);
      expect(mockOrgCatalogRepo.save).not.toHaveBeenCalled();
    });
    it('enables service in organization catalogue with local rules', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-1',
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 1,
      });
      mockOrgCatalogRepo.findOne.mockResolvedValue(null);

      const result = await service.configureOrgCatalogue('org-1', {
        globalServiceId: 'gs-1',
        isEnabled: true,
        minVolunteers: 2,
        preferredVolunteers: 3,
        customLabelEn: 'Kozhikode Special Escort',
      });

      expect(result.minVolunteers).toBe(2);
      expect(result.preferredVolunteers).toBe(3);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORG_CATALOGUE_CONFIGURED',
          organizationId: 'org-1',
        }),
      );
    });

    it('throws NotFoundException if org does not exist', async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);

      await expect(
        service.configureOrgCatalogue('missing-org', { globalServiceId: 'gs-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if global service does not exist', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.configureOrgCatalogue('org-1', { globalServiceId: 'missing-gs' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('disallows minVolunteers below global safety minimum', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-1',
        defaultMinVolunteers: 3,
        defaultPreferredVolunteers: 4,
      });

      await expect(
        service.configureOrgCatalogue('org-1', {
          globalServiceId: 'gs-1',
          minVolunteers: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('disallows preferredVolunteers below minVolunteers', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-1',
        defaultMinVolunteers: 2,
        defaultPreferredVolunteers: 2,
      });

      await expect(
        service.configureOrgCatalogue('org-1', {
          globalServiceId: 'gs-1',
          minVolunteers: 2,
          preferredVolunteers: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOrgCatalogueItem', () => {
    it('returns org catalogue item if found', async () => {
      const item = { id: 'oc-1', organizationId: 'org-1' };
      mockOrgCatalogRepo.findOne.mockResolvedValue(item);

      const result = await service.getOrgCatalogueItem('org-1', 'oc-1');
      expect(result).toBe(item);
    });

    it('throws NotFoundException if org catalogue item not found', async () => {
      mockOrgCatalogRepo.findOne.mockResolvedValue(null);

      await expect(service.getOrgCatalogueItem('org-1', 'missing-oc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createProposal (AT-M3-03)', () => {
    it('submits municipal service proposal in PENDING_REVIEW status', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'cat-1' });
      mockProposalRepo.findOne.mockResolvedValue(null);

      const result = await service.createProposal(
        'org-1',
        {
          categoryId: 'cat-1',
          proposedName: 'Canal Cleanup',
          description: 'Cleaning local canals',
          justification: 'Monsoon readiness',
          suggestedMinVolunteers: 2,
          isHazardousPhysical: false,
        },
        'user-coord-1',
      );

      expect(result.status).toBe(ServiceProposalStatus.PENDING_REVIEW);
      expect(result.proposedByUserId).toBe('user-coord-1');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SERVICE_PROPOSAL_SUBMITTED' }),
      );
    });

    it('throws NotFoundException if org does not exist', async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createProposal(
          'non-existent-org',
          {
            categoryId: 'cat-1',
            proposedName: 'Canal Cleanup',
            description: 'Cleaning',
            justification: 'Monsoon',
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if category does not exist', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createProposal(
          'org-1',
          {
            categoryId: 'non-existent-cat',
            proposedName: 'Canal Cleanup',
            description: 'Cleaning',
            justification: 'Monsoon',
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate proposal with same name pending review in same org (ConflictException)', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockCategoryRepo.findOne.mockResolvedValue({ id: 'cat-1' });
      mockProposalRepo.findOne.mockResolvedValue({
        id: 'prop-existing',
        organizationId: 'org-1',
        proposedName: 'Canal Cleanup',
        status: ServiceProposalStatus.PENDING_REVIEW,
      });

      await expect(
        service.createProposal(
          'org-1',
          {
            categoryId: 'cat-1',
            proposedName: 'Canal Cleanup',
            description: 'Cleaning',
            justification: 'Monsoon',
          },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reviewProposal (Super Admin approval)', () => {
    it('approves proposal and automatically enables it in proposing org catalogue', async () => {
      const proposal = {
        id: 'prop-1',
        organizationId: 'org-1',
        proposedName: 'Canal Cleanup',
        suggestedMinVolunteers: 2,
        status: ServiceProposalStatus.PENDING_REVIEW,
      };
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockGlobalServiceRepo.findOne.mockResolvedValue({
        id: 'gs-created-1',
        defaultMinVolunteers: 2,
        defaultPreferredVolunteers: 2,
      });
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1' });
      mockOrgCatalogRepo.findOne.mockResolvedValue(null);

      const result = await service.reviewProposal(
        'prop-1',
        {
          status: ServiceProposalStatus.APPROVED,
          resultingGlobalServiceId: 'gs-created-1',
        },
        'super-admin-user-id',
      );

      expect(result.status).toBe(ServiceProposalStatus.APPROVED);
      expect(result.reviewedByUserId).toBe('super-admin-user-id');
      expect(result.resultingGlobalServiceId).toBe('gs-created-1');
      expect(mockOrgCatalogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          globalServiceId: 'gs-created-1',
          isEnabled: true,
          minVolunteers: 2,
        }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SERVICE_PROPOSAL_REVIEWED' }),
      );
    });

    it('rejects proposal with reason', async () => {
      const proposal = {
        id: 'prop-1',
        organizationId: 'org-1',
        proposedName: 'Disallowed Service',
        status: ServiceProposalStatus.PENDING_REVIEW,
      };
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      const result = await service.reviewProposal(
        'prop-1',
        {
          status: ServiceProposalStatus.REJECTED,
          rejectionReason: 'Violates national safety protocols',
        },
        'super-admin-user-id',
      );

      expect(result.status).toBe(ServiceProposalStatus.REJECTED);
      expect(result.rejectionReason).toBe('Violates national safety protocols');
    });

    it('throws BadRequestException if rejecting without reason', async () => {
      const proposal = {
        id: 'prop-1',
        status: ServiceProposalStatus.PENDING_REVIEW,
      };
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      await expect(
        service.reviewProposal(
          'prop-1',
          {
            status: ServiceProposalStatus.REJECTED,
          },
          'super-admin-user-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if reviewing an already resolved proposal', async () => {
      const proposal = {
        id: 'prop-1',
        status: ServiceProposalStatus.APPROVED,
      };
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      await expect(
        service.reviewProposal(
          'prop-1',
          {
            status: ServiceProposalStatus.REJECTED,
            rejectionReason: 'Too late',
          },
          'super-admin-user-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if proposal not found', async () => {
      mockProposalRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reviewProposal(
          'missing-prop',
          {
            status: ServiceProposalStatus.APPROVED,
          },
          'super-admin-user-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
