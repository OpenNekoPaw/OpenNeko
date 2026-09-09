import type { AgentReasoningEffort } from '@neko/agent-contracts';
import {
  projectLlmModelCapabilities,
  type Model,
  type Provider,
  type ProviderCredentialReader,
} from '@neko/host/settings';
import { resolveDshDialogueProtocol } from '@neko/host/ai-model-settings-service';

const DSH_PI_AI_ROW_ID = 'llm-pi-ai';
const DSH_CREDENTIAL_ENV_PREFIX = 'OPENNEKO_DSH_PROVIDER_CREDENTIAL_';

export interface DesktopDshExecutionModel {
  readonly providerId: string;
  readonly productModelId: string;
  readonly apiModelName: string;
  readonly input: readonly ('text' | 'image')[];
}

export interface DesktopDshExecutionCatalog {
  resolve(providerId: string, productModelId: string): DesktopDshExecutionModel | undefined;
}

export interface DesktopDshProviderDiagnostic {
  readonly providerId: string;
  readonly modelId?: string;
  readonly message: string;
}

export interface DesktopDshProviderRuntimeProjection {
  readonly modelBindings: readonly DesktopDshExecutionModel[];
  readonly profilePatchEntries: readonly Readonly<Record<string, unknown>>[];
  readonly credentialEnvironment: Readonly<Record<string, string>>;
  readonly executionCatalog: DesktopDshExecutionCatalog;
  readonly diagnostics: readonly DesktopDshProviderDiagnostic[];
}

interface DshProviderProfile {
  readonly displayName: string;
  readonly api?: string;
  readonly baseURL?: string;
  readonly models: readonly Readonly<Record<string, unknown>>[];
  readonly apiKeyEnv?: string;
}

export async function createDesktopDshProviderRuntimeProjection(input: {
  readonly providers: readonly Provider[];
  readonly models: readonly Model[];
  readonly credentials: ProviderCredentialReader;
}): Promise<DesktopDshProviderRuntimeProjection> {
  const diagnostics: DesktopDshProviderDiagnostic[] = [];
  const profiles: Record<string, DshProviderProfile> = {};
  const credentialEnvironment: Record<string, string> = {};
  const executionModels = new Map<string, ReadonlyMap<string, DesktopDshExecutionModel>>();
  let credentialIndex = 0;

  for (const provider of input.providers) {
    if (provider.enabled === false) continue;
    const providerModels = input.models.filter(
      (model) =>
        model.enabled !== false &&
        model.providerId === provider.id &&
        (model.type === undefined || model.type === 'llm'),
    );
    if (providerModels.length === 0) continue;

    const protocol = resolveDshDialogueProtocol(provider);
    const baseURL = resolveDshBaseUrl(provider);
    if (
      (provider.apiUrl.trim().length > 0 && baseURL === undefined) ||
      provider.id === 'deepseek-official'
    ) {
      diagnostics.push({
        providerId: provider.id,
        message: `Provider '${provider.id}' cannot be expressed by the OpenNeko DSH execution profile.`,
      });
      continue;
    }

    const nameCounts = new Map<string, number>();
    for (const model of providerModels) {
      const apiModelName = model.name.trim();
      if (apiModelName.length > 0)
        nameCounts.set(apiModelName, (nameCounts.get(apiModelName) ?? 0) + 1);
    }
    const dshModels: Readonly<Record<string, unknown>>[] = [];
    const providerExecutionModels = new Map<string, DesktopDshExecutionModel>();
    for (const model of providerModels) {
      const apiModelName = model.name.trim();
      if (apiModelName.length === 0) {
        diagnostics.push({
          providerId: provider.id,
          modelId: model.id,
          message: `Model '${provider.id}/${model.id}' has no API model name.`,
        });
        continue;
      }
      if (nameCounts.get(apiModelName) !== 1) {
        diagnostics.push({
          providerId: provider.id,
          modelId: model.id,
          message: `Model '${provider.id}/${model.id}' does not have a unique API model name '${apiModelName}'.`,
        });
        continue;
      }
      const execution = Object.freeze({
        providerId: provider.id,
        productModelId: model.id,
        apiModelName,
        input: modelSupportsImageInput(model.capabilities)
          ? (['text', 'image'] as const)
          : (['text'] as const),
      });
      const reasoningEfforts = projectDshReasoningEfforts(model, provider);
      providerExecutionModels.set(model.id, execution);
      dshModels.push(
        Object.freeze({
          id: apiModelName,
          name: model.displayName || apiModelName,
          ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
          ...(isPositiveInteger(model.maxOutputTokens) ? { maxTokens: model.maxOutputTokens } : {}),
          input: execution.input,
          reasoningEfforts,
        }),
      );
    }
    if (dshModels.length === 0) continue;

    let credentialEnvironmentName: string | undefined;
    if (provider.requiresApiKey !== false) {
      try {
        const credential = await input.credentials.read(provider.id);
        if (credential === undefined && provider.requiresApiKey === true) {
          diagnostics.push({
            providerId: provider.id,
            message: `Provider '${provider.id}' requires an API-key credential for DSH execution.`,
          });
          continue;
        }
        if (credential !== undefined) {
          credentialEnvironmentName = `${DSH_CREDENTIAL_ENV_PREFIX}${credentialIndex}`;
          credentialIndex += 1;
          credentialEnvironment[credentialEnvironmentName] = credential.key;
        }
      } catch (error) {
        diagnostics.push({
          providerId: provider.id,
          message: `Provider '${provider.id}' credential is unavailable: ${describeError(error)}`,
        });
        continue;
      }
    }

    profiles[provider.id] = Object.freeze({
      displayName: provider.displayName || provider.name || provider.id,
      ...(protocol === undefined ? {} : { api: protocol }),
      ...(baseURL === undefined ? {} : { baseURL }),
      models: Object.freeze(dshModels),
      ...(credentialEnvironmentName === undefined ? {} : { apiKeyEnv: credentialEnvironmentName }),
    });
    executionModels.set(provider.id, providerExecutionModels);
  }

  const executionCatalog: DesktopDshExecutionCatalog = Object.freeze({
    resolve(providerId: string, productModelId: string) {
      return executionModels.get(providerId)?.get(productModelId);
    },
  });
  return Object.freeze({
    modelBindings: Object.freeze(
      [...executionModels.values()].flatMap((models) => [...models.values()]),
    ),
    profilePatchEntries: Object.freeze([
      Object.freeze({
        id: DSH_PI_AI_ROW_ID,
        config: Object.freeze({ providers: Object.freeze(profiles) }),
      }),
    ]),
    credentialEnvironment: Object.freeze({ ...credentialEnvironment }),
    executionCatalog,
    diagnostics: Object.freeze(diagnostics),
  });
}

