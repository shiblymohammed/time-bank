import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { ServiceProposalStatus } from '@ktb/shared-types';
import { ReviewOrgProposalDto } from './dto/review-proposal.dto';

describe('CatalogueController', () => {
  let controller: CatalogueController;

  const mockCatalogueService = {
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    listCategories: jest.fn(),
    createGlobalService: jest.fn(),
    updateGlobalService: jest.fn(),
    listGlobalServices: jest.fn(),
    getGlobalService: jest.fn(),
    listProposals: jest.fn(),
    reviewProposal: jest.fn(),
    listOrgCatalogue: jest.fn(),
    getOrgCatalogueItem: jest.fn(),
    configureOrgCatalogue: jest.fn(),
    createProposal: jest.fn(),
  };

  const mockRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogueController],
      providers: [{ provide: CatalogueService, useValue: mockCatalogueService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CatalogueController>(CatalogueController);
  });

  describe('Central Super Admin Catalogue Endpoints', () => {
    it('creates a service category', async () => {
      const dto = {
        code: 'ELDER_CARE',
        nameEn: 'Elder Care',
        nameMl: 'മുതിർന്നവർക്കുള്ള പരിചരണം',
      };
      mockCatalogueService.createCategory.mockResolvedValue({ id: 'cat-1', ...dto });

      const result = await controller.createCategory(dto, 'user-admin-1', mockRequest);
      expect(result).toEqual(expect.objectContaining({ id: 'cat-1', code: 'ELDER_CARE' }));
      expect(mockCatalogueService.createCategory).toHaveBeenCalledWith(
        dto,
        'user-admin-1',
        '127.0.0.1',
      );
    });

    it('updates a service category', async () => {
      const dto = { nameEn: 'Updated Elder Care', isActive: true };
      mockCatalogueService.updateCategory.mockResolvedValue({ id: 'cat-1', ...dto });

      const result = await controller.updateCategory('cat-1', dto, 'user-admin-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'cat-1', nameEn: 'Updated Elder Care' }),
      );
      expect(mockCatalogueService.updateCategory).toHaveBeenCalledWith(
        'cat-1',
        dto,
        'user-admin-1',
        '127.0.0.1',
      );
    });

    it('lists service categories with activeOnly filtering', async () => {
      mockCatalogueService.listCategories.mockResolvedValue([{ id: 'cat-1' }]);

      const result = await controller.listCategories('true');
      expect(result).toHaveLength(1);
      expect(mockCatalogueService.listCategories).toHaveBeenCalledWith(true);
    });

    it('creates canonical global service definition', async () => {
      const dto = {
        categoryId: 'cat-1',
        code: 'HOSPITAL_ACCOMPANIMENT',
        nameEn: 'Hospital Accompaniment',
        nameMl: 'ആശുപത്രി സഹായം',
        defaultMinVolunteers: 1,
        defaultPreferredVolunteers: 2,
        baseCreditRateHourly: 1.0,
        creditMultiplier: 1.0,
        allowPartialHours: true,
      };
      mockCatalogueService.createGlobalService.mockResolvedValue({ id: 'gs-1', ...dto });

      const result = await controller.createGlobalService(dto, 'user-admin-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'gs-1', code: 'HOSPITAL_ACCOMPANIMENT' }),
      );
      expect(mockCatalogueService.createGlobalService).toHaveBeenCalledWith(
        dto,
        'user-admin-1',
        '127.0.0.1',
      );
    });

    it('updates canonical global service definition', async () => {
      const dto = { creditMultiplier: 1.5, allowPartialHours: true };
      mockCatalogueService.updateGlobalService.mockResolvedValue({ id: 'gs-1', ...dto });

      const result = await controller.updateGlobalService('gs-1', dto, 'user-admin-1', mockRequest);
      expect(result).toEqual(expect.objectContaining({ id: 'gs-1', creditMultiplier: 1.5 }));
      expect(mockCatalogueService.updateGlobalService).toHaveBeenCalledWith(
        'gs-1',
        dto,
        'user-admin-1',
        '127.0.0.1',
      );
    });

    it('lists global service definitions with optional category filter', async () => {
      mockCatalogueService.listGlobalServices.mockResolvedValue([{ id: 'gs-1' }]);

      const result = await controller.listGlobalServices('cat-1', 'true');
      expect(result).toHaveLength(1);
      expect(mockCatalogueService.listGlobalServices).toHaveBeenCalledWith('cat-1', true);
    });

    it('gets a single global service definition by id', async () => {
      mockCatalogueService.getGlobalService.mockResolvedValue({ id: 'gs-1' });

      const result = await controller.getGlobalService('gs-1');
      expect(result).toEqual({ id: 'gs-1' });
      expect(mockCatalogueService.getGlobalService).toHaveBeenCalledWith('gs-1');
    });

    it('lists all proposals nationwide for Super Admin', async () => {
      mockCatalogueService.listProposals.mockResolvedValue([{ id: 'prop-1' }]);

      const result = await controller.listAllProposals();
      expect(result).toHaveLength(1);
      expect(mockCatalogueService.listProposals).toHaveBeenCalledWith();
    });

    it('reviews and approves a service proposal centrally', async () => {
      const dto: ReviewOrgProposalDto = {
        status: ServiceProposalStatus.APPROVED,
        resultingGlobalServiceId: 'gs-created-1',
      };
      mockCatalogueService.reviewProposal.mockResolvedValue({
        id: 'prop-1',
        status: ServiceProposalStatus.APPROVED,
      });

      const result = await controller.reviewProposal('prop-1', dto, 'user-admin-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'prop-1', status: ServiceProposalStatus.APPROVED }),
      );
      expect(mockCatalogueService.reviewProposal).toHaveBeenCalledWith(
        'prop-1',
        dto,
        'user-admin-1',
        '127.0.0.1',
      );
    });
  });

  describe('Organization Tenant Catalogue Endpoints', () => {
    it('lists enabled services for an organization', async () => {
      mockCatalogueService.listOrgCatalogue.mockResolvedValue([{ id: 'oc-1' }]);

      const result = await controller.listOrgCatalogue('org-uuid-1', 'false');
      expect(result).toHaveLength(1);
      expect(mockCatalogueService.listOrgCatalogue).toHaveBeenCalledWith('org-uuid-1', true);
    });

    it('gets a single organization catalogue item', async () => {
      mockCatalogueService.getOrgCatalogueItem.mockResolvedValue({ id: 'oc-1' });

      const result = await controller.getOrgCatalogueItem('org-uuid-1', 'oc-1');
      expect(result).toEqual({ id: 'oc-1' });
      expect(mockCatalogueService.getOrgCatalogueItem).toHaveBeenCalledWith('org-uuid-1', 'oc-1');
    });

    it('configures/enables an organization catalogue entry', async () => {
      const dto = {
        globalServiceId: 'gs-1',
        isEnabled: true,
        minVolunteers: 2,
        preferredVolunteers: 3,
      };
      mockCatalogueService.configureOrgCatalogue.mockResolvedValue({ id: 'oc-1', ...dto });

      const result = await controller.configureOrgCatalogue(
        'org-uuid-1',
        dto,
        'user-coord-1',
        mockRequest,
      );
      expect(result).toEqual(expect.objectContaining({ id: 'oc-1', minVolunteers: 2 }));
      expect(mockCatalogueService.configureOrgCatalogue).toHaveBeenCalledWith(
        'org-uuid-1',
        dto,
        'user-coord-1',
        '127.0.0.1',
      );
    });

    it('submits a municipal service proposal', async () => {
      const dto = {
        categoryId: 'cat-1',
        proposedName: 'Canal Cleanup',
        description: 'Cleaning local canals',
        justification: 'Monsoon readiness',
        suggestedMinVolunteers: 2,
      };
      mockCatalogueService.createProposal.mockResolvedValue({
        id: 'prop-1',
        status: ServiceProposalStatus.PENDING_REVIEW,
      });

      const result = await controller.createOrgProposal(
        'org-uuid-1',
        dto,
        'user-coord-1',
        mockRequest,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'prop-1', status: ServiceProposalStatus.PENDING_REVIEW }),
      );
      expect(mockCatalogueService.createProposal).toHaveBeenCalledWith(
        'org-uuid-1',
        dto,
        'user-coord-1',
        '127.0.0.1',
      );
    });

    it('lists proposals submitted by an organization', async () => {
      mockCatalogueService.listProposals.mockResolvedValue([{ id: 'prop-1' }]);

      const result = await controller.listOrgProposals('org-uuid-1');
      expect(result).toHaveLength(1);
      expect(mockCatalogueService.listProposals).toHaveBeenCalledWith('org-uuid-1');
    });
  });
});
