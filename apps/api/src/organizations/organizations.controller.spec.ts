import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { ROLES_KEY } from '../authorization/decorators/roles.decorator';
import { OrganizationType, OrganizationStatus, UserRole } from '@ktb/shared-types';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockOrgsService = {
    createOrganization: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findPublic: jest.fn(),
    findPublicById: jest.fn(),
    updateOrganization: jest.fn(),
    getBranding: jest.fn(),
    updateBranding: jest.fn(),
    getAppBuilds: jest.fn(),
    createOrUpdateAppBuild: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [{ provide: OrganizationsService, useValue: mockOrgsService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  describe('createOrganization()', () => {
    it('should create organization and return wrapped response envelope', async () => {
      const mockResult = {
        id: 'org-uuid-1',
        code: 'KOZHIKODE',
        name: 'Kozhikode Municipal Corporation',
        type: OrganizationType.MUNICIPAL_CORPORATION,
        status: OrganizationStatus.ACTIVE,
      };

      mockOrgsService.createOrganization.mockResolvedValue(mockResult);

      const response = await controller.createOrganization(
        {
          code: 'KOZHIKODE',
          name: 'Kozhikode Municipal Corporation',
          type: OrganizationType.MUNICIPAL_CORPORATION,
          district: 'Kozhikode',
        },
        'user-uuid-1',
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockResult);
      expect(response.timestamp).toBeDefined();
    });
  });

  describe('public and managed listings', () => {
    it('serves unauthenticated callers public summaries only', async () => {
      mockOrgsService.findPublic.mockResolvedValue([{ id: 'org-1' }]);
      mockOrgsService.findPublicById.mockResolvedValue({ id: 'org-1' });

      await expect(controller.listOrganizations()).resolves.toMatchObject({
        data: [{ id: 'org-1' }],
      });
      await expect(controller.getOrganization('org-1')).resolves.toMatchObject({
        data: { id: 'org-1' },
      });
      expect(mockOrgsService.findAll).not.toHaveBeenCalled();
      expect(mockOrgsService.findById).not.toHaveBeenCalled();
    });

    it.each(['listManagedOrganizations', 'getManagedOrganization', 'getAppBuilds'] as const)(
      '%s requires a Super Admin',
      (handler) => {
        const method = OrganizationsController.prototype[handler];
        expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(AuthGuard);
        expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(RolesGuard);
        expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([UserRole.SUPER_ADMIN]);
        // A suspended organization must stay manageable.
        expect(Reflect.getMetadata(GUARDS_METADATA, method)).not.toContain(OrganizationAccessGuard);
      },
    );
  });

  describe('getBranding()', () => {
    it('should return public branding without requiring authentication', async () => {
      const branding = {
        appDisplayName: 'Kozhikode Time Bank',
        primaryColor: '#0D5C75',
      };
      mockOrgsService.getBranding.mockResolvedValue(branding);

      const response = await controller.getBranding('org-uuid-1');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(branding);
    });
  });
});
