import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  LoyaltyCoinTxType,
  MerchantOfferStatus,
  MerchantStatus,
  UserRole,
} from '@ktb/shared-types';

import { LoyaltyService } from './loyalty.service';
import { LoyaltyCoinWallet } from './entities/loyalty-coin-wallet.entity';
import { LoyaltyCoinLedger } from './entities/loyalty-coin-ledger.entity';
import { OrganizationMerchant } from './entities/organization-merchant.entity';
import { MerchantOffer } from './entities/merchant-offer.entity';
import { LoyaltyRedemption } from './entities/loyalty-redemption.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG = 'org-1';
const USER = 'user-1';
const MERCHANT_ID = 'merchant-1';
const OFFER_ID = 'offer-1';
const WALLET_ID = 'wallet-1';

const mockAudit = { logEvent: jest.fn().mockResolvedValue(undefined) };
const mockAuthz = {
  evaluateOrganizationAccess: jest.fn().mockResolvedValue({
    isSuperAdmin: false,
    roles: [UserRole.MUNICIPALITY_ADMIN],
    membershipId: 'mem-1',
  }),
};

function makeWalletRepo(overrides: object = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => ({ id: WALLET_ID, ...e })),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}
function makeLedgerRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => e),
    find: jest.fn().mockResolvedValue([]),
  };
}
function makeMerchantRepo(overrides: object = {}) {
  return {
    findOne: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => ({ id: MERCHANT_ID, ...e })),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}
function makeOfferRepo(overrides: object = {}) {
  return {
    findOne: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => ({ id: OFFER_ID, ...e })),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
    ...overrides,
  };
}
function makeRedemptionRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => ({ id: 'redemption-1', ...e })),
    find: jest.fn().mockResolvedValue([]),
  };
}
function makeMembershipRepo() {
  return { findOne: jest.fn() };
}

const mockDataSource = {
  transaction: jest.fn(async (_iso: string, action: any) =>
    action({
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (_e: any, row: any) => row ?? _e),
      create: jest.fn((_e: any, data: any) => data),
      getRepository: jest.fn(() => ({ findOne: jest.fn() })),
    }),
  ),
};

async function buildService(overrides: {
  wallet?: any;
  ledger?: any;
  merchant?: any;
  offer?: any;
  redemption?: any;
  dataSource?: any;
} = {}) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LoyaltyService,
      { provide: getRepositoryToken(LoyaltyCoinWallet), useValue: overrides.wallet ?? makeWalletRepo() },
      { provide: getRepositoryToken(LoyaltyCoinLedger), useValue: overrides.ledger ?? makeLedgerRepo() },
      { provide: getRepositoryToken(OrganizationMerchant), useValue: overrides.merchant ?? makeMerchantRepo() },
      { provide: getRepositoryToken(MerchantOffer), useValue: overrides.offer ?? makeOfferRepo() },
      { provide: getRepositoryToken(LoyaltyRedemption), useValue: overrides.redemption ?? makeRedemptionRepo() },
      { provide: getRepositoryToken(OrganizationMembership), useValue: makeMembershipRepo() },
      { provide: DataSource, useValue: overrides.dataSource ?? mockDataSource },
      { provide: AuditService, useValue: mockAudit },
      { provide: AuthorizationService, useValue: mockAuthz },
    ],
  }).compile();
  return module.get(LoyaltyService);
}

beforeEach(() => jest.clearAllMocks());

// ─── getOrCreateWallet ────────────────────────────────────────────────────────

describe('LoyaltyService — getOrCreateWallet', () => {
  it('returns existing wallet when found', async () => {
    const existing = { id: WALLET_ID, userId: USER, organizationId: ORG, balanceCoins: 5 };
    const service = await buildService({ wallet: makeWalletRepo({ findOne: jest.fn().mockResolvedValue(existing) }) });
    const result = await service.getOrCreateWallet(USER, ORG);
    expect(result).toBe(existing);
  });

  it('creates a new wallet when none exists', async () => {
    const walletRepo = makeWalletRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ wallet: walletRepo });
    await service.getOrCreateWallet(USER, ORG);
    expect(walletRepo.save).toHaveBeenCalled();
  });
});

// ─── registerMerchant ─────────────────────────────────────────────────────────

