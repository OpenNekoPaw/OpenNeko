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
  createPersistentAssistantGenerationJobStore,
  createPersistentGenerationJobStore,
  initializeGenerationJobTables,
  type GenerationJobOwner,
  type GenerationOwner,
} from '@neko/generation/job';
import {
  createNodeGlobalResourceCacheMetadataBinding,
  createNodeWorkspaceResourceCacheMetadataBinding,
} from '@neko/local-metadata/node';
import type { LocalMetadataStore } from '@neko/local-metadata';
import type { ResourceCacheManifestStore } from '@neko/local-metadata/resource-cache';
import { PathResolver } from '@neko/shared';
import { GeneratedAssetIndex } from './generated-asset-index';
import { finalizeMediaGenerationOutputs } from './media-generation-output-finalizer';
import type { GeneratedMediaKind } from './media-generated-asset';
import { createStableGeneratedOutputId } from './media-generated-asset';
import { LocalMetadataGeneratedOutputProjectionStore } from './local-metadata/generated-output-projection-store';

export interface NodeGenerationJobOwnerOptions {
  readonly owner: GenerationOwner;
  readonly root: string;
  readonly homedir: string;
  readonly mediaExecution: MediaGenerationExecutionPort;
  readonly promptExecution: PromptGenerationExecutionPort;
}

interface GenerationMetadataBinding {
  readonly metadataStore: LocalMetadataStore;
  readonly manifestStore: ResourceCacheManifestStore;
  dispose(): Promise<void>;
}

export async function createNodeGenerationJobOwner(
  options: NodeGenerationJobOwnerOptions,
): Promise<GenerationJobOwner> {
  const metadata = await createGenerationMetadataBinding(options);
  let coordinator: GenerationJobCoordinator | undefined;
  try {
    await initializeGenerationJobTables(metadata.metadataStore);
    const generatedAssets = new GeneratedAssetIndex(
      new LocalMetadataGeneratedOutputProjectionStore({
        manifestStore: metadata.manifestStore,
        owner: options.owner,
        ownerRoot: options.root,
        pathResolver: createOwnerPathResolver(options),
      }),
    );
    await generatedAssets.load();
    coordinator = new GenerationJobCoordinator({
      store:
        options.owner.kind === 'workspace'
          ? createPersistentGenerationJobStore({
              metadataStore: metadata.metadataStore,
              workspaceId: options.owner.workspaceId,
            })
          : createPersistentAssistantGenerationJobStore({
              metadataStore: metadata.metadataStore,
              assistantSpaceId: options.owner.assistantSpaceId,
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
            ownerRoot: options.root,
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
          throw new AggregateError(failures, 'Generation Job owner disposal failed.');
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
    throw new AggregateError(failures, 'Generation Job owner initialization failed.');
  }
}

async function createGenerationMetadataBinding(
  options: NodeGenerationJobOwnerOptions,
): Promise<GenerationMetadataBinding> {
  if (options.owner.kind === 'assistant') {
    assertAssistantStorageRoot(options.root, options.homedir);
    return createNodeGlobalResourceCacheMetadataBinding({ homedir: options.homedir });
  }
  const workspaceId = options.owner.workspaceId;
  const metadata = await createNodeWorkspaceResourceCacheMetadataBinding({
    homedir: options.homedir,
    workDir: options.root,
    createWorkspaceId: () => workspaceId,
  });
  if (metadata.workspaceId !== workspaceId) {
    await metadata.dispose();
    throw new Error(
      `Workspace Generation identity mismatch: expected '${workspaceId}', received '${metadata.workspaceId}'.`,
    );
  }
  return metadata;
}

function assertAssistantStorageRoot(ownerRoot: string, homedir: string): void {
  const assistantSpacesRoot = path.resolve(homedir, '.neko', 'assistant-spaces');
  const exactOwnerRoot = path.resolve(ownerRoot);
  const relative = path.relative(assistantSpacesRoot, exactOwnerRoot);
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Assistant Generation root must be an exact user-owned Assistant Space under '${assistantSpacesRoot}'.`,
    );
  }
}

function createOwnerPathResolver(options: NodeGenerationJobOwnerOptions): PathResolver {
  const rootVariable = options.owner.kind === 'workspace' ? 'WORKSPACE' : 'ASSISTANT_SPACE';
  return new PathResolver(
    new Map([
      [rootVariable, options.root],
      ['HOME', options.homedir],
    ]),
  );
}

async function commitGenerationResult(input: {
  readonly operationId: string;
  readonly generation: GenerationExecutionResult;
  readonly ownerRoot: string;
  readonly generatedAssets: GeneratedAssetIndex;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  if (input.generation.type === 'prompt') {
    return commitPromptGenerationResult({
      operationId: input.operationId,
      text: input.generation.text,
      ownerRoot: input.ownerRoot,
    });
  }
  const mediaKind = toGeneratedMediaKind(input.generation.type);
  const finalized = await finalizeMediaGenerationOutputs({
    workspaceRoot: input.ownerRoot,
    operationId: input.operationId,
    generationType: input.generation.type,
    mediaKind,
    outputs: input.generation.outputs,
    providerId: input.generation.providerId,
    modelId: input.generation.modelId,
    request: input.generation.request,
    outputDir: path.join(
      input.ownerRoot,
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
  readonly ownerRoot: string;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  const bytes = Buffer.from(input.text, 'utf8');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const outputId = createStableGeneratedOutputId(input.operationId, 0, digest);
  const relativePath = path.posix.join('neko', 'generated', 'text', `${outputId}.md`);
  const outputPath = path.join(input.ownerRoot, ...relativePath.split('/'));
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
