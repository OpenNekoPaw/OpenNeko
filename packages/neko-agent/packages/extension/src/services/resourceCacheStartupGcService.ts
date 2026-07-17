import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ResourceCacheSettings } from '@neko/shared';
import { migrateLegacyResourceCacheManifest } from '@neko/shared/local-metadata/node';
import {
  createHostContentAccessRuntime,
  resolveResourceCacheQuotaPolicy,
  type ResourceCacheGcResult,
  type ResourceCacheManifestStore,
  type ResourceCacheService,
} from '@neko/shared/vscode/extension';
import { createAgentProjectResourceCacheTarget } from '@neko/agent/runtime';
import { getLogger } from '../base';

const logger = getLogger('ResourceCacheStartupGc');

export interface ResourceCacheStartupGcServiceOptions {
  readonly context: vscode.ExtensionContext;
  readonly settings?: ResourceCacheSettings;
  readonly createCacheService?: (input: ResourceCacheStartupGcTarget) => ResourceCacheService;
  readonly manifestStores?: {
    readonly workspace?: ResourceCacheManifestStore;
    readonly global?: ResourceCacheManifestStore;
  };
}

export interface ResourceCacheStartupGcTarget {
  readonly scope: 'project' | 'extension-private';
  readonly cacheRoot: string;
  readonly manifestPath: string;
  readonly projectRoot?: string;
  readonly extensionPrivateRoot?: string;
}

export function runResourceCacheStartupGc(
  options: ResourceCacheStartupGcServiceOptions,
): Promise<readonly ResourceCacheStartupGcResult[]> {
  const targets = createStartupGcTargets(options.context);
  return Promise.all(targets.map((target) => runStartupGcForTarget(target, options)));
}

export function createStartupGcTargets(
  context: vscode.ExtensionContext,
): readonly ResourceCacheStartupGcTarget[] {
  const targets: ResourceCacheStartupGcTarget[] = [];
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    targets.push(
      createAgentProjectResourceCacheTarget({
        workspaceRoot,
        homedir: os.homedir() || workspaceRoot,
      }),
    );
  }

  if (context.globalStorageUri.scheme === 'file') {
    const extensionPrivateRoot = context.globalStorageUri.fsPath;
    const cacheRoot = path.join(extensionPrivateRoot, 'resources');
    targets.push({
      scope: 'extension-private',
      cacheRoot,
      manifestPath: path.join(cacheRoot, 'manifest.json'),
      extensionPrivateRoot,
    });
  }
  return dedupeTargetsByRoot(targets);
}

export interface ResourceCacheStartupGcResult {
  readonly target: ResourceCacheStartupGcTarget;
  readonly result?: ResourceCacheGcResult;
  readonly error?: unknown;
}

async function runStartupGcForTarget(
  target: ResourceCacheStartupGcTarget,
  options: ResourceCacheStartupGcServiceOptions,
): Promise<ResourceCacheStartupGcResult> {
  try {
    const manifestStore =
      target.scope === 'project'
        ? options.manifestStores?.workspace
        : options.manifestStores?.global;
    if (manifestStore) {
      await migrateLegacyResourceCacheManifest({
        manifestPath: target.manifestPath,
        cacheRoot: target.cacheRoot,
        manifestStore,
      });
    }
    const cacheService = options.createCacheService
      ? options.createCacheService(target)
      : createDefaultStartupGcCacheService(options, target);
    const result = await cacheService.gc(resolveResourceCacheQuotaPolicy(options.settings));
    if (result.removedCount > 0) {
      logger.info('Resource cache startup GC completed', {
        scope: target.scope,
        cacheRoot: target.cacheRoot,
        removedCount: result.removedCount,
        removedBytes: result.removedBytes,
        skippedCount: result.skippedCount,
      });
    }
    return { target, result };
  } catch (error) {
    logger.warn('Resource cache startup GC failed', {
      scope: target.scope,
      cacheRoot: target.cacheRoot,
      error,
    });
    return { target, error };
  }
}

function createDefaultStartupGcCacheService(
  options: ResourceCacheStartupGcServiceOptions,
  target: ResourceCacheStartupGcTarget,
): ResourceCacheService {
  const manifestStore =
    target.scope === 'project' ? options.manifestStores?.workspace : options.manifestStores?.global;
  if (!manifestStore) {
    throw new Error(`Resource cache startup GC requires a ${target.scope} metadata store.`);
  }
  const runtime = createHostContentAccessRuntime({
    extensionUri: options.context.extensionUri,
    context: options.context,
    workspaceRoot: target.projectRoot,
    resourceCacheOptions: {
      cacheRoot: target.cacheRoot,
      manifestStore,
      ...(target.projectRoot ? { projectRoot: target.projectRoot } : {}),
      ...(target.extensionPrivateRoot ? { extensionPrivateRoot: target.extensionPrivateRoot } : {}),
      providers: [],
    },
    sourceFileProvider: { enabled: false },
    documentEntryProvider: { enabled: false },
    ingest: { enabled: false },
    logger,
  });
  if (!runtime.resourceCache) {
    throw new Error('Resource cache startup GC requires ResourceCacheService.');
  }
  return runtime.resourceCache;
}

function dedupeTargetsByRoot(
  targets: readonly ResourceCacheStartupGcTarget[],
): readonly ResourceCacheStartupGcTarget[] {
  const seen = new Set<string>();
  const deduped: ResourceCacheStartupGcTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.cacheRoot)) {
      continue;
    }
    seen.add(target.cacheRoot);
    deduped.push(target);
  }
  return deduped;
}
