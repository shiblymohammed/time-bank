import { DataSource, QueryRunner } from 'typeorm';
import * as path from 'path';
import { Foundation1729118400001 } from './migrations/1729118400001-Foundation';
import { IdentityAndOrganizations1729118400002 } from './migrations/1729118400002-IdentityAndOrganizations';
import { ServiceCatalogueAndRequests1729118400003 } from './migrations/1729118400003-ServiceCatalogueAndRequests';
import { OperationalZonesAndMatchingRounds1729118400004 } from './migrations/1729118400004-OperationalZonesAndMatchingRounds';

describe('entity and migration schema contract', () => {
  it('defines every mapped entity column in the migration SQL', async () => {
    const queries: string[] = [];
    const runner = {
      query: async (sql: string) => {
        queries.push(sql);
        return [];
      },
    } as unknown as QueryRunner;
    for (const migration of [
      new Foundation1729118400001(),
      new IdentityAndOrganizations1729118400002(),
      new ServiceCatalogueAndRequests1729118400003(),
      new OperationalZonesAndMatchingRounds1729118400004(),
    ]) {
      await migration.up(runner);
    }
    const tables = new Map<string, Set<string>>();
    for (const sql of queries) {
      const create = /CREATE TABLE "([^"]+)"\s*\(([\s\S]*)\)/.exec(sql);
      if (create)
        tables.set(
          create[1]!,
          new Set([...create[2]!.matchAll(/^\s*"([^"]+)"\s+/gm)].map((m) => m[1]!)),
        );
      const alter = /ALTER TABLE "([^"]+)"/.exec(sql);
      if (alter)
        for (const column of sql.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"([^"]+)"/g)) {
          tables.get(alter[1]!)?.add(column[1]!);
        }
    }
    const source = new DataSource({
      type: 'postgres',
      entities: [path.join(__dirname, '../**/*.entity.ts')],
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    expect(source.entityMetadatas).toHaveLength(30);
    for (const entity of source.entityMetadatas) {
      expect(tables.has(entity.tableName)).toBe(true);
      for (const column of entity.columns) {
        expect({
          table: entity.tableName,
          missingColumn: tables.get(entity.tableName)?.has(column.databaseName)
            ? null
            : column.databaseName,
        }).toEqual({ table: entity.tableName, missingColumn: null });
      }
    }
  });
});
