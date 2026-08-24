import {
  AUTH_TYPES,
  MODEL_TYPES,
  PROVIDER_CONNECTION_KINDS,
  PROVIDER_MODEL_FAMILIES,
  PROVIDER_PROTOCOL_PROFILES,
  PROVIDER_SUPPORT_LEVELS,
  PROVIDER_TYPES,
  STREAM_FORMATS,
  type ProtocolVariant,
} from '@neko/ai-contracts';
import type { Model, Provider } from './types/provider';
import type { ProviderDefinition } from './config-core/types';

export type PortableProviderDefinition = ProviderDefinition;

export interface ConfigExportData {
  readonly exportedAt: string;
  readonly providers: readonly PortableProviderDefinition[];
  readonly models: readonly Model[];
}

export interface ConfigImportResult {
  readonly success: boolean;
  readonly message: string;
  readonly importedCount: number;
}

export interface CustomProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly displayName?: string;
  readonly type?: Provider['type'];
  readonly connectionKind?: Provider['connectionKind'];
  readonly protocolProfile?: Provider['protocolProfile'];
  readonly supportedModelFamilies?: Provider['supportedModelFamilies'];
  readonly requiresApiKey?: boolean;
  readonly baseUrl?: string;
}

export interface IConfigOperations {
  setProvider(provider: ProviderDefinition): Promise<void>;
  setModel(model: Model): Promise<void>;
}

export interface IConfigExportService {
  exportConfig(providers: Map<string, Provider>, models: Map<string, Model>): ConfigExportData;
  importConfig(data: ConfigExportData, operations: IConfigOperations): Promise<ConfigImportResult>;
  addCustomProvider(
    config: CustomProviderConfig,
    operations: IConfigOperations,
  ): Promise<ConfigImportResult>;
}

export class ConfigExportService implements IConfigExportService {
  exportConfig(providers: Map<string, Provider>, models: Map<string, Model>): ConfigExportData {
    return {
      exportedAt: new Date().toISOString(),
      providers: Array.from(providers.values(), projectPortableProvider),
      models: Array.from(models.values(), (model) => structuredClone(model)),
    };
  }

