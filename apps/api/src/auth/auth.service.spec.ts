import { createHash, createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  IdentityVerificationStatus,
  IdentityVerificationLevel,
  UserRole,
  RoleGrantStatus,
  MembershipStatus,
} from '@ktb/shared-types';

import { AuthService } from './auth.service';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthenticationSession } from './entities/authentication-session.entity';
import { User } from '../identity/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { SmsService } from './sms/sms.service';
import { sha256 } from './utils/phone.util';

describe('AuthService', () => {
  let service: AuthService;

  const mockOtpRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSessionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockOrgRepo = {
    findOne: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'AUTH_ALLOW_MOCK_OTP') return 'true';
      if (key === 'OTP_EXPIRY_SECONDS') return 600;
      if (key === 'OTP_MAX_ATTEMPTS') return 3;
      return defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test_secret_key_1234567890123456';
      return '';
    }),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockSmsService = {
    sendOtp: jest.fn().mockResolvedValue(true),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation(async (action) =>
      action({ getRepository: () => mockOtpRepo, query: jest.fn().mockResolvedValue([]) }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(OtpChallenge), useValue: mockOtpRepo },
        { provide: getRepositoryToken(AuthenticationSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SmsService, useValue: mockSmsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.each(['request', 'verify'])(
    'blocks legacy OTP %s without explicit QA opt-in',
    async (action) => {
      mockConfigService.get
        .mockImplementationOnce(() => 'development')
        .mockImplementationOnce(() => 'false');
      const result =
        action === 'request'
          ? service.requestOtp({ phone: '9876543210' })
          : service.verifyOtp({ phone: '9876543210', code: '123456' });
      await expect(result).rejects.toThrow('Legacy SMS sign-in is disabled');
      expect(mockOtpRepo.findOne).not.toHaveBeenCalled();
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    },
  );

  describe('requestOtp', () => {
    it('should throw BadRequestException for invalid phone format', async () => {
      await expect(service.requestOtp({ phone: 'invalid123' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw 429 when recent challenge exists within cooldown', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(service.requestOtp({ phone: '9876543210' })).rejects.toThrow(HttpException);
    });

    it('should create challenge, call SMS service, and record audit event', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce(null);
      mockOtpRepo.create.mockImplementation((dto) => dto);
      mockOtpRepo.save.mockImplementation((c) => Promise.resolve({ id: 'c-1', ...c }));

      const res = await service.requestOtp({ phone: '9876543210' });

      expect(res.success).toBe(true);
      expect(mockOtpRepo.create).toHaveBeenCalled();
      expect(mockOtpRepo.save).toHaveBeenCalled();
      expect(mockSmsService.sendOtp).toHaveBeenCalledWith('+919876543210', expect.any(String));
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'OTP_REQUESTED' }),
      );
    });
  });

  describe('verifyOtp', () => {
    it('allows only one concurrent verification of the same challenge', async () => {
      let stored = {
        id: 'challenge',
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('123456'),
        consumedAt: null as Date | null,
      };
      mockOtpRepo.findOne.mockImplementation(async () =>
        stored.consumedAt ? null : { ...stored },
      );
      mockOtpRepo.save.mockImplementation(async (challenge) => {
        await Promise.resolve();
        stored = { ...challenge };
        return challenge;
      });
      // Simulate a transaction lock: the second reader observes the committed claim.
      let pending: Promise<unknown> = Promise.resolve();
      mockDataSource.transaction.mockImplementation((action) => {
        const next = pending.then(() =>
          action({ getRepository: () => mockOtpRepo, query: jest.fn().mockResolvedValue([]) }),
        );
        pending = next.catch(() => undefined);
        return next;
      });
      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          id: 'existing-user',
          phoneE164: '+919876543210',
          status: AccountStatus.ACTIVE,
        }),
      });
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockMembershipRepo.createQueryBuilder.mockReturnValue(qb);
      mockSessionRepo.create.mockImplementation((dto) => ({ id: 'session', ...dto }));
      mockSessionRepo.save.mockImplementation(async (session) => session);
      const results = await Promise.allSettled([
        service.verifyOtp({ phone: '9876543210', code: '123456' }),
        service.verifyOtp({ phone: '9876543210', code: '123456' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockOtpRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('should throw BadRequestException if no active challenge exists', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.verifyOtp({ phone: '9876543210', code: '123456' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if maximum attempts exceeded', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce({
        attemptCount: 3,
        maxAttempts: 3,
        codeHash: sha256('123456'),
      });

      await expect(service.verifyOtp({ phone: '9876543210', code: '123456' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException on wrong code', async () => {
      const challenge = {
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('654321'),
      };
      mockOtpRepo.findOne.mockResolvedValueOnce(challenge);
      mockOtpRepo.save.mockResolvedValueOnce(challenge);

      await expect(service.verifyOtp({ phone: '9876543210', code: '111111' })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(challenge.attemptCount).toBe(1);
      expect(mockOtpRepo.save).toHaveBeenCalledWith(challenge);
    });

    it('should provision new user, wallet, and identity on valid first verification', async () => {
      const challenge = {
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('123456'),
        consumedAt: null as Date | null,
      };
      mockOtpRepo.findOne.mockResolvedValueOnce(challenge);
      mockOtpRepo.save.mockResolvedValue(challenge);

      const mockTransactionalUserRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto) => ({ id: 'new-user-id', ...dto })),
        save: jest.fn((user) => Promise.resolve(user)),
      };
      const mockTransactionalIdentityRepo = {
        create: jest.fn((dto) => ({ id: 'new-identity-id', ...dto })),
        save: jest.fn((identity) => Promise.resolve(identity)),
      };
      const mockTransactionalWalletRepo = {
        create: jest.fn((dto) => ({ id: 'new-wallet-id', ...dto })),
        save: jest.fn((wallet) => Promise.resolve(wallet)),
      };

      mockQueryRunner.manager.getRepository.mockImplementation((entity) => {
        if (entity === User) return mockTransactionalUserRepo;
        if (entity.name === 'VerifiedIdentity') return mockTransactionalIdentityRepo;
        if (entity.name === 'UniversalTimeWallet') return mockTransactionalWalletRepo;
        return null;
      });

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockMembershipRepo.createQueryBuilder.mockReturnValue(qb);

      mockSessionRepo.create.mockImplementation((dto) => ({ id: 'sess-1', ...dto }));
      mockSessionRepo.save.mockImplementation((s) => Promise.resolve(s));

      const res = await service.verifyOtp({ phone: '9876543210', code: '123456' });

      expect(res.accessToken).toBe('mock.jwt.token');
      expect(res.user.id).toBe('new-user-id');
      expect(res.user.phoneE164).toBe('+919876543210');
      expect(res.verifiedIdentity?.verificationStatus).toBe(IdentityVerificationStatus.UNVERIFIED);
      expect(res.universalWallet?.balanceCredits).toBe(0);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'IDENTITY_REGISTERED' }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'AUTH_LOGIN' }),
      );
    });

    it('gives a suspended person a sign-in that can only appeal', async () => {
      const challenge = {
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('123456'),
        consumedAt: null as Date | null,
      };
      mockOtpRepo.findOne.mockResolvedValueOnce(challenge);
      mockOtpRepo.save.mockResolvedValue(challenge);

      const mockTransactionalUserRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-suspended',
          phoneE164: '+919876543210',
          status: AccountStatus.SUSPENDED,
        }),
      };
      mockQueryRunner.manager.getRepository.mockReturnValue(mockTransactionalUserRepo);
      mockSessionRepo.create.mockReturnValue({ id: 'sess-restricted' });
      mockSessionRepo.save.mockResolvedValue({ id: 'sess-restricted' });

      const session = await service.verifyOtp({ phone: '9876543210', code: '123456' });

      expect(session.accountRestricted).toBe(true);
      expect(session.roles).toEqual([]);
      expect(session.isSuperAdmin).toBe(false);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'RESTRICTED', roles: [], isSuperAdmin: false }),
      );
    });

    it('still refuses a closed account', async () => {
      const challenge = {
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('123456'),
        consumedAt: null as Date | null,
      };
      mockOtpRepo.findOne.mockResolvedValueOnce(challenge);
      mockOtpRepo.save.mockResolvedValue(challenge);
      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          id: 'user-closed',
          phoneE164: '+919876543210',
          status: AccountStatus.DECEASED_CLOSED,
        }),
      });

      await expect(service.verifyOtp({ phone: '9876543210', code: '123456' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('gives a duplicate account only a limited session, so its owner can appeal', async () => {
      const challenge = {
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        maxAttempts: 3,
        codeHash: sha256('123456'),
        consumedAt: null as Date | null,
      };
      mockOtpRepo.findOne.mockResolvedValueOnce(challenge);
      mockOtpRepo.save.mockResolvedValue(challenge);
      mockQueryRunner.manager.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          id: 'user-duplicate',
          phoneE164: '+919876543210',
          status: AccountStatus.DUPLICATE_CLOSED,
        }),
      });

      await expect(service.verifyOtp({ phone: '9876543210', code: '123456' })).resolves.toMatchObject(
        { accountRestricted: true },
      );
    });
  });

  describe('refreshToken', () => {
    it('should throw UnauthorizedException if session is invalid or revoked', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.refreshToken({ refreshToken: 'invalid-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should issue new access token for valid session', async () => {
      const session = {
        id: 'sess-1',
        user: { id: 'user-1', phoneE164: '+919876543210', status: AccountStatus.ACTIVE },
        activeOrgId: null,
        refreshTokenHash: createHash('sha256').update('valid-token').digest('hex'),
      };
      mockSessionRepo.findOne.mockResolvedValueOnce(session);

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockMembershipRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.refreshToken({ refreshToken: 'valid-token' });

      expect(res.accessToken).toBe('mock.jwt.token');
      expect(res.expiresIn).toBe(900);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'AUTH_TOKEN_REFRESHED' }),
      );
    });

    describe('rotation', () => {
      const activeUser = { id: 'user-1', phoneE164: '+919876543210', status: AccountStatus.ACTIVE };
      const hash = (token: string) => createHash('sha256').update(token).digest('hex');
      const replacementFor = (token: string) =>
        createHmac('sha256', 'test_secret_key_1234567890123456')
          .update(`refresh:sess-1:${token}`)
          .digest('hex');

      beforeEach(() => {
        mockMembershipRepo.createQueryBuilder.mockReturnValue({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        });
      });

      it('replaces the token and remembers the old one', async () => {
        mockSessionRepo.findOne.mockResolvedValueOnce({
          id: 'sess-1',
          user: activeUser,
          activeOrgId: null,
          refreshTokenHash: hash('current'),
        });

        const res = await service.refreshToken({ refreshToken: 'current' });

        expect(res.refreshToken).toEqual(expect.any(String));
        expect(res.refreshToken).not.toBe('current');
        expect(mockSessionRepo.update).toHaveBeenCalledWith(
          { id: 'sess-1', refreshTokenHash: hash('current') },
          expect.objectContaining({
            refreshTokenHash: hash(res.refreshToken!),
            previousRefreshTokenHash: hash('current'),
          }),
        );
      });

      it('gives a retry the same replacement, so a lost reply does not sign the phone out', async () => {
        mockSessionRepo.findOne.mockResolvedValueOnce({
          id: 'sess-1',
          user: activeUser,
          activeOrgId: null,
          refreshTokenHash: hash(replacementFor('current')),
          previousRefreshTokenHash: hash('current'),
          rotatedAt: new Date(Date.now() - 2 * 60 * 1000),
        });

        const res = await service.refreshToken({ refreshToken: 'current' });

        expect(res.accessToken).toBe('mock.jwt.token');
        expect(res.refreshToken).toBe(replacementFor('current'));
        expect(mockSessionRepo.update).not.toHaveBeenCalled();
      });

      it('gives two requests with the same token the same replacement', async () => {
        const session = {
          id: 'sess-1',
          user: activeUser,
          activeOrgId: null,
          refreshTokenHash: hash('current'),
        };
        mockSessionRepo.findOne.mockResolvedValueOnce({ ...session });
        mockSessionRepo.findOne.mockResolvedValueOnce({ ...session });

        const first = await service.refreshToken({ refreshToken: 'current' });
        const second = await service.refreshToken({ refreshToken: 'current' });

        expect(first.refreshToken).toBe(second.refreshToken);
      });

      it('ends the session when an old token comes back later', async () => {
        mockSessionRepo.findOne.mockResolvedValueOnce({
          id: 'sess-1',
          user: activeUser,
          activeOrgId: null,
          refreshTokenHash: hash('newer'),
          previousRefreshTokenHash: hash('stolen'),
          rotatedAt: new Date(Date.now() - 10 * 60 * 1000),
        });

        await expect(service.refreshToken({ refreshToken: 'stolen' })).rejects.toThrow(
          UnauthorizedException,
        );
        expect(mockSessionRepo.update).toHaveBeenCalledWith('sess-1', {
          revokedAt: expect.any(Date),
        });
        expect(mockAuditService.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: 'AUTH_REFRESH_REUSE_DETECTED' }),
        );
      });
    });
  });

  describe('logout', () => {
    it('should revoke session and return success', async () => {
      const session = {
        id: 'sess-1',
        userId: 'user-1',
        revokedAt: null as Date | null,
      };
      mockSessionRepo.findOne.mockResolvedValueOnce(session);
      mockSessionRepo.save.mockResolvedValueOnce(session);

      const res = await service.logout({ refreshToken: 'active-token' });

      expect(res.success).toBe(true);
      expect(session.revokedAt).toBeInstanceOf(Date);
      expect(mockSessionRepo.save).toHaveBeenCalledWith(session);
    });
  });

  describe('getMe', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getMe('missing-user-id')).rejects.toThrow(NotFoundException);
    });

    it('should return user profile with wallet and memberships', async () => {
      const user = {
        id: 'u-1',
        phoneE164: '+919876543210',
        status: AccountStatus.ACTIVE,
        verifiedIdentity: {
          id: 'vi-1',
          verificationStatus: IdentityVerificationStatus.UNVERIFIED,
          verificationLevel: IdentityVerificationLevel.BASIC,
          verifiedAt: null,
        },
        universalWallet: {
          id: 'uw-1',
          balanceCredits: '12.50',
          frozenCredits: '0.00',
          status: 'ACTIVE',
        },
        memberships: [
          {
            id: 'm-1',
            organizationId: 'org-1',
            organization: { code: 'KOTTAKKAL', name: 'Kottakkal Time Bank', branding: null },
            membershipNumber: 'KTB-001',
            status: MembershipStatus.APPROVED,
            appliedAt: new Date(),
            approvedAt: new Date(),
            roleGrants: [{ role: UserRole.VOLUNTEER, status: RoleGrantStatus.ACTIVE }],
          },
        ],
      };
      mockUserRepo.findOne.mockResolvedValueOnce(user);

      const res = await service.getMe('u-1');

      expect(res.id).toBe('u-1');
      expect(res.universalWallet?.balanceCredits).toBe(12.5);
      expect(res.memberships).toHaveLength(1);
      expect(res.memberships[0]?.roles).toContain(UserRole.VOLUNTEER);
    });
  });
});
