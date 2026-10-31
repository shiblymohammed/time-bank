import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { HealthModule } from '../src/health/health.module';

/**
 * E2E test: Health endpoints
 *
 * These tests run against a real PostgreSQL database (provided by CI service
 * or a local Docker Compose instance). They verify the full HTTP stack:
 * NestJS app → TypeORM → PostgreSQL.
 *
 * NFR-16: Automated integration tests
 * UC-30: Health check verification in deployment pipeline
 */
describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url:
            process.env['DATABASE_URL'] ??
            'postgresql://ktb_test:ktb_test_password@localhost:5432/ktb_test',
          entities: [],
          synchronize: false,
        }),
        TerminusModule,
        HealthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health/live', () => {
    it('returns 200 with status ok', async () => {
      const response = await request(app.getHttpServer()).get('/api/health/live').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        environment: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when database is reachable', async () => {
      const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.info?.database?.status).toBe('up');
    });
  });
});
