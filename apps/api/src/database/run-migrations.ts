/* eslint-disable no-console */
/**
 * run-migrations.ts
 *
 * Standalone migration runner for production deployments.
 *
 * This script is compiled to `dist/database/run-migrations.js` and run as a
 * one-shot container in the deploy pipeline BEFORE the API container starts:
 *
 *   docker run --rm \
 *     --env DATABASE_URL=... \
 *     ghcr.io/<repo>/api:<IMAGE_TAG> \
 *     node apps/api/dist/database/run-migrations.js
 *
 * Exits with code 0 on success, non-zero on failure.
 * Designed to be idempotent — safe to run multiple times (TypeORM skips
 * already-applied migrations).
 *
 * NFR-17: Versioned migrations with rollback plans.
 * NFR-05: Database must be recoverable — take a backup before running in production.
 */

import { DataSource } from 'typeorm';
import * as path from 'path';

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    console.error('[migrate] ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: process.env['DATABASE_SSL'] === 'true' ? { rejectUnauthorized: true } : false,
    // Point at compiled JS migration files — this runner is always used from the built dist/
    migrations: [path.resolve(__dirname, './migrations/[0-9]*{.js}')],
    entities: [],       // Not needed for migration runner
    synchronize: false, // NFR-17: never auto-sync
    logging: true,
  });

  console.log('[migrate] Initializing database connection...');
  await dataSource.initialize();

  try {
    const pending = await dataSource.showMigrations();
    if (!pending) {
      console.log('[migrate] No pending migrations. Database schema is up to date.');
    } else {
      console.log('[migrate] Running pending migrations...');
      const ran = await dataSource.runMigrations({ transaction: 'each' });
      console.log(`[migrate] Successfully ran ${ran.length} migration(s):`);
      for (const m of ran) {
        console.log(`  ✓ ${m.name}`);
      }
    }
  } finally {
    await dataSource.destroy();
    console.log('[migrate] Database connection closed.');
  }
}

runMigrations().catch((err: unknown) => {
  console.error('[migrate] FATAL: Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
