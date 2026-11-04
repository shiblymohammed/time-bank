import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { IdempotencyInterceptor } from './offline/idempotency.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // ─── Security headers (NFR-08, NFR-18) ───────────────────────────────
  // helmet sets sane HTTP security headers in production.
  // ContentSecurityPolicy disabled for dev (Swagger UI inline scripts).
  if (nodeEnv === 'production') {
    app.use(helmet());
  } else {
    app.use(helmet({ contentSecurityPolicy: false }));
  }

  // ─── Versioning (URI strategy: /api/v1/...) ──────────────────────────
  // NFR-01: Versioned APIs allow safe incremental rollout across milestones
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
  app.setGlobalPrefix('api');

  // ─── Validation pipe ─────────────────────────────────────────────────
  // class-validator strips unknown properties and transforms types
  // Critical: prevents mass-assignment vulnerabilities in DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ─── Idempotency interceptor (FR-OFF-03, NFR-11) ─────────────────────
  // Reads X-Client-Operation-Id / X-Idempotency-Key headers and injects
  // them into the request body so all mutation DTOs get idempotency for free.
  app.useGlobalInterceptors(new IdempotencyInterceptor());

  // ─── CORS ────────────────────────────────────────────────────────────
  // NFR-08: Allow only known origins in production
  const allowedOrigins = configService.get<string>('API_BASE_URL', 'http://localhost:3000');
  app.enableCors({
    origin: nodeEnv === 'production' ? allowedOrigins : true,
    credentials: true,
  });

  // ─── Swagger / OpenAPI ───────────────────────────────────────────────
  // Not served in production (avoids exposing internal API surface)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Kottakkal Time Bank API')
      .setDescription(
        'Internal API for the Kottakkal Time Bank platform.\n\n' +
          '**Not a public API.** Authentication required for all non-health endpoints.\n\n' +
          'PRD reference: NFR-01 (versioned APIs), D#95 (NestJS + TypeScript + PostgreSQL)',
      )
      .setVersion('1')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.warn(`[KTB API] Listening on port ${port} (${nodeEnv})`);

  if (nodeEnv !== 'production') {
    console.warn(`[KTB API] Swagger docs: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