  async importConfig(
    data: ConfigExportData,
    operations: IConfigOperations,
  ): Promise<ConfigImportResult> {
    try {
      const parsed = parseConfigExportData(data);
      for (const provider of parsed.providers) await operations.setProvider(provider);
      for (const model of parsed.models) await operations.setModel(model);
      const importedCount = parsed.providers.length + parsed.models.length;
      return {
        success: true,
        message: `Imported ${importedCount} configuration definitions`,
        importedCount,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import configuration: ${describeError(error)}`,
        importedCount: 0,
      };
    }
  }

  async addCustomProvider(
    config: CustomProviderConfig,
    operations: IConfigOperations,
  ): Promise<ConfigImportResult> {
    try {
      const providerType = config.type ?? 'generic';
      const isLocalProvider = providerType === 'ollama';
      await operations.setProvider({
        id: requireIdentifier(config.id, 'provider id'),
        name: requireString(config.name, 'provider name'),
        displayName: config.displayName ?? config.name,
        type: providerType,
        connectionKind: config.connectionKind ?? (isLocalProvider ? 'local' : 'direct'),
        protocolProfile: config.protocolProfile ?? (isLocalProvider ? 'ollama' : 'openai-chat'),
        supportLevel: 'custom',
        ...(config.supportedModelFamilies === undefined
          ? {}
          : { supportedModelFamilies: config.supportedModelFamilies }),
        requiresApiKey: config.requiresApiKey ?? !isLocalProvider,
        apiUrl: config.baseUrl ?? '',
        enabled: true,
      });
      return {
        success: true,
        message: `Custom provider "${config.name}" added successfully`,
        importedCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        message: describeError(error),
        importedCount: 0,
      };
    }
  }
}

export function parseConfigExportData(value: unknown): ConfigExportData {
  if (!isRecord(value)) throw new TypeError('Configuration export must be a record.');
  assertExactKeys(value, new Set(['exportedAt', 'providers', 'models']), 'configuration export');
  const exportedAt = requireString(value['exportedAt'], 'exportedAt');
  if (Number.isNaN(Date.parse(exportedAt))) throw new TypeError('exportedAt must be an ISO date.');
  const providers = requireArray(value['providers'], 'providers').map(parsePortableProvider);
  const models = requireArray(value['models'], 'models').map(parsePortableModel);
  return Object.freeze({
    exportedAt,
    providers: Object.freeze(providers),
    models: Object.freeze(models),
  });
}

function projectPortableProvider(provider: Provider): PortableProviderDefinition {
  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.displayName,
    type: provider.type,
    apiUrl: provider.apiUrl,
    enabled: provider.enabled,
    ...(provider.connectionKind === undefined ? {} : { connectionKind: provider.connectionKind }),
    ...(provider.protocolProfile === undefined
      ? {}
      : { protocolProfile: provider.protocolProfile }),
    ...(provider.supportLevel === undefined ? {} : { supportLevel: provider.supportLevel }),
    ...(provider.supportedModelFamilies === undefined
      ? {}
      : { supportedModelFamilies: [...provider.supportedModelFamilies] }),
    ...(provider.requiresApiKey === undefined ? {} : { requiresApiKey: provider.requiresApiKey }),
    ...(provider.builtin === undefined ? {} : { builtin: provider.builtin }),
    ...(provider.supportsBeta === undefined ? {} : { supportsBeta: provider.supportsBeta }),
    ...(provider.useBearerAuth === undefined ? {} : { useBearerAuth: provider.useBearerAuth }),
    ...(provider.options === undefined ? {} : { options: structuredClone(provider.options) }),
    ...(provider.protocolVariant === undefined
      ? {}
      : { protocolVariant: structuredClone(provider.protocolVariant) }),
  };
}

function parsePortableProvider(value: unknown): PortableProviderDefinition {
  if (!isRecord(value)) throw new TypeError('Provider definition must be a record.');
  assertExactKeys(
    value,
    new Set([
      'id',
      'name',
      'displayName',
      'type',
      'apiUrl',
      'enabled',
      'connectionKind',
      'protocolProfile',
      'supportLevel',
      'supportedModelFamilies',
      'requiresApiKey',
      'builtin',
      'supportsBeta',
      'useBearerAuth',
      'options',
      'protocolVariant',
    ]),
    'provider definition',
  );
  const id = requireIdentifier(value['id'], 'provider id');
  const name = requireString(value['name'], `provider '${id}' name`);
  const displayName = requireString(value['displayName'], `provider '${id}' displayName`);
  const type = requireEnum(value['type'], PROVIDER_TYPES, `provider '${id}' type`);
  const apiUrl = requireString(value['apiUrl'], `provider '${id}' apiUrl`, true);
  const enabled = requireBoolean(value['enabled'], `provider '${id}' enabled`);
  return {
    id,
    name,
    displayName,
    type,
    apiUrl,
    enabled,
    ...optionalEnumField(value, 'connectionKind', PROVIDER_CONNECTION_KINDS),
    ...optionalEnumField(value, 'protocolProfile', PROVIDER_PROTOCOL_PROFILES),
    ...optionalEnumField(value, 'supportLevel', PROVIDER_SUPPORT_LEVELS),
    ...optionalEnumArrayField(value, 'supportedModelFamilies', PROVIDER_MODEL_FAMILIES),
    ...optionalBooleanField(value, 'requiresApiKey'),
    ...optionalBooleanField(value, 'builtin'),
    ...optionalBooleanField(value, 'supportsBeta'),
    ...optionalBooleanField(value, 'useBearerAuth'),
    ...optionalRecordField(value, 'options'),
    ...('protocolVariant' in value
      ? { protocolVariant: parseProtocolVariant(value['protocolVariant'], id) }
      : {}),
  };
}

function parsePortableModel(value: unknown): Model {
  if (!isRecord(value)) throw new TypeError('Model definition must be a record.');
  assertExactKeys(
    value,
    new Set([
      'id',
      'name',
      'displayName',
      'providerId',
      'protocolProfile',
      'protocol',
      'useBearerAuth',
      'supportsBeta',
      'type',
      'capabilities',
      'providerExpressionProfileId',
      'contextWindow',
      'maxOutputTokens',
      'inputCostPer1k',
      'outputCostPer1k',
      'enabled',
      'options',
    ]),
    'model definition',
  );
  const id = requireIdentifier(value['id'], 'model id');
  const name = requireString(value['name'], `model '${id}' name`);
  const providerId = requireIdentifier(value['providerId'], `model '${id}' providerId`);
  const capabilities = value['capabilities'];
  if (!Array.isArray(capabilities) || capabilities.some((item) => typeof item !== 'string')) {
    throw new TypeError(`Model '${id}' capabilities must be a string array.`);
  }
  return {
    id,
    name,
    providerId,
    capabilities: [...capabilities],
    enabled: requireBoolean(value['enabled'], `model '${id}' enabled`),
    ...optionalStringField(value, 'displayName'),
    ...optionalEnumField(value, 'protocolProfile', PROVIDER_PROTOCOL_PROFILES),
    ...optionalEnumField(value, 'protocol', PROVIDER_TYPES),
    ...optionalBooleanField(value, 'useBearerAuth'),
    ...optionalBooleanField(value, 'supportsBeta'),
    ...optionalEnumField(value, 'type', MODEL_TYPES),
    ...optionalStringField(value, 'providerExpressionProfileId'),
    ...optionalNumberField(value, 'contextWindow'),
    ...optionalNumberField(value, 'maxOutputTokens'),
    ...optionalNumberField(value, 'inputCostPer1k'),
    ...optionalNumberField(value, 'outputCostPer1k'),
    ...optionalRecordField(value, 'options'),
  };
}

function parseProtocolVariant(value: unknown, providerId: string): ProtocolVariant {
  if (!isRecord(value)) {
    throw new TypeError(`Provider '${providerId}' protocolVariant must be a record.`);
  }
  assertExactKeys(
    value,
    new Set([
      'basePath',
      'authType',
      'authHeader',
      'streamFormat',
      'streamDoneMarker',
      'extraHeaders',
      'mediaEndpoints',
    ]),
    `provider '${providerId}' protocolVariant`,
  );
  return {
    ...optionalStringField(value, 'basePath', true),
    ...optionalEnumField(value, 'authType', AUTH_TYPES),
    ...optionalStringField(value, 'authHeader'),
    ...optionalEnumField(value, 'streamFormat', STREAM_FORMATS),
    ...optionalStringField(value, 'streamDoneMarker', true),
    ...optionalStringRecordField(value, 'extraHeaders'),
    ...('mediaEndpoints' in value
      ? { mediaEndpoints: parseMediaEndpoints(value['mediaEndpoints'], providerId) }
      : {}),
  };
}

function parseMediaEndpoints(
  value: unknown,
  providerId: string,
): NonNullable<ProtocolVariant['mediaEndpoints']> {
  if (!isRecord(value)) {
    throw new TypeError(`Provider '${providerId}' mediaEndpoints must be a record.`);
  }
  assertExactKeys(
    value,
    new Set(['imageGenerations', 'videoGenerations', 'videoStatus', 'videoCancel']),
    `provider '${providerId}' mediaEndpoints`,
  );
  return {
    ...optionalStringField(value, 'imageGenerations'),
    ...optionalStringField(value, 'videoGenerations'),
    ...optionalStringField(value, 'videoStatus'),
    ...optionalStringField(value, 'videoCancel'),
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown field '${key}'.`);
  }
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function requireIdentifier(value: unknown, label: string): string {
  const parsed = requireString(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(parsed)) {
    throw new TypeError(`${label} contains invalid characters.`);
  }
  return parsed;
}

function requireString(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.trim().length === 0) ||
    value !== value.trim()
  ) {
    throw new TypeError(
      `${label} must be ${allowEmpty ? 'a trimmed' : 'a non-empty trimmed'} string.`,
    );
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
  return value;
}

function requireEnum<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string,
): TValue {
  const selected = allowed.find((candidate) => candidate === value);
  if (selected === undefined) throw new TypeError(`${label} is unsupported.`);
  return selected;
}

