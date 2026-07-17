import {
  resolveGlobalStorageLayout,
  resolveStorageLayout,
  type IProviderCardRegistry,
  type IProviderExpressionProfileRegistry,
  type ProviderCard,
  type ProviderCardLayer,
} from '@neko/shared';
import { toProviderExpressionProfile } from '@neko/shared';
import {
  registerProviderCardDirectory,
  type ProviderCardLoadError,
  type ProviderCardLoaderFs,
  type RegisterProviderCardDirectoryOptions,
} from './provider-card-loader';

export interface ProviderCardRuntimeLogger {
  warn(message: string, details?: unknown): void;
}

export interface RegisterRuntimeProviderCardDirectoriesOptions {
  readonly registry: IProviderCardRegistry;
  readonly providerExpressionProfileRegistry?: Pick<IProviderExpressionProfileRegistry, 'register'>;
  readonly fs: ProviderCardLoaderFs;
  readonly homeDir: string;
  readonly workspaceRoot?: string;
  readonly logger?: ProviderCardRuntimeLogger;
  readonly registerDirectory?: (
    options: RegisterProviderCardDirectoryOptions,
  ) => Promise<readonly ProviderCard[]>;
}

export interface RuntimeProviderCardDirectoryRegistrationResult {
  readonly market: readonly ProviderCard[];
  readonly project: readonly ProviderCard[];
}

export async function registerRuntimeProviderCardDirectories(
  options: RegisterRuntimeProviderCardDirectoriesOptions,
): Promise<RuntimeProviderCardDirectoryRegistrationResult> {
  const registerDirectory = options.registerDirectory ?? registerProviderCardDirectory;

  const marketRegistration = registerProviderCardRuntimeDirectory({
    options,
    registerDirectory,
    layer: 'market',
    root: resolveGlobalStorageLayout(options.homeDir).providerCards,
    recursive: true,
    sourceRefPrefix: '${NEKO_HOME}/providers',
  });

  const projectRegistration = options.workspaceRoot
    ? registerProviderCardRuntimeDirectory({
        options,
        registerDirectory,
        layer: 'project',
        root: resolveStorageLayout(options.workspaceRoot, options.homeDir).project.facts
          .providerCards,
        recursive: false,
        sourceRefPrefix: 'neko/providers',
      })
    : Promise.resolve([]);

  const [market, project] = await Promise.all([marketRegistration, projectRegistration]);

  return { market, project };
}

async function registerProviderCardRuntimeDirectory(input: {
  readonly options: RegisterRuntimeProviderCardDirectoriesOptions;
  readonly registerDirectory: (
    options: RegisterProviderCardDirectoryOptions,
  ) => Promise<readonly ProviderCard[]>;
  readonly layer: ProviderCardLayer;
  readonly root: string;
  readonly recursive: boolean;
  readonly sourceRefPrefix: string;
}): Promise<readonly ProviderCard[]> {
  try {
    const cards = await input.registerDirectory({
      registry: input.options.registry,
      root: input.root,
      sourceLayer: input.layer,
      fs: input.options.fs,
      recursive: input.recursive,
      sourceRefPrefix: input.sourceRefPrefix,
      onError: (error) => emitProviderCardLoadWarning(input.options.logger, error, input.layer),
    });
    for (const card of cards) {
      input.options.providerExpressionProfileRegistry?.register(toProviderExpressionProfile(card));
    }
    return cards;
  } catch (error) {
    emitProviderCardLoadWarning(
      input.options.logger,
      {
        path: input.root,
        reason: 'read-failed',
        cause: error,
      },
      input.layer,
    );
    return [];
  }
}

function emitProviderCardLoadWarning(
  logger: ProviderCardRuntimeLogger | undefined,
  error: ProviderCardLoadError,
  layer: ProviderCardLayer,
): void {
  logger?.warn('Failed to load provider expression card.', {
    code: 'extension.provider-card.load-failed',
    reason: error.reason,
    context: {
      layer,
      path: error.path,
      error: String(error.cause),
    },
  });
}
