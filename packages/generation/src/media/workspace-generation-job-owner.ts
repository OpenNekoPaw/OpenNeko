import * as path from 'node:path';
import type { GenerationExecutionPort, MediaGenerationResult } from '@neko/generation';
import type { GeneratedOutputContentLocator } from '@neko/content';
import { resolveWorkspaceGeneratedAssetRelativeDirectory } from '@neko/generation';
import {
  GenerationJobCoordinator,
  createPersistentGenerationJobStore,
  initializeGenerationJobTables,
  type WorkspaceGenerationJobOwner,
} from '@neko/generation/job';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '@neko/local-metadata/node';
import { PathResolver } from '@neko/shared';
import { GeneratedAssetIndex } from './generated-asset-index';
import { finalizeMediaGenerationOutputs } from './media-generation-output-finalizer';
import type { GeneratedMediaKind } from './media-generated-asset';
import { LocalMetadataGeneratedOutputProjectionStore } from './local-metadata/generated-output-projection-store';

export interface NodeWorkspaceGenerationJobOwnerOptions {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly execution: GenerationExecutionPort;
}

export async function createNodeWorkspaceGenerationJobOwner(
  options: NodeWorkspaceGenerationJobOwnerOptions,
): Promise<WorkspaceGenerationJobOwner> {
  const metadata = await createNodeWorkspaceResourceCacheMetadataBinding({
    homedir: options.homedir,
    workDir: options.workspaceRoot,
    createWorkspaceId: () => options.workspaceId,
  });
  let coordinator: GenerationJobCoordinator | undefined;
  try {
    if (metadata.workspaceId !== options.workspaceId) {
      throw new Error(
        `Workspace Generation identity mismatch: expected '${options.workspaceId}', received '${metadata.workspaceId}'.`,
      );
    }
    await initializeGenerationJobTables(metadata.metadataStore);
    const generatedAssets = new GeneratedAssetIndex(
      new LocalMetadataGeneratedOutputProjectionStore({
        manifestStore: metadata.manifestStore,
        workspaceRoot: options.workspaceRoot,
        pathResolver: new PathResolver(
          new Map([
            ['WORKSPACE', options.workspaceRoot],
            ['HOME', options.homedir],
          ]),
        ),
      }),
    );
    await generatedAssets.load();
    coordinator = new GenerationJobCoordinator({
      store: createPersistentGenerationJobStore({
        metadataStore: metadata.metadataStore,
        workspaceId: metadata.workspaceId,
      }),
      execution: options.execution,
      resultCommitter: {
        commit: ({ ref, generation }) =>
          commitGenerationResult({
            operationId: ref.jobId,
            generation,
            workspaceRoot: options.workspaceRoot,
            generatedAssets,
          }),
      },
    });
    await coordinator.recoverPersistedGenerationJobs();
    const ownedCoordinator = coordinator;
    return {
      jobs: ownedCoordinator,
      dispose: async () => {
        const results = await Promise.allSettled([ownedCoordinator.dispose(), metadata.dispose()]);
        const failures = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Workspace Generation Job owner disposal failed.');
        }
      },
    };
  } catch (error) {
    const failures: unknown[] = [error];
    if (coordinator) {
      try {
        await coordinator.dispose();
      } catch (disposeError) {
        failures.push(disposeError);
      }
    }
    try {
      await metadata.dispose();
    } catch (disposeError) {
      failures.push(disposeError);
    }
    if (failures.length === 1) throw error;
    throw new AggregateError(failures, 'Workspace Generation Job owner initialization failed.');
  }
}

async function commitGenerationResult(input: {
  readonly operationId: string;
  readonly generation: MediaGenerationResult;
  readonly workspaceRoot: string;
  readonly generatedAssets: GeneratedAssetIndex;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  const mediaKind = toGeneratedMediaKind(input.generation.type);
  const finalized = await finalizeMediaGenerationOutputs({
    workspaceRoot: input.workspaceRoot,
    operationId: input.operationId,
    generationType: input.generation.type,
    mediaKind,
    outputs: input.generation.outputs,
    providerId: input.generation.providerId,
    modelId: input.generation.modelId,
    request: input.generation.request,
    outputDir: path.join(
      input.workspaceRoot,
      resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }),
    ),
    assetIndex: input.generatedAssets,
  });
  return finalized.generatedAssets.map((asset) => {
    if (!asset.lifecycle) {
      throw new Error(`Generated asset '${asset.id}' has no durable lifecycle.`);
    }
    return asset.lifecycle.contentLocator;
  });
}

function toGeneratedMediaKind(type: string): GeneratedMediaKind {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  if (type.includes('image')) return 'image';
  throw new Error(`Unsupported generated media type '${type}'.`);
}
