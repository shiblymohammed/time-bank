import { AppDataSource } from './data-source';

/**
 * Applies pending migrations from the compiled production image, which has no TypeORM CLI or
 * TypeScript sources. Each migration runs in its own transaction, and any failure stops the deploy.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const applied = await AppDataSource.runMigrations({ transaction: 'each' });
    console.warn(`[KTB migrations] Applied ${applied.length} pending migration(s).`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[KTB migrations] Failed', error);
  process.exitCode = 1;
});
