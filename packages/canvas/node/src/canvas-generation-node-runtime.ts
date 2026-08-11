import { createHash, randomUUID } from 'node:crypto';
import { createNodeHostContentReadService } from '@neko/content/node';
import {
  type ContentLocator,
  type ContentReadService,
  type GeneratedOutputContentLocator,
} from '@neko/content';
import {
  beginCanvasGenerationRun,
  bindCanvasGenerationNodeJob,
  requireCanvasGenerationNode,
  resolveCanvasGenerationInputs,
  selectedCanvasGenerationOutput,
  type CanvasData,
  type CanvasGenerationApplicationPort,
  type CanvasGenerationKind,
  type CanvasGenerationModelBinding,
  type CanvasGenerationRecipe,
  type CanvasGenerationResolvedInput,
  type CanvasGenerationRunBinding,
  type CanvasGenerationRuntimeProjection,
  type CanvasGenerationStartResult,
  type CanvasGenerationWorkspace,
} from '@neko/canvas-domain';
import {
  GenerationJobError,
  type GenerationJobPort,
  type GenerationJobRequest,
  type GenerationJobSnapshot,
  type SubmitGenerationJobInput,
} from '@neko/generation';
import { isTerminalJobPhase } from '@neko/shared/job-lifecycle';

export interface CanvasGenerationWorkspaceJobResolver {
  getWorkspaceJobs(input: {
    readonly workspaceId: string;
    readonly workspaceRoot: string;
  }): Promise<GenerationJobPort>;
  validateBinding(input: {
    readonly workspace: CanvasGenerationWorkspace;
    readonly kind: CanvasGenerationKind;
    readonly binding: CanvasGenerationModelBinding;
  }): void | Promise<void>;
}

export interface CanvasGenerationNodeRuntimeOptions {
  readonly generation: CanvasGenerationWorkspaceJobResolver;
  readonly createContentReader?: (workspaceRoot: string) => ContentReadService;
  readonly createSubmissionId?: () => string;
}

export class CanvasGenerationNodeRuntime implements CanvasGenerationApplicationPort {
  private disposed = false;
  private readonly createSubmissionId: () => string;

  constructor(private readonly options: CanvasGenerationNodeRuntimeOptions) {
    this.createSubmissionId = options.createSubmissionId ?? randomUUID;
  }

  async startNode(
    input: Parameters<CanvasGenerationApplicationPort['startNode']>[0],
  ): Promise<CanvasGenerationStartResult> {
    this.requireActive();
    const node = requireCanvasGenerationNode(input.canvas, input.nodeId);
    if (node.data.latestRun) {
      if (!node.data.latestRun.jobRef) {
        throw new Error(
          `Canvas Generation node "${input.nodeId}" has an unresolved submission and must be resumed before another run.`,
        );
      }
      const jobs = await this.requireWorkspaceJobs(input.workspace);
      const current = await jobs.describeGeneration(node.data.latestRun.jobRef);
      if (!isTerminalJobPhase(current.phase)) {
        throw new Error(`Canvas Generation node "${input.nodeId}" already has an active Job.`);
      }
    }

    const prepared = await this.prepare(input.workspace, input.canvas, input.nodeId);
    const submissionId = this.createSubmissionId();
    const runCanvas = replaceNodeData(
      input.canvas,
      input.nodeId,
      beginCanvasGenerationRun(node.data, {
        submissionId,
        recipeInputFingerprint: prepared.fingerprint,
      }),
    );
    await input.persistCanvas(runCanvas);
    return this.submitAndBind({
      ...input,
      canvas: runCanvas,
      submissionId,
      recipeInputFingerprint: prepared.fingerprint,
      request: prepared.request,
    });
  }

