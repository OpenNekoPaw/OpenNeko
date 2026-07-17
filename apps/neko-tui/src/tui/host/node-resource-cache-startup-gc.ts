import * as os from 'node:os';
import {
  createAgentProjectResourceCacheTarget,
  type AgentProjectResourceCacheTarget,
} from '@neko/agent/runtime';
import type { ResourceCacheSettings } from '@neko/shared';
import type { ResourceCacheManifestStore } from '@neko/shared';
import {
  resolveResourceCacheQuotaPolicy,
  type ResourceCacheGcResult,
  type ResourceCacheService,
} from '@neko/shared/content-access';
import { createNodeContentAccessRuntimeServices } from './node-content-access-runtime';
import { createNodeWorkspaceContentHostAdapter } from './node-workspace-content-host';

export type NodeResourceCacheStartupGcTarget = AgentProjectResourceCacheTarget;

export interface NodeResourceCacheStartupGcResult {
  readonly target: NodeResourceCacheStartupGcTarget;
  readonly result?: ResourceCacheGcResult;
  readonly error?: unknown;
}

export interface NodeResourceCacheStartupGcLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
}

export interface NodeResourceCacheStartupGcOptions {
  readonly workDir: string;
  readonly homedir?: string;
  readonly settings?: ResourceCacheSettings;
  readonly createCacheService?: (
    target: NodeResourceCacheStartupGcTarget,
  ) => ResourceCacheService | Promise<ResourceCacheService>;
  readonly logger?: NodeResourceCacheStartupGcLogger;
  readonly manifestStore?: ResourceCacheManifestStore;
}

export async function runNodeResourceCacheStartupGc(
  options: NodeResourceCacheStartupGcOptions,
): Promise<readonly NodeResourceCacheStartupGcResult[]> {
  const target = createNodeProjectResourceCacheStartupGcTarget(options);
  return [await runNodeResourceCacheStartupGcForTarget(target, options)];
}

export function createNodeProjectResourceCacheStartupGcTarget(input: {
  readonly workDir: string;
  readonly homedir?: string;
}): NodeResourceCacheStartupGcTarget {
  return createAgentProjectResourceCacheTarget({
    workspaceRoot: input.workDir,
    homedir: input.homedir ?? os.homedir() ?? input.workDir,
  });
}

async function runNodeResourceCacheStartupGcForTarget(
  target: NodeResourceCacheStartupGcTarget,
  options: NodeResourceCacheStartupGcOptions,
): Promise<NodeResourceCacheStartupGcResult> {
  try {
    const cacheService = options.createCacheService
      ? await options.createCacheService(target)
      : await createDefaultNodeResourceCacheService(options, target);
    const result = await cacheService.gc(resolveResourceCacheQuotaPolicy(options.settings));
    if (result.removedCount > 0) {
      options.logger?.info('TUI resource cache startup GC completed', {
        scope: target.scope,
        cacheRoot: target.cacheRoot,
        removedCount: result.removedCount,
        removedBytes: result.removedBytes,
        skippedCount: result.skippedCount,
      });
    }
    return { target, result };
  } catch (error) {
    options.logger?.warn('TUI resource cache startup GC failed', {
      scope: target.scope,
      cacheRoot: target.cacheRoot,
      error,
    });
    return { target, error };
  }
}

async function createDefaultNodeResourceCacheService(
  options: NodeResourceCacheStartupGcOptions,
  target: NodeResourceCacheStartupGcTarget,
): Promise<ResourceCacheService> {
  const services = await createNodeContentAccessRuntimeServices({
    host: createNodeWorkspaceContentHostAdapter({
      workDir: target.projectRoot,
      ...(options.homedir ? { homedir: options.homedir } : {}),
    }),
    ...(options.manifestStore ? { resourceCacheManifestStore: options.manifestStore } : {}),
  });
  if (!services.resourceCache) {
    throw new Error('TUI resource cache startup GC requires ResourceCacheService.');
  }
  return services.resourceCache;
}
