import type {
  ModelType,
  ProviderType,
  ProviderConnectionKind,
  ProviderModelFamily,
} from '@neko/ai-contracts';
import { PROVIDER_TYPES } from '@neko/ai-contracts';
import type { DesktopAiModelProtocol } from './ai-model-provider-presets';

export {
  DESKTOP_AI_PROVIDER_PRESETS,
  type DesktopAiModelProtocol,
  type DesktopAiModelTemplate,
  type DesktopAiProviderPreset,
} from './ai-model-provider-presets';

export const DESKTOP_AI_MODEL_SETTINGS_CHANNEL = 'openneko:desktop:ai-model-settings:execute';

export type DesktopAiModelType = ModelType;
export type DesktopAiProviderModelFamily = ProviderModelFamily;
export type DesktopAiProviderType = ProviderType;

export interface DesktopAiModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface DesktopAiProviderView {
  readonly id: string;
  readonly displayName: string;
  readonly type: ProviderType;
  readonly apiUrl: string;
  readonly protocol?: DesktopAiModelProtocol;
  readonly connectionKind: ProviderConnectionKind;
  readonly enabled: boolean;
  readonly supportedModelFamilies: readonly ProviderModelFamily[];
  readonly credentialStatus: 'configured' | 'missing' | 'invalid' | 'not-required';
  readonly diagnostic?: string;
}

export interface DesktopAiModelView {
  readonly id: string;
  readonly providerId: string;
  readonly apiName: string;
  readonly displayName: string;
  readonly type: ModelType;
  readonly enabled: boolean;
}

export interface DesktopAiModelSettingsProjection {
  readonly providers: readonly DesktopAiProviderView[];
  readonly models: readonly DesktopAiModelView[];
  readonly defaults: Readonly<Partial<Record<ModelType, DesktopAiModelRef>>>;
}

export type DesktopAiModelSettingsRequest =
  | { readonly requestId: string; readonly operation: 'get' }
  | {
      readonly requestId: string;
      readonly operation: 'save-provider';
      readonly provider: {
        readonly id: string;
        readonly displayName: string;
        readonly type: ProviderType;
        readonly apiUrl: string;
        readonly protocol?: DesktopAiModelProtocol;
        readonly presetId?: string;
        readonly supportedModelFamilies: readonly ProviderModelFamily[];
        readonly enabled: boolean;
      };
      readonly apiKey?: string;
    }
  | {
      readonly requestId: string;
      readonly operation: 'save-model';
      readonly model: {
        readonly id: string;
        readonly providerId: string;
        readonly apiName: string;
        readonly displayName: string;
        readonly type: ModelType;
        readonly enabled: boolean;
        readonly templateId?: string;
      };
    }
  | {
      readonly requestId: string;
      readonly operation: 'delete-provider';
      readonly providerId: string;
    }
  | {
      readonly requestId: string;
      readonly operation: 'delete-model';
      readonly modelId: string;
    }
  | {
      readonly requestId: string;
      readonly operation: 'set-default';
      readonly modelType: ModelType;
      readonly ref: DesktopAiModelRef;
    };

export interface DesktopAiModelSettingsResponse {
  readonly requestId: string;
  readonly projection: DesktopAiModelSettingsProjection;
  readonly runtimeEffect: 'unchanged' | 'applied' | 'pending';
}

export interface OpenNekoDesktopAiModelSettingsBridge {
  readonly aiModelSettings: {
    get(): Promise<DesktopAiModelSettingsProjection>;
    saveProvider(
      input: Extract<DesktopAiModelSettingsRequest, { operation: 'save-provider' }>['provider'],
      apiKey?: string,
    ): Promise<DesktopAiModelSettingsResponse>;
    saveModel(
      input: Extract<DesktopAiModelSettingsRequest, { operation: 'save-model' }>['model'],
    ): Promise<DesktopAiModelSettingsResponse>;
    deleteProvider(providerId: string): Promise<DesktopAiModelSettingsResponse>;
    deleteModel(modelId: string): Promise<DesktopAiModelSettingsResponse>;
    setDefault(
      modelType: ModelType,
      ref: DesktopAiModelRef,
    ): Promise<DesktopAiModelSettingsResponse>;
  };
}

export function createDesktopAiModelSettingsRequest(
  request: DesktopAiModelSettingsRequest,
): DesktopAiModelSettingsRequest {
  return parseDesktopAiModelSettingsRequest(request);
}

