import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';

describe('MatchingController (Milestone 3 Phase C)', () => {
  let controller: MatchingController;

  const mockMatchingService = {
    listMyAssignments: jest.fn(),
    assertRequestOrganization: jest.fn(),
    createZone: jest.fn(),
    listZones: jest.fn(),
    getZone: jest.fn(),
    updateZone: jest.fn(),
    assignVolunteerToZone: jest.fn(),
    removeVolunteerFromZone: jest.fn(),
    listVolunteerZones: jest.fn(),
    updateAvailability: jest.fn(),
    getAvailability: jest.fn(),
    verifySkill: jest.fn(),
    listVolunteerSkills: jest.fn(),
    acceptOffer: jest.fn(),
    declineOffer: jest.fn(),
    withdrawAssignment: jest.fn(),
    coordinatorDispatch: jest.fn(),
    expandSearchRadius: jest.fn(),
    evaluateRoundProgression: jest.fn(),
  };

  const mockRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    organizationMembership: {
      membershipId: 'mem-123',
      organizationId: 'org-1',
    },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [{ provide: MatchingService, useValue: mockMatchingService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MatchingController>(MatchingController);
  });

  it('does not expand matching for a request outside the selected tenant', async () => {
    mockMatchingService.assertRequestOrganization.mockRejectedValueOnce(new Error('Wrong tenant'));
    await expect(controller.expandRadius('org-other', 'request-1')).rejects.toThrow('Wrong tenant');
    expect(mockMatchingService.expandSearchRadius).not.toHaveBeenCalled();
  });

  it('lists assignments only for the authenticated membership', async () => {
    mockMatchingService.listMyAssignments.mockResolvedValue([]);
    await controller.listMyAssignments('org-1', mockRequest);
    expect(mockMatchingService.listMyAssignments).toHaveBeenCalledWith('org-1', 'mem-123');
  });

  it('prevents an ordinary member from modifying another volunteer', async () => {
    await expect(
      controller.updateAvailability(
        'org-1',
        'someone-else',
        { isAvailableImmediate: false },
        mockRequest,
      ),
    ).rejects.toThrow('own volunteer preferences');
    expect(mockMatchingService.updateAvailability).not.toHaveBeenCalled();
  });

  it('allows members to update their own availability and coordinators to manage others', async () => {
    await controller.updateAvailability(
      'org-1',
      'mem-123',
      { isAvailableImmediate: true },
      mockRequest,
    );
    const coordinator = {
      organizationMembership: { membershipId: 'coord', roles: ['COORDINATOR'] },
    } as unknown as Request;
    await controller.updateAvailability(
      'org-1',
      'other',
      { isAvailableImmediate: false },
      coordinator,
    );
    expect(mockMatchingService.updateAvailability).toHaveBeenCalledWith('org-1', 'other', {
      isAvailableImmediate: false,
    });
  });

  describe('Operational Zones', () => {
    it('creates operational zone', async () => {
      mockMatchingService.createZone.mockResolvedValue({ id: 'zone-1', code: 'ZONE_NORTH' });

      const result = await controller.createZone(
        'org-1',
        { code: 'ZONE_NORTH', name: 'North Zone', wardNumbers: ['1', '2'] },
        'user-coord-1',
        mockRequest,
      );

      expect(result.id).toBe('zone-1');
      expect(mockMatchingService.createZone).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ code: 'ZONE_NORTH' }),
        'user-coord-1',
        '127.0.0.1',
      );
    });

    it('lists operational zones for organization', async () => {
      mockMatchingService.listZones.mockResolvedValue([{ id: 'zone-1' }]);

      const result = await controller.listZones('org-1');
      expect(result).toHaveLength(1);
      expect(mockMatchingService.listZones).toHaveBeenCalledWith('org-1');
    });

    it('assigns volunteer to operational zone', async () => {
      mockMatchingService.assignVolunteerToZone.mockResolvedValue({ id: 'za-1' });

      const result = await controller.assignVolunteerToZone(
        'org-1',
        'zone-1',
        { membershipId: 'mem-1' },
        'user-coord-1',
        mockRequest,
      );

      expect(result.id).toBe('za-1');
      expect(mockMatchingService.assignVolunteerToZone).toHaveBeenCalledWith(
        'org-1',
        'zone-1',
        { membershipId: 'mem-1' },
        'user-coord-1',
        '127.0.0.1',
      );
    });
  });

  describe('Offer Acceptance & Progression', () => {
    it('accepts offer with clientOperationId for offline retry idempotency', async () => {
      mockMatchingService.acceptOffer.mockResolvedValue({ id: 'assign-1', status: 'ACCEPTED' });

      const result = await controller.acceptOffer(
        'org-1',
        'assign-1',
        { clientOperationId: 'client-op-1' },
        mockRequest,
      );

      expect(result.status).toBe('ACCEPTED');
      expect(mockMatchingService.acceptOffer).toHaveBeenCalledWith(
        'org-1',
        'assign-1',
        'mem-123',
        { clientOperationId: 'client-op-1' },
        '127.0.0.1',
      );
    });

    it('evaluates round progression', async () => {
      mockMatchingService.evaluateRoundProgression.mockResolvedValue({
        id: 'req-1',
        matchingTier: 2,
      });

      const result = await controller.evaluateProgression('org-1', 'req-1');
      expect(result.matchingTier).toBe(2);
      expect(mockMatchingService.evaluateRoundProgression).toHaveBeenCalledWith('req-1');
    });

    it('expands search radius', async () => {
      mockMatchingService.expandSearchRadius.mockResolvedValue({
        id: 'req-1',
        matchingRadiusKm: 7.0,
      });

      const result = await controller.expandRadius('org-1', 'req-1');
      expect(result.matchingRadiusKm).toBe(7.0);
      expect(mockMatchingService.expandSearchRadius).toHaveBeenCalledWith('req-1');
    });
  });
});
