import * as path from 'node:path';
import {
  type GenerationJobPort,
  type GenerationJobSnapshot,
  type MediaGenerationResult,
} from '@neko/generation';
import {
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
  createPersistentGenerationJobStore,
} from '@neko/generation/job';
import {
  GeneratedAssetIndex,
  createContentReadMediaRequestAssetMaterializer,
  finalizeMediaGenerationOutputs,
  migrateLegacyGeneratedAssetIndex,
  createMediaPlatform,
  type GeneratedMediaKind,
} from '@neko/generation/media';
import { ConfigManager, FileUserConfigManager } from '@neko/host/settings';
import { PathResolver } from '@neko/shared';
import { contentLocatorsEqual, type GeneratedOutputContentLocator } from '@neko/content';
import { resolveWorkspaceGeneratedAssetRelativeDirectory } from '@neko/generation';
import {
  type CanvasGenerationApplicationPort,
  type CanvasGenerationWorkspace,
  type CanvasMaterialGenerationContext,
} from '@neko-canvas/domain';
import { createNodeHostContentReadService } from '@neko/content/node';
import { JobLifecycleError, isTerminalJobPhase } from '@neko/shared/job-lifecycle';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '@neko/local-metadata/node';
import { LocalMetadataGeneratedOutputProjectionStore } from '@neko/generation/media';
import type {
  CanvasGenerationProjectionSnapshot,
  CanvasMaterialActionTarget,
} from '@neko-canvas/domain';

export interface CanvasGenerationJobOwner {
  readonly jobs: Pick<
    GenerationJobPort,
    'describeGeneration' | 'observeGeneration' | 'regenerateGeneration'
  >;
  dispose(): Promise<void>;
}

export interface CanvasGenerationNodeRuntimeOptions {
  readonly homedir: string;
  readonly createWorkspaceOwner?: (
    workspace: CanvasGenerationWorkspace,
  ) => Promise<CanvasGenerationJobOwner>;
}

interface WorkspaceOwnerEntry {
  readonly workspacePath: string;
  readonly owner: CanvasGenerationJobOwner;
}

/**
 * Node application runtime for owner-authored Generation Jobs.
 *
 * Canvas receives only immutable projections. The authoritative request,
 * provider execution, persistence, output commit, and regeneration lifecycle
 * remain owned by @neko/generation.
 */
export class CanvasGenerationNodeRuntime implements CanvasGenerationApplicationPort {
  private readonly workspaceOwners = new Map<string, Promise<WorkspaceOwnerEntry>>();
  private disposed = false;

  constructor(private readonly options: CanvasGenerationNodeRuntimeOptions) {}

  async resolveResultActions(input: {
    readonly workspace: CanvasGenerationWorkspace;
    readonly target: CanvasMaterialActionTarget;
  }): Promise<{ readonly regenerate: boolean; readonly editAndGenerate: boolean }> {
    const snapshot = await this.resolveAuthorizedSnapshot(input.workspace, input.target);
    return {
      regenerate: snapshot?.phase === 'succeeded',
      editAndGenerate: false,
    };
  }

  async regenerateResult(input: {
    readonly workspace: CanvasGenerationWorkspace;
    readonly target: CanvasMaterialActionTarget;
  }): Promise<CanvasGenerationProjectionSnapshot> {
    this.requireActive();
    const current = await this.resolveAuthorizedSnapshot(input.workspace, input.target);
    if (!current || current.phase !== 'succeeded') {
      throw new Error(
        'Desktop Canvas regeneration requires an authoritative succeeded Generation Job result.',
      );
    }
    const owner = (await this.requireWorkspaceOwner(input.workspace)).owner;
    const started = await owner.jobs.regenerateGeneration({
      ref: current.ref,
      expectedRevision: current.revision,
    });
    const completed = await waitForTerminalGeneration(owner.jobs, started);
    return projectGenerationSnapshot(completed, input.target.mediaKind);
  }

