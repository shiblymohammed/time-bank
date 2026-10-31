import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Standalone TypeORM DataSource used by the `typeorm` CLI for:
 *   - Running migrations:   pnpm typeorm migration:run -d src/database/data-source.ts
 *   - Reverting migrations: pnpm typeorm migration:revert -d src/database/data-source.ts
 *   - Generating migrations: pnpm typeorm migration:generate -d src/database/data-source.ts
 *
 * This file is NOT used at runtime (AppModule uses TypeOrmModule.forRootAsync).
 * It is only used by the CLI tooling during development.
 *
 * NFR-17: Never auto-synchronize schema. All changes go through migrations.
 */

// Load .env from monorepo root (two directories up from apps/api)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env['DATABASE_URL'] ? { url: process.env['DATABASE_URL'] } : {}),
  entities: [path.resolve(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [path.resolve(__dirname, './migrations/[0-9]*{.ts,.js}')],
  synchronize: false,
});
