import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

@Controller()
class ProbeController {
  @Get('open')
  open() {
    return 'ok';
  }

  @Post('sign-in')
  @Throttle({ default: { limit: () => 1, ttl: 60_000 } })
  signIn() {
    return 'ok';
  }

  @Get('health')
  @SkipThrottle()
  health() {
    return 'ok';
  }
}

describe('API rate limiting', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('answers 429 once a client passes the limit', async () => {
    await request(app.getHttpServer()).get('/open').expect(200);
    await request(app.getHttpServer()).get('/open').expect(200);
    await request(app.getHttpServer()).get('/open').expect(429);
  });

  it('applies the stricter sign-in limit to that route alone', async () => {
    await request(app.getHttpServer()).post('/sign-in').expect(201);
    await request(app.getHttpServer()).post('/sign-in').expect(429);
    await request(app.getHttpServer()).get('/open').expect(200);
  });

  it('never limits health checks', async () => {
    for (let call = 0; call < 5; call += 1) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }
  });
});
