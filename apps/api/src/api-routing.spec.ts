import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { INestApplication, RequestMethod, VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { AuthController } from './auth/auth.controller';
import { AdminController } from './admin/admin.controller';
import { OrganizationsController } from './organizations/organizations.controller';
import { MembershipsController } from './memberships/memberships.controller';
import { CatalogueController } from './catalogue/catalogue.controller';
import { BeneficiariesController } from './beneficiaries/beneficiaries.controller';
import { RequestsController } from './requests/requests.controller';
import { MatchingController } from './matching/matching.controller';
import { AuthService } from './auth/auth.service';
import { AdminService } from './admin/admin.service';
import { OrganizationsService } from './organizations/organizations.service';
import { MembershipsService } from './memberships/memberships.service';
import { CatalogueService } from './catalogue/catalogue.service';
import { BeneficiariesService } from './beneficiaries/beneficiaries.service';
import { RequestsService } from './requests/requests.service';
import { MatchingService } from './matching/matching.service';
import { AuthGuard } from './auth/guards/auth.guard';
import { OrganizationAccessGuard } from './authorization/guards/organization-access.guard';
import { RolesGuard } from './authorization/guards/roles.guard';

const controllers = [
  HealthController,
  AuthController,
  AdminController,
  OrganizationsController,
  MembershipsController,
  CatalogueController,
  BeneficiariesController,
  RequestsController,
  MatchingController,
];
const services = [
  AuthService,
  AdminService,
  OrganizationsService,
  MembershipsService,
  CatalogueService,
  BeneficiariesService,
  RequestsService,
  MatchingService,
];
const uuid = '00000000-0000-4000-8000-000000000001';
const routes = controllers.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype).flatMap((handler) => {
    const fn = (controller.prototype as unknown as Record<string, unknown>)[handler];
    if (typeof fn !== 'function') return [];
    const method = Reflect.getMetadata(METHOD_METADATA, fn);
    if (method === undefined) return [];
    const version = Reflect.getMetadata(VERSION_METADATA, controller);
    const path = [
      '/api',
      version && version !== VERSION_NEUTRAL ? `v${version}` : '',
      Reflect.getMetadata(PATH_METADATA, controller),
      Reflect.getMetadata(PATH_METADATA, fn),
    ]
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/');
    return [
      {
        controller,
        handler,
        method: RequestMethod[method]!.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete',
        path,
      },
    ];
  }),
);

// Exercises the real HTTP router, parameter pipes and controller -> service wiring.
// Database services and guards are replaced: authorization and DTO validation have separate tests.
describe('HTTP route dispatch contracts', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const serviceStub = () =>
      new Proxy(
        {},
        {
          get: (_target, key) => (key === 'then' ? undefined : async () => ({ ok: true })),
        },
      );
    const fixture = Test.createTestingModule({
      controllers,
      providers: [
        ...services.map((provide) => ({ provide, useValue: serviceStub() })),
        { provide: HealthCheckService, useValue: { check: async () => ({ status: 'ok' }) } },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck: async () => ({ database: { status: 'up' } }) },
        },
      ],
    });
    for (const guard of [AuthGuard, OrganizationAccessGuard, RolesGuard]) {
      fixture.overrideGuard(guard).useValue({ canActivate: () => true });
    }
    const module = await fixture.compile();
    for (const route of routes) jest.spyOn(module.get(route.controller), route.handler as never);
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { user?: unknown; organizationMembership?: unknown },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = { id: uuid };
        req.organizationMembership = { membershipId: uuid, roles: [], isSuperAdmin: true };
        next();
      },
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(routes)('$method $path reaches $handler', async (route) => {
    jest.clearAllMocks();
    const url = route.path.replace(/:[^/]+/g, uuid);
    const response = await request(app.getHttpServer())[route.method](url).send({});
    expect(response.status).toBeGreaterThanOrEqual(200);
    if (response.status >= 300) throw new Error(JSON.stringify({ url, body: response.body }));
    expect(
      (app.get(route.controller) as unknown as Record<string, unknown>)[route.handler],
    ).toHaveBeenCalledTimes(1);
  });
});
