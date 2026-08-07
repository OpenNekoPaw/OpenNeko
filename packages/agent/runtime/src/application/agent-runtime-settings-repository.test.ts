import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createAgentRuntimeSettingsAuthority,
  createAgentRuntimeSettingsRepository,
} from './agent-runtime-settings-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent runtime settings repository', () => {
  it('retains UI-managed settings across database reopen', async () => {
    const fixture = await createFixture();
    const firstRepository = createAgentRuntimeSettingsRepository({
      metadataStore: fixture.store,
      scopeId: 'assistant-space:local-user',
    });
    const first = await createAgentRuntimeSettingsAuthority({
      scopeId: 'assistant-space:local-user',
      repository: firstRepository,
    });
    await first.commit({
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-5',
      executionMode: 'ask',
      temperature: 0.4,
      maxTokens: 4096,
    });
    await fixture.store.dispose();

    const reopenedStore = createNodeSqliteLocalMetadataStore({ homedir: fixture.root });
    await reopenedStore.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    const reopened = await createAgentRuntimeSettingsAuthority({
      scopeId: 'assistant-space:local-user',
      repository: createAgentRuntimeSettingsRepository({
        metadataStore: reopenedStore,
        scopeId: 'assistant-space:local-user',
      }),
    });

    expect(reopened.snapshot()).toEqual({
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-5',
      executionMode: 'ask',
      temperature: 0.4,
      maxTokens: 4096,
    });
    expect(reopened.diagnostic()).toBeUndefined();
    await reopenedStore.dispose();
  });

  it('isolates an invalid settings record to its exact scope until explicit reset', async () => {
    const fixture = await createFixture();
    const invalidRepository = createAgentRuntimeSettingsRepository({
      metadataStore: fixture.store,
      scopeId: 'assistant-space:invalid',
    });
    await invalidRepository.prepare();
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'inject-invalid-agent-settings' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO agent_runtime_settings(scope_id, settings_json, updated_at)
           VALUES (?, ?, ?)`,
          ['assistant-space:invalid', '{"maxTokens":0}', new Date().toISOString()],
        );
      },
    );

    const invalid = await createAgentRuntimeSettingsAuthority({
      scopeId: 'assistant-space:invalid',
      repository: invalidRepository,
    });
    const valid = await createAgentRuntimeSettingsAuthority({
      scopeId: 'assistant-space:valid',
      repository: createAgentRuntimeSettingsRepository({
        metadataStore: fixture.store,
        scopeId: 'assistant-space:valid',
      }),
    });

    expect(invalid.snapshot()).toEqual({});
    expect(invalid.diagnostic()).toEqual(
      expect.objectContaining({
        authority: 'neko.db#agent.runtime-settings:assistant-space:invalid',
      }),
    );
    await expect(invalid.commit({ executionMode: 'plan' })).rejects.toThrow(
      "Agent runtime settings 'assistant-space:invalid' were rejected",
    );
    await valid.commit({ executionMode: 'auto' });
    expect(valid.snapshot()).toEqual({ executionMode: 'auto' });

    await invalid.reset();
    await invalid.commit({ executionMode: 'plan' });
    expect(invalid.snapshot()).toEqual({ executionMode: 'plan' });
    await fixture.store.dispose();
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly databasePath: string;
  readonly store: ReturnType<typeof createNodeSqliteLocalMetadataStore>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-settings-'));
  roots.push(root);
  const databasePath = join(root, '.neko', 'neko.db');
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  return { root, databasePath, store };
}
