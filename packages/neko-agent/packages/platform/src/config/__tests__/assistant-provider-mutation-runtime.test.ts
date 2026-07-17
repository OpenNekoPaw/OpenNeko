import { describe, expect, it, vi } from 'vitest';
import {
  buildProviderMutationFailureMessage,
  runAssistantProviderConfigMutationRuntime,
  runAssistantProviderConfigMutationNotificationRuntime,
  runAssistantProviderMutationRuntime,
  type AssistantProviderMutationConfigRuntime,
  type AssistantProviderMutationRuntimeEffects,
} from '../assistant-provider-mutation-runtime';

function createEffects(
  overrides: Partial<AssistantProviderMutationRuntimeEffects> = {},
): AssistantProviderMutationRuntimeEffects {
  return {
    addProvider: vi.fn(async () => ({ success: true })),
    removeProvider: vi.fn(async () => ({ success: true })),
    toggleProvider: vi.fn(async () => undefined),
    toggleModel: vi.fn(async () => undefined),
    getSelection: () => ({ selectedProviderId: 'anthropic', selectedModelId: 'claude' }),
    applySelectionUpdate: vi.fn(),
    ...overrides,
  };
}

describe('assistant-provider-mutation-runtime', () => {
  it('adds provider and returns a result message', async () => {
    const effects = createEffects();

    await expect(
      runAssistantProviderMutationRuntime(
        { type: 'addModel', model: { type: 'openai', apiKey: 'sk' } },
        effects,
      ),
    ).resolves.toEqual({
      settingsChanged: true,
      selectionUpdate: {},
      resultMessage: { type: 'modelAdded', success: true, modelType: 'openai' },
    });
    expect(effects.addProvider).toHaveBeenCalledWith({ type: 'openai', apiKey: 'sk' });
  });

  it('removes provider and clears selected provider when needed', async () => {
    const effects = createEffects({
      getSelection: () => ({ selectedProviderId: 'openai', selectedModelId: 'gpt-4' }),
    });

    const result = await runAssistantProviderMutationRuntime(
      { type: 'removeModel', providerId: 'openai' },
      effects,
    );

    expect(result.selectionUpdate).toEqual({
      selectedProviderId: null,
      selectedModelId: null,
    });
    expect(effects.applySelectionUpdate).toHaveBeenCalledWith({
      selectedProviderId: null,
      selectedModelId: null,
    });
    expect(result.resultMessage).toEqual({
      type: 'modelRemoved',
      success: true,
      modelType: 'openai',
    });
  });

  it('clears provider and model selection when disabling the selected provider', async () => {
    const effects = createEffects();

    await runAssistantProviderMutationRuntime(
      { type: 'toggleProvider', providerId: 'anthropic', enabled: false },
      effects,
    );

    expect(effects.toggleProvider).toHaveBeenCalledWith('anthropic', false);
    expect(effects.applySelectionUpdate).toHaveBeenCalledWith({
      selectedProviderId: null,
      selectedModelId: null,
    });
  });

  it('clears only model selection when disabling the selected model', async () => {
    const effects = createEffects();

    await runAssistantProviderMutationRuntime(
      { type: 'toggleModel', providerId: 'anthropic', modelId: 'claude', enabled: false },
      effects,
    );

    expect(effects.toggleModel).toHaveBeenCalledWith('anthropic', 'claude', false);
    expect(effects.applySelectionUpdate).toHaveBeenCalledWith({ selectedModelId: null });
  });
});

