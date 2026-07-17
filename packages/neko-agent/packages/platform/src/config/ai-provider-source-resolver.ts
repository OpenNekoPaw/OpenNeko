import type {
  AccountAiCatalogSnapshot,
  AccountAiCatalogDiagnostic,
  AccountAiCatalogStatus,
  ChatModelOption,
  ModelSourceGroup,
  ModelType,
  SecretSafeModelProjection,
  SecretSafeProviderProjection,
} from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import type { Model, Provider } from '../types/provider';
import type { AssistantConfigDiagnostic } from './config-diagnostic';
import { isProviderConfigured } from './provider-configuration';
import { ChatModelService } from './chat-model-service';
import {
  projectLlmParameterControls,
  resolveEffectiveLlmProviderView,
} from './llm-parameter-projection';

export const ACCOUNT_GATEWAY_PROVIDER_ID = 'neko-account-gateway';

export interface AiProviderSourceInput {
  readonly providers: readonly Provider[];
  readonly models: readonly Model[];
  readonly userConfigReadResult?: ConfigReadResult | null;
  readonly configDiagnostic?: AssistantConfigDiagnostic;
  readonly accountCatalog?: AccountAiCatalogSnapshot | null;
}

export interface ExplicitAiConfigState {
  readonly isExplicit: boolean;
  readonly invalidDiagnostic?: AssistantConfigDiagnostic;
}

export interface AiProviderSourceProjection {
  readonly providers: readonly SecretSafeProviderProjection[];
  readonly models: readonly SecretSafeModelProjection[];
  readonly chatModelOptions: readonly ChatModelOption[];
  readonly modelGroups: readonly ModelSourceGroup[];
  readonly accountConfigDiagnostic?: AssistantConfigDiagnostic;
  readonly explicitAiConfig: ExplicitAiConfigState;
  readonly hasAccountGateway: boolean;
  readonly hasSelectableModels: boolean;
}

const chatModelService = new ChatModelService();

export function resolveAiProviderSources(input: AiProviderSourceInput): AiProviderSourceProjection {
  const explicitAiConfig = detectExplicitAiConfig(input);
  const accountModels = buildAccountModelOptions(input.accountCatalog);
  const explicitModelOptions = chatModelService.getChatModelOptions(
    [...input.providers],
    [...input.models],
  );
  const chatModelOptions = [
    ...accountModels.filter((option) => option.category === 'llm'),
    ...explicitModelOptions,
  ];
  const accountGroup = buildAccountModelGroup(input.accountCatalog);
  const explicitGroups = buildExplicitModelGroups(input.providers, explicitModelOptions);
  const modelGroups = [...(accountGroup ? [accountGroup] : []), ...explicitGroups];

  return {
    providers: [
      ...(input.accountCatalog ? [toSecretSafeAccountProvider(input.accountCatalog.provider)] : []),
      ...input.providers.map((provider) => toSecretSafeProvider(provider)),
    ],
    models: [
      ...(input.accountCatalog ? input.accountCatalog.models.map(toSecretSafeAccountModel) : []),
      ...input.models.map(toSecretSafeModel),
    ],
    chatModelOptions,
    modelGroups,
    ...(buildAccountConfigDiagnostic(input.accountCatalog)
      ? {
          accountConfigDiagnostic: buildAccountConfigDiagnostic(input.accountCatalog),
        }
      : {}),
    explicitAiConfig,
    hasAccountGateway: !!accountGroup,
    hasSelectableModels: accountModels.length > 0 || explicitModelOptions.length > 0,
  };
}

export function detectExplicitAiConfig(input: AiProviderSourceInput): ExplicitAiConfigState {
  const result = input.userConfigReadResult;
  if (result?.status !== 'ok') {
    return { isExplicit: false };
  }

  const raw = result.config;
  const isExplicit =
    hasNonEmptyArray(raw.providers) ||
    hasNonEmptyArray(raw.models) ||
    isNonEmptyString(raw.defaultProvider) ||
    isNonEmptyString(raw.defaultModel) ||
    hasNonEmptyRecord(raw.defaultModels) ||
    hasNonEmptyRecord(raw.defaultModelPurposes) ||
    hasNonEmptyRecord(raw.providerOverrides) ||
    hasNonEmptyRecord(raw.modelOverrides);

  if (!isExplicit) {
    return { isExplicit: false };
  }

  const invalidDiagnostic = isExplicitAiAvailabilityDiagnostic(input.configDiagnostic)
    ? input.configDiagnostic
    : undefined;
  return {
    isExplicit: true,
    ...(invalidDiagnostic ? { invalidDiagnostic } : {}),
  };
}

