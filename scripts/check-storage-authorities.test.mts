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

  it('rejects the retired first-submit Agent lifecycle while allowing DSH catalog metadata', () => {
    assert.deepEqual(
      validateRetiredAgentStorageSources({
        'old-schema.ts':
          'CREATE TABLE IF NOT EXISTS agent_conversation_records (conversation_id TEXT);',
        'old-service.ts': 'export interface AgentDomainConversationService {}',
        'dsh-catalog.ts':
          'CREATE TABLE IF NOT EXISTS agent_dsh_conversation_catalog (conversation_id TEXT);',
        'context.ts':
          'CREATE TABLE IF NOT EXISTS agent_conversation_authority (conversation_id TEXT);',
      }),
      [
        'old-schema.ts: retired first-submit Agent Conversation SQLite table',
        'old-service.ts: retired first-submit Agent Conversation lifecycle contract',
      ],
    );
  });

  it('rejects retired Pi storage deletion and cleanup services in every production owner', () => {
    assert.deepEqual(
      validateRetiredAgentStorageSources({
        'cleanup.ts': `
          export async function removeRetiredPiStorage() {
            await sql.run('DROP TABLE IF EXISTS pi_messages');
          }
        `,
      }),
      [
        'cleanup.ts: retired Pi table pi_messages must remain byte-preserved',
        'cleanup.ts: retired Pi storage cleanup path must remain deleted',
      ],
    );

    assert.deepEqual(
      validateRetiredAgentStorageSources({
        'renamed-owner.ts': `
          const tables = ['pi_conversations', 'pi_messages'];
          for (const table of tables) await sql.run(\`DROP TABLE IF EXISTS \${table}\`);
        `,
      }),
      [
        'renamed-owner.ts: retired Pi table pi_conversations must remain byte-preserved',
        'renamed-owner.ts: retired Pi table pi_messages must remain byte-preserved',
      ],
    );
  });
});
