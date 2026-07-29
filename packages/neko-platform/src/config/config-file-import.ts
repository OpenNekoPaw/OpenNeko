import type { UnifiedConfig } from '@neko/shared';
import type { Provider } from '../types/provider';

export interface ProviderCredentialImport {
  id: string;
  apiKey: string;
  provider: Provider;
}

export interface ProviderCredentialImportFailure {
  id: string;
  error: unknown;
}

export interface ProviderCredentialImportApplyResult {
  imported: ProviderCredentialImport[];
  failed: ProviderCredentialImportFailure[];
}

export interface ProviderCredentialConfigFileImportRuntime {
  importProviderCredentialsFromConfigFiles(options: {
    readonly workspacePath?: string;
  }): Promise<ProviderCredentialImportApplyResult>;
}

export interface ProviderCredentialConfigFileImportLogger {
  error(message: string, details?: unknown): void;
}

export interface ProviderCredentialConfigFileImportRuntimeInput {
  workspacePath?: string;
}

export interface ProviderCredentialConfigFileImportRuntimeEffects {
  config: ProviderCredentialConfigFileImportRuntime;
  logger?: ProviderCredentialConfigFileImportLogger;
}

export type ProviderCredentialConfigFileImportRuntimeResult =
  | {
      status: 'completed';
      result: ProviderCredentialImportApplyResult;
    }
  | {
      status: 'failed';
      error: unknown;
    };

export interface ProviderCredentialConfigFileChangeRuntimeEffects extends ProviderCredentialConfigFileImportRuntimeEffects {
  /** Deprecated: Agent config snapshots no longer broadcast file-change refreshes. */
  notifyConfigChanged(): void | Promise<void>;
}

export interface ProviderCredentialConfigFileChangeRuntimeResult {
  importResult: ProviderCredentialConfigFileImportRuntimeResult;
  notified: boolean;
}

/**
 * Build provider credential imports from config files.
 * Later configs win, so workspace config can override user config.
 */
export function buildProviderCredentialImports(
  configs: readonly UnifiedConfig[],
): ProviderCredentialImport[] {
  const byId = new Map<string, ProviderCredentialImport>();

  for (const config of configs) {
    for (const provider of config.providers ?? []) {
      if (!provider.apiKey) continue;
      byId.set(provider.id, {
        id: provider.id,
        apiKey: provider.apiKey,
        provider,
      });
    }
  }

  return Array.from(byId.values());
}

export async function runProviderCredentialConfigFileImportRuntime(
  input: ProviderCredentialConfigFileImportRuntimeInput,
  effects: ProviderCredentialConfigFileImportRuntimeEffects,
): Promise<ProviderCredentialConfigFileImportRuntimeResult> {
  try {
    const result = await effects.config.importProviderCredentialsFromConfigFiles({
      ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
    });
    for (const failure of result.failed) {
      effects.logger?.error(
        `Failed to import provider ${failure.id} from config file:`,
        failure.error,
      );
    }
    return { status: 'completed', result };
  } catch (error) {
    effects.logger?.error('Failed to import providers from config files:', error);
    return { status: 'failed', error };
  }
}

export async function runProviderCredentialConfigFileChangeRuntime(
  input: ProviderCredentialConfigFileImportRuntimeInput,
  effects: ProviderCredentialConfigFileChangeRuntimeEffects,
): Promise<ProviderCredentialConfigFileChangeRuntimeResult> {
  const importResult = await runProviderCredentialConfigFileImportRuntime(input, effects);
  return { importResult, notified: false };
}
