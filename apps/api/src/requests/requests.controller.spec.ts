import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CreationChannel, ServiceRequestStatus, UrgencyType, UserRole } from '@ktb/shared-types';

describe('RequestsController', () => {
  let controller: RequestsController;

  const mockRequestsService = {
    createRequest: jest.fn(),
    listRequests: jest.fn(),
    getRequestById: jest.fn(),
    cancelRequest: jest.fn(),
    rescheduleRequest: jest.fn(),
  };

  const mockRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    organizationMembership: {
      roles: [UserRole.BENEFICIARY],
    },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [{ provide: RequestsService, useValue: mockRequestsService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RequestsController>(RequestsController);
  });

  describe('createRequest (D#8, D#59, D#60, D#61)', () => {
    it('creates a service request with manual location', async () => {
      const dto = {
        serviceCatalogId: 'cat-item-1',
        urgency: UrgencyType.IMMEDIATE,
        scheduledStartTime: '2026-10-20T10:00:00.000Z',
        locationAddressText: 'Kottakkal Arya Vaidya Sala Main Block',
        locationWardNumber: '7',
        locationPostalCode: '676503',
      };
      mockRequestsService.createRequest.mockResolvedValue({
        id: 'req-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        ...dto,
      });

      const result = await controller.createRequest('org-1', dto, 'user-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'req-1', status: ServiceRequestStatus.MATCHING_ACTIVE }),
      );
      expect(mockRequestsService.createRequest).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        dto,
        '127.0.0.1',
      );
    });

    it('extracts x-idempotency-key header if not in body', async () => {
      const dto = {
        serviceCatalogId: 'cat-item-1',
        urgency: UrgencyType.IMMEDIATE,
        scheduledStartTime: '2026-10-20T10:00:00.000Z',
        locationAddressText: 'Kottakkal Arya Vaidya Sala Main Block',
        locationWardNumber: '7',
        locationPostalCode: '676503',
      };
      const reqWithHeader = {
        ...mockRequest,
        headers: { 'x-idempotency-key': 'idem-header-123' },
      } as unknown as Request;

      await controller.createRequest('org-1', dto, 'user-1', reqWithHeader);

      expect(mockRequestsService.createRequest).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({ idempotencyKey: 'idem-header-123' }),
        '127.0.0.1',
      );
    });
  });

  describe('listRequests', () => {
    it('lists organization requests', async () => {
      mockRequestsService.listRequests.mockResolvedValue({ data: [{ id: 'req-1' }], total: 1 });

      const query = { page: 1, limit: 10 };
      const result = await controller.listRequests('org-1', query, 'user-1', mockRequest);
      expect(result.data).toHaveLength(1);
      expect(mockRequestsService.listRequests).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        (mockRequest as any).organizationMembership,
        query,
      );
    });
  });

  describe('getRequest', () => {
    it('gets request details by id', async () => {
      mockRequestsService.getRequestById.mockResolvedValue({ id: 'req-1' });

      const result = await controller.getRequest('org-1', 'req-1', 'user-1', mockRequest);
      expect(result).toEqual({ id: 'req-1' });
      expect(mockRequestsService.getRequestById).toHaveBeenCalledWith(
        'org-1',
        'req-1',
        'user-1',
        (mockRequest as any).organizationMembership,
      );
    });
  });

  describe('cancelRequest (D#29, D#62)', () => {
    it('cancels service request with resolved role and membership context', async () => {
      const dto = { reasonCode: 'BENEFICIARY_UNWELL', notes: 'Cannot attend' };
      mockRequestsService.cancelRequest.mockResolvedValue({
        id: 'req-1',
        status: ServiceRequestStatus.CANCELLED,
      });

      const result = await controller.cancelRequest('org-1', 'req-1', dto, 'user-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'req-1', status: ServiceRequestStatus.CANCELLED }),
      );
      expect(mockRequestsService.cancelRequest).toHaveBeenCalledWith(
        'org-1',
        'req-1',
        'user-1',
        (mockRequest as any).organizationMembership,
        dto,
        '127.0.0.1',
      );
    });
  });

  describe('rescheduleRequest (D#62)', () => {
    it('reschedules service request with new time and reason', async () => {
      const dto = {
        newStartTime: '2026-10-22T14:00:00.000Z',
        reason: 'Shifted appointment',
      };
      mockRequestsService.rescheduleRequest.mockResolvedValue({
        id: 'req-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
      });

      const result = await controller.rescheduleRequest(
        'org-1',
        'req-1',
        dto,
        'user-1',
        mockRequest,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'req-1', status: ServiceRequestStatus.MATCHING_ACTIVE }),
      );
      expect(mockRequestsService.rescheduleRequest).toHaveBeenCalledWith(
        'org-1',
        'req-1',
        'user-1',
        (mockRequest as any).organizationMembership,
        dto,
        '127.0.0.1',
      );
    });
  });
  it('denies a member spoofing the coordinator creation channel', async () => {
    await expect(
      controller.createRequest(
        'org',
        {
          creationChannel: CreationChannel.COORDINATOR_ON_BEHALF,
          beneficiaryMembershipId: 'other',
          serviceCatalogId: 'cat',
          urgency: UrgencyType.SCHEDULED,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Address',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        },
        'user',
        mockRequest,
      ),
    ).rejects.toThrow('Coordinator or administrator role required');
    expect(mockRequestsService.createRequest).not.toHaveBeenCalled();
  });
});