  async resumeNode(
    input: Parameters<CanvasGenerationApplicationPort['resumeNode']>[0],
  ): Promise<CanvasGenerationStartResult> {
    this.requireActive();
    const node = requireCanvasGenerationNode(input.canvas, input.nodeId);
    if (node.data.latestRun?.submissionId !== input.run.submissionId) {
      throw new Error(`Canvas Generation resume target "${input.nodeId}" is stale.`);
    }
    if (input.run.jobRef) {
      const jobs = await this.requireWorkspaceJobs(input.workspace);
      const prepared = await this.prepare(input.workspace, input.canvas, input.nodeId);
      const snapshot = await jobs.describeGeneration(input.run.jobRef);
      const selected = selectedCanvasGenerationOutput(node.data);
      return {
        canvas: input.canvas,
        projection: {
          ...(await this.projectSnapshot(
            input.workspace,
            input.nodeId,
            input.run,
            snapshot,
            selected?.kind === 'prompt' ? selected.locator : undefined,
          )),
          recipeStale: prepared.fingerprint !== input.run.recipeInputFingerprint,
        },
      };
    }
    const prepared = await this.prepare(input.workspace, input.canvas, input.nodeId);
    if (prepared.fingerprint !== input.run.recipeInputFingerprint) {
      return {
        canvas: input.canvas,
        projection: {
          nodeId: input.nodeId,
          submissionId: input.run.submissionId,
          recipeInputFingerprint: input.run.recipeInputFingerprint,
          phase: 'outcome-unknown',
          diagnostic: {
            code: 'canvas-generation-resume-input-changed',
            message:
              'The persisted Generation submission cannot be resumed because its Recipe or inputs changed.',
          },
        },
      };
    }
    return this.submitAndBind({
      ...input,
      submissionId: input.run.submissionId,
      recipeInputFingerprint: input.run.recipeInputFingerprint,
      request: prepared.request,
    });
  }

  async *observeNode(
    input: Parameters<CanvasGenerationApplicationPort['observeNode']>[0],
  ): AsyncIterable<CanvasGenerationRuntimeProjection> {
    this.requireActive();
    const jobs = await this.requireWorkspaceJobs(input.workspace);
    let updatedAt = -1;
    const initial = await jobs.describeGeneration(input.run.jobRef);
    assertSnapshotBinding(input.run, initial);
    updatedAt = initial.updatedAt;
    yield await this.projectSnapshot(input.workspace, input.nodeId, input.run, initial);
    if (isTerminalJobPhase(initial.phase)) return;
    for await (const snapshot of jobs.observeGeneration(input.run.jobRef)) {
      this.requireActive();
      assertSnapshotBinding(input.run, snapshot);
      if (snapshot.updatedAt < updatedAt) continue;
      updatedAt = snapshot.updatedAt;
      yield await this.projectSnapshot(input.workspace, input.nodeId, input.run, snapshot);
      if (isTerminalJobPhase(snapshot.phase)) return;
    }
    throw new Error(
      `Canvas Generation observation ended before Job "${input.run.jobRef.jobId}" became terminal.`,
    );
  }

  async cancelNode(
    input: Parameters<CanvasGenerationApplicationPort['cancelNode']>[0],
  ): Promise<CanvasGenerationRuntimeProjection> {
    this.requireActive();
    const jobs = await this.requireWorkspaceJobs(input.workspace);
    const snapshot = await jobs.cancelGeneration({ ref: input.run.jobRef });
    assertSnapshotBinding(input.run, snapshot);
    return this.projectSnapshot(input.workspace, input.nodeId, input.run, snapshot);
  }

