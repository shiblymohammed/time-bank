import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { OrganizationType, OrganizationStatus } from '@ktb/shared-types';
import { OrganizationsService } from './organizations.service';
import { Organization } from './entities/organization.entity';
import { OrganizationBranding } from './entities/organization-branding.entity';
import { OrganizationAppBuild } from './entities/organization-app-build.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const mockOrgRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockBrandingRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockAppBuildRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({ id: 'audit-uuid' }),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(OrganizationBranding), useValue: mockBrandingRepo },
        { provide: getRepositoryToken(OrganizationAppBuild), useValue: mockAppBuildRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('createOrganization()', () => {
    it('should throw ConflictException if organization code already exists', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'existing-id', code: 'KOZHIKODE' });

      await expect(
        service.createOrganization({
          code: 'KOZHIKODE',
          name: 'Kozhikode Municipal Corporation',
          type: OrganizationType.MUNICIPAL_CORPORATION,
          district: 'Kozhikode',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should transactionally create organization, branding, initial admin, and audit log', async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);

      const savedOrg = {
        id: 'new-org-uuid',
        code: 'KOZHIKODE',
        name: 'Kozhikode Municipal Corporation',
        type: OrganizationType.MUNICIPAL_CORPORATION,
        district: 'Kozhikode',
      };

      const savedBranding = {
        id: 'branding-uuid',
        organizationId: savedOrg.id,
        appDisplayName: 'Kozhikode Time Bank',
        version: 1,
      };

      mockDataSource.transaction.mockImplementation(async (callback) => {
        const mockManager = {
          create: jest.fn().mockImplementation((entityClass, data) => data),
          save: jest.fn().mockImplementation(async (entityClass, data) => {
            if (entityClass === Organization) return savedOrg;
            if (entityClass === OrganizationBranding) return savedBranding;
            if (entityClass === User) return { id: 'admin-user-uuid', ...data };
            return { id: 'generic-uuid', ...data };
          }),
          findOne: jest.fn().mockResolvedValue(null),
        };
        return callback(mockManager);
      });

      const result = await service.createOrganization(
        {
          code: 'KOZHIKODE',
          name: 'Kozhikode Municipal Corporation',
          type: OrganizationType.MUNICIPAL_CORPORATION,
          district: 'Kozhikode',
          adminPhone: '+919876543210',
          branding: {
            appDisplayName: 'Kozhikode Time Bank',
            primaryColor: '#0D5C75',
          },
        },
        'creator-uuid-1',
      );

      expect(result.id).toBe('new-org-uuid');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORGANIZATION_CREATED',
          actorId: 'creator-uuid-1',
          targetId: 'new-org-uuid',
        }),
        expect.objectContaining({ save: expect.any(Function) }),
      );
    });
  });

  describe('updateOrganization()', () => {
    it('should update organization status and log audit event', async () => {
      const existingOrg = {
        id: 'org-uuid-1',
        name: 'Kottakkal Municipality',
        status: OrganizationStatus.ACTIVE,
      };

      mockOrgRepo.findOne.mockResolvedValue(existingOrg);
      mockOrgRepo.save.mockImplementation(async (org) => org);

      const result = await service.updateOrganization(
        'org-uuid-1',
        { status: OrganizationStatus.SUSPENDED },
        'admin-uuid-1',
      );

      expect(result.status).toBe(OrganizationStatus.SUSPENDED);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORGANIZATION_UPDATED',
          actorId: 'admin-uuid-1',
          targetId: 'org-uuid-1',
        }),
      );
    });
  });

  describe('getBranding() & updateBranding()', () => {
    it('should return public branding for tenant bootstrap', async () => {
      const branding = {
        organizationId: 'org-uuid-1',
        appDisplayName: 'Kozhikode Time Bank',
        primaryColor: '#0D5C75',
      };
      mockBrandingRepo.findOne.mockResolvedValue(branding);

      const result = await service.getBranding('org-uuid-1');
      expect(result.appDisplayName).toBe('Kozhikode Time Bank');
    });

    it('should update branding, increment version, and emit audit event', async () => {
      const existingBranding = {
        id: 'branding-1',
        organizationId: 'org-uuid-1',
        appDisplayName: 'Kozhikode Time Bank',
        version: 1,
      };

      mockBrandingRepo.findOne.mockResolvedValue(existingBranding);
      mockBrandingRepo.save.mockImplementation(async (b) => b);

      const result = await service.updateBranding(
        'org-uuid-1',
        { primaryColor: '#003366' },
        'admin-user-uuid',
      );

      expect(result.version).toBe(2);
      expect(result.primaryColor).toBe('#003366');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORGANIZATION_BRANDING_UPDATED',
        }),
      );
    });
  });

  describe('createOrUpdateAppBuild()', () => {
    it('should register a new release build and log audit event', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-uuid-1' });
      mockAppBuildRepo.findOne.mockResolvedValue(null);
      mockAppBuildRepo.create.mockImplementation((data) => ({ id: 'build-1', ...data }));
      mockAppBuildRepo.save.mockImplementation(async (data) => data);

      const result = await service.createOrUpdateAppBuild(
        'org-uuid-1',
        {
          platform: 'ANDROID',
          applicationId: 'in.gov.kerala.timebank.kozhikode',
          buildVersion: '1.0.0',
        },
        'superadmin-uuid',
      );

      expect(result.applicationId).toBe('in.gov.kerala.timebank.kozhikode');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ORGANIZATION_APP_BUILD_SAVED',
        }),
      );
    });
  });
});