export function parseDesktopAiModelSettingsRequest(value: unknown): DesktopAiModelSettingsRequest {
  const record = exactRecord(value, 'AI model settings request');
  const requestId = nonEmpty(record['requestId'], 'requestId');
  const operation = oneOf(
    record['operation'],
    [
      'get',
      'save-provider',
      'save-model',
      'delete-provider',
      'delete-model',
      'set-default',
    ] as const,
    'operation',
  );
  if (operation === 'get') {
    exactKeys(record, ['requestId', 'operation'], 'AI model settings get request');
    return { requestId, operation };
  }
  if (operation === 'save-provider') {
    exactKeys(record, ['requestId', 'operation', 'provider', 'apiKey'], 'Provider save request');
    const provider = exactRecord(record['provider'], 'Provider input');
    exactKeys(
      provider,
      [
        'id',
        'displayName',
        'type',
        'apiUrl',
        'protocol',
        'presetId',
        'supportedModelFamilies',
        'enabled',
      ],
      'Provider input',
    );
    const apiKey = record['apiKey'];
    if (apiKey !== undefined && typeof apiKey !== 'string')
      throw invalid('apiKey must be a string.');
    return {
      requestId,
      operation,
      provider: {
        id: identity(provider['id'], 'provider.id'),
        displayName: nonEmpty(provider['displayName'], 'provider.displayName'),
        type: oneOf(provider['type'], PROVIDER_TYPES, 'provider.type'),
        apiUrl: httpUrl(provider['apiUrl']),
        ...(provider['protocol'] === undefined
          ? {}
          : {
              protocol: oneOf(
                provider['protocol'],
                ['openai-chat', 'openai-responses', 'anthropic', 'ollama'] as const,
                'provider.protocol',
              ),
            }),
        ...(provider['presetId'] === undefined
          ? {}
          : { presetId: identity(provider['presetId'], 'provider.presetId') }),
        supportedModelFamilies: providerModelFamilies(provider['supportedModelFamilies']),
        enabled: booleanValue(provider['enabled'], 'provider.enabled'),
      },
      ...(apiKey === undefined ? {} : { apiKey: nonEmpty(apiKey, 'apiKey') }),
    };
  }
  if (operation === 'save-model') {
    exactKeys(record, ['requestId', 'operation', 'model'], 'Model save request');
    const model = exactRecord(record['model'], 'Model input');
    exactKeys(
      model,
      ['id', 'providerId', 'apiName', 'displayName', 'type', 'enabled', 'templateId'],
      'Model input',
    );
    return {
      requestId,
      operation,
      model: {
        id: identity(model['id'], 'model.id'),
        providerId: identity(model['providerId'], 'model.providerId'),
        apiName: nonEmpty(model['apiName'], 'model.apiName'),
        displayName: nonEmpty(model['displayName'], 'model.displayName'),
        type: modelType(model['type']),
        enabled: booleanValue(model['enabled'], 'model.enabled'),
        ...(model['templateId'] === undefined
          ? {}
          : { templateId: identity(model['templateId'], 'model.templateId') }),
      },
    };
  }
  if (operation === 'delete-provider') {
    exactKeys(record, ['requestId', 'operation', 'providerId'], 'Provider delete request');
    return {
      requestId,
      operation,
      providerId: identity(record['providerId'], 'providerId'),
    };
  }
  if (operation === 'delete-model') {
    exactKeys(record, ['requestId', 'operation', 'modelId'], 'Model delete request');
    return {
      requestId,
      operation,
      modelId: identity(record['modelId'], 'modelId'),
    };
  }
  exactKeys(record, ['requestId', 'operation', 'modelType', 'ref'], 'Default model request');
  return {
    requestId,
    operation,
    modelType: modelType(record['modelType']),
    ref: parseModelRef(record['ref']),
  };
}

export function parseDesktopAiModelSettingsResponse(
  value: unknown,
  expectedRequestId: string,
): DesktopAiModelSettingsResponse {
  const record = exactRecord(value, 'AI model settings response');
  exactKeys(record, ['requestId', 'projection', 'runtimeEffect'], 'AI model settings response');
  const requestId = nonEmpty(record['requestId'], 'requestId');
  if (requestId !== expectedRequestId)
    throw invalid('AI model settings response request mismatch.');
  return {
    requestId,
    projection: parseDesktopAiModelSettingsProjection(record['projection']),
    runtimeEffect: oneOf(
      record['runtimeEffect'],
      ['unchanged', 'applied', 'pending'] as const,
      'runtimeEffect',
    ),
  };
}

