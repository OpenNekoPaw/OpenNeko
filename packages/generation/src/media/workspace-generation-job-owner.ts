import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type {
  GenerationExecutionResult,
  MediaGenerationExecutionPort,
  PromptGenerationExecutionPort,
} from '@neko/generation';
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
import { createStableGeneratedOutputId } from './media-generated-asset';
import { LocalMetadataGeneratedOutputProjectionStore } from './local-metadata/generated-output-projection-store';

export interface NodeWorkspaceGenerationJobOwnerOptions {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly mediaExecution: MediaGenerationExecutionPort;
  readonly promptExecution: PromptGenerationExecutionPort;
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
      execution: {
        generatePrompt: (request, executionOptions) =>
          options.promptExecution.generatePrompt(request, executionOptions),
        generateImage: (request, executionOptions) =>
          options.mediaExecution.generateImage(request, executionOptions),
        generateVideo: (request, executionOptions) =>
          options.mediaExecution.generateVideo(request, executionOptions),
        generateAudio: (request, executionOptions) =>
          options.mediaExecution.generateAudio(request, executionOptions),
        describeExternalTask: (task) => options.mediaExecution.describeExternalTask(task),
        cancelExternalTask: (task) => options.mediaExecution.cancelExternalTask(task),
      },
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
  readonly generation: GenerationExecutionResult;
  readonly workspaceRoot: string;
  readonly generatedAssets: GeneratedAssetIndex;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  if (input.generation.type === 'prompt') {
    return commitPromptGenerationResult({
      operationId: input.operationId,
      text: input.generation.text,
      workspaceRoot: input.workspaceRoot,
    });
  }
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

async function commitPromptGenerationResult(input: {
  readonly operationId: string;
  readonly text: string;
  readonly workspaceRoot: string;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  const bytes = Buffer.from(input.text, 'utf8');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const outputId = createStableGeneratedOutputId(input.operationId, 0, digest);
  const relativePath = path.posix.join('neko', 'generated', 'text', `${outputId}.md`);
  const outputPath = path.join(input.workspaceRoot, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return [{ kind: 'generated-output', outputId, digest, path: relativePath }];
}

function toGeneratedMediaKind(type: string): GeneratedMediaKind {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  if (type.includes('image')) return 'image';
  throw new Error(`Unsupported generated media type '${type}'.`);
}