function buildAccountModelOptions(
  catalog?: AccountAiCatalogSnapshot | null,
): readonly ChatModelOption[] {
  if (!isAvailableAccountCatalog(catalog)) return [];
  const allowed = new Set(catalog.entitlement.allowedModelIds);
  const disabled = new Set(catalog.entitlement.disabledModelIds ?? []);
  return catalog.models
    .filter((model) => model.enabled !== false)
    .filter((model) => allowed.has(model.id) && !disabled.has(model.id))
    .map((model) => {
      const category = model.type ?? 'llm';
      const modelName = model.displayName || model.name || model.id;
      const effectiveProvider =
        resolveEffectiveLlmProviderView(model, catalog.provider) ?? catalog.provider;
      return {
        id: `${catalog.provider.id}:${model.id}`,
        label: `${catalog.provider.displayName || catalog.provider.name} / ${modelName}`,
        providerId: catalog.provider.id,
        modelId: model.id,
        providerLabel: catalog.provider.displayName || catalog.provider.name || catalog.provider.id,
        source: 'account-gateway',
        ...(catalog.provider.connectionKind
          ? { connectionKind: catalog.provider.connectionKind }
          : {}),
        ...(effectiveProvider.protocolProfile
          ? { protocolProfile: effectiveProvider.protocolProfile }
          : {}),
        ...(catalog.provider.supportLevel ? { supportLevel: catalog.provider.supportLevel } : {}),
        capabilities: [...model.capabilities],
        category,
        ...(model.providerExpressionProfileId
          ? { providerExpressionProfileId: model.providerExpressionProfileId }
          : {}),
        ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
        ...(isPositiveInteger(model.maxOutputTokens)
          ? { maxOutputTokens: model.maxOutputTokens }
          : {}),
        ...(category === 'llm'
          ? {
              llmParameterControls: projectLlmParameterControls({
                model,
                provider: effectiveProvider,
              }),
            }
          : {}),
      } satisfies ChatModelOption;
    });
}

function buildAccountModelGroup(
  catalog?: AccountAiCatalogSnapshot | null,
): ModelSourceGroup | undefined {
  const options = buildAccountModelOptions(catalog);
  if (!catalog || options.length === 0) return undefined;
  return {
    source: 'account-gateway',
    providerId: catalog.provider.id,
    providerLabel: catalog.provider.displayName || catalog.provider.name || catalog.provider.id,
    connectionKind: catalog.provider.connectionKind,
    priority: 0,
    modelsByType: groupModelOptionsByType(options),
    ...(catalog.diagnostics ? { diagnostics: catalog.diagnostics } : {}),
  };
}

function buildExplicitModelGroups(
  providers: readonly Provider[],
  options: readonly ChatModelOption[],
): readonly ModelSourceGroup[] {
  const providerOrder = new Map(providers.map((provider, index) => [provider.id, index]));
  return providers
    .filter((provider) => provider.enabled !== false)
    .filter((provider) => isProviderConfigured(provider))
    .map((provider) => {
      const providerOptions = options.filter((option) => option.providerId === provider.id);
      return {
        source: 'explicit-config',
        providerId: provider.id,
        providerLabel: provider.displayName || provider.name || provider.id,
        connectionKind: provider.connectionKind,
        priority: 1 + (providerOrder.get(provider.id) ?? 0),
        modelsByType: groupModelOptionsByType(providerOptions),
      } satisfies ModelSourceGroup;
    })
    .filter((group) => Object.keys(group.modelsByType).length > 0);
}

