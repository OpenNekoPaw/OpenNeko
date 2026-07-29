import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATE_LAYOUT,
  STATE_LAYOUT_MARKER_KEY,
  STATE_LAYOUT_SCHEMA,
  verifyStateLayout,
  validateStateLayout,
  type StateLayoutEntry,
} from './state-layout.ts';

test('preserves the six historical memento prefixes and global-storage paths exactly', () => {
  assert.deepEqual(
    STATE_LAYOUT.map((entry) => ({
      feature: entry.feature,
      prefix: entry.workspaceMementoPrefix,
      storage: entry.globalStorageSegments.join('/'),
      disposition: entry.disposition,
    })),
    [
      {
        feature: 'tools',
        prefix: 'neko.neko-tools:',
        storage: 'features/neko.neko-tools',
        disposition: 'identity-reuse',
      },
      {
        feature: 'preview',
        prefix: 'neko.neko-preview:',
        storage: 'features/neko.neko-preview',
        disposition: 'identity-reuse',
      },
      {
        feature: 'assets',
        prefix: 'neko.neko-assets:',
        storage: 'features/neko.neko-assets',
        disposition: 'identity-reuse',
      },
      {
        feature: 'cut',
        prefix: 'neko.neko-cut:',
        storage: 'features/neko.neko-cut',
        disposition: 'identity-reuse',
      },
      {
        feature: 'canvas',
        prefix: 'neko.neko-canvas:',
        storage: 'features/neko.neko-canvas',
        disposition: 'identity-reuse',
      },
      {
        feature: 'agent',
        prefix: 'neko.neko-agent:',
        storage: 'features/neko.neko-agent',
        disposition: 'identity-reuse',
      },
    ],
  );
});

test('records the version marker only after a clean layout validates', async () => {
  const memento = createMemento();
  assert.equal(await verifyStateLayout(memento), 'recorded');
  assert.deepEqual(memento.values.get(STATE_LAYOUT_MARKER_KEY), {
    schema: STATE_LAYOUT_SCHEMA,
    version: 1,
  });
  assert.equal(await verifyStateLayout(memento), 'already-current');
  assert.equal(memento.updates, 1);
});

test('rejects destination marker conflict without overwriting source state', async () => {
  const memento = createMemento(
    new Map<string, unknown>([
      [STATE_LAYOUT_MARKER_KEY, { schema: 'future-layout', version: 2 }],
      ['unrelated-user-state', { token: 'must-stay-private' }],
    ]),
  );
  await assert.rejects(() => verifyStateLayout(memento), /malformed or incompatible/u);
  assert.deepEqual(memento.values.get('unrelated-user-state'), {
    token: 'must-stay-private',
  });
  assert.equal(memento.updates, 0);
});

test('rejects malformed or conflicting mappings before committing a marker', async () => {
  const memento = createMemento();
  const malformed: readonly StateLayoutEntry[] = [
    ...STATE_LAYOUT.slice(0, -1),
    {
      ...STATE_LAYOUT.at(-1)!,
      workspaceMementoPrefix: 'neko.neko-tools:',
    },
  ];
  await assert.rejects(() => verifyStateLayout(memento, malformed), /prefix mismatch for agent/u);
  assert.equal(memento.values.has(STATE_LAYOUT_MARKER_KEY), false);

  const duplicate = [...STATE_LAYOUT.slice(0, -1), STATE_LAYOUT[0]!];
  assert.throws(() => validateStateLayout(duplicate), /Duplicate state-layout feature owner/u);
});

test('an interrupted marker write preserves source state and succeeds on retry', async () => {
  const memento = createMemento(
    new Map([['neko.neko-agent:neko.tabState', { activeTab: 'chat' }]]),
  );
  memento.failNextUpdate = true;

  await assert.rejects(() => verifyStateLayout(memento), /simulated interruption/u);
  assert.deepEqual(memento.values.get('neko.neko-agent:neko.tabState'), {
    activeTab: 'chat',
  });
  assert.equal(memento.values.has(STATE_LAYOUT_MARKER_KEY), false);

  assert.equal(await verifyStateLayout(memento), 'recorded');
  assert.deepEqual(memento.values.get('neko.neko-agent:neko.tabState'), {
    activeTab: 'chat',
  });
});

test('diagnostics identify only layout metadata and never include stored values', async () => {
  const secretValue = 'sk-sensitive-value';
  const memento = createMemento(
    new Map([
      [STATE_LAYOUT_MARKER_KEY, { schema: 'invalid', version: secretValue }],
      ['credential', secretValue],
    ]),
  );
  let diagnostic = '';
  try {
    await verifyStateLayout(memento);
    assert.fail('Expected the incompatible marker to fail.');
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    diagnostic = error.message;
  }
  assert.doesNotMatch(diagnostic, new RegExp(secretValue, 'u'));
  assert.match(diagnostic, new RegExp(STATE_LAYOUT_MARKER_KEY, 'u'));
});

function createMemento(initial = new Map<string, unknown>()) {
  const values = new Map(initial);
  return {
    values,
    updates: 0,
    failNextUpdate: false,
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    async update(key: string, value: unknown): Promise<void> {
      this.updates += 1;
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        throw new Error('simulated interruption');
      }
      values.set(key, value);
    },
  };
}