  detachWindow(_windowId: string): void {
    // Generation Jobs are workspace-owned and survive renderer/window lifecycles.
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const settled = await Promise.allSettled(this.workspaceOwners.values());
    this.workspaceOwners.clear();
    const failures: unknown[] = [];
    for (const result of settled) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
        continue;
      }
      try {
        await result.value.owner.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Desktop Canvas Generation disposal failed.');
    }
  }

  private async resolveAuthorizedSnapshot(
    workspace: CanvasGenerationWorkspace,
    target: CanvasMaterialActionTarget,
  ): Promise<GenerationJobSnapshot | undefined> {
    this.requireActive();
    if (
      target.origin !== 'generated' ||
      target.locator.kind !== 'generated-output' ||
      !target.generation
    ) {
      return undefined;
    }
    const owner = (await this.requireWorkspaceOwner(workspace)).owner;
    let snapshot: GenerationJobSnapshot;
    try {
      snapshot = await owner.jobs.describeGeneration(target.generation.jobRef);
    } catch (error) {
      if (error instanceof JobLifecycleError && error.code === 'job-not-found') return undefined;
      throw error;
    }
    const ownsResult =
      snapshot.resultLocators?.some((locator) => contentLocatorsEqual(locator, target.locator)) ??
      false;
    return ownsResult ? snapshot : undefined;
  }

  private requireWorkspaceOwner(
    workspace: CanvasGenerationWorkspace,
  ): Promise<WorkspaceOwnerEntry> {
    const existing = this.workspaceOwners.get(workspace.workspaceId);
    if (existing) {
      return existing.then((entry) => {
        if (entry.workspacePath !== workspace.workspacePath) {
          throw new Error(
            `Desktop Canvas Generation Workspace '${workspace.workspaceId}' changed its authorized root.`,
          );
        }
        return entry;
      });
    }
    const createWorkspaceOwner =
      this.options.createWorkspaceOwner ??
      ((authorizedWorkspace) =>
        createDefaultWorkspaceOwner({
          homedir: this.options.homedir,
          workspace: authorizedWorkspace,
        }));
    const pending = createWorkspaceOwner(workspace)
      .then((owner) => ({
        workspacePath: workspace.workspacePath,
        owner,
      }))
      .catch((error: unknown) => {
        this.workspaceOwners.delete(workspace.workspaceId);
        throw error;
      });
    this.workspaceOwners.set(workspace.workspaceId, pending);
    return pending;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Canvas Generation runtime is disposed.');
  }
}

