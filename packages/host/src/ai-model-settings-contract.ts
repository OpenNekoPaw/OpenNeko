import type {
  ModelCapability,
  ModelType,
  ProviderType,
  ProviderConnectionKind,
  ProviderModelFamily,
  ProviderSupportLevel,
} from '@neko/ai-contracts';
import { PROVIDER_TYPES } from '@neko/ai-contracts';

export { defaultDesktopAiModelCapabilities } from './ai-model-provider-presets';

export type DesktopAiModelProtocol = string;

export interface DesktopAiModelTemplate {
  readonly id: string;
  readonly providerType: ProviderType;
  readonly apiName: string;
  readonly displayName: string;
  readonly type: ModelType;
  readonly capabilities: readonly ModelCapability[];
}

export interface DesktopAiGenerationProviderCapability {
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
  readonly modelTemplates: readonly DesktopAiModelTemplate[];
}

export const DESKTOP_AI_MODEL_SETTINGS_CHANNEL = 'openneko:desktop:ai-model-settings:execute';

export type DesktopAiModelType = ModelType;
export type DesktopAiModelCapability = string;
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
  readonly capabilities: readonly string[];
  readonly enabled: boolean;
}

export interface DesktopAiDialogueProviderCapability {
  readonly providerId: string;
  readonly displayName: string;
  readonly source: 'catalog' | 'declared';
  readonly settingsNamespace: string;
  readonly settingsPath: readonly string[];
  readonly providerType: ProviderType;
  readonly defaultApiUrl: string;
  readonly connectionKind: ProviderConnectionKind;
  readonly requiresApiKey: boolean;
}

export type DesktopAiDialogueCapabilityProjection =
  | {
      readonly status: 'available';
      readonly providers: readonly DesktopAiDialogueProviderCapability[];
      readonly protocols: readonly string[];
      readonly diagnostics: readonly string[];
    }
  | {
      readonly status: 'unavailable';
      readonly providers: readonly [];
      readonly protocols: readonly [];
      readonly diagnostics: readonly [string, ...string[]];
    };