function createConfigRuntime(
  overrides: Partial<AssistantProviderMutationConfigRuntime> = {},
): AssistantProviderMutationConfigRuntime {
  return {
    updateProviderOverride: vi.fn().mockResolvedValue(undefined),
    removeProviderOverride: vi.fn().mockResolvedValue(undefined),
    updateModelOverride: vi.fn().mockResolvedValue(undefined),
    getAssistantSettingsSnapshot: () => ({
      selectedProviderId: 'anthropic',
      selectedModelId: 'claude',
    }),
    setAssistantSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('assistant-provider-config-mutation-runtime', () => {
  it('adds provider credentials through config overrides', async () => {
    const config = createConfigRuntime();

    const result = await runAssistantProviderConfigMutationRuntime(
      {
        type: 'addModel',
        model: { type: 'openai', apiKey: 'sk', baseUrl: 'https://api.example.test' },
      },
      config,
    );

    expect(config.updateProviderOverride).toHaveBeenCalledWith('openai', {
      apiKey: 'sk',
      apiUrl: 'https://api.example.test',
    });
    expect(result.resultMessage).toEqual({
      type: 'modelAdded',
      success: true,
      modelType: 'openai',
    });
  });

  it('reports provider override failures as mutation result messages', async () => {
    const config = createConfigRuntime({
      updateProviderOverride: vi.fn().mockRejectedValue(new Error('Invalid API key')),
    });

    const result = await runAssistantProviderConfigMutationRuntime(
      { type: 'addModel', model: { type: 'openai' } },
      config,
    );

    expect(result.resultMessage).toEqual({
      type: 'modelAdded',
      success: false,
      modelType: 'openai',
      error: 'Invalid API key',
    });
  });

  it('toggles provider and applies selection updates through config', async () => {
    const config = createConfigRuntime();

    await runAssistantProviderConfigMutationRuntime(
      { type: 'toggleProvider', providerId: 'anthropic', enabled: false },
      config,
    );

    expect(config.updateProviderOverride).toHaveBeenCalledWith('anthropic', {
      enabled: false,
    });
    expect(config.setAssistantSettings).toHaveBeenCalledWith({
      selectedProviderId: null,
      selectedModelId: null,
    });
  });

  it('toggles model overrides by model id', async () => {
    const config = createConfigRuntime();

    await runAssistantProviderConfigMutationRuntime(
      { type: 'toggleModel', providerId: 'anthropic', modelId: 'claude', enabled: false },
      config,
    );

    expect(config.updateModelOverride).toHaveBeenCalledWith('claude', { enabled: false });
    expect(config.setAssistantSettings).toHaveBeenCalledWith({ selectedModelId: null });
  });

  it('notifies settings refresh and result messages after config mutations', async () => {
    const config = createConfigRuntime();
    const sendSettings = vi.fn();
    const postMessage = vi.fn();

    await expect(
      runAssistantProviderConfigMutationNotificationRuntime(
        { type: 'addModel', model: { type: 'openai', apiKey: 'sk' } },
        config,
        { sendSettings, postMessage },
      ),
    ).resolves.toEqual({
      status: 'completed',
      result: {
        settingsChanged: true,
        selectionUpdate: {},
        resultMessage: { type: 'modelAdded', success: true, modelType: 'openai' },
      },
    });

    expect(sendSettings).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'modelAdded',
      success: true,
      modelType: 'openai',
    });
  });

  it('keeps unavailable platform mutations silent for host compatibility', async () => {
    const sendSettings = vi.fn();
    const postMessage = vi.fn();

    await expect(
      runAssistantProviderConfigMutationNotificationRuntime(
        { type: 'toggleProvider', providerId: 'openai', enabled: false },
        undefined,
        { sendSettings, postMessage },
      ),
    ).resolves.toEqual({ status: 'unavailable' });

    expect(sendSettings).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('reports unexpected mutation failures as global errors', async () => {
    const config = createConfigRuntime({
      updateProviderOverride: vi.fn().mockRejectedValue('boom'),
    });
    const postMessage = vi.fn();
    const onError = vi.fn();

    await expect(
      runAssistantProviderConfigMutationNotificationRuntime(
        { type: 'toggleProvider', providerId: 'openai', enabled: false },
        config,
        { postMessage, onError },
      ),
    ).resolves.toEqual({ status: 'failed', error: 'boom' });

    expect(onError).toHaveBeenCalledWith('boom');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Failed to update provider settings: boom',
    });
  });

  it('builds provider mutation failure messages', () => {
    expect(buildProviderMutationFailureMessage(new Error('bad key'))).toBe(
      'Failed to update provider settings: bad key',
    );
  });
});
