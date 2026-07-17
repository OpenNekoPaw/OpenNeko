import { describe, expect, it } from 'vitest';
import {
  LocalMetadataError,
  validateLocalMetadataMigrationSequence,
  type LocalMetadataMigration,
} from '../contracts';
import { evaluateLocalMetadataCacheQuota } from '../repositories';

function migration(
  overrides: Partial<LocalMetadataMigration> & Pick<LocalMetadataMigration, 'version'>,
): LocalMetadataMigration {
  return {
    namespace: 'core',
    version: overrides.version,
    name: `core-${overrides.version}`,
    checksum: `checksum-${overrides.version}`,
    ownership: 'system',
    destructive: false,
    statements: ['CREATE TABLE example (id TEXT PRIMARY KEY)'],
    ...overrides,
  };
}

describe('local metadata contracts', () => {
  it('accepts a namespaced, strictly increasing migration sequence', () => {
    expect(() =>
      validateLocalMetadataMigrationSequence([
        migration({ version: 1 }),
        migration({ version: 2 }),
      ]),
    ).not.toThrow();
  });

  it('rejects mixed namespaces, non-increasing versions, empty checksums, and empty statements', () => {
    const cases: readonly (readonly LocalMetadataMigration[])[] = [
      [migration({ version: 1 }), migration({ namespace: 'agent', version: 2 })],
      [migration({ version: 2 }), migration({ version: 1 })],
      [migration({ checksum: '', version: 1 })],
      [migration({ statements: [], version: 1 })],
    ];

    for (const migrations of cases) {
      expect(() => validateLocalMetadataMigrationSequence(migrations)).toThrowError(
        expect.objectContaining<Partial<LocalMetadataError>>({ code: 'metadata-migration-failed' }),
      );
    }
  });

  it('computes bounded cache reclamation without touching state ownership', () => {
    expect(
      evaluateLocalMetadataCacheQuota(
        { maximumBytes: 1_000, targetBytes: 750, orphanRetentionMs: 86_400_000 },
        1_200,
      ),
    ).toEqual({ overBudget: true, reclaimBytes: 450 });
    expect(
      evaluateLocalMetadataCacheQuota(
        { maximumBytes: 1_000, targetBytes: 750, orphanRetentionMs: 86_400_000 },
        900,
      ),
    ).toEqual({ overBudget: false, reclaimBytes: 0 });
  });
});
