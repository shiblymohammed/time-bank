import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { NearbyController } from './nearby.controller';
import { NearbySessionGuard } from './nearby-session.guard';
import { activityRange, coarseCoordinate, NearbyService } from './nearby.service';

const org = '00000000-0000-4000-8000-000000000001';
const area = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
describe('Nearby HTTP boundaries', () => {
  let app: INestApplication;
  const nearby = {
    snapshot: jest.fn(async () => ({ areas: [] })),
    available: jest.fn(async () => ({ areaId: area })),
    stop: jest.fn(async () => ({ availability: null })),
    publish: jest.fn(async () => ({})),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NearbyController],
      providers: [
        NearbySessionGuard,
        { provide: NearbyService, useValue: nearby },
        {
          provide: DataSource,
          useValue: {
            query: async (_sql: string, values: string[]) => (values[0] === session ? [{}] : []),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            id: 'user',
            sessionId: req.headers.authorization === 'Bearer active' ? session : org,
          };
          return true;
        },
      })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({
        canActivate: (context: any) => {
          if (context.switchToHttp().getRequest().params.id !== org) throw new ForbiddenException();
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());
  const root = `/api/organizations/${org}/community`;
  it('requires authentication and a live sign-in on every read', async () => {
    await request(app.getHttpServer()).get(`${root}/nearby`).expect(401);
    await request(app.getHttpServer())
      .get(`${root}/nearby`)
      .auth('expired', { type: 'bearer' })
      .expect(401);
    expect(nearby.snapshot).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get(`${root}/nearby`)
      .auth('active', { type: 'bearer' })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
  });
  it('preserves community guard boundaries', async () => {
    await request(app.getHttpServer())
      .get(`/api/organizations/${area}/community/nearby`)
      .auth('active', { type: 'bearer' })
      .expect(403);
    expect(nearby.snapshot).not.toHaveBeenCalled();
  });
  it.each([
    { areaId: area, minutes: 60 },
    { areaId: area, minutes: 60, consent: false },
    { areaId: area, minutes: 999, consent: true },
    { areaId: area, minutes: '60', consent: true },
    { areaId: 'not-a-uuid', minutes: 60, consent: true },
    { areaId: area, minutes: 60, consent: true, userId: 'another-member' },
  ])('rejects malformed/implicit or body-controlled consent: %j', async (body) => {
    await request(app.getHttpServer())
      .put(`${root}/availability`)
      .auth('active', { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(nearby.available).not.toHaveBeenCalled();
  });
  it.each([15, 30, 60, 120])(
    'accepts explicit %i-minute availability for the authenticated account',
    async (minutes) => {
      await request(app.getHttpServer())
        .put(`${root}/availability`)
        .auth('active', { type: 'bearer' })
        .send({ areaId: area, minutes, consent: true })
        .expect(200);
      expect(nearby.available).toHaveBeenCalledWith(
        org,
        'user',
        session,
        expect.objectContaining({ areaId: area, minutes, consent: true }),
      );
    },
  );
  it('supports explicit withdrawal and validates publication settings', async () => {
    await request(app.getHttpServer())
      .delete(`${root}/availability`)
      .auth('active', { type: 'bearer' })
      .expect(200);
    expect(nearby.stop).toHaveBeenCalledWith(org, 'user');
    await request(app.getHttpServer())
      .put(`${root}/nearby/areas/${area}`)
      .auth('active', { type: 'bearer' })
      .send({ visible: 'true' })
      .expect(400);
  });
});

describe('Coarse Nearby presentation', () => {
  it.each([
    [0, '0'],
    [1, '1-4'],
    [4, '1-4'],
    [5, '5-9'],
    [9, '5-9'],
    [10, '10+'],
    [100, '10+'],
  ])('groups %s as %s', (count, range) => expect(activityRange(Number(count))).toBe(range));
  it('rounds fixed area centres and preserves missing centres', () => {
    expect(coarseCoordinate('10.9982456')).toBe(11);
    expect(coarseCoordinate(75.9921456)).toBe(75.99);
    expect(coarseCoordinate(null)).toBeNull();
  });
});
