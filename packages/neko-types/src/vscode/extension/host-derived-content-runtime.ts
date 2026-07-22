import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import {
  createNodeGlobalResourceCacheMetadataBinding,
  createNodeWorkspaceResourceCacheMetadataBinding,
  type NodeGlobalResourceCacheMetadataBinding,
  type NodeWorkspaceResourceCacheMetadataBinding,
} from '../../local-metadata/node-workspace-resource-cache-binding';
import { resolveStorageLayout } from '../../types';
import type {
  ContentRepresentationGenerator,
  ContentRepresentationRequest,
  ContentRepresentationService,
  ResourceCacheSettings,
  ResourceCacheStats,
} from '../../types';
import { HostContentRepresentationService } from './content-representation-service';
import {
  resolveResourceCacheQuotaPolicy,
  type ResourceCacheGcResult,
  type ResourceCacheLogger,
  type ResourceCacheService,
  VSCodeResourceCacheService,
} from './resource-cache-service';
import type { ResourceCacheFileOps } from './resource-cache-providers';
import {
  createDefaultLocalResourceAccessService,
  type DefaultLocalResourceAccessServiceOptions,
  type LocalResourceAccessService,
  type LocalResourceRootProvider,
} from './local-resource-access';

export type HostDerivedContentTarget =
  | {
      readonly kind: 'workspace';
      readonly workspaceRoot: string;
      readonly homedir?: string;
    }
  | {
      readonly kind: 'extension-private';
      readonly homedir?: string;
      readonly cacheSegments?: readonly string[];
    };

export interface CreateHostDerivedContentRuntimeOptions {
  readonly target: HostDerivedContentTarget;
  readonly context?: vscode.ExtensionContext;
  readonly extensionUri?: vscode.Uri;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly localResourceAccessOptions?: Partial<DefaultLocalResourceAccessServiceOptions>;
  readonly extraLocalResourceRootProviders?: readonly LocalResourceRootProvider[];
  readonly representationGenerators?: readonly ContentRepresentationGenerator[];
  readonly representationFileOps?: ResourceCacheFileOps;
  readonly settings?: ResourceCacheSettings;
  readonly runStartupMaintenance?: boolean;
  readonly logger?: ResourceCacheLogger;
}

export interface HostDerivedContentMaintenanceOptions {
  readonly settings?: ResourceCacheSettings;
  readonly activeVariantKeys?: readonly string[];
}

export type HostDerivedContentMaintenanceResult =
  | {
      readonly status: 'completed';
      readonly stats: ResourceCacheStats;
      readonly gc: ResourceCacheGcResult;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'startup-maintenance-disabled';
    }
  | {
      readonly status: 'failed';
      readonly diagnostic: {
        readonly code:
          | 'derived-storage-initialization-failed'
          | 'derived-storage-maintenance-failed'
          | 'derived-storage-unavailable';
        readonly message: string;
      };
    };

export interface HostDerivedContentRuntime {
  readonly contentRepresentation: ContentRepresentationService;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly startupMaintenance: HostDerivedContentMaintenanceResult;
  runMaintenance(
    options?: HostDerivedContentMaintenanceOptions,
  ): Promise<HostDerivedContentMaintenanceResult>;
  dispose(): Promise<void>;
}

type HostDerivedContentMetadataBinding =
  NodeWorkspaceResourceCacheMetadataBinding | NodeGlobalResourceCacheMetadataBinding;

