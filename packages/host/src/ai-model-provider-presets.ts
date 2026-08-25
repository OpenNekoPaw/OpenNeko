import type {
  ModelCapability,
  ModelType,
  ProviderConnectionKind,
  ProviderModelFamily,
  ProviderSupportLevel,
  ProviderType,
} from '@neko/ai-contracts';

export type DesktopAiModelProtocol = string;

export interface DesktopAiModelTemplate {
  readonly id: string;
  readonly providerType: ProviderType;
  readonly apiName: string;
  readonly displayName: string;
  readonly type: ModelType;
  readonly capabilities: readonly ModelCapability[];
}

export interface DesktopAiProviderPreset {
  readonly id: string;
  readonly family: ProviderModelFamily;
  readonly displayName: string;
  readonly suggestedProviderId: string;
  readonly providerType: ProviderType;
  readonly defaultApiUrl: string;
  readonly connectionKind: ProviderConnectionKind;
  readonly supportLevel: ProviderSupportLevel;
  readonly requiresApiKey: boolean;
  readonly protocol?: DesktopAiModelProtocol;
  readonly allowCustomModels: boolean;
  readonly modelTemplates: readonly DesktopAiModelTemplate[];
}

const MINIMAX_H3_TEMPLATE: DesktopAiModelTemplate = Object.freeze({
  id: 'minimax-h3',
  providerType: 'minimax',
  apiName: 'MiniMax-H3',
  displayName: 'MiniMax H3',
  type: 'video',
  capabilities: Object.freeze([
    'text_to_video',
    'video.generate',
    'image_to_video',
    'video_to_video',
  ] as const satisfies readonly ModelCapability[]),
});

const BYTEDANCE_SEEDANCE_2_TEMPLATE: DesktopAiModelTemplate = Object.freeze({
  id: 'bytedance-seedance-2',
  providerType: 'bytedance',
  apiName: 'doubao-seedance-2-0-260128',
  displayName: 'Seedance 2.0',
  type: 'video',
  capabilities: Object.freeze([
    'text_to_video',
    'video.generate',
    'image_to_video',
  ] as const satisfies readonly ModelCapability[]),
});

export const DESKTOP_AI_PROVIDER_PRESETS: readonly DesktopAiProviderPreset[] = Object.freeze([
  preset({
    id: 'dialogue-openai',
    family: 'dialogue',
    displayName: 'OpenAI',
    suggestedProviderId: 'openai-chat',
    providerType: 'openai',
    defaultApiUrl: 'https://api.openai.com/v1',
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    protocol: 'openai-responses',
    allowCustomModels: true,
  }),
  preset({
    id: 'dialogue-anthropic',
    family: 'dialogue',
    displayName: 'Anthropic',
    suggestedProviderId: 'anthropic-chat',
    providerType: 'anthropic',
    defaultApiUrl: 'https://api.anthropic.com',
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    protocol: 'anthropic',
    allowCustomModels: true,
  }),
  preset({
    id: 'dialogue-ollama',
    family: 'dialogue',
    displayName: 'Ollama Local',
    suggestedProviderId: 'ollama-chat',
    providerType: 'ollama',
    defaultApiUrl: 'http://127.0.0.1:11434/api',
    connectionKind: 'local',
    supportLevel: 'compatible',
    requiresApiKey: false,
    protocol: 'ollama',
    allowCustomModels: true,
  }),
  preset({
    id: 'dialogue-newapi',
    family: 'dialogue',
    displayName: 'Custom NewAPI Chat',
    suggestedProviderId: 'newapi-chat',
    providerType: 'newapi',
    defaultApiUrl: '',
    connectionKind: 'gateway',
    supportLevel: 'custom',
    requiresApiKey: true,
    protocol: 'openai-chat',
    allowCustomModels: true,
  }),
  preset({
    id: 'generation-minimax-h3',
    family: 'generation',
    displayName: 'MiniMax H3',
    suggestedProviderId: 'minimax-media',
    providerType: 'minimax',
    defaultApiUrl: 'https://api.minimaxi.com/v2',
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    modelTemplates: [MINIMAX_H3_TEMPLATE],
  }),
  preset({
    id: 'generation-bytedance-seedance',
    family: 'generation',
    displayName: 'ByteDance Ark / Seedance',
    suggestedProviderId: 'bytedance-media',
    providerType: 'bytedance',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    modelTemplates: [BYTEDANCE_SEEDANCE_2_TEMPLATE],
  }),
  preset({
    id: 'generation-newapi',
    family: 'generation',
    displayName: 'Custom NewAPI Media',
    suggestedProviderId: 'newapi-media',
    providerType: 'newapi',
    defaultApiUrl: '',
    connectionKind: 'gateway',
    supportLevel: 'custom',
    requiresApiKey: true,
    allowCustomModels: true,
  }),
]);

export function getDesktopAiProviderPreset(id: string): DesktopAiProviderPreset | undefined {
  return DESKTOP_AI_PROVIDER_PRESETS.find((preset) => preset.id === id);
}

export function getDesktopAiModelTemplate(id: string): DesktopAiModelTemplate | undefined {
  for (const preset of DESKTOP_AI_PROVIDER_PRESETS) {
    const template = preset.modelTemplates.find((candidate) => candidate.id === id);
    if (template) return template;
  }
  return undefined;
}

export function defaultDesktopAiModelCapabilities(type: ModelType): readonly ModelCapability[] {
  if (type === 'llm') return ['chat', 'llm.chat', 'streaming'];
  if (type === 'image') return ['text_to_image', 'image.generate'];
  if (type === 'video') return ['text_to_video', 'video.generate'];
  return ['text_to_audio', 'audio.generate'];
}

function preset(
  input: Omit<DesktopAiProviderPreset, 'modelTemplates'> & {
    readonly modelTemplates?: readonly DesktopAiModelTemplate[];
  },
): DesktopAiProviderPreset {
  return Object.freeze({
    ...input,
    modelTemplates: Object.freeze([...(input.modelTemplates ?? [])]),
  });
}
