import type {
  ChatModelOption,
  ModelConfig,
  ModelType,
  ProviderConfig,
  ProviderConnectionKind,
} from './config';

export type AiProviderSourceKind = 'explicit-config' | 'account-gateway';

export type AccountAiCatalogStatus =
  | 'available'
  | 'missing-session'
  | 'unavailable'
  | 'unauthorized'
  | 'entitlement-denied'
  | 'stale'
  | 'invalid';

export interface AccountAiUsageProjection {
  readonly tokens?: number;
  readonly limit?: number;
  readonly resetAt?: string;
}

export interface AccountAiEntitlementProjection {
  readonly plan?: string;
  readonly allowedModelIds: readonly string[];
  readonly disabledModelIds?: readonly string[];
  readonly usage?: AccountAiUsageProjection;
}

export interface AccountAiModelDefaults {
  readonly chat?: string;
  readonly image?: string;
  readonly video?: string;
  readonly audio?: string;
}

export interface AccountAiCatalogDiagnostic {
  readonly code: AccountAiCatalogStatus;
  readonly message: string;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface AccountAiCatalogSnapshot {
  readonly source: 'account-gateway';
  readonly provider: ProviderConfig;
  readonly models: readonly ModelConfig[];
  readonly entitlement: AccountAiEntitlementProjection;
  readonly defaults?: AccountAiModelDefaults;
  readonly status: AccountAiCatalogStatus;
  readonly version?: string;
  readonly etag?: string;
  readonly expiresAt: number;
  readonly diagnostics?: readonly AccountAiCatalogDiagnostic[];
}

export interface SecretSafeProviderProjection {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly type: ProviderConfig['type'];
  readonly enabled: boolean;
  readonly connectionKind?: ProviderConnectionKind;
  readonly protocolProfile?: ProviderConfig['protocolProfile'];
  readonly supportLevel?: ProviderConfig['supportLevel'];
  readonly requiresApiKey?: boolean;
  readonly source: AiProviderSourceKind;
}

export interface SecretSafeModelProjection {
  readonly id: string;
  readonly name: string;
  readonly displayName?: string;
  readonly providerId: string;
  readonly type?: ModelType;
  readonly protocolProfile?: ModelConfig['protocolProfile'];
  readonly capabilities: readonly string[];
  readonly providerExpressionProfileId?: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly enabled: boolean;
  readonly source: AiProviderSourceKind;
}

export interface ModelSourceGroup {
  readonly source: AiProviderSourceKind;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly connectionKind?: ProviderConnectionKind;
  readonly priority: number;
  readonly modelsByType: Partial<Record<ModelType, readonly ChatModelOption[]>>;
  readonly diagnostics?: readonly AccountAiCatalogDiagnostic[];
}

export interface AiProviderSourceDiagnostic {
  readonly code:
    | 'missing-source'
    | 'missing-explicit-config'
    | 'invalid-explicit-config'
    | 'missing-account-session'
    | 'missing-account-catalog'
    | 'account-catalog-unavailable'
    | 'account-model-not-entitled'
    | 'missing-capability';
  readonly message: string;
  readonly source?: AiProviderSourceKind;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface AiProviderSourceResolution {
  readonly source: AiProviderSourceKind;
  readonly providers: readonly SecretSafeProviderProjection[];
  readonly models: readonly SecretSafeModelProjection[];
  readonly selectedProviderId: string | null;
  readonly selectedModelId: string | null;
  readonly modelGroups: readonly ModelSourceGroup[];
  readonly diagnostics?: readonly AiProviderSourceDiagnostic[];
}