export async function createHostDerivedContentRuntime(
  options: CreateHostDerivedContentRuntimeOptions,
): Promise<HostDerivedContentRuntime> {
  const context = options.context;
  const extensionUri = options.extensionUri ?? context?.extensionUri;
  const logger = options.logger;
  const localResourceAccess =
    options.localResourceAccess ??
    createLocalResourceAccessIfConfigured(options, extensionUri, context);
  let metadataBinding: HostDerivedContentMetadataBinding | undefined;
  let resourceCache: ResourceCacheService | undefined;
  let initializationFailure: HostDerivedContentMaintenanceResult | undefined;

  try {
    metadataBinding = await createMetadataBinding(options.target);
    const cacheOptions = createCacheOptions(options.target, context, metadataBinding);
    resourceCache = new VSCodeResourceCacheService({
      ...cacheOptions,
      ...(localResourceAccess ? { localResourceAccess } : {}),
      providers: [],
      ...(logger ? { logger } : {}),
    });
    const contentRepresentation = new HostContentRepresentationService({
      resourceCache,
      scope: options.target.kind === 'workspace' ? 'project' : 'extension-private',
      generators: options.representationGenerators,
      ...(options.representationFileOps ? { fileOps: options.representationFileOps } : {}),
      ...(logger ? { logger } : {}),
    });
    return createRuntimeResult({
      contentRepresentation,
      localResourceAccess,
      metadataBinding,
      resourceCache,
      settings: options.settings,
      runStartupMaintenance: options.runStartupMaintenance !== false,
      logger,
    });
  } catch (error) {
    if (metadataBinding) {
      await disposeAfterInitializationFailure(metadataBinding, error);
      metadataBinding = undefined;
    }
    initializationFailure = failedMaintenance(
      'derived-storage-initialization-failed',
      'Derived content storage could not be initialized.',
    );
    logger?.error?.('Derived content storage initialization failed.', {
      error: errorMessage(error),
    });
  }

  const unavailable =
    initializationFailure ??
    failedMaintenance('derived-storage-unavailable', 'Derived content storage is unavailable.');
  return {
    contentRepresentation: unavailableRepresentationService,
    ...(localResourceAccess ? { localResourceAccess } : {}),
    startupMaintenance: unavailable,
    runMaintenance: async () =>
      failedMaintenance('derived-storage-unavailable', 'Derived content storage is unavailable.'),
    dispose: async () => {},
  };
}

async function createRuntimeResult(input: {
  readonly contentRepresentation: ContentRepresentationService;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly metadataBinding: HostDerivedContentMetadataBinding;
  readonly resourceCache: ResourceCacheService;
  readonly settings?: ResourceCacheSettings;
  readonly runStartupMaintenance: boolean;
  readonly logger?: ResourceCacheLogger;
}): Promise<HostDerivedContentRuntime> {
  const startupMaintenance = input.runStartupMaintenance
    ? await runMaintenance(input.resourceCache, { settings: input.settings }, input.logger)
    : ({
        status: 'skipped',
        reason: 'startup-maintenance-disabled',
      } satisfies HostDerivedContentMaintenanceResult);

  return {
    contentRepresentation: input.contentRepresentation,
    ...(input.localResourceAccess ? { localResourceAccess: input.localResourceAccess } : {}),
    startupMaintenance,
    runMaintenance: (options) => runMaintenance(input.resourceCache, options, input.logger),
    dispose: async () => {
      const errors: unknown[] = [];
      try {
        await input.resourceCache.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        await input.metadataBinding.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Host derived content disposal failed.');
      }
    },
  };
}

async function runMaintenance(
  resourceCache: ResourceCacheService,
  options: HostDerivedContentMaintenanceOptions | undefined,
  logger: ResourceCacheLogger | undefined,
): Promise<HostDerivedContentMaintenanceResult> {
  try {
    const gc = await resourceCache.gc(
      resolveResourceCacheQuotaPolicy(options?.settings, options?.activeVariantKeys),
    );
    const stats = await resourceCache.stats();
    return { status: 'completed', stats, gc };
  } catch (error) {
    logger?.warn('Derived content storage maintenance failed.', {
      error: errorMessage(error),
    });
    return failedMaintenance(
      'derived-storage-maintenance-failed',
      'Derived content storage maintenance failed.',
    );
  }
}

