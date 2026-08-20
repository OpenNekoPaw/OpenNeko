import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NekoStorageClassification } from '../packages/local-metadata/src/storage.ts';
import {
  reportNonCanonicalDatabasePaths,
  validateRetiredAgentStorageSources,
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

  it('rejects every non-canonical SQLite path', () => {
    const findings = reportNonCanonicalDatabasePaths([
      { sourcePath: 'runtime.ts', literal: 'unknown.sqlite' },
    ]);

    assert.deepEqual(findings, ['Non-canonical SQLite path: runtime.ts -> unknown.sqlite']);
  });

  it('rejects the retired generic Conversation SQLite catalog without matching DSH tables', () => {
    assert.deepEqual(
      validateRetiredAgentStorageSources({
        'repositories.ts': 'export interface ConversationCatalogRepository {}',
        'schema.ts': 'CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT);',
        'layout.ts': "const retired = join(root, 'journals');",
        'dsh.ts':
          'CREATE TABLE IF NOT EXISTS agent_conversation_dsh_bindings (conversation_id TEXT);',
      }),
      [
        'repositories.ts: retired generic Conversation SQLite catalog contract',
        'schema.ts: retired generic Conversation SQLite catalog table',
        'layout.ts: retired Pi conversation file layout',
      ],
    );
  });
});
