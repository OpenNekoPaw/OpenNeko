import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsHandler } from '../settingsHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockPlatform() {
  return {
    config: {
      reloadConfig: vi.fn(),
      getAssistantSettingsData: vi.fn().mockReturnValue({
        providers: [],
        configuredProviders: [],
        selectedProviderId: 'global-provider',
        selectedModelId: 'global-model',
        customSystemPrompt: '',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.7,
        maxTokens: 8192,
        executionMode: 'ask',
        chatModelOptions: [],
        modelGroups: [],
        defaultMediaModels: {},
      }),
      applyRuntimeAssistantSettingsFromWebview: vi.fn(() => {
        throw new Error('legacy global settings path used');
      }),
    },
  };
}

function createConversationSettings() {
  return {
    snapshotForConversation: vi.fn((conversationId: string) => ({
      selectedProviderId: `${conversationId}-provider`,
      selectedModelId: `${conversationId}-model`,
      customSystemPrompt: `${conversationId}-prompt`,
      autoExecuteTools: true,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.2,
      maxTokens: 4096,
      thinkingBudget: 1024,
      executionMode: 'ask',
    })),
    updateConversation: vi.fn(),
  };
}

describe('SettingsHandler', () => {
  let webview: ReturnType<typeof createMockWebview>;
  let platform: ReturnType<typeof createMockPlatform>;
  let conversationSettings: ReturnType<typeof createConversationSettings>;

  beforeEach(() => {
    webview = createMockWebview();
    platform = createMockPlatform();
    conversationSettings = createConversationSettings();
  });

  it('projects settings for the explicitly requested conversation', async () => {
    const handler = new SettingsHandler({
      platform: platform as never,
      conversationSettings: conversationSettings as never,
    });

    await handler.sendSettings(webview as never, { conversationId: 'conversation-b' });

    expect(conversationSettings.snapshotForConversation).toHaveBeenCalledWith('conversation-b');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'settingsData',
        conversationId: 'conversation-b',
        selectedProviderId: 'conversation-b-provider',
        selectedModelId: 'conversation-b-model',
        systemPrompt: 'conversation-b-prompt',
      }),
    );
  });

  it('passes account catalog snapshots into the shared provider projection', async () => {
    const accountCatalog = {
      getSnapshot: vi.fn().mockResolvedValue({
        snapshot: {
          source: 'account-gateway',
          status: 'available',
          provider: { id: 'neko-account-gateway' },
          models: [],
          entitlement: { allowedModelIds: [] },
          expiresAt: 10_000,
        },
        refreshed: false,
      }),
      invalidateForAuthFailure: vi.fn(),
    };
    const handler = new SettingsHandler({
      platform: platform as never,
      accountAiCatalog: accountCatalog as never,
      conversationSettings: conversationSettings as never,
    });

    await handler.sendSettings(webview as never, { conversationId: 'conversation-a' });

    expect(platform.config.getAssistantSettingsData).toHaveBeenCalledWith({
      accountCatalog: expect.objectContaining({ source: 'account-gateway' }),
    });
  });

  it('updates only the target conversation while other Agents and Tasks may be running', async () => {
    const handler = new SettingsHandler({
      platform: platform as never,
      conversationSettings: conversationSettings as never,
    });
    const update = { providerId: 'provider-b', modelId: 'model-b', temperature: 0.3 };

    await handler.handleUpdateSettings(webview as never, update, {
      conversationId: 'conversation-b',
    });

    expect(conversationSettings.updateConversation).toHaveBeenCalledWith('conversation-b', update);
    expect(platform.config.applyRuntimeAssistantSettingsFromWebview).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'settingsUpdated', success: true });
  });

  it('emits execution-mode activation progress with the same conversation owner', async () => {
    const handler = new SettingsHandler({
      conversationSettings: conversationSettings as never,
    });

    await handler.handleUpdateSettings(
      webview as never,
      { executionMode: 'plan' },
      { conversationId: 'conversation-a' },
    );

    const progressMessages = webview.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'agentCapabilityActivationProgress');
    expect(progressMessages.map((message) => message.events[0].step)).toEqual([
      'requested',
      'validated',
      'projected',
      'active',
    ]);
    expect(progressMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ conversationId: 'conversation-a' })]),
    );
  });

  it('fails visibly when the conversation settings runtime is unavailable', async () => {
    const handler = new SettingsHandler({ platform: platform as never });

    await handler.handleUpdateSettings(
      webview as never,
      { temperature: 0.3 },
      { conversationId: 'conversation-a' },
    );

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'settingsUpdated',
      success: false,
      error: 'Conversation settings runtime is not initialized',
    });
  });

  it('surfaces conversation-specific validation failures', async () => {
    conversationSettings.updateConversation.mockImplementation(() => {
      throw new Error('Invalid model for conversation-b');
    });
    const handler = new SettingsHandler({
      conversationSettings: conversationSettings as never,
    });

    await handler.handleUpdateSettings(
      webview as never,
      { modelId: 'invalid' },
      { conversationId: 'conversation-b' },
    );

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'settingsUpdated',
      success: false,
      error: 'Invalid model for conversation-b',
    });
  });
});
