import {
  createModels,
  createProvider,
  type Api,
  type CredentialStore,
  type Model,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';

export type OpenNekoPiProtocolProfile =
  'newapi' | 'openai-chat' | 'openai-responses' | 'anthropic' | 'google' | 'ollama';

export interface OpenNekoPiModelConfig {
  readonly id: string;
  readonly name?: string;
  readonly protocol?: OpenNekoPiProtocolProfile;
  readonly input?: readonly ('text' | 'image')[];
  readonly reasoning?: boolean;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly cost?: {
    readonly input?: number;
    readonly output?: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
  };
}

export interface OpenNekoPiProviderConfig {
  readonly id: string;
  readonly name?: string;
  readonly baseUrl: string;
  readonly protocol: OpenNekoPiProtocolProfile;
  readonly requiresApiKey: boolean;
  readonly auth?:
    | { readonly type: 'provider-default' }
    | { readonly type: 'bearer' }
    | { readonly type: 'api-key' }
    | { readonly type: 'custom-header'; readonly header: string };
  readonly models: readonly OpenNekoPiModelConfig[];
}

export interface OpenNekoPiProviderProjection {
  readonly provider: Provider;
  readonly models: readonly Model<Api>[];
}

export type OpenNekoPiProviderProjectionErrorCode =
  'invalid-provider' | 'invalid-endpoint' | 'invalid-model' | 'unsupported-protocol';

export class OpenNekoPiProviderProjectionError extends Error {
  readonly code: OpenNekoPiProviderProjectionErrorCode;

  constructor(code: OpenNekoPiProviderProjectionErrorCode, message: string) {
    super(message);
    this.name = 'OpenNekoPiProviderProjectionError';
    this.code = code;
  }
}

export function createOpenNekoPiModels(credentials: CredentialStore): MutableModels {
  return createModels({ credentials });
}

export function projectOpenNekoPiProvider(
  config: OpenNekoPiProviderConfig,
): OpenNekoPiProviderProjection {
  validateConfig(config);
  const models = Object.freeze(
    config.models.map((model) =>
      Object.freeze({
        id: model.id,
        name: model.name ?? model.id,
        api: resolveApiId(model.protocol ?? config.protocol),
        provider: config.id,
        baseUrl: config.baseUrl,
        reasoning: model.reasoning ?? false,
        input: [...(model.input ?? ['text'])],
        cost: {
          input: model.cost?.input ?? 0,
          output: model.cost?.output ?? 0,
          cacheRead: model.cost?.cacheRead ?? 0,
          cacheWrite: model.cost?.cacheWrite ?? 0,
        },
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        compat: {},
      } satisfies Model<Api>),
    ),
  );
  const provider = createProvider({
    id: config.id,
    name: config.name ?? config.id,
    baseUrl: config.baseUrl,
    models,
    auth: {
      apiKey: {
        name: `${config.name ?? config.id} API key`,
        login: async (callbacks) => ({
          type: 'api_key',
          key: await callbacks.prompt({
            type: 'secret',
            message: `Enter the API key for ${config.name ?? config.id}`,
          }),
        }),
        resolve: async ({ credential }) => {
          const key = credential?.key?.trim();
          if (key !== undefined && key.length > 0) {
            return {
              auth: projectModelAuth(config.auth, key),
              source: 'OpenNeko CredentialStore',
            };
          }
          return config.requiresApiKey
            ? undefined
            : { auth: {}, source: 'OpenNeko keyless local provider' };
        },
      },
    },
    api: {
      'openai-completions': openAICompletionsApi(),
      'openai-responses': openAIResponsesApi(),
      'anthropic-messages': anthropicMessagesApi(),
      'google-generative-ai': googleGenerativeAIApi(),
    },
  });
  return Object.freeze({ provider, models });
}

function projectModelAuth(
  profile: OpenNekoPiProviderConfig['auth'],
  key: string,
): { readonly apiKey?: string; readonly headers?: Readonly<Record<string, string>> } {
  switch (profile?.type) {
    case undefined:
    case 'provider-default':
      return { apiKey: key };
    case 'bearer':
      return { headers: { authorization: `Bearer ${key}` } };
    case 'api-key':
      return { headers: { 'x-api-key': key } };
    case 'custom-header': {
      const header = profile.header.trim();
      if (header.length === 0) {
        throw new OpenNekoPiProviderProjectionError(
          'invalid-provider',
          'OpenNeko custom credential header must be non-empty.',
        );
      }
      return { headers: { [header]: key } };
    }
  }
}

export function registerOpenNekoPiProvider(
  models: MutableModels,
  config: OpenNekoPiProviderConfig,
): OpenNekoPiProviderProjection {
  const projection = projectOpenNekoPiProvider(config);
  models.setProvider(projection.provider);
  return projection;
}

function resolveApiId(protocol: OpenNekoPiProtocolProfile): Api {
  switch (protocol) {
    case 'newapi':
    case 'openai-chat':
    case 'ollama':
      return 'openai-completions';
    case 'openai-responses':
      return 'openai-responses';
    case 'anthropic':
      return 'anthropic-messages';
    case 'google':
      return 'google-generative-ai';
    default:
      throw new OpenNekoPiProviderProjectionError(
        'unsupported-protocol',
        `OpenNeko provider protocol ${String(protocol)} is not supported by the Pi projection.`,
      );
  }
}

function validateConfig(config: OpenNekoPiProviderConfig): void {
  if (config.id.trim().length === 0) {
    throw new OpenNekoPiProviderProjectionError(
      'invalid-provider',
      'OpenNeko Pi provider id must be non-empty.',
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(config.baseUrl);
  } catch {
    throw new OpenNekoPiProviderProjectionError(
      'invalid-endpoint',
      `OpenNeko Pi provider ${config.id} has an invalid baseUrl.`,
    );
  }
  if (
    endpoint.protocol !== 'https:' &&
    endpoint.hostname !== 'localhost' &&
    endpoint.hostname !== '127.0.0.1' &&
    endpoint.hostname !== '[::1]'
  ) {
    throw new OpenNekoPiProviderProjectionError(
      'invalid-endpoint',
      `OpenNeko Pi provider ${config.id} must use HTTPS unless it is local.`,
    );
  }
  const ids = new Set<string>();
  if (config.models.length === 0) {
    throw new OpenNekoPiProviderProjectionError(
      'invalid-model',
      `OpenNeko Pi provider ${config.id} requires at least one model.`,
    );
  }
  for (const model of config.models) {
    if (
      model.id.trim().length === 0 ||
      !Number.isInteger(model.contextWindow) ||
      model.contextWindow <= 0 ||
      !Number.isInteger(model.maxTokens) ||
      model.maxTokens <= 0 ||
      ids.has(model.id)
    ) {
      throw new OpenNekoPiProviderProjectionError(
        'invalid-model',
        `OpenNeko Pi provider ${config.id} has an invalid or duplicate model ${model.id}.`,
      );
    }
    resolveApiId(model.protocol ?? config.protocol);
    ids.add(model.id);
  }
  if (config.auth?.type === 'custom-header' && config.auth.header.trim().length === 0) {
    throw new OpenNekoPiProviderProjectionError(
      'invalid-provider',
      'OpenNeko custom credential header must be non-empty.',
    );
  }
}