describe('LoyaltyService — registerMerchant', () => {
  it('creates merchant in PENDING_APPROVAL status', async () => {
    const merchantRepo = makeMerchantRepo();
    const service = await buildService({ merchant: merchantRepo });
    const result = await service.registerMerchant(
      ORG,
      { merchantName: 'Raj Grocery', phone: '+919876543210', address: '12 Main St' },
      'coordinator-1',
    );
    expect(result.status).toBe(MerchantStatus.PENDING_APPROVAL);
    expect(mockAudit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MERCHANT_REGISTERED' }),
    );
  });

  it('throws ForbiddenException when caller is not staff', async () => {
    mockAuthz.evaluateOrganizationAccess.mockResolvedValueOnce({
      isSuperAdmin: false,
      roles: [UserRole.VOLUNTEER],
    });
    const service = await buildService();
    await expect(
      service.registerMerchant(ORG, { merchantName: 'X', phone: '+919876543210', address: 'Y' }, 'vol-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ─── reviewMerchant ───────────────────────────────────────────────────────────

describe('LoyaltyService — reviewMerchant', () => {
  it('approves merchant and sets approvedBy', async () => {
    const merchant = { id: MERCHANT_ID, organizationId: ORG, status: MerchantStatus.PENDING_APPROVAL };
    const merchantRepo = makeMerchantRepo({ findOne: jest.fn().mockResolvedValue(merchant) });
    const service = await buildService({ merchant: merchantRepo });

    const result = await service.reviewMerchant(ORG, MERCHANT_ID, MerchantStatus.ACTIVE, 'admin-1');
    expect(result.status).toBe(MerchantStatus.ACTIVE);
    expect(result.approvedBy).toBe('admin-1');
  });

  it('throws NotFoundException when merchant not found', async () => {
    const merchantRepo = makeMerchantRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ merchant: merchantRepo });
    await expect(
      service.reviewMerchant(ORG, 'ghost', MerchantStatus.ACTIVE, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── proposeOffer ─────────────────────────────────────────────────────────────

describe('LoyaltyService — proposeOffer', () => {
  const dto = {
    title: '10% off groceries',
    description: 'Show this offer at checkout',
    coinCost: 50,
    validFrom: new Date(Date.now() + 1000).toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  it('creates offer in PENDING_REVIEW status', async () => {
    const merchantRepo = makeMerchantRepo({
      findOne: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: MerchantStatus.ACTIVE }),
    });
    const service = await buildService({ merchant: merchantRepo });
    const result = await service.proposeOffer(ORG, MERCHANT_ID, dto, 'coord-1');
    expect(result.status).toBe(MerchantOfferStatus.PENDING_REVIEW);
    expect(mockAudit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MERCHANT_OFFER_PROPOSED' }),
    );
  });

  it('throws NotFoundException when merchant is not ACTIVE', async () => {
    const merchantRepo = makeMerchantRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ merchant: merchantRepo });
    await expect(
      service.proposeOffer(ORG, MERCHANT_ID, dto, 'coord-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when validUntil is before validFrom', async () => {
    const merchantRepo = makeMerchantRepo({
      findOne: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: MerchantStatus.ACTIVE }),
    });
    const service = await buildService({ merchant: merchantRepo });
    await expect(
      service.proposeOffer(ORG, MERCHANT_ID, {
        ...dto,
        validFrom: new Date(Date.now() + 10_000).toISOString(),
        validUntil: new Date(Date.now() + 1_000).toISOString(),
      }, 'coord-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── reviewOffer ──────────────────────────────────────────────────────────────

describe('LoyaltyService — reviewOffer', () => {
  it('approves a pending offer', async () => {
    const offer = { id: OFFER_ID, organizationId: ORG, status: MerchantOfferStatus.PENDING_REVIEW };
    const offerRepo = makeOfferRepo({ findOne: jest.fn().mockResolvedValue(offer) });
    const service = await buildService({ offer: offerRepo });
    const result = await service.reviewOffer(ORG, OFFER_ID, { status: MerchantOfferStatus.ACTIVE }, 'admin-1');
    expect(result.status).toBe(MerchantOfferStatus.ACTIVE);
  });

  it('rejects an offer with a reason', async () => {
    const offer = { id: OFFER_ID, organizationId: ORG, status: MerchantOfferStatus.PENDING_REVIEW };
    const offerRepo = makeOfferRepo({ findOne: jest.fn().mockResolvedValue(offer) });
    const service = await buildService({ offer: offerRepo });
    const result = await service.reviewOffer(ORG, OFFER_ID, {
      status: MerchantOfferStatus.REJECTED,
      rejectionReason: 'Terms not met',
    }, 'admin-1');
    expect(result.status).toBe(MerchantOfferStatus.REJECTED);
    expect(result.rejectionReason).toBe('Terms not met');
  });

  it('throws BadRequestException when rejecting without a reason', async () => {
    const offer = { id: OFFER_ID, organizationId: ORG, status: MerchantOfferStatus.PENDING_REVIEW };
    const offerRepo = makeOfferRepo({ findOne: jest.fn().mockResolvedValue(offer) });
    const service = await buildService({ offer: offerRepo });
    await expect(
      service.reviewOffer(ORG, OFFER_ID, { status: MerchantOfferStatus.REJECTED }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when offer is already reviewed', async () => {
    const offer = { id: OFFER_ID, organizationId: ORG, status: MerchantOfferStatus.ACTIVE };
    const offerRepo = makeOfferRepo({ findOne: jest.fn().mockResolvedValue(offer) });
    const service = await buildService({ offer: offerRepo });
    await expect(
      service.reviewOffer(ORG, OFFER_ID, { status: MerchantOfferStatus.ACTIVE }, 'admin-1'),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── redeemOffer ──────────────────────────────────────────────────────────────

describe('LoyaltyService — redeemOffer', () => {
  const activeOffer = {
    id: OFFER_ID,
    organizationId: ORG,
    merchantId: MERCHANT_ID,
    title: '10% off',
    coinCost: 50,
    status: MerchantOfferStatus.ACTIVE,
    validFrom: new Date(Date.now() - 1000),
    validUntil: new Date(Date.now() + 60 * 60 * 1000),
    maxRedemptions: null,
    redemptionsCount: 0,
  };

  const activeWallet = {
    id: WALLET_ID,
    userId: USER,
    organizationId: ORG,
    balanceCoins: 100,
    status: 'ACTIVE',
  };

  it('redeems an offer and debits the wallet', async () => {
    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue(activeOffer),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn()
              .mockResolvedValueOnce(activeOffer) // offer lock
              .mockResolvedValueOnce(activeWallet), // wallet lock
          })),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          increment: jest.fn().mockResolvedValue(undefined),
          save: jest.fn(async (_e: any, row: any) => ({ id: 'redemption-1', ...row })),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    const result = await service.redeemOffer(ORG, USER, { offerId: OFFER_ID });

    expect(result.coinsSpent).toBe(activeOffer.coinCost);
    expect(ds.transaction).toHaveBeenCalled();
    expect(mockAudit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'LOYALTY_OFFER_REDEEMED' }),
      expect.anything(),
    );
  });

  it('throws BadRequestException when neither offerId nor code provided', async () => {
    const service = await buildService();
    await expect(service.redeemOffer(ORG, USER, {})).rejects.toThrow(BadRequestException);
  });

  it('throws ForbiddenException when wallet balance is insufficient', async () => {
    const poorWallet = { ...activeWallet, balanceCoins: 10 }; // less than coinCost=50
    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue(activeOffer), // offer lookup via findOne
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(poorWallet), // wallet lock returns poor wallet
          })),
          update: jest.fn(),
          increment: jest.fn(),
          save: jest.fn(),
          create: jest.fn((_e: any, d: any) => d),
        }),
      ),
    };
    const service = await buildService({ dataSource: ds as any });
    await expect(service.redeemOffer(ORG, USER, { offerId: OFFER_ID })).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when offer has reached max redemptions', async () => {
    const fullOffer = { ...activeOffer, maxRedemptions: 5, redemptionsCount: 5 };
    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue(fullOffer),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValueOnce(fullOffer),
          })),
          update: jest.fn(),
          increment: jest.fn(),
          save: jest.fn(),
          create: jest.fn((_e: any, d: any) => d),
        }),
      ),
    };
    const service = await buildService({ dataSource: ds as any });
    await expect(service.redeemOffer(ORG, USER, { offerId: OFFER_ID })).rejects.toThrow(ConflictException);
  });
});

// ─── postServiceEarning ───────────────────────────────────────────────────────

describe('LoyaltyService — postServiceEarning', () => {
  it('credits coins to the wallet for confirmed minutes', async () => {
    const wallet = { id: WALLET_ID, userId: USER, organizationId: ORG, balanceCoins: 0, status: 'ACTIVE' };
    const managerMock = {
      findOne: jest.fn().mockImplementation(async (entity: any) => {
        if (entity?.name === 'LoyaltyCoinLedger') return null; // no existing entry
        if (entity?.name === 'LoyaltyCoinWallet') return wallet;
        return null;
      }),
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(wallet),
        create: jest.fn((d: any) => d),
        save: jest.fn(async (e: any) => e),
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (_e: any, row: any) => row ?? _e),
      create: jest.fn((_e: any, data: any) => data),
    };

    const service = await buildService();
    const result = await service.postServiceEarning(managerMock as any, {
      userId: USER,
      organizationId: ORG,
      serviceRequestId: 'req-1',
      assignmentId: 'assign-1',
      confirmedMinutes: 60,
    });

    expect(result.coinsEarned).toBe(60); // 60 min × 1 coin/min
  });

  it('returns 0 coins for 0 confirmed minutes', async () => {
    const service = await buildService();
    const result = await service.postServiceEarning({} as any, {
      userId: USER,
      organizationId: ORG,
      serviceRequestId: 'req-1',
      assignmentId: 'assign-1',
      confirmedMinutes: 0,
    });
    expect(result.coinsEarned).toBe(0);
  });
});
