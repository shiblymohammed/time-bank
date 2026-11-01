import { Test, TestingModule } from '@nestjs/testing';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthorizationService } from '../authorization/authorization.service';
import { DocumentReviewStatus, UserRole } from '@ktb/shared-types';

describe('MembershipsController', () => {
  let controller: MembershipsController;

  const mockService = {
    apply: jest.fn().mockResolvedValue({ id: 'm-1' }),
    listMemberships: jest.fn().mockResolvedValue({ memberships: [], total: 0 }),
    getMembershipById: jest.fn().mockResolvedValue({ id: 'm-1' }),
    approveMembership: jest.fn().mockResolvedValue({ id: 'm-1', status: 'APPROVED' }),
    rejectMembership: jest.fn().mockResolvedValue({ id: 'm-1', status: 'REJECTED' }),
    uploadDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    reviewDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    grantRole: jest.fn().mockResolvedValue({ id: 'g-1' }),
    revokeRole: jest.fn().mockResolvedValue({ id: 'g-1' }),
  };

  const mockReq = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [
        { provide: MembershipsService, useValue: mockService },
        { provide: AuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        {
          provide: OrganizationAccessGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        { provide: RolesGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: AuthorizationService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<MembershipsController>(MembershipsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call apply', async () => {
    const dto = { notes: 'Ward 4' };
    const res = await controller.apply('org-1', dto, 'u-1', mockReq);
    expect(mockService.apply).toHaveBeenCalledWith('org-1', 'u-1', dto, '127.0.0.1');
    expect(res).toEqual({ id: 'm-1' });
  });

  it('should call listMemberships', async () => {
    const query = { limit: 10 };
    const res = await controller.listMemberships('org-1', query);
    expect(mockService.listMemberships).toHaveBeenCalledWith('org-1', query);
    expect(res).toEqual({ memberships: [], total: 0 });
  });

  it('should call getMembership', async () => {
    const res = await controller.getMembership('org-1', 'm-1');
    expect(mockService.getMembershipById).toHaveBeenCalledWith('org-1', 'm-1');
    expect(res).toEqual({ id: 'm-1' });
  });

  it('should call approveMembership', async () => {
    const dto = { initialRole: UserRole.VOLUNTEER };
    const res = await controller.approveMembership('org-1', 'm-1', dto, 'admin-1', mockReq);
    expect(mockService.approveMembership).toHaveBeenCalledWith(
      'org-1',
      'm-1',
      'admin-1',
      dto,
      '127.0.0.1',
    );
    expect(res.status).toBe('APPROVED');
  });

  it('should call rejectMembership', async () => {
    const dto = { reason: 'Wrong district' };
    const res = await controller.rejectMembership('org-1', 'm-1', dto, 'admin-1', mockReq);
    expect(mockService.rejectMembership).toHaveBeenCalledWith(
      'org-1',
      'm-1',
      'admin-1',
      dto,
      '127.0.0.1',
    );
    expect(res.status).toBe('REJECTED');
  });

  it('should call uploadDocument', async () => {
    const dto = { documentType: 'PROOF', storageKey: 'path' };
    const res = await controller.uploadDocument('org-1', 'm-1', dto, 'u-1', mockReq);
    expect(mockService.uploadDocument).toHaveBeenCalledWith(
      'org-1',
      'm-1',
      'u-1',
      dto,
      '127.0.0.1',
    );
    expect(res).toEqual({ id: 'doc-1' });
  });

  it('should call reviewDocument', async () => {
    const dto = { status: DocumentReviewStatus.APPROVED };
    const res = await controller.reviewDocument('org-1', 'doc-1', dto, 'admin-1', mockReq);
    expect(mockService.reviewDocument).toHaveBeenCalledWith(
      'org-1',
      'doc-1',
      'admin-1',
      dto,
      '127.0.0.1',
    );
    expect(res).toEqual({ id: 'doc-1' });
  });

  it('should call grantRole', async () => {
    const dto = { role: UserRole.COORDINATOR };
    const res = await controller.grantRole('org-1', 'm-1', dto, 'admin-1', mockReq);
    expect(mockService.grantRole).toHaveBeenCalledWith('org-1', 'm-1', dto, 'admin-1', '127.0.0.1');
    expect(res).toEqual({ id: 'g-1' });
  });

  it('should call revokeRole', async () => {
    const dto = { reason: 'Retired' };
    const res = await controller.revokeRole('org-1', 'm-1', 'g-1', dto, 'admin-1', mockReq);
    expect(mockService.revokeRole).toHaveBeenCalledWith(
      'org-1',
      'm-1',
      'g-1',
      dto,
      'admin-1',
      '127.0.0.1',
    );
    expect(res).toEqual({ id: 'g-1' });
  });
});
