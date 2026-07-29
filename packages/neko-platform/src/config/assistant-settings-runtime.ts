import {
  buildAssistantSettingsDataMessage,
  buildAssistantSettingsUpdatedMessage,
  type AssistantSettingsData,
  type AssistantSettingsDataMessage,
  type AssistantSettingsUpdatedMessage,
} from './assistant-config';

export interface AssistantSettingsRuntimeEffects {
  getSettingsData(): AssistantSettingsData | undefined;
  updateSettingsFromWebview(settings: Record<string, unknown>): Promise<void>;
}

export function buildAssistantSettingsRuntimeDataMessage(
  effects: Pick<AssistantSettingsRuntimeEffects, 'getSettingsData'>,
): AssistantSettingsDataMessage | undefined {
  const data = effects.getSettingsData();
  return data ? buildAssistantSettingsDataMessage(data) : undefined;
}

export async function runAssistantSettingsUpdateRuntime(
  settings: Record<string, unknown>,
  effects: Pick<AssistantSettingsRuntimeEffects, 'updateSettingsFromWebview'>,
): Promise<AssistantSettingsUpdatedMessage> {
  try {
    await effects.updateSettingsFromWebview(settings);
    return buildAssistantSettingsUpdatedMessage({ success: true });
  } catch (error) {
    return buildAssistantSettingsUpdatedMessage({
      success: false,
      error: getErrorMessage(error),
    });
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
