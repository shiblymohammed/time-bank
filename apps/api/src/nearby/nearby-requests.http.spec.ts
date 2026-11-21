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
import { NearbyRequestsController } from './nearby-requests.controller';
import { NearbyRequestsService } from './nearby-requests.service';

const org = '00000000-0000-4000-8000-000000000001';
const area = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
describe('Nearby request feed HTTP boundaries', () => {
  let app: INestApplication;
  const nearby = {
    list: jest.fn(async () => ({ items: [], canBrowse: true })),
    image: jest.fn(async () => Buffer.from('jpeg')),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NearbyRequestsController],
      providers: [
        NearbySessionGuard,
        { provide: NearbyRequestsService, useValue: nearby },
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
  const root = `/api/organizations/${org}/community/nearby/requests`;
  it('requires a real active session and same-organization access for list and images', async () => {
    for (const suffix of [
      '',
      '/abcdefabcdefabcdefabcdef/photo',
      '/abcdefabcdefabcdefabcdef/member-photo',
    ]) {
      await request(app.getHttpServer())
        .get(root + suffix)
        .expect(401);
      await request(app.getHttpServer())
        .get(root + suffix)
        .auth('expired', { type: 'bearer' })
        .expect(401);
      await request(app.getHttpServer())
        .get(root.replace(org, area) + suffix)
        .auth('active', { type: 'bearer' })
        .expect(403);
    }
    expect(nearby.list).not.toHaveBeenCalled();
    expect(nearby.image).not.toHaveBeenCalled();
  });
  it.each([
    'offset=-1',
    'offset=1.5',
    'offset=10001',
    'category=invalid',
    'sort=random',
    'when=forever',
    'userId=someone',
    'q=' + 'x'.repeat(101),
  ])('validates feed filters: %s', async (query) => {
    await request(app.getHttpServer())
      .get(root + '?' + query)
      .auth('active', { type: 'bearer' })
      .expect(400);
    expect(nearby.list).not.toHaveBeenCalled();
  });
  it('accepts bounded filters and keeps responses out of shared caches', async () => {
    await request(app.getHttpServer())
      .get(root + '?offset=20&sort=newest&when=today&ward=14')
      .auth('active', { type: 'bearer' })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(nearby.list).toHaveBeenCalledWith(
      org,
      'user',
      expect.objectContaining({ offset: 20, sort: 'newest', when: 'today', ward: '14' }),
    );
  });
  it('serves protected JPEG bytes with no-store and nosniff', async () => {
    await request(app.getHttpServer())
      .get(root + '/abcdefabcdefabcdefabcdef/photo')
      .auth('active', { type: 'bearer' })
      .expect(200)
      .expect('Content-Type', /image\/jpeg/)
      .expect('Cache-Control', 'private, no-store')
      .expect('X-Content-Type-Options', 'nosniff');
    expect(nearby.image).toHaveBeenCalledWith(org, 'user', 'abcdefabcdefabcdefabcdef', 'request');
  });
});
