import { describe, expect, it, vi } from 'vitest';
import { SettingsManager } from './settingsManager';

function createConfigManager() {
  return {
    getAssistantRuntimeSettingsSnapshot: vi.fn().mockReturnValue({
      selectedProviderId: 'user-provider',
      selectedModelId: 'user-model',
      customSystemPrompt: 'system',
      autoExecuteTools: true,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.2,
      maxTokens: 4096,
      thinkingBudget: 2048,
      executionMode: 'ask',
    }),
    getEffectiveAgentWorkspaceConfigSnapshot: vi.fn().mockReturnValue({
      providerId: 'workspace-provider',
      modelId: 'workspace-model',
      temperature: 0.55,
      maxTokens: 1024,
      thinkingBudget: 512,
      executionMode: 'auto',
    }),
  };
}

describe('SettingsManager', () => {
  it('initializes each conversation from validated defaults exactly once', () => {
    const config = createConfigManager();
    const manager = new SettingsManager(config as never);

    const first = manager.snapshotForConversation('conversation-a');
    config.getEffectiveAgentWorkspaceConfigSnapshot.mockReturnValue({
      providerId: 'changed-default',
      modelId: 'changed-model',
      temperature: 0.9,
      maxTokens: 999,
      thinkingBudget: 999,
      executionMode: 'plan',
    });

    expect(manager.snapshotForConversation('conversation-a')).toBe(first);
    expect(manager.snapshotForConversation('conversation-b')).toEqual(
      expect.objectContaining({
        selectedProviderId: 'changed-default',
        selectedModelId: 'changed-model',
      }),
    );
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('updates conversations independently without mutating captured snapshots', async () => {
    const manager = new SettingsManager(createConfigManager() as never);
    const activeTurnSnapshot = manager.snapshotForConversation('conversation-a');

    const updatedA = await manager.updateConversation('conversation-a', {
      providerId: 'provider-a-next',
      modelId: 'model-a-next',
      thinkingBudget: 4096,
    });
    const updatedB = await manager.updateConversation('conversation-b', {
      providerId: 'provider-b',
      modelId: 'model-b',
    });

    expect(activeTurnSnapshot.selectedModelId).toBe('workspace-model');
    expect(updatedA).toEqual(
      expect.objectContaining({
        selectedProviderId: 'provider-a-next',
        selectedModelId: 'model-a-next',
        thinkingBudget: 4096,
      }),
    );
    expect(updatedB).toEqual(
      expect.objectContaining({ selectedProviderId: 'provider-b', selectedModelId: 'model-b' }),
    );
    expect(manager.snapshotForConversation('conversation-a')).toBe(updatedA);
    expect(manager.snapshotForConversation('conversation-b')).toBe(updatedB);
  });

  it('persists conversation-owned settings and restores them without reading current defaults', async () => {
    const values = new Map<string, unknown>();
    const storage = {
      get: vi.fn((key: string) => values.get(key)),
      update: vi.fn(async (key: string, value: unknown) => {
        if (value === undefined) values.delete(key);
        else values.set(key, value);
      }),
    };
    const firstConfig = createConfigManager();
    const first = new SettingsManager(firstConfig as never, storage);

    await first.updateConversation('conversation-a', {
      providerId: 'persisted-provider',
      modelId: 'persisted-model',
      temperature: 0.35,
    });

    const changedDefaults = createConfigManager();
    changedDefaults.getEffectiveAgentWorkspaceConfigSnapshot.mockReturnValue({
      providerId: 'new-default-provider',
      modelId: 'new-default-model',
      temperature: 0.9,
      maxTokens: 999,
      thinkingBudget: 999,
      executionMode: 'plan',
    });
    const restored = new SettingsManager(changedDefaults as never, storage);

    expect(restored.snapshotForConversation('conversation-a')).toEqual(
      expect.objectContaining({
        selectedProviderId: 'persisted-provider',
        selectedModelId: 'persisted-model',
        temperature: 0.35,
      }),
    );
    expect(changedDefaults.getAssistantRuntimeSettingsSnapshot).not.toHaveBeenCalled();
    expect(changedDefaults.getEffectiveAgentWorkspaceConfigSnapshot).not.toHaveBeenCalled();
  });

  it('fails visibly when persisted conversation settings violate the owned schema', () => {
    const storage = {
      get: vi.fn().mockReturnValue({
        version: 1,
        conversationId: 'conversation-b',
        settings: {},
      }),
      update: vi.fn(),
    };
    const manager = new SettingsManager(createConfigManager() as never, storage);

    expect(() => manager.snapshotForConversation('conversation-a')).toThrow(
      /ownership mismatch.*conversation-a/i,
    );
  });

  it('does not publish an in-memory update when durable settings persistence fails', async () => {
    const storage = {
      get: vi.fn(),
      update: vi.fn().mockRejectedValue(new Error('settings persistence failed')),
    };
    const manager = new SettingsManager(createConfigManager() as never, storage);
    const before = manager.snapshotForConversation('conversation-a');

    await expect(
      manager.updateConversation('conversation-a', { modelId: 'not-durable' }),
    ).rejects.toThrow('settings persistence failed');

    expect(manager.snapshotForConversation('conversation-a')).toBe(before);
  });

  it('fails visibly for missing ownership, invalid values, and unknown fields', async () => {
    const manager = new SettingsManager(createConfigManager() as never);

    expect(() => manager.snapshotForConversation('')).toThrow(/conversationId is required/);
    await expect(
      manager.updateConversation('conversation-a', { temperature: 'hot' }),
    ).rejects.toThrow(/temperature must be a finite number/);
    await expect(
      manager.updateConversation('conversation-a', { legacyModel: 'x' }),
    ).rejects.toThrow(/Unsupported conversation settings fields/);
  });
});