  detachWindow(_windowId: string): void {
    // Workspace Jobs are detached from renderer and window lifecycles.
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private async submitAndBind(input: {
    readonly workspace: CanvasGenerationWorkspace;
    readonly canvas: CanvasData;
    readonly nodeId: string;
    readonly submissionId: string;
    readonly recipeInputFingerprint: string;
    readonly request: GenerationJobRequest;
    readonly persistCanvas: (canvas: CanvasData) => Promise<void>;
  }): Promise<CanvasGenerationStartResult> {
    let snapshot: GenerationJobSnapshot;
    try {
      const jobs = await this.requireWorkspaceJobs(input.workspace);
      snapshot = await jobs.submitGeneration({
        ...input.request,
        submissionId: input.submissionId,
        lifecycleMode: 'detached',
      } as SubmitGenerationJobInput);
    } catch (error) {
      return {
        canvas: input.canvas,
        projection: {
          nodeId: input.nodeId,
          submissionId: input.submissionId,
          recipeInputFingerprint: input.recipeInputFingerprint,
          phase: 'outcome-unknown',
          diagnostic: diagnosticFor(error),
        },
      };
    }
    const boundCanvas = bindCanvasGenerationNodeJob({
      canvas: input.canvas,
      nodeId: input.nodeId,
      submissionId: input.submissionId,
      recipeInputFingerprint: input.recipeInputFingerprint,
      jobRef: snapshot.ref,
    });
    await input.persistCanvas(boundCanvas);
    const run = requireCanvasGenerationNode(boundCanvas, input.nodeId).data.latestRun;
    if (!run?.jobRef) throw new Error('Canvas Generation Job binding was not persisted.');
    return {
      canvas: boundCanvas,
      projection: await this.projectSnapshot(input.workspace, input.nodeId, run, snapshot),
    };
  }

  private async prepare(
    workspace: CanvasGenerationWorkspace,
    canvas: CanvasData,
    nodeId: string,
  ): Promise<{ readonly request: GenerationJobRequest; readonly fingerprint: string }> {
    const node = requireCanvasGenerationNode(canvas, nodeId);
    const model = node.data.recipe.model;
    if (!model) throw new Error('Canvas Generation Recipe requires an exact model binding.');
    await this.options.generation.validateBinding({
      workspace,
      kind: node.data.recipe.kind,
      binding: model,
    });
    const reader =
      this.options.createContentReader?.(workspace.workspacePath) ??
      createNodeHostContentReadService({ workspaceRoot: workspace.workspacePath });
    const inputs = await resolveCanvasGenerationInputs({
      canvas,
      nodeId,
      port: {
        fingerprintText,
        readText: async (locator) => {
          const result = await reader.read(locator, { maxBytes: 4 * 1024 * 1024 });
          if (result.status !== 'ready') {
            throw new Error(
              `Canvas Generation text input is unavailable: ${result.diagnostic.code}.`,
            );
          }
          return {
            text: new TextDecoder('utf-8', { fatal: true }).decode(result.bytes),
            digest: result.fingerprint.value,
          };
        },
        authorizeLocator: async (locator) => (await reader.stat(locator)).status === 'ready',
      },
    });
    const fingerprint = fingerprintValue({ recipe: node.data.recipe, inputs });
    return { request: projectGenerationRequest(node.data.recipe, inputs), fingerprint };
  }

  private requireWorkspaceJobs(workspace: CanvasGenerationWorkspace): Promise<GenerationJobPort> {
    this.requireActive();
    return this.options.generation.getWorkspaceJobs({
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.workspacePath,
    });
  }

  private async projectSnapshot(
    workspace: CanvasGenerationWorkspace,
    nodeId: string,
    run: CanvasGenerationRunBinding,
    snapshot: GenerationJobSnapshot,
    selectedPromptLocator?: GeneratedOutputContentLocator,
  ): Promise<CanvasGenerationRuntimeProjection> {
    const projection = projectSnapshot(nodeId, run, snapshot);
    if (
      snapshot.phase !== 'succeeded' ||
      snapshot.request.generationType !== 'prompt' ||
      !(selectedPromptLocator ?? snapshot.resultLocators?.[0])
    ) {
      return projection;
    }
    const reader =
      this.options.createContentReader?.(workspace.workspacePath) ??
      createNodeHostContentReadService({ workspaceRoot: workspace.workspacePath });
    const content = await reader.read(selectedPromptLocator ?? snapshot.resultLocators![0]!, {
      maxBytes: 4 * 1024 * 1024,
    });
    if (content.status !== 'ready') {
      return {
        ...projection,
        diagnostic: {
          code: content.diagnostic.code,
          message: 'Generated text output is unavailable.',
        },
      };
    }
    return {
      ...projection,
      text: new TextDecoder('utf-8', { fatal: true }).decode(content.bytes),
    };
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Canvas Generation runtime is disposed.');
  }
}

function projectGenerationRequest(
  recipe: CanvasGenerationRecipe,
  inputs: readonly CanvasGenerationResolvedInput[],
): GenerationJobRequest {
  if (!recipe.prompt.trim() || !recipe.model) {
    throw new Error('Canvas Generation Recipe is not executable.');
  }
  const textInputs = inputs.filter(
    (entry): entry is Extract<CanvasGenerationResolvedInput, { kind: 'text' }> =>
      entry.kind === 'text',
  );
  const prompt = [recipe.prompt, ...textInputs.map((entry) => entry.text)]
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
  const binding = { providerId: recipe.model.providerId, modelId: recipe.model.modelId };
  switch (recipe.kind) {
    case 'prompt':
      return {
        generationType: 'prompt',
        ...binding,
        request: {
          prompt: recipe.prompt,
          ...(textInputs.length > 0 ? { context: textInputs } : {}),
          ...(recipe.temperature === undefined ? {} : { temperature: recipe.temperature }),
          ...(recipe.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: recipe.maxOutputTokens }),
        },
      };
    case 'image': {
      const image = uniqueLocator(inputs, 'image');
      return {
        generationType: image ? 'image-to-image' : 'text-to-image',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.width === undefined ? {} : { width: recipe.width }),
          ...(recipe.height === undefined ? {} : { height: recipe.height }),
          ...(recipe.aspectRatio === undefined ? {} : { aspectRatio: recipe.aspectRatio }),
          ...(recipe.count === undefined ? {} : { count: recipe.count }),
          ...(recipe.quality === undefined ? {} : { quality: recipe.quality }),
          ...(recipe.style === undefined ? {} : { style: recipe.style }),
          ...(image ? { referenceImageLocator: image } : {}),
        },
      };
    }
    case 'video': {
      const image = uniqueLocator(inputs, 'image');
      const video = uniqueLocator(inputs, 'video');
      return {
        generationType: video ? 'video-to-video' : image ? 'image-to-video' : 'text-to-video',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.duration === undefined ? {} : { duration: recipe.duration }),
          ...(recipe.resolution === undefined ? {} : { resolution: recipe.resolution }),
          ...(recipe.fps === undefined ? {} : { fps: recipe.fps }),
          ...(recipe.aspectRatio === undefined ? {} : { aspectRatio: recipe.aspectRatio }),
          ...(recipe.motionStrength === undefined ? {} : { motionStrength: recipe.motionStrength }),
          ...(recipe.cameraMovement === undefined ? {} : { cameraMovement: recipe.cameraMovement }),
          ...(video ? { referenceVideoLocator: video } : {}),
          ...(!video && image ? { startFrameLocator: image } : {}),
        },
      };
    }
    case 'audio':
      if (inputs.some((entry) => entry.kind === 'audio')) {
        throw new Error(
          'The selected Audio generation contract does not support an audio reference input.',
        );
      }
      return {
        generationType: recipe.isMusic ? 'text-to-music' : 'text-to-audio',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.duration === undefined ? {} : { duration: recipe.duration }),
          ...(recipe.isMusic === undefined ? {} : { isMusic: recipe.isMusic }),
          ...(recipe.genre === undefined ? {} : { genre: recipe.genre }),
          ...(recipe.format === undefined ? {} : { format: recipe.format }),
        },
      };
  }
}

