import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
  env: { language: 'en' },
  l10n: { t: (message: string) => message },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: () => false }),
  },
}));

import {
  EntityInspectorProvider,
  isInspectorChangeRelated,
  toInspectorEntityRef,
  type EntityInspectorChangeSubscriber,
} from './entityInspectorProvider';

describe('EntityInspectorProvider canonical Entity path', () => {
  it('normalizes retained entity requests onto the canonical Entity source', () => {
    expect(
      toInspectorEntityRef(
        {
          entityId: 'character-1',
          entityKind: 'character',
          projectRoot: '/old-workspace',
          source: 'removed-story-source',
        },
        '/workspace',
      ),
    ).toEqual({
      source: 'neko-entity',
      entityId: 'character-1',
      entityKind: 'character',
      projectRoot: '/workspace',
    });
  });

  it('matches canonical runtime changes without a source-specific row contract', () => {
    expect(
      isInspectorChangeRelated(
        {
          entityId: 'character-1',
          entityKind: 'character',
          projectRoot: '/workspace',
          source: 'neko-entity',
        },
        [
          {
            kind: 'binding',
            id: 'character-1',
            entityRef: {
              entityId: 'character-1',
              entityKind: 'character',
              projectRoot: '/workspace',
            },
          },
        ],
      ),
    ).toBe(true);
  });

  it('refreshes through the canonical Entity runtime subscription', async () => {
    let listener: Parameters<EntityInspectorChangeSubscriber>[1] | undefined;
    const subscription = { dispose: vi.fn() };
    const executeCommand = vi.fn(async () => ({
      entity: {
        id: 'character-1',
        kind: 'character',
        canonicalName: '小橘',
        aliases: [],
        status: 'confirmed',
      },
      candidates: [],
      bindings: [],
      visualDrafts: [],
    }));
    const provider = new EntityInspectorProvider({
      executeCommand,
      subscribeEntityChanges: (_projectRoot, nextListener) => {
        listener = nextListener;
        return subscription;
      },
    });

    await provider.inspect({
      projectRoot: '/workspace',
      entityRef: { entityId: 'character-1', entityKind: 'character' },
      reveal: false,
    });
    listener?.({
      projectRoot: '/workspace',
      reason: 'update-metadata',
      changedRefs: [{ kind: 'entity', id: 'character-1' }],
      generation: 2,
      freshness: 'fresh',
      updatedAt: '2026-07-19T00:00:00.000Z',
    });

    await vi.waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(2));
    provider.dispose();
    expect(subscription.dispose).toHaveBeenCalledOnce();
  });
});
