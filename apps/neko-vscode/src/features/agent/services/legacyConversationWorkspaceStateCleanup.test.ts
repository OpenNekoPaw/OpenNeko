import { describe, expect, it, vi } from 'vitest';

import { cleanupLegacyConversationWorkspaceState } from './legacyConversationWorkspaceStateCleanup';

describe('cleanupLegacyConversationWorkspaceState', () => {
  it('deletes the legacy transcript authority without touching current host projections', async () => {
    const values = new Map<string, unknown>([
      [
        'conversations',
        {
          conversations: [
            [
              'conversation-1',
              {
                id: 'conversation-1',
                messages: [{ id: 'message-1', role: 'user', content: 'legacy transcript' }],
              },
            ],
          ],
        },
      ],
      ['neko.tabState', { openTabs: [], activeTabId: null }],
      ['neko.agent.conversationSettings.v1.conversation-1', { modelId: 'configured-model' }],
    ]);
    const update = vi.fn(async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    });

    await expect(
      cleanupLegacyConversationWorkspaceState({
        get: <T>(key: string, defaultValue?: T) =>
          (values.has(key) ? values.get(key) : defaultValue) as T,
        update,
      }),
    ).resolves.toEqual({ removedKeys: ['conversations'] });

    expect(values.has('conversations')).toBe(false);
    expect(values.get('neko.tabState')).toEqual({ openTabs: [], activeTabId: null });
    expect(values.get('neko.agent.conversationSettings.v1.conversation-1')).toEqual({
      modelId: 'configured-model',
    });
  });

  it('is idempotent when the legacy transcript state is absent', async () => {
    const update = vi.fn();

    await expect(
      cleanupLegacyConversationWorkspaceState({ get: () => undefined, update }),
    ).resolves.toEqual({ removedKeys: [] });
    expect(update).not.toHaveBeenCalled();
  });
});