export function parseDesktopAiModelSettingsProjection(
  value: unknown,
): DesktopAiModelSettingsProjection {
  const record = exactRecord(value, 'AI model settings projection');
  exactKeys(record, ['providers', 'models', 'defaults'], 'AI model settings projection');
  if (!Array.isArray(record['providers']) || !Array.isArray(record['models'])) {
    throw invalid('AI model settings providers and models must be arrays.');
  }
  const defaultsRecord = exactRecord(record['defaults'], 'AI model defaults');
  exactKeys(defaultsRecord, ['llm', 'image', 'video', 'audio'], 'AI model defaults');
  const defaults: Partial<Record<ModelType, DesktopAiModelRef>> = {};
  for (const type of ['llm', 'image', 'video', 'audio'] as const) {
    const raw = defaultsRecord[type];
    if (raw !== undefined) defaults[type] = parseModelRef(raw);
  }
  return {
    providers: record['providers'].map(parseProviderView),
    models: record['models'].map(parseModelView),
    defaults,
  };
}

function parseProviderView(value: unknown): DesktopAiProviderView {
  const record = exactRecord(value, 'Provider view');
  exactKeys(
    record,
    [
      'id',
      'displayName',
      'type',
      'apiUrl',
      'protocol',
      'connectionKind',
      'enabled',
      'supportedModelFamilies',
      'credentialStatus',
      'diagnostic',
    ],
    'Provider view',
  );
  const diagnostic = record['diagnostic'];
  if (diagnostic !== undefined && typeof diagnostic !== 'string')
    throw invalid('diagnostic must be a string.');
  return {
    id: identity(record['id'], 'provider.id'),
    displayName: nonEmpty(record['displayName'], 'provider.displayName'),
    type: oneOf(record['type'], PROVIDER_TYPES, 'provider.type'),
    apiUrl: httpUrl(record['apiUrl']),
    ...(record['protocol'] === undefined
      ? {}
      : {
          protocol: oneOf(
            record['protocol'],
            ['openai-chat', 'openai-responses', 'anthropic', 'ollama'] as const,
            'provider.protocol',
          ),
        }),
    connectionKind: oneOf(
      record['connectionKind'],
      ['gateway', 'local', 'direct'] as const,
      'provider.connectionKind',
    ),
    enabled: booleanValue(record['enabled'], 'provider.enabled'),
    supportedModelFamilies: providerModelFamilies(record['supportedModelFamilies']),
    credentialStatus: oneOf(
      record['credentialStatus'],
      ['configured', 'missing', 'invalid', 'not-required'] as const,
      'provider.credentialStatus',
    ),
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function parseModelView(value: unknown): DesktopAiModelView {
  const record = exactRecord(value, 'Model view');
  exactKeys(
    record,
    ['id', 'providerId', 'apiName', 'displayName', 'type', 'enabled'],
    'Model view',
  );
  return {
    id: identity(record['id'], 'model.id'),
    providerId: identity(record['providerId'], 'model.providerId'),
    apiName: nonEmpty(record['apiName'], 'model.apiName'),
    displayName: nonEmpty(record['displayName'], 'model.displayName'),
    type: modelType(record['type']),
    enabled: booleanValue(record['enabled'], 'model.enabled'),
  };
}

function parseModelRef(value: unknown): DesktopAiModelRef {
  const record = exactRecord(value, 'Model ref');
  exactKeys(record, ['providerId', 'modelId'], 'Model ref');
  return {
    providerId: identity(record['providerId'], 'ref.providerId'),
    modelId: identity(record['modelId'], 'ref.modelId'),
  };
}

function modelType(value: unknown): ModelType {
  return oneOf(value, ['llm', 'image', 'video', 'audio'] as const, 'modelType');
}

function providerModelFamilies(value: unknown): readonly ProviderModelFamily[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalid('provider.supportedModelFamilies must be a non-empty array.');
  }
  const selected = value.map((entry) =>
    oneOf(entry, ['dialogue', 'generation'] as const, 'provider.supportedModelFamilies'),
  );
  if (new Set(selected).size !== selected.length) {
    throw invalid('provider.supportedModelFamilies must not contain duplicates.');
  }
  return selected;
}

function exactRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const extras = Object.keys(record).filter((key) => !allowed.has(key));
  if (extras.length > 0) throw invalid(`${label} contains unknown fields: ${extras.join(', ')}.`);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    throw invalid(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const parsed = nonEmpty(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(parsed)) throw invalid(`${label} is invalid.`);
  return parsed;
}

function httpUrl(value: unknown): string {
  const raw = nonEmpty(value, 'apiUrl');
  const url = new URL(raw);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw invalid('apiUrl must be a credential-free HTTP(S) URL without query or fragment.');
  }
  return url.toString().replace(/\/$/u, '');
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw invalid(`${label} must be a boolean.`);
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw invalid(`${label} is invalid.`);
  return value as T[number];
}

function invalid(message: string): Error {
  return new Error(`Invalid Desktop AI model settings payload: ${message}`);
}