function uniqueLocator(
  inputs: readonly CanvasGenerationResolvedInput[],
  kind: 'image' | 'video',
): ContentLocator | undefined {
  const matches: ContentLocator[] = [];
  for (const entry of inputs) {
    if (entry.kind === kind) matches.push(entry.locator);
  }
  if (matches.length > 1) {
    throw new Error(`Canvas Generation accepts at most one ${kind} reference input.`);
  }
  return matches[0];
}

function projectSnapshot(
  nodeId: string,
  run: CanvasGenerationRunBinding,
  snapshot: GenerationJobSnapshot,
): CanvasGenerationRuntimeProjection {
  assertSnapshotBinding(run, snapshot);
  return {
    nodeId,
    submissionId: run.submissionId,
    recipeInputFingerprint: run.recipeInputFingerprint,
    jobRef: snapshot.ref,
    phase: snapshot.phase,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    progress: snapshot.progress,
    ...(snapshot.resultLocators ? { resultLocators: snapshot.resultLocators } : {}),
    ...(snapshot.failure ? { diagnostic: snapshot.failure } : {}),
  };
}

function assertSnapshotBinding(
  run: CanvasGenerationRunBinding,
  snapshot: GenerationJobSnapshot,
): void {
  if (snapshot.submissionId !== run.submissionId || run.jobRef?.jobId !== snapshot.ref.jobId) {
    throw new GenerationJobError(
      'generation-job-binding-mismatch',
      'Canvas Generation Job snapshot does not match the exact persisted run binding.',
    );
  }
}

function replaceNodeData(
  canvas: CanvasData,
  nodeId: string,
  data: ReturnType<typeof requireCanvasGenerationNode>['data'],
): CanvasData {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === nodeId && node.type === 'generation' ? { ...node, data } : node,
    ),
  };
}

function fingerprintText(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function fingerprintValue(value: unknown): string {
  return fingerprintText(JSON.stringify(value));
}

function diagnosticFor(error: unknown) {
  return {
    code: error instanceof GenerationJobError ? error.code : 'canvas-generation-submit-failed',
    message: error instanceof Error ? error.message : 'Canvas Generation submission failed.',
  };
}
