import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { UserRole } from '@ktb/shared-types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { LoyaltyController, CentralLoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { MerchantsController } from '../merchants/merchants.controller';
import { MerchantsService } from '../merchants/merchants.service';

const org = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const secret = 'disposable-m6-http-test-secret';
describe('M6 signed HTTP and input boundaries', () => {
  let app: INestApplication;
  const jwt = new JwtService();
  const loyalty = {
    wallet: jest.fn(async () => ({ balanceCoins: 80 })),
    setPolicy: jest.fn(async () => ({ version: '1' })),
    certificate: jest.fn(async () => ({
      bytes: Buffer.from('%PDF-1.4 private'),
      contentType: 'application/pdf',
      fileName: 'recognition.pdf',
    })),
  };
  const merchants = {
    issue: jest.fn(async () => ({ id: other })),
    consume: jest.fn(async () => ({ status: 'REDEEMED' })),
  };
  const token = (sub: string, extra = {}) => jwt.sign({ sub, ...extra }, { secret });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LoyaltyController, CentralLoyaltyController, MerchantsController],
      providers: [
        { provide: LoyaltyService, useValue: loyalty },
        { provide: MerchantsService, useValue: merchants },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret, NODE_ENV: 'production' }),
        },
        {
          provide: AuthorizationService,
          useValue: {
            evaluateOrganizationAccess: async (user: string, community: string) => {
              if (community !== org || user === 'revoked')
                throw new ForbiddenException('Membership required');
              return {
                userId: user,
                organizationId: community,
                roles: [UserRole.VOLUNTEER],
                isSuperAdmin: false,
              };
            },
            evaluateGlobalAccess: async (user: string) => ({
              roles: user === 'central' ? [UserRole.SUPER_ADMIN] : [],
            }),
          },
        },
        AuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  it('requires a signed active session and ignores forged development headers', async () => {
    const path = `/api/organizations/${org}/loyalty/wallet`;
    await request(app.getHttpServer()).get(path).set('x-user-id', 'member').expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token('revoked')}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token('member', { scope: 'RESTRICTED' })}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token('member')}`)
      .expect(200);
    expect(loyalty.wallet).toHaveBeenCalledWith(org, 'member');
  });
  it('rejects foreign organizations and community-bound tokens before calling the wallet', async () => {
    await request(app.getHttpServer())
      .get(`/api/organizations/${other}/loyalty/wallet`)
      .set('Authorization', `Bearer ${token('member')}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/organizations/${org}/loyalty/wallet`)
      .set('Authorization', `Bearer ${token('member', { appOrg: other })}`)
      .expect(403);
    expect(loyalty.wallet).not.toHaveBeenCalled();
  });
  it('refuses caller-supplied amounts and invalid retry IDs on redemption', async () => {
    const path = `/api/organizations/${org}/loyalty/redemptions`;
    const auth = `Bearer ${token('member')}`;
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', auth)
      .send({ offerId: other, clientOperationId: org, coins: 1, userId: 'someone-else' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', auth)
      .send({ offerId: other, clientOperationId: 'invalid' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', auth)
      .send({ offerId: other, clientOperationId: org })
      .expect(201);
    expect(merchants.issue).toHaveBeenCalledTimes(1);
    expect(merchants.issue).toHaveBeenCalledWith(org, 'member', {
      offerId: other,
      clientOperationId: org,
    });
  });
  it('uses current central authority and validates nested policy values', async () => {
    const path = '/api/admin/loyalty/policies';
    const body = {
      enabled: true,
      coinsPerHour: 60,
      engagementCap: 50,
      campaignCapPerHour: 30,
      milestones: [{ minutes: 60, name: 'One hour', coins: 20 }],
    };
    await request(app.getHttpServer())
      .post(path)
      .set(
        'Authorization',
        `Bearer ${token('member', { roles: ['SUPER_ADMIN'], isSuperAdmin: true })}`,
      )
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token('central')}`)
      .send({ ...body, milestones: [{ minutes: 0, name: 'Invalid', coins: -1 }] })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token('central')}`)
      .send(body)
      .expect(201);
    expect(loyalty.setPolicy).toHaveBeenCalledTimes(1);
  });
  it('returns private certificate bytes and validates its identifier', async () => {
    const path = `/api/organizations/${org}/loyalty/achievements`;
    const auth = `Bearer ${token('member')}`;
    await request(app.getHttpServer())
      .get(`${path}/invalid/certificate`)
      .set('Authorization', auth)
      .expect(400);
    const response = await request(app.getHttpServer())
      .get(`${path}/${other}/certificate`)
      .set('Authorization', auth)
      .expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(loyalty.certificate).toHaveBeenCalledWith(org, 'member', other);
  });
});
