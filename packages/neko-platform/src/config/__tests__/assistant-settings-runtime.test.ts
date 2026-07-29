import { describe, expect, it, vi } from 'vitest';
import {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
} from '../assistant-settings-runtime';

describe('assistant-settings-runtime', () => {
  it('projects settings data into the webview message schema', () => {
    const message = buildAssistantSettingsRuntimeDataMessage({
      getSettingsData: () => ({
        providers: [],
        configuredProviders: [],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-4.1',
        customSystemPrompt: 'System prompt',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.7,
        maxTokens: 4096,
        executionMode: 'auto',
        chatModelOptions: [],
        defaultMediaModels: {},
      }),
    });

    expect(message).toEqual(
      expect.objectContaining({
        type: 'settingsData',
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-4.1',
        systemPrompt: 'System prompt',
      }),
    );
  });

  it('returns undefined when settings data is unavailable', () => {
    expect(
      buildAssistantSettingsRuntimeDataMessage({
        getSettingsData: () => undefined,
      }),
    ).toBeUndefined();
  });

  it('awaits settings update and reports success', async () => {
    const updateSettingsFromWebview = vi.fn().mockResolvedValue(undefined);

    await expect(
      runAssistantSettingsUpdateRuntime({ temperature: 0.4 }, { updateSettingsFromWebview }),
    ).resolves.toEqual({ type: 'settingsUpdated', success: true });

    expect(updateSettingsFromWebview).toHaveBeenCalledWith({ temperature: 0.4 });
  });

  it('reports settings update failures without throwing', async () => {
    const updateSettingsFromWebview = vi.fn().mockRejectedValue(new Error('Config write failed'));

    await expect(
      runAssistantSettingsUpdateRuntime({ temperature: 0.4 }, { updateSettingsFromWebview }),
    ).resolves.toEqual({
      type: 'settingsUpdated',
      success: false,
      error: 'Config write failed',
    });
  });
});