function optionalStringField<TKey extends string>(
  value: Record<string, unknown>,
  key: TKey,
  allowEmpty = false,
): Partial<Record<TKey, string>> {
  const result: Partial<Record<TKey, string>> = {};
  if (key in value) result[key] = requireString(value[key], key, allowEmpty);
  return result;
}

function optionalBooleanField<TKey extends string>(
  value: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, boolean>> {
  const result: Partial<Record<TKey, boolean>> = {};
  if (key in value) result[key] = requireBoolean(value[key], key);
  return result;
}

function optionalNumberField<TKey extends string>(
  value: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, number>> {
  if (!(key in value)) return {};
  const selected = value[key];
  if (typeof selected !== 'number' || !Number.isFinite(selected) || selected < 0) {
    throw new TypeError(`${key} must be a finite non-negative number.`);
  }
  const result: Partial<Record<TKey, number>> = {};
  result[key] = selected;
  return result;
}

function optionalEnumField<TKey extends string, TValue extends string>(
  value: Record<string, unknown>,
  key: TKey,
  allowed: readonly TValue[],
): Partial<Record<TKey, TValue>> {
  const result: Partial<Record<TKey, TValue>> = {};
  if (key in value) result[key] = requireEnum(value[key], allowed, key);
  return result;
}

function optionalEnumArrayField<TKey extends string, TValue extends string>(
  value: Record<string, unknown>,
  key: TKey,
  allowed: readonly TValue[],
): Partial<Record<TKey, readonly TValue[]>> {
  if (!(key in value)) return {};
  const raw = value[key];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TypeError(`${key} must be a non-empty array.`);
  }
  const selected = raw.map((entry) => requireEnum(entry, allowed, key));
  if (new Set(selected).size !== selected.length) {
    throw new TypeError(`${key} must not contain duplicate values.`);
  }
  const result: Partial<Record<TKey, readonly TValue[]>> = {};
  result[key] = selected;
  return result;
}

function optionalRecordField<TKey extends string>(
  value: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, Record<string, unknown>>> {
  if (!(key in value)) return {};
  const selected = value[key];
  if (!isRecord(selected)) throw new TypeError(`${key} must be a record.`);
  const result: Partial<Record<TKey, Record<string, unknown>>> = {};
  result[key] = structuredClone(selected);
  return result;
}

function optionalStringRecordField<TKey extends string>(
  value: Record<string, unknown>,
  key: TKey,
): Partial<Record<TKey, Record<string, string>>> {
  if (!(key in value)) return {};
  const selected = value[key];
  if (!isRecord(selected) || Object.values(selected).some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`${key} must be a string record.`);
  }
  const result: Partial<Record<TKey, Record<string, string>>> = {};
  result[key] = Object.fromEntries(
    Object.entries(selected).map(([entryKey, entry]) => [entryKey, requireString(entry, entryKey)]),
  );
  return result;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
