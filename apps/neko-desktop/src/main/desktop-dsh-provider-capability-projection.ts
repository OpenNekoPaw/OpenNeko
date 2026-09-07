import { PROVIDER_TYPES, type ProviderType } from '@neko/ai-contracts';
import type { DshAcpProviderCapability } from '@neko/agent-contracts';
import type { DesktopAiDialogueProviderCapability } from '@neko/host/ai-model-settings';

export function projectDesktopDshProviderCapability(
  capability: DshAcpProviderCapability,
): DesktopAiDialogueProviderCapability {
  const providerType = isProviderType(capability.providerId) ? capability.providerId : 'generic';
  const isOllama = capability.providerId === 'ollama';
  return {
    ...capability,
    providerType,
    defaultApiUrl: isOllama ? 'http://127.0.0.1:11434/api' : '',
    connectionKind: isOllama ? 'local' : 'direct',
    requiresApiKey: !isOllama,
  };
}

function isProviderType(value: string): value is ProviderType {
  return PROVIDER_TYPES.some((providerType) => providerType === value);
}
