import { type GenerationJobPort, type GenerationJobSnapshot } from '@neko/generation';
import { contentLocatorsEqual } from '@neko/content';
import {
  type CanvasGenerationApplicationPort,
  type CanvasGenerationWorkspace,
  type CanvasMaterialGenerationContext,
} from '@neko/canvas-domain';
import { JobLifecycleError, isTerminalJobPhase } from '@neko/shared/job-lifecycle';
import type {
  CanvasGenerationProjectionSnapshot,
  CanvasMaterialActionTarget,
} from '@neko/canvas-domain';

export interface CanvasGenerationWorkspaceJobResolver {
  getWorkspaceJobs(input: {
    readonly workspaceId: string;
    readonly workspaceRoot: string;
  }): Promise<GenerationJobPort>;
}

export interface CanvasGenerationNodeRuntimeOptions {
  readonly generation: CanvasGenerationWorkspaceJobResolver;
}

/**
 * Node application runtime for owner-authored Generation Jobs.
 *
 * Canvas receives only immutable projections. The authoritative request,
 * provider execution, persistence, output commit, and regeneration lifecycle
 * remain owned by @neko/generation.
 */
export class CanvasGenerationNodeRuntime implements CanvasGenerationApplicationPort {
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
    const jobs = await this.requireWorkspaceJobs(input.workspace);
    const started = await jobs.regenerateGeneration({
      ref: current.ref,
    });
    const completed = await waitForTerminalGeneration(jobs, started);
    return projectGenerationSnapshot(completed, input.target.mediaKind);
  }

  detachWindow(_windowId: string): void {
    // Generation Jobs are workspace-owned and survive renderer/window lifecycles.
  }

  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    return Promise.resolve();
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
    const jobs = await this.requireWorkspaceJobs(workspace);
    let snapshot: GenerationJobSnapshot;
    try {
      snapshot = await jobs.describeGeneration(target.generation.jobRef);
    } catch (error) {
      if (error instanceof JobLifecycleError && error.code === 'job-not-found') return undefined;
      throw error;
    }
    const ownsResult =
      snapshot.resultLocators?.some((locator) => contentLocatorsEqual(locator, target.locator)) ??
      false;
    return ownsResult ? snapshot : undefined;
  }

  private requireWorkspaceJobs(workspace: CanvasGenerationWorkspace): Promise<GenerationJobPort> {
    this.requireActive();
    return this.options.generation.getWorkspaceJobs({
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.workspacePath,
    });
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Canvas Generation runtime is disposed.');
  }
}

async function waitForTerminalGeneration(
  jobs: Pick<GenerationJobPort, 'observeGeneration'>,
  initial: GenerationJobSnapshot,
): Promise<GenerationJobSnapshot> {
  if (isTerminalJobPhase(initial.phase)) return initial;
  for await (const snapshot of jobs.observeGeneration(initial.ref)) {
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