async function createDefaultWorkspaceOwner(input: {
  readonly homedir: string;
  readonly workspace: CanvasGenerationWorkspace;
}): Promise<CanvasGenerationJobOwner> {
  const metadata = await createNodeWorkspaceResourceCacheMetadataBinding({
    homedir: input.homedir,
    workDir: input.workspace.workspacePath,
  });
  let configManager: ConfigManager | undefined;
  let coordinator: GenerationJobCoordinator | undefined;
  try {
    if (metadata.workspaceId !== input.workspace.workspaceId) {
      throw new Error(
        `Desktop Canvas Generation Workspace identity mismatch: expected '${input.workspace.workspaceId}', received '${metadata.workspaceId}'.`,
      );
    }
    await metadata.metadataStore.migrateNamespace(GENERATION_JOB_MIGRATIONS);
    const generatedAssetStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: metadata.manifestStore,
      workspaceRoot: input.workspace.workspacePath,
      pathResolver: new PathResolver(
        new Map([
          ['WORKSPACE', input.workspace.workspacePath],
          ['HOME', input.homedir],
        ]),
      ),
    });
    const migration = await migrateLegacyGeneratedAssetIndex({
      indexPath: path.join(input.workspace.workspacePath, 'neko', 'generated', 'index.json'),
      store: generatedAssetStore,
    });
    if (migration.sourceStatus === 'quarantined') {
      throw new Error(
        `Desktop Canvas generated asset index was quarantined: ${migration.sourceDiagnostic ?? 'invalid index'}.`,
      );
    }
    const generatedAssets = new GeneratedAssetIndex(generatedAssetStore);
    await generatedAssets.load();
    configManager = new ConfigManager({
      userConfigManager: new FileUserConfigManager(),
      workspacePath: input.workspace.workspacePath,
    });
    const media = createMediaPlatform({
      configManager,
      requestAssetMaterializer: createContentReadMediaRequestAssetMaterializer({
        contentRead: createNodeHostContentReadService({
          workspaceRoot: input.workspace.workspacePath,
        }),
        encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
      }),
    });
    coordinator = new GenerationJobCoordinator({
      store: createPersistentGenerationJobStore({
        metadataStore: metadata.metadataStore,
        workspaceId: metadata.workspaceId,
      }),
      execution: media.service,
      resultCommitter: {
        commit: ({ ref, generation }) =>
          commitGenerationResult({
            operationId: ref.jobId,
            generation,
            workspaceRoot: input.workspace.workspacePath,
            generatedAssets,
          }),
      },
    });
    await coordinator.recoverPersistedGenerationJobs();
    const ownedCoordinator = coordinator;
    const ownedConfigManager = configManager;
    return {
      jobs: ownedCoordinator,
      dispose: async () => {
        const failures: unknown[] = [];
        try {
          await ownedCoordinator.dispose();
        } catch (error) {
          failures.push(error);
        }
        try {
          await metadata.dispose();
        } catch (error) {
          failures.push(error);
        }
        ownedConfigManager.dispose();
        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            'Desktop Canvas Generation Workspace owner disposal failed.',
          );
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
    if (configManager) {
      try {
        configManager.dispose();
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
    throw new AggregateError(
      failures,
      'Desktop Canvas Generation Workspace owner initialization failed.',
    );
  }
}

async function waitForTerminalGeneration(
  jobs: CanvasGenerationJobOwner['jobs'],
  initial: GenerationJobSnapshot,
): Promise<GenerationJobSnapshot> {
  if (isTerminalJobPhase(initial.phase)) return initial;
  for await (const snapshot of jobs.observeGeneration(initial.ref, initial.revision)) {
    if (isTerminalJobPhase(snapshot.phase)) return snapshot;
  }
  throw new Error(
    `Desktop Canvas Generation observation ended before Job '${initial.ref.jobId}' became terminal.`,
  );
}

function projectGenerationSnapshot(
  snapshot: GenerationJobSnapshot,
  mediaKind: CanvasMaterialActionTarget['mediaKind'],
): CanvasGenerationProjectionSnapshot {
  return {
    ref: snapshot.ref,
    ...(snapshot.retryOf ? { retryOf: snapshot.retryOf } : {}),
    ...(snapshot.regenerateOf ? { regenerateOf: snapshot.regenerateOf } : {}),
    phase: snapshot.phase,
    revision: snapshot.revision,
    title: `Regenerate ${mediaKind}`,
    inputNodeIds: [],
    mediaKind,
    summary: generationSummary(snapshot),
    ...(snapshot.resultLocators ? { resultLocators: snapshot.resultLocators } : {}),
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
  };
}

function generationSummary(snapshot: GenerationJobSnapshot): CanvasMaterialGenerationContext {
  const generationRequest = snapshot.request;
  const base = {
    prompt: generationRequest.request.prompt,
    model: generationRequest.modelId,
  };
  switch (generationRequest.generationType) {
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
      return {
        ...base,
        ...(generationRequest.request.width !== undefined
          ? { width: generationRequest.request.width }
          : {}),
        ...(generationRequest.request.height !== undefined
          ? { height: generationRequest.request.height }
          : {}),
        ...(generationRequest.request.aspectRatio
          ? { aspectRatio: generationRequest.request.aspectRatio }
          : {}),
      };
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return {
        ...base,
        ...(generationRequest.request.aspectRatio
          ? { aspectRatio: generationRequest.request.aspectRatio }
          : {}),
        ...(generationRequest.request.duration !== undefined
          ? { duration: generationRequest.request.duration }
          : {}),
      };
    case 'text-to-audio':
    case 'text-to-music':
      return {
        ...base,
        ...(generationRequest.request.duration !== undefined
          ? { duration: generationRequest.request.duration }
          : {}),
      };
  }
}

async function commitGenerationResult(input: {
  readonly operationId: string;
  readonly generation: MediaGenerationResult;
  readonly workspaceRoot: string;
  readonly generatedAssets: GeneratedAssetIndex;
}): Promise<readonly GeneratedOutputContentLocator[]> {
  const mediaKind = toGeneratedMediaKind(input.generation.type);
  const outputDir = path.join(
    input.workspaceRoot,
    resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }),
  );
  const finalized = await finalizeMediaGenerationOutputs({
    workspaceRoot: input.workspaceRoot,
    operationId: input.operationId,
    generationType: input.generation.type,
    mediaKind,
    outputs: input.generation.outputs,
    providerId: input.generation.providerId,
    modelId: input.generation.modelId,
    request: input.generation.request,
    outputDir,
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