function groupModelOptionsByType(
  options: readonly ChatModelOption[],
): Partial<Record<ModelType, readonly ChatModelOption[]>> {
  const groups: Partial<Record<ModelType, ChatModelOption[]>> = {};
  for (const option of options) {
    const category = option.category ?? 'llm';
    groups[category] = [...(groups[category] ?? []), option];
  }
  return groups;
}

function buildAccountConfigDiagnostic(
  catalog?: AccountAiCatalogSnapshot | null,
): AssistantConfigDiagnostic | undefined {
  if (!catalog || catalog.status === 'available') return undefined;
  const code = mapAccountStatusToConfigDiagnosticCode(catalog.status);
  return {
    code,
    filePath: '<neko-account-gateway>',
    message: catalog.diagnostics?.[0]?.message ?? buildAccountDiagnosticMessage(catalog.status),
  };
}

function mapAccountStatusToConfigDiagnosticCode(
  status: AccountAiCatalogStatus,
): AssistantConfigDiagnostic['code'] {
  switch (status) {
    case 'unauthorized':
      return 'missingAccountCatalog';
    case 'entitlement-denied':
      return 'accountModelNotEntitled';
    default:
      return 'accountCatalogUnavailable';
  }
}

function buildAccountDiagnosticMessage(status: AccountAiCatalogStatus): string {
  switch (status) {
    case 'missing-session':
      return 'Neko account AI catalog is unavailable because no OAuth session is active.';
    case 'unauthorized':
      return 'Neko account AI catalog authorization failed. Log in again, then refresh Agent.';
    case 'entitlement-denied':
      return 'Neko account does not have entitlement for the selected AI catalog models.';
    default:
      return 'Neko account AI catalog is unavailable.';
  }
}

function isAvailableAccountCatalog(
  catalog?: AccountAiCatalogSnapshot | null,
): catalog is AccountAiCatalogSnapshot {
  return (
    !!catalog && catalog.status === 'available' && catalog.entitlement.allowedModelIds.length > 0
  );
}

function toSecretSafeAccountProvider(provider: Provider): SecretSafeProviderProjection {
  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.displayName,
    type: provider.type,
    enabled: provider.enabled !== false,
    connectionKind: provider.connectionKind,
    protocolProfile: provider.protocolProfile,
    supportLevel: provider.supportLevel,
    requiresApiKey: false,
    source: 'account-gateway',
  };
}

function toSecretSafeProvider(provider: Provider): SecretSafeProviderProjection {
  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.displayName,
    type: provider.type,
    enabled: provider.enabled !== false,
    connectionKind: provider.connectionKind,
    protocolProfile: provider.protocolProfile,
    supportLevel: provider.supportLevel,
    requiresApiKey: provider.requiresApiKey,
    source: 'explicit-config',
  };
}

function toSecretSafeAccountModel(model: Model): SecretSafeModelProjection {
  return {
    id: model.id,
    name: model.name,
    ...(model.displayName ? { displayName: model.displayName } : {}),
    providerId: model.providerId,
    ...(model.type ? { type: model.type } : {}),
    ...(model.protocolProfile ? { protocolProfile: model.protocolProfile } : {}),
    capabilities: [...model.capabilities],
    ...(model.providerExpressionProfileId
      ? { providerExpressionProfileId: model.providerExpressionProfileId }
      : {}),
    ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
    ...(isPositiveInteger(model.maxOutputTokens) ? { maxOutputTokens: model.maxOutputTokens } : {}),
    enabled: model.enabled !== false,
    source: 'account-gateway',
  };
}

function toSecretSafeModel(model: Model): SecretSafeModelProjection {
  return {
    ...toSecretSafeAccountModel(model),
    source: 'explicit-config',
  };
}

function isExplicitAiAvailabilityDiagnostic(
  diagnostic?: AssistantConfigDiagnostic,
): diagnostic is AssistantConfigDiagnostic {
  return (
    diagnostic?.code === 'missingProvider' ||
    diagnostic?.code === 'missingModel' ||
    diagnostic?.code === 'missingApiKey' ||
    diagnostic?.code === 'invalidDefaultProvider' ||
    diagnostic?.code === 'invalidDefaultModel' ||
    diagnostic?.code === 'invalidDefaultModelBinding'
  );
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyRecord(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