async function createMetadataBinding(
  target: HostDerivedContentTarget,
): Promise<HostDerivedContentMetadataBinding> {
  const homedir = (target.homedir ?? os.homedir()) || targetFallbackRoot(target);
  return target.kind === 'workspace'
    ? createNodeWorkspaceResourceCacheMetadataBinding({
        homedir,
        workDir: target.workspaceRoot,
      })
    : createNodeGlobalResourceCacheMetadataBinding({ homedir });
}

function createCacheOptions(
  target: HostDerivedContentTarget,
  context: vscode.ExtensionContext | undefined,
  metadataBinding: HostDerivedContentMetadataBinding,
) {
  if (target.kind === 'workspace') {
    const layout = resolveStorageLayout(
      target.workspaceRoot,
      (target.homedir ?? os.homedir()) || target.workspaceRoot,
    );
    return {
      cacheRoot: layout.project.local.cache.resources,
      manifestStore: metadataBinding.manifestStore,
      projectRoot: target.workspaceRoot,
    };
  }
  if (!context || context.globalStorageUri.scheme !== 'file') {
    throw new Error('Extension-private derived storage requires a file-backed ExtensionContext.');
  }
  const extensionPrivateRoot = context.globalStorageUri.fsPath;
  return {
    cacheRoot: path.join(extensionPrivateRoot, ...(target.cacheSegments ?? ['resources'])),
    manifestStore: metadataBinding.manifestStore,
    extensionPrivateRoot,
  };
}

function createLocalResourceAccessIfConfigured(
  options: CreateHostDerivedContentRuntimeOptions,
  extensionUri: vscode.Uri | undefined,
  context: vscode.ExtensionContext | undefined,
): LocalResourceAccessService | undefined {
  if (!extensionUri) return undefined;
  const localOptions = options.localResourceAccessOptions;
  return createDefaultLocalResourceAccessService({
    extensionUri,
    ...(context ? { context } : {}),
    ...(localOptions?.extensionAssetSegments
      ? { extensionAssetSegments: localOptions.extensionAssetSegments }
      : {}),
    ...(localOptions?.includeExtensionCache !== undefined
      ? { includeExtensionCache: localOptions.includeExtensionCache }
      : {}),
    ...(localOptions?.includeWorkspaceCache !== undefined
      ? { includeWorkspaceCache: localOptions.includeWorkspaceCache }
      : {}),
    ...(localOptions?.getWorkspaceFolders
      ? { getWorkspaceFolders: localOptions.getWorkspaceFolders }
      : {}),
    extraRootProviders: [
      ...(localOptions?.extraRootProviders ?? []),
      ...(options.extraLocalResourceRootProviders ?? []),
    ],
    logger: localOptions?.logger ?? options.logger,
  });
}

const unavailableRepresentationService: ContentRepresentationService = {
  getRepresentation: async (_request: ContentRepresentationRequest) => ({
    status: 'unavailable',
    diagnostic: {
      code: 'representation-unsupported',
      severity: 'error',
      message: 'Content representation service is unavailable.',
    },
  }),
  readRepresentation: async (locator) => ({
    status: 'unavailable',
    locator,
    diagnostic: {
      code: 'representation-unsupported',
      severity: 'error',
      message: 'Content representation service is unavailable.',
    },
  }),
};

function targetFallbackRoot(target: HostDerivedContentTarget): string {
  return target.kind === 'workspace' ? target.workspaceRoot : process.cwd();
}

function failedMaintenance(
  code: Extract<
    HostDerivedContentMaintenanceResult,
    { readonly status: 'failed' }
  >['diagnostic']['code'],
  message: string,
): HostDerivedContentMaintenanceResult {
  return { status: 'failed', diagnostic: { code, message } };
}

async function disposeAfterInitializationFailure(
  binding: HostDerivedContentMetadataBinding,
  initializationError: unknown,
): Promise<void> {
  try {
    await binding.dispose();
  } catch (disposeError) {
    throw new AggregateError(
      [initializationError, disposeError],
      'Host derived content initialization and cleanup failed.',
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
