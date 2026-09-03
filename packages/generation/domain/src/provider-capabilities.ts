import type {
  ModelCapability,
  ModelType,
  ProviderConnectionKind,
  ProviderSupportLevel,
  ProviderType,
} from '@neko/ai-contracts';

export interface GenerationModelTemplate {
  readonly id: string;
  readonly providerType: ProviderType;
  readonly apiName: string;
  readonly displayName: string;
  readonly type: Exclude<ModelType, 'llm'>;
  readonly capabilities: readonly ModelCapability[];
}

export interface GenerationProviderCapability {
  readonly id: string;
  readonly displayName: string;
  readonly suggestedProviderId: string;
  readonly providerType: ProviderType;
  readonly defaultApiUrl: string;
  readonly requiresApiUrl: boolean;
  readonly connectionKind: ProviderConnectionKind;
  readonly supportLevel: ProviderSupportLevel;
  readonly requiresApiKey: boolean;
  readonly allowCustomModels: boolean;
  readonly supportedModelTypes: readonly Exclude<ModelType, 'llm'>[];
  readonly modelTemplates: readonly GenerationModelTemplate[];
}

const MINIMAX_H3_TEMPLATE: GenerationModelTemplate = Object.freeze({
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

const BYTEDANCE_SEEDANCE_2_TEMPLATE: GenerationModelTemplate = Object.freeze({
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

export const GENERATION_PROVIDER_CAPABILITIES: readonly GenerationProviderCapability[] =
  Object.freeze([
    capability({
      id: 'generation-minimax-h3',
      displayName: 'MiniMax H3',
      suggestedProviderId: 'minimax-media',
      providerType: 'minimax',
      defaultApiUrl: 'https://api.minimaxi.com/v2',
      supportLevel: 'verified',
      allowCustomModels: false,
      supportedModelTypes: ['video'],
      modelTemplates: [MINIMAX_H3_TEMPLATE],
    }),
    capability({
      id: 'generation-bytedance-seedance',
      displayName: 'ByteDance Ark / Seedance',
      suggestedProviderId: 'bytedance-media',
      providerType: 'bytedance',
      defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      supportLevel: 'verified',
      allowCustomModels: false,
      supportedModelTypes: ['image', 'video'],
      modelTemplates: [BYTEDANCE_SEEDANCE_2_TEMPLATE],
    }),
    capability({
      id: 'generation-openai',
      displayName: 'OpenAI',
      suggestedProviderId: 'openai-media',
      providerType: 'openai',
      defaultApiUrl: 'https://api.openai.com/v1',
      supportedModelTypes: ['image', 'audio', 'music'],
    }),
    capability({
      id: 'generation-newapi',
      displayName: 'NewAPI Media',
      suggestedProviderId: 'newapi-media',
      providerType: 'newapi',
      connectionKind: 'gateway',
      supportLevel: 'custom',
      supportedModelTypes: ['image', 'audio', 'music'],
    }),
    capability({
      id: 'generation-oneapi',
      displayName: 'OneAPI Media',
      suggestedProviderId: 'oneapi-media',
      providerType: 'oneapi',
      connectionKind: 'gateway',
      supportLevel: 'custom',
      supportedModelTypes: ['image', 'audio', 'music'],
    }),
    capability({
      id: 'generation-compatible',
      displayName: 'OpenAI-compatible Media',
      suggestedProviderId: 'compatible-media',
      providerType: 'generic',
      connectionKind: 'gateway',
      supportLevel: 'custom',
      supportedModelTypes: ['image', 'audio'],
    }),
  ]);

function capability(
  input: Pick<
    GenerationProviderCapability,
    'id' | 'displayName' | 'suggestedProviderId' | 'providerType' | 'supportedModelTypes'
  > &
    Partial<
      Pick<
        GenerationProviderCapability,
        | 'defaultApiUrl'
        | 'requiresApiUrl'
        | 'connectionKind'
        | 'supportLevel'
        | 'requiresApiKey'
        | 'allowCustomModels'
        | 'modelTemplates'
      >
    >,
): GenerationProviderCapability {
  return Object.freeze({
    ...input,
    defaultApiUrl: input.defaultApiUrl ?? '',
    requiresApiUrl: input.requiresApiUrl ?? true,
    connectionKind: input.connectionKind ?? 'direct',
    supportLevel: input.supportLevel ?? 'compatible',
    requiresApiKey: input.requiresApiKey ?? true,
    allowCustomModels: input.allowCustomModels ?? true,
    supportedModelTypes: Object.freeze([...input.supportedModelTypes]),
    modelTemplates: Object.freeze([...(input.modelTemplates ?? [])]),
  });
}
