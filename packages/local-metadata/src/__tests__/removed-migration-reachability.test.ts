import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe('Local Metadata migration retirement', () => {
  it('keeps migration contracts, registries, and state converters outside product reachability', () => {
    const contracts = read('contracts.ts');
    const publicIndex = read('index.ts');
    const sqliteStore = read('sqlite/sqlite-local-metadata-store.ts');

    expect(contracts).not.toContain('LocalMetadataMigration');
    expect(contracts).not.toContain('migrateNamespace');
    expect(sqliteStore).not.toContain('schema_migrations');
    expect(sqliteStore).not.toContain('migrateNamespace');
    expect(publicIndex).not.toContain('desktop-state-migration');
    expect(publicIndex).not.toContain('versioned-json-state-repository');
    expect(read('node.ts')).not.toContain('node-resource-cache-manifest-migration');
    expect(existsSync(join(sourceRoot, 'desktop-state-migration.ts'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'versioned-json-state-repository.ts'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'node-resource-cache-manifest-migration.ts'))).toBe(false);
  });

  it('uses stable table initialization without migration metadata', () => {
    for (const file of [
      'sqlite/agent-state-schema.ts',
      'sqlite/asset-library-membership-schema.ts',
      'sqlite/catalog-projection-schema.ts',
      'sqlite/entity-asset-projection-schema.ts',
      'sqlite/m1-schema.ts',
      'sqlite/media-metadata-schema.ts',
      'sqlite/resource-cache-schema.ts',
      'sqlite/search-projection-schema.ts',
    ]) {
      const source = read(file);
      expect(source).toContain('initializeLocalMetadataTables');
      expect(source).not.toContain('checksum');
      expect(source).not.toContain('destructive');
      expect(source).not.toContain('namespace:');
      expect(source).not.toContain('_MIGRATIONS');
    }
  });
});

function read(relativePath: string): string {
  return readFileSync(join(sourceRoot, relativePath), 'utf8');
}