export interface DesktopAiModelSettingsProjection {
  readonly dialogueCapabilities: DesktopAiDialogueCapabilityProjection;
  readonly generationCapabilities: readonly DesktopAiGenerationProviderCapability[];
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
        readonly existingId?: string;
        readonly providerId: string;
        readonly apiName: string;
        readonly displayName: string;
        readonly type: ModelType;
        readonly capabilities: readonly string[];
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
        apiUrl: httpUrlOrEmpty(provider['apiUrl']),
        ...(provider['protocol'] === undefined
          ? {}
          : {
              protocol: nonEmpty(provider['protocol'], 'provider.protocol'),
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
      [
        'existingId',
        'providerId',
        'apiName',
        'displayName',
        'type',
        'capabilities',
        'enabled',
        'templateId',
      ],
      'Model input',
    );
    return {
      requestId,
      operation,
      model: {
        ...(model['existingId'] === undefined
          ? {}
          : { existingId: identity(model['existingId'], 'model.existingId') }),
        providerId: identity(model['providerId'], 'model.providerId'),
        apiName: nonEmpty(model['apiName'], 'model.apiName'),
        displayName: nonEmpty(model['displayName'], 'model.displayName'),
        type: modelType(model['type']),
        capabilities: modelCapabilities(model['capabilities']),
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
  exactKeys(
    record,
    ['dialogueCapabilities', 'generationCapabilities', 'providers', 'models', 'defaults'],
    'AI model settings projection',
  );
  if (
    !Array.isArray(record['generationCapabilities']) ||
    !Array.isArray(record['providers']) ||
    !Array.isArray(record['models'])
  ) {
    throw invalid('AI model settings capabilities, providers, and models must be arrays.');
  }
  const defaultsRecord = exactRecord(record['defaults'], 'AI model defaults');
  exactKeys(defaultsRecord, ['llm', 'image', 'video', 'audio'], 'AI model defaults');
  const defaults: Partial<Record<ModelType, DesktopAiModelRef>> = {};
  for (const type of ['llm', 'image', 'video', 'audio'] as const) {
    const raw = defaultsRecord[type];
    if (raw !== undefined) defaults[type] = parseModelRef(raw);
  }
  const generationCapabilities = record['generationCapabilities'].map(parseGenerationCapability);
  assertUnique(
    generationCapabilities.map((capability) => capability.id),
    'Generation Provider capability IDs',
  );
  assertUnique(
    generationCapabilities.map((capability) => capability.providerType),
    'Generation Provider capability types',
  );
  return {
    dialogueCapabilities: parseDialogueCapabilities(record['dialogueCapabilities']),
    generationCapabilities,
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
    apiUrl: httpUrlOrEmpty(record['apiUrl']),
    ...(record['protocol'] === undefined
      ? {}
      : {
          protocol: nonEmpty(record['protocol'], 'provider.protocol'),
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

function parseDialogueCapabilities(value: unknown): DesktopAiDialogueCapabilityProjection {
  const record = exactRecord(value, 'Dialogue Provider capabilities');
  exactKeys(
    record,
    ['status', 'providers', 'protocols', 'diagnostics'],
    'Dialogue Provider capabilities',
  );
  const status = oneOf(record['status'], ['available', 'unavailable'] as const, 'status');
  if (
    !Array.isArray(record['providers']) ||
    !Array.isArray(record['protocols']) ||
    !Array.isArray(record['diagnostics'])
  ) {
    throw invalid('Dialogue Provider capability fields must be arrays.');
  }
  const providers = record['providers'].map((value, index) => {
    const provider = exactRecord(value, `Dialogue Provider capability ${index}`);
    exactKeys(
      provider,
      [
        'providerId',
        'displayName',
        'source',
        'settingsNamespace',
        'settingsPath',
        'providerType',
        'defaultApiUrl',
        'connectionKind',
        'requiresApiKey',
      ],
      `Dialogue Provider capability ${index}`,
    );
    if (
      !Array.isArray(provider['settingsPath']) ||
      provider['settingsPath'].some(
        (entry) => typeof entry !== 'string' || entry.trim().length === 0,
      )
    ) {
      throw invalid(`Dialogue Provider capability ${index} settingsPath is invalid.`);
    }
    return {
      providerId: identity(provider['providerId'], `capabilities.providers[${index}].providerId`),
      displayName: nonEmpty(
        provider['displayName'],
        `capabilities.providers[${index}].displayName`,
      ),
      source: oneOf(
        provider['source'],
        ['catalog', 'declared'] as const,
        `capabilities.providers[${index}].source`,
      ),
      settingsNamespace: nonEmpty(
        provider['settingsNamespace'],
        `capabilities.providers[${index}].settingsNamespace`,
      ),
      settingsPath: [...provider['settingsPath']],
      providerType: oneOf(
        provider['providerType'],
        PROVIDER_TYPES,
        `capabilities.providers[${index}].providerType`,
      ),
      defaultApiUrl: httpUrlOrEmpty(provider['defaultApiUrl']),
      connectionKind: oneOf(
        provider['connectionKind'],
        ['gateway', 'local', 'direct'] as const,
        `capabilities.providers[${index}].connectionKind`,
      ),
      requiresApiKey: booleanValue(
        provider['requiresApiKey'],
        `capabilities.providers[${index}].requiresApiKey`,
      ),
    };
  });
  const protocols = record['protocols'].map((entry, index) =>
    nonEmpty(entry, `capabilities.protocols[${index}]`),
  );
  const diagnostics = record['diagnostics'].map((entry, index) =>
    nonEmpty(entry, `capabilities.diagnostics[${index}]`),
  );
  if (status === 'unavailable') {
    if (providers.length !== 0 || protocols.length !== 0 || diagnostics.length === 0) {
      throw invalid('Unavailable dialogue capabilities must contain only diagnostics.');
    }
    return {
      status,
      providers: [],
      protocols: [],
      diagnostics: diagnostics as [string, ...string[]],
    };
  }
  return { status, providers, protocols, diagnostics };
}

function parseGenerationCapability(
  value: unknown,
  index: number,
): DesktopAiGenerationProviderCapability {
  const record = exactRecord(value, `Generation Provider capability ${index}`);
  exactKeys(
    record,
    [
      'id',
      'displayName',
      'suggestedProviderId',
      'providerType',
      'defaultApiUrl',
      'requiresApiUrl',
      'connectionKind',
      'supportLevel',
      'requiresApiKey',
      'allowCustomModels',
      'supportedModelTypes',
      'modelTemplates',
    ],
    `Generation Provider capability ${index}`,
  );
  if (!Array.isArray(record['supportedModelTypes']) || record['supportedModelTypes'].length === 0) {
    throw invalid(`Generation Provider capability ${index} supportedModelTypes is invalid.`);
  }
  if (!Array.isArray(record['modelTemplates'])) {
    throw invalid(`Generation Provider capability ${index} modelTemplates is invalid.`);
  }
  const providerType = oneOf(record['providerType'], PROVIDER_TYPES, 'providerType');
  const supportedModelTypes = record['supportedModelTypes'].map((type) =>
    oneOf(type, ['image', 'video', 'audio'] as const, 'supportedModelType'),
  );
  assertUnique(supportedModelTypes, `Generation Provider capability ${index} model types`);
  const modelTemplates = record['modelTemplates'].map((template, templateIndex) =>
    parseModelTemplate(template, index, templateIndex, providerType),
  );
  assertUnique(
    modelTemplates.map((template) => template.id),
    `Generation Provider capability ${index} model template IDs`,
  );
  return {
    id: identity(record['id'], `generationCapabilities[${index}].id`),
    displayName: nonEmpty(record['displayName'], `generationCapabilities[${index}].displayName`),
    suggestedProviderId: identity(
      record['suggestedProviderId'],
      `generationCapabilities[${index}].suggestedProviderId`,
    ),
    providerType,
    defaultApiUrl: httpUrlOrEmpty(record['defaultApiUrl']),
    requiresApiUrl: booleanValue(record['requiresApiUrl'], 'requiresApiUrl'),
    connectionKind: oneOf(
      record['connectionKind'],
      ['gateway', 'local', 'direct'] as const,
      'connectionKind',
    ),
    supportLevel: oneOf(
      record['supportLevel'],
      ['verified', 'compatible', 'custom'] as const,
      'supportLevel',
    ),
    requiresApiKey: booleanValue(record['requiresApiKey'], 'requiresApiKey'),
    allowCustomModels: booleanValue(record['allowCustomModels'], 'allowCustomModels'),
    supportedModelTypes,
    modelTemplates,
  };
}

function parseModelTemplate(
  value: unknown,
  capabilityIndex: number,
  templateIndex: number,
  providerType: ProviderType,
): DesktopAiModelTemplate {
  const label = `Generation Provider capability ${capabilityIndex} model template ${templateIndex}`;
  const record = exactRecord(value, label);
  exactKeys(
    record,
    ['id', 'providerType', 'apiName', 'displayName', 'type', 'capabilities'],
    label,
  );
  const templateProviderType = oneOf(record['providerType'], PROVIDER_TYPES, 'providerType');
  if (templateProviderType !== providerType) {
    throw invalid(`${label} providerType does not match its Provider capability.`);
  }
  return {
    id: identity(record['id'], `${label}.id`),
    providerType: templateProviderType,
    apiName: nonEmpty(record['apiName'], `${label}.apiName`),
    displayName: nonEmpty(record['displayName'], `${label}.displayName`),
    type: oneOf(record['type'], ['image', 'video', 'audio'] as const, `${label}.type`),
    capabilities: modelCapabilities(record['capabilities']) as readonly ModelCapability[],
  };
}

function parseModelView(value: unknown): DesktopAiModelView {
  const record = exactRecord(value, 'Model view');
  exactKeys(
    record,
    ['id', 'providerId', 'apiName', 'displayName', 'type', 'capabilities', 'enabled'],
    'Model view',
  );
  return {
    id: identity(record['id'], 'model.id'),
    providerId: identity(record['providerId'], 'model.providerId'),
    apiName: nonEmpty(record['apiName'], 'model.apiName'),
    displayName: nonEmpty(record['displayName'], 'model.displayName'),
    type: modelType(record['type']),
    capabilities: modelCapabilities(record['capabilities']),
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

function modelCapabilities(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalid('model.capabilities must be a non-empty array.');
  }
  const capabilities = value.map((capability, index) =>
    nonEmpty(capability, `model.capabilities[${index}]`),
  );
  if (new Set(capabilities).size !== capabilities.length) {
    throw invalid('model.capabilities must not contain duplicates.');
  }
  return capabilities;
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

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw invalid(`${label} must not contain duplicates.`);
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

function httpUrlOrEmpty(value: unknown): string {
  if (value === '') return '';
  return httpUrl(value);
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
