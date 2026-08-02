import {
  buildAssistantProviderMutationResultMessage,
  buildAssistantProviderMutationSettingsUpdate,
  type AssistantProviderMutationResultMessage,
  type AssistantSettingsSnapshot,
} from './assistant-config';

export interface AssistantProviderConfigInput {
  type: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{ id: string; enabled: boolean }>;
}

export interface AssistantProviderMutationOperationResult {
  success: boolean;
  error?: string;
}

export type AssistantProviderMutationRuntimeRequest =
  | { type: 'addModel'; model: AssistantProviderConfigInput }
  | { type: 'removeModel'; providerId: string }
  | { type: 'toggleProvider'; providerId: string; enabled: boolean }
  | { type: 'toggleModel'; providerId: string; modelId: string; enabled: boolean };

export interface AssistantProviderMutationRuntimeEffects {
  addProvider(
    model: AssistantProviderConfigInput,
  ): Promise<AssistantProviderMutationOperationResult>;
  removeProvider(providerId: string): Promise<AssistantProviderMutationOperationResult>;
  toggleProvider(providerId: string, enabled: boolean): Promise<void>;
  toggleModel(providerId: string, modelId: string, enabled: boolean): Promise<void>;
  getSelection(): Pick<AssistantSettingsSnapshot, 'selectedProviderId' | 'selectedModelId'>;
  applySelectionUpdate(update: Partial<AssistantSettingsSnapshot>): void | Promise<void>;
}

export interface AssistantProviderMutationConfigRuntime {
  updateProviderOverride(
    providerId: string,
    override: {
      apiKey?: string;
      apiUrl?: string;
      enabled?: boolean;
    },
  ): Promise<void>;
  removeProviderOverride(providerId: string): Promise<void>;
  updateModelOverride(modelId: string, override: { enabled?: boolean }): Promise<void>;
  getAssistantSettingsSnapshot(): Pick<
    AssistantSettingsSnapshot,
    'selectedProviderId' | 'selectedModelId'
  >;
  setAssistantSettings(update: Partial<AssistantSettingsSnapshot>): Promise<void>;
}

export interface AssistantProviderMutationRuntimeResult {
  settingsChanged: boolean;
  selectionUpdate: Partial<AssistantSettingsSnapshot>;
  resultMessage?: AssistantProviderMutationResultMessage;
}

export type AssistantProviderMutationNotificationMessage =
  | AssistantProviderMutationResultMessage
  | {
      type: 'globalError';
      message: string;
    };

export interface AssistantProviderConfigMutationNotificationEffects {
  postMessage?: (message: AssistantProviderMutationNotificationMessage) => void | Promise<void>;
  sendSettings?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export type AssistantProviderConfigMutationNotificationResult =
  | {
      status: 'unavailable';
    }
  | {
      status: 'completed';
      result: AssistantProviderMutationRuntimeResult;
    }
  | {
      status: 'failed';
      error: unknown;
    };

export async function runAssistantProviderMutationRuntime(
  request: AssistantProviderMutationRuntimeRequest,
  effects: AssistantProviderMutationRuntimeEffects,
): Promise<AssistantProviderMutationRuntimeResult> {
  if (request.type === 'addModel') {
    const result = await effects.addProvider(request.model);
    return {
      settingsChanged: true,
      selectionUpdate: {},
      resultMessage: buildAssistantProviderMutationResultMessage({
        type: 'modelAdded',
        success: result.success,
        modelType: request.model.type,
        ...(result.error !== undefined ? { error: result.error } : {}),
      }),
    };
  }

  if (request.type === 'removeModel') {
    const result = await effects.removeProvider(request.providerId);
    const selectionUpdate = buildAssistantProviderMutationSettingsUpdate({
      mutation: { type: 'providerRemoved', providerId: request.providerId },
      selection: effects.getSelection(),
    });
    await effects.applySelectionUpdate(selectionUpdate);
    return {
      settingsChanged: true,
      selectionUpdate,
      resultMessage: buildAssistantProviderMutationResultMessage({
        type: 'modelRemoved',
        success: result.success,
        modelType: request.providerId,
        ...(result.error !== undefined ? { error: result.error } : {}),
      }),
    };
  }

  if (request.type === 'toggleProvider') {
    await effects.toggleProvider(request.providerId, request.enabled);
    const selectionUpdate = buildAssistantProviderMutationSettingsUpdate({
      mutation: {
        type: 'providerToggled',
        providerId: request.providerId,
        enabled: request.enabled,
      },
      selection: effects.getSelection(),
    });
    await effects.applySelectionUpdate(selectionUpdate);
    return { settingsChanged: true, selectionUpdate };
  }

  await effects.toggleModel(request.providerId, request.modelId, request.enabled);
  const selectionUpdate = buildAssistantProviderMutationSettingsUpdate({
    mutation: {
      type: 'modelToggled',
      providerId: request.providerId,
      modelId: request.modelId,
      enabled: request.enabled,
    },
    selection: effects.getSelection(),
  });
  await effects.applySelectionUpdate(selectionUpdate);
  return { settingsChanged: true, selectionUpdate };
}

export async function runAssistantProviderConfigMutationRuntime(
  request: AssistantProviderMutationRuntimeRequest,
  config: AssistantProviderMutationConfigRuntime,
): Promise<AssistantProviderMutationRuntimeResult> {
  return runAssistantProviderMutationRuntime(request, {
    addProvider: (model) => addProviderConfigOverride(config, model),
    removeProvider: (providerId) => removeProviderConfigOverride(config, providerId),
    toggleProvider: (providerId, enabled) => config.updateProviderOverride(providerId, { enabled }),
    toggleModel: (_providerId, modelId, enabled) =>
      config.updateModelOverride(modelId, { enabled }),
    getSelection: () => config.getAssistantSettingsSnapshot(),
    applySelectionUpdate: (update) => config.setAssistantSettings(update),
  });
}

export async function runAssistantProviderConfigMutationNotificationRuntime(
  request: AssistantProviderMutationRuntimeRequest,
  config: AssistantProviderMutationConfigRuntime | undefined,
  effects: AssistantProviderConfigMutationNotificationEffects = {},
): Promise<AssistantProviderConfigMutationNotificationResult> {
  if (!config) {
    return { status: 'unavailable' };
  }

  try {
    const result = await runAssistantProviderConfigMutationRuntime(request, config);
    if (result.settingsChanged) {
      await effects.sendSettings?.();
    }
    if (result.resultMessage) {
      await effects.postMessage?.(result.resultMessage);
    }
    return { status: 'completed', result };
  } catch (error) {
    effects.onError?.(error);
    await effects.postMessage?.({
      type: 'globalError',
      message: buildProviderMutationFailureMessage(error),
    });
    return { status: 'failed', error };
  }
}

export function buildProviderMutationFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to update provider settings: ${message}`;
}

async function addProviderConfigOverride(
  config: AssistantProviderMutationConfigRuntime,
  model: AssistantProviderConfigInput,
): Promise<AssistantProviderMutationOperationResult> {
  try {
    await config.updateProviderOverride(model.type, {
      apiKey: model.apiKey,
      apiUrl: model.baseUrl,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

async function removeProviderConfigOverride(
  config: AssistantProviderMutationConfigRuntime,
  providerId: string,
): Promise<AssistantProviderMutationOperationResult> {
  try {
    await config.removeProviderOverride(providerId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