function projectDshReasoningEfforts(
  model: Model,
  provider: Provider,
): false | Readonly<Record<string, string | null>> {
  const capabilities = projectLlmModelCapabilities({ model, provider });
  if (!capabilities.supportsReasoningEffort) return false;

  const values = capabilities.reasoningEffortValues;
  if (values === undefined || values.length === 0) {
    throw new Error(
      `Host model '${provider.id}/${model.id}' supports reasoning effort without an effort catalog.`,
    );
  }

  return Object.freeze(
    Object.fromEntries(
      values.map((effort) => {
        const dshEffort = toDshReasoningEffort(effort);
        return [dshEffort, dshEffort === 'off' ? null : dshEffort] as const;
      }),
    ),
  );
}

function toDshReasoningEffort(
  effort: AgentReasoningEffort,
): 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  switch (effort) {
    case 'none':
      return 'off';
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return effort;
    default:
      return assertNever(effort);
  }
}

function modelSupportsImageInput(capabilities: readonly string[]): boolean {
  return capabilities.includes('vision');
}

function resolveDshBaseUrl(provider: Provider): string | undefined {
  const raw = provider.apiUrl.trim().replace(/\/+$/u, '');
  if (raw.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    return undefined;
  }
  if (provider.protocolProfile === 'ollama' || provider.type === 'ollama') {
    const path = parsed.pathname.replace(/\/+$/u, '');
    if (path !== '' && path !== '/api' && path !== '/v1') return undefined;
    parsed.pathname = '/v1';
    return parsed.toString().replace(/\/+$/u, '');
  }
  const basePath = provider.protocolVariant?.basePath?.trim().replace(/\/+$/u, '');
  if (!basePath || basePath === '/' || raw.endsWith(basePath)) return raw;
  return `${raw}/${basePath.replace(/^\/+/, '')}`;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Host reasoning effort '${String(value)}'.`);
}
