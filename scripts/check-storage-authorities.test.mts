import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NekoStorageClassification } from '../packages/local-metadata/src/storage.ts';
import {
  reconcileLegacyReaders,
  validateStorageClassifications,
} from './check-storage-authorities.mts';

const validClassification: NekoStorageClassification = {
  id: 'valuable-local-state',
  scope: 'user-global',
  storageClass: 'valuable-local-state',
  metadataOwnership: 'state',
  durability: 'valuable-local-state',
  owner: 'local-metadata-store',
  authorityKind: 'sqlite-state',
  userManagement: 'ui-managed',
  portability: 'machine-local',
  sensitivity: 'non-secret',
  sqliteRole: 'authority',
  deletion: 'owner-controlled',
  retention: 'owner-policy',
  defaultLocation: '~/.neko/neko.db#state',
  tracking: 'outside-workspace',
  cleanup: 'explicit-confirmation',
  migration: 'backup-and-migrate',
  backup: 'required',
};

describe('storage authority quality gate', () => {
  it('rejects secret, raw-log, portable and cache authority violations', () => {
    const findings = validateStorageClassifications([
      { ...validClassification, sensitivity: 'secret' },
      { ...validClassification, storageClass: 'raw-log' },
      { ...validClassification, userManagement: 'user-content' },
      { ...validClassification, authorityKind: 'sqlite-cache' },
    ]);

    assert.ok(findings.some((finding) => finding.includes('secret-store')));
    assert.ok(findings.some((finding) => finding.includes('log-file')));
    assert.ok(findings.some((finding) => finding.includes('user-managed or portable')));
    assert.ok(findings.some((finding) => finding.includes('rebuildable projection')));
  });

  it('rejects unclassified, stale and expired legacy SQLite readers', () => {
    const findings = reconcileLegacyReaders(
      [{ sourcePath: 'runtime.ts', legacyLiteral: 'unknown.sqlite' }],
      {
        version: 1,
        legacyReaders: [
          {
            sourcePath: 'migration.ts',
            legacyLiteral: 'legacy.sqlite',
            owner: '@neko/owner',
            reason: 'migration',
            replacement: 'neko.db',
            validationPath: 'migration.test.ts',
            removalCondition: 'source retired',
            expiresOn: '2026-01-01',
          },
        ],
      },
      { now: Date.parse('2026-08-03T00:00:00Z'), pathExists: () => true },
    );

    assert.ok(findings.some((finding) => finding.includes('Unclassified')));
    assert.ok(findings.some((finding) => finding.includes('Stale')));
    assert.ok(findings.some((finding) => finding.includes('expired')));
  });
});
