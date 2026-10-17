import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthorizationService } from '../authorization/authorization.service';
import { GlobalRestrictionType, OrganizationStatus, UserRole } from '@ktb/shared-types';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    getOverviewMetrics: jest.fn().mockResolvedValue({ totalUsers: 10 }),
    imposeRestriction: jest.fn().mockResolvedValue({ id: 'r-1' }),
    resolveRestriction: jest.fn().mockResolvedValue({ id: 'r-1' }),
    listRestrictions: jest.fn().mockResolvedValue([]),
    updateOrganizationStatus: jest.fn().mockResolvedValue({ id: 'org-1' }),
    grantOrganizationRole: jest.fn().mockResolvedValue({ id: 'g-1' }),
    revokeOrganizationRole: jest.fn().mockResolvedValue({ id: 'g-1' }),
    queryAuditLogs: jest.fn().mockResolvedValue({ events: [], total: 0 }),
  };

  const mockReq = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: RolesGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: AuthorizationService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getOverviewMetrics', async () => {
    const res = await controller.getOverview();
    expect(mockAdminService.getOverviewMetrics).toHaveBeenCalled();
    expect(res).toEqual({ totalUsers: 10 });
  });

  it('should call imposeRestriction', async () => {
    const dto = {
      userId: 'u-1',
      restrictionType: GlobalRestrictionType.PERMANENT_BAN,
      reasonCode: 'FRAUD',
    };
    const res = await controller.imposeRestriction(dto, 'admin-1', mockReq);
    expect(mockAdminService.imposeRestriction).toHaveBeenCalledWith(dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'r-1' });
  });

  it('should call resolveRestriction', async () => {
    const dto = { resolutionNotes: 'cleared' };
    const res = await controller.resolveRestriction('r-1', dto, 'admin-1', mockReq);
    expect(mockAdminService.resolveRestriction).toHaveBeenCalledWith('r-1', dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'r-1' });
  });

  it('should call listRestrictions', async () => {
    const res = await controller.listRestrictions('u-1');
    expect(mockAdminService.listRestrictions).toHaveBeenCalledWith('u-1', undefined);
    expect(res).toEqual([]);
  });

  it('should call updateOrgStatus', async () => {
    const dto = { status: OrganizationStatus.ACTIVE };
    const res = await controller.updateOrgStatus('org-1', dto, 'admin-1', mockReq);
    expect(mockAdminService.updateOrganizationStatus).toHaveBeenCalledWith('org-1', dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'org-1' });
  });

  it('should call grantOrgRole', async () => {
    const dto = { userId: 'u-1', role: UserRole.COORDINATOR };
    const res = await controller.grantOrgRole('org-1', dto, 'admin-1', mockReq);
    expect(mockAdminService.grantOrganizationRole).toHaveBeenCalledWith('org-1', dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'g-1' });
  });

  it('should call revokeOrgRole', async () => {
    const dto = { reason: 'transfer' };
    const res = await controller.revokeOrgRole('org-1', 'g-1', dto, 'admin-1', mockReq);
    expect(mockAdminService.revokeOrganizationRole).toHaveBeenCalledWith('org-1', 'g-1', dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'g-1' });
  });

  it('should call queryAuditLogs', async () => {
    const query = { eventType: 'AUTH_LOGIN' };
    const res = await controller.queryAuditLogs(query);
    expect(mockAdminService.queryAuditLogs).toHaveBeenCalledWith(query);
    expect(res).toEqual({ events: [], total: 0 });
  });
});
