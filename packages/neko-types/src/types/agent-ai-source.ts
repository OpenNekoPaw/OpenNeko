import type {
  ChatModelOption,
  ModelConfig,
  ModelType,
  ProviderConfig,
  ProviderConnectionKind,
} from './config';

export type AiProviderSourceKind = 'explicit-config';

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
}

export interface AiProviderSourceDiagnostic {
  readonly code:
    'missing-source' | 'missing-explicit-config' | 'invalid-explicit-config' | 'missing-capability';
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
