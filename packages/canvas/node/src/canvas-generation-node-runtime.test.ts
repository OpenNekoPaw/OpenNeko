import {
  attachCanvasGenerationReference,
  createCanvasGenerationNode,
  projectResolvedCanvasMaterialToCanvas,
  requireCanvasGenerationNode,
  updateCanvasGenerationNodeRecipe,
  type CanvasData,
  type CanvasGenerationRunBinding,
  type CanvasGenerationWorkspace,
  type CanvasHostRuntimeIdentity,
} from '@neko/canvas-domain';
import {
  GenerationJobError,
  type GenerationJobPort,
  type GenerationJobSnapshot,
  type SubmitGenerationJobInput,
} from '@neko/generation-domain';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGenerationNodeRuntime } from './canvas-generation-node-runtime';
import { createNodeHostContentReadService } from '@neko/content-domain/node';
import { createProjectContentReadService } from '@neko/assets-node';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspace: CanvasGenerationWorkspace = {
  workspaceId: 'workspace-1',
  workspacePath: '/fixture/workspace',
};

const identity: CanvasHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:board-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'boards/board-1.nkc',
  sessionId: 'canvas-session-1',
  rendererSessionId: 'renderer-session-1',
};

describe('CanvasGenerationNodeRuntime', () => {
  it('reads embedded document images through the project reader and isolates missing or unauthorized inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'canvas-generation-input-'));
    const outside = await mkdtemp(join(tmpdir(), 'canvas-generation-outside-'));
    try {
      await writeFile(join(root, 'comic.epub'), 'document fixture');
      await writeFile(join(outside, 'comic.epub'), 'unauthorized document fixture');
      await symlink(outside, join(root, 'outside'));
      const source = {
        file: { authority: 'workspace' as const, path: 'comic.epub' },
        selector: { kind: 'entry' as const, path: 'image/page.jpg' },
      };
      const readEntry = vi.fn(async () => new Uint8Array([1, 2, 3]));
      const createContentReader = vi.fn((workspaceRoot: string, projectId: string) =>
        createProjectContentReadService({
          workspaceRoot,
          projectId,
          globalMediaLibraryRoot: join(root, 'libraries'),
          documentEntryReader: { readEntry },
        }),
      );
      const submitGeneration = vi.fn(async () =>
        snapshot({ phase: 'running', submissionId: 'submission-1' }),
      );
      const runtime = new CanvasGenerationNodeRuntime({
        generation: {
          getWorkspaceJobs: async () => createJobs({ submitGeneration }),
          validateBinding: vi.fn(),
        },
        createContentReader,
        createSubmissionId: () => 'submission-1',
      });
      const canvasWithSource = (path: string): CanvasData => {
        const canvas = configuredCanvas();
        const node = requireCanvasGenerationNode(canvas, 'generation-1');
        return {
          ...canvas,
          nodes: [
            {
              ...node,
              data: {
                ...node.data,
                inputMaterials: [
                  { mediaKind: 'image', locator: { ...source, file: { ...source.file, path } } },
                ],
              },
            },
          ],
        };
      };
      const persistCanvas = vi.fn(async () => undefined);
      const start = (path: string) =>
        runtime.startNode({
          identity,
          workspace: { ...workspace, workspacePath: root },
          canvas: canvasWithSource(path),
          nodeId: 'generation-1',
          persistCanvas,
        });
      await expect(start('missing.epub')).rejects.toThrow('content-missing');
      await expect(start('outside/comic.epub')).rejects.toThrow('content-unauthorized');
      expect(readEntry).not.toHaveBeenCalled();
      expect(submitGeneration).not.toHaveBeenCalled();
      expect(persistCanvas).not.toHaveBeenCalled();
      await start('comic.epub');
      expect(createContentReader).toHaveBeenLastCalledWith(root, identity.projectId);
      expect(readEntry).toHaveBeenCalledExactlyOnceWith(join(root, 'comic.epub'), 'image/page.jpg');
      expect(submitGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          generationType: 'image-to-image',
          request: expect.objectContaining({ referenceImageLocator: source }),
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('persists run intent before exact Workspace submission and persists the Job binding afterward', async () => {
    const persisted: CanvasData[] = [];
    const submitGeneration = vi.fn(async (input: SubmitGenerationJobInput) => {
      expect(persisted).toHaveLength(1);
      expect(requireCanvasGenerationNode(persisted[0]!, 'generation-1').data.latestRun).toEqual({
        submissionId: 'submission-1',
        recipeInputFingerprint: expect.stringMatching(/^sha256:/),
      });
      return snapshot({ submissionId: input.submissionId, phase: 'running' });
    });
    const jobs = createJobs({ submitGeneration });
    const getWorkspaceJobs = vi.fn(async () => jobs);
    const validateBinding = vi.fn();
    const runtime = new CanvasGenerationNodeRuntime({
      generation: { getWorkspaceJobs, validateBinding },
      createContentReader: (workspaceRoot) => createNodeHostContentReadService({ workspaceRoot }),
      createSubmissionId: () => 'submission-1',
    });

    const result = await runtime.startNode({
      identity,
      workspace,
      canvas: configuredCanvas(),
      nodeId: 'generation-1',
      persistCanvas: async (canvas) => {
        persisted.push(canvas);
      },
    });

    expect(getWorkspaceJobs).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      workspaceRoot: '/fixture/workspace',
    });
    expect(validateBinding).toHaveBeenCalledWith({
      workspace,
      kind: 'image',
      binding: {
        purpose: 'image.generate',
        providerId: 'provider-1',
        modelId: 'image-model-1',
      },
    });
    expect(submitGeneration).toHaveBeenCalledWith({
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model-1',
      lifecycleMode: 'detached',
      submissionId: 'submission-1',
      request: {
        prompt: 'Create a quiet concept frame',
        providerId: 'provider-1',
        modelId: 'image-model-1',
        width: 1024,
        height: 768,
      },
    });
    expect(persisted).toHaveLength(2);
    expect(requireCanvasGenerationNode(persisted[1]!, 'generation-1').data.latestRun).toEqual({
      submissionId: 'submission-1',
      recipeInputFingerprint: result.projection.recipeInputFingerprint,
      jobRef: { kind: 'generation', jobId: 'job-1' },
    });
    expect(result.canvas.nodes).toHaveLength(1);
    expect(result.canvas.nodes[0]?.type).toBe('generation');
  });

  it('resubmits a projected video recipe with its first frame and effective parameters intact', async () => {
    const firstFrame = {
      file: {
        authority: 'workspace' as const,
        path: 'neko/generated/image/first-frame.png',
      },
    };
    const submitGeneration = vi.fn(async (input: SubmitGenerationJobInput) =>
      snapshot({ submissionId: input.submissionId, phase: 'running' }),
    );
    const runtime = new CanvasGenerationNodeRuntime({
      generation: {
        getWorkspaceJobs: vi.fn(async () => createJobs({ submitGeneration })),
        validateBinding: vi.fn(),
      },
      createContentReader: () => ({
        stat: async (locator) => ({
          status: 'ready',
          locator,
          byteLength: 1,
          fingerprint: { strategy: 'sha256', value: 'first-frame' },
        }),
        read: async () => {
          throw new Error('Image-to-video preparation must not read image bytes.');
        },
      }),
      createSubmissionId: () => 'submission-1',
    });
    const withGeneration = updateCanvasGenerationNodeRecipe({
      canvas: createCanvasGenerationNode({
        canvas: emptyCanvas(),
        nodeId: 'generation-1',
        kind: 'video',
        position: { x: 392, y: 48 },
      }),
      nodeId: 'generation-1',
      recipe: {
        kind: 'video',
        prompt: 'Slowly push into the megastructure',
        negativePrompt: 'fast camera',
        model: {
          purpose: 'video.generate',
          providerId: 'minimax-provider',
          modelId: 'minimax-h3',
        },
        duration: 6,
        resolution: '768P',
        fps: 24,
        aspectRatio: '16:9',
        generateAudio: false,
        motionStrength: 0.2,
        cameraMovement: 'slow push-in',
        cameraAngle: 'low-angle upward view',
        shotScale: 'extreme wide shot',
        editInstruction: 'Preserve the first-frame composition',
      },
    });
    const withMaterial = projectResolvedCanvasMaterialToCanvas({
      canvas: withGeneration,
      material: { locator: firstFrame, title: 'first-frame.png', mediaKind: 'image' },
      generateId: () => 'first-frame',
    });
    const canvas = attachCanvasGenerationReference({
      canvas: withMaterial,
      nodeId: 'generation-1',
      sourceNodeId: 'first-frame',
    });

    await runtime.startNode({
      identity,
      workspace,
      canvas,
      nodeId: 'generation-1',
      persistCanvas: async () => undefined,
    });

    expect(submitGeneration).toHaveBeenCalledWith({
      generationType: 'image-to-video',
      providerId: 'minimax-provider',
      modelId: 'minimax-h3',
      lifecycleMode: 'detached',
      submissionId: 'submission-1',
      request: {
        providerId: 'minimax-provider',
        modelId: 'minimax-h3',
        prompt: 'Slowly push into the megastructure',
        negativePrompt: 'fast camera',
        duration: 6,
        resolution: '768P',
        fps: 24,
        aspectRatio: '16:9',
        generateAudio: false,
        motionStrength: 0.2,
        cameraMovement: 'slow push-in',
        cameraAngle: 'low-angle upward view',
        shotScale: 'extreme wide shot',
        editInstruction: 'Preserve the first-frame composition',
        inputs: [{ type: 'image', role: 'first-frame', locator: firstFrame }],
      },
    });
  });

  it('resumes an uncertain unbound submission with the same idempotency identity', async () => {
    const submitGeneration = vi
      .fn<(input: SubmitGenerationJobInput) => Promise<GenerationJobSnapshot>>()
      .mockRejectedValueOnce(new Error('connection lost after submit'))
      .mockImplementationOnce(async (input) =>
        snapshot({ submissionId: input.submissionId, phase: 'pending' }),
      );
    const runtime = createRuntime(createJobs({ submitGeneration }));
    const first = await runtime.startNode({
      identity,
      workspace,
      canvas: configuredCanvas(),
      nodeId: 'generation-1',
      persistCanvas: async () => undefined,
    });
    const run = requireRun(first.canvas);

    expect(first.projection).toMatchObject({ phase: 'outcome-unknown' });
    const resumed = await runtime.resumeNode({
      identity,
      workspace,
      canvas: first.canvas,
      nodeId: 'generation-1',
      run,
      persistCanvas: async () => undefined,
    });

    expect(submitGeneration).toHaveBeenCalledTimes(2);
    expect(submitGeneration.mock.calls[0]?.[0].submissionId).toBe('submission-1');
    expect(submitGeneration.mock.calls[1]?.[0].submissionId).toBe('submission-1');
    expect(resumed.projection).toMatchObject({
      phase: 'pending',
      jobRef: { kind: 'generation', jobId: 'job-1' },
    });
  });

  it('projects an exact persistence diagnostic when the Workspace Job owner cannot initialize', async () => {
    const persisted: CanvasData[] = [];
    const getWorkspaceJobs = vi
      .fn()
      .mockRejectedValue(
        new GenerationJobError(
          'generation-job-persistence-invalid',
          'Generation Job persistence contains non-canonical records.',
        ),
      );
    const runtime = new CanvasGenerationNodeRuntime({
      generation: { getWorkspaceJobs, validateBinding: vi.fn() },
      createContentReader: (workspaceRoot) => createNodeHostContentReadService({ workspaceRoot }),
      createSubmissionId: () => 'submission-1',
    });

    await expect(
      runtime.startNode({
        identity,
        workspace,
        canvas: configuredCanvas(),
        nodeId: 'generation-1',
        persistCanvas: async (canvas) => {
          persisted.push(canvas);
        },
      }),
    ).resolves.toMatchObject({
      projection: {
        phase: 'outcome-unknown',
        diagnostic: {
          code: 'generation-job-persistence-invalid',
          message: 'Generation Job persistence contains non-canonical records.',
        },
      },
    });
    expect(persisted).toHaveLength(1);
  });

  it('does not submit an unbound run when its Recipe or input fingerprint changed', async () => {
    const submitGeneration = vi.fn();
    const runtime = createRuntime(createJobs({ submitGeneration }));
    const canvas = withRun(configuredCanvas(), {
      submissionId: 'submission-1',
      recipeInputFingerprint: 'sha256:stale',
    });

    await expect(
      runtime.resumeNode({
        identity,
        workspace,
        canvas,
        nodeId: 'generation-1',
        run: requireRun(canvas),
        persistCanvas: async () => undefined,
      }),
    ).resolves.toMatchObject({
      canvas,
      projection: {
        phase: 'outcome-unknown',
        diagnostic: { code: 'canvas-generation-resume-input-changed' },
      },
    });
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('reattaches the exact bound Job and marks a changed Recipe/input fingerprint stale', async () => {
    const run = boundRun();
    const submitGeneration = vi.fn();
    const describeGeneration = vi.fn(async () =>
      snapshot({ submissionId: run.submissionId, phase: 'running' }),
    );
    const runtime = createRuntime(createJobs({ submitGeneration, describeGeneration }));
    const canvas = withRun(configuredCanvas(), run);

    await expect(
      runtime.resumeNode({
        identity,
        workspace,
        canvas,
        nodeId: 'generation-1',
        run,
        persistCanvas: async () => undefined,
      }),
    ).resolves.toMatchObject({
      canvas,
      projection: {
        jobRef: run.jobRef,
        phase: 'running',
        recipeStale: true,
      },
    });
    expect(describeGeneration).toHaveBeenCalledWith(run.jobRef);
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('reattaches an Agent-created Job by JobRef when no submission identity exists', async () => {
    const run = {
      recipeInputFingerprint: 'sha256:recipe-input',
      jobRef: { kind: 'generation' as const, jobId: 'job-1' },
    };
    const describeGeneration = vi.fn(async () => snapshot({ phase: 'running' }));
    const runtime = createRuntime(createJobs({ describeGeneration }));
    const canvas = withRun(configuredCanvas(), run);

    await expect(
      runtime.resumeNode({
        identity,
        workspace,
        canvas,
        nodeId: 'generation-1',
        run,
        persistCanvas: async () => undefined,
      }),
    ).resolves.toMatchObject({
      canvas,
      projection: {
        jobRef: run.jobRef,
        phase: 'running',
      },
    });
    expect(describeGeneration).toHaveBeenCalledWith(run.jobRef);
  });

  it('reattaches a bound Job by JobRef when its runtime snapshot omits submission metadata', async () => {
    const run = boundRun();
    const describeGeneration = vi.fn(async () => snapshot({ phase: 'running' }));
    const runtime = createRuntime(createJobs({ describeGeneration }));
    const canvas = withRun(configuredCanvas(), run);

    await expect(
      runtime.resumeNode({
        identity,
        workspace,
        canvas,
        nodeId: 'generation-1',
        run,
        persistCanvas: async () => undefined,
      }),
    ).resolves.toMatchObject({
      canvas,
      projection: {
        jobRef: run.jobRef,
        phase: 'running',
      },
    });
    expect(describeGeneration).toHaveBeenCalledWith(run.jobRef);
  });

  it('observes the authoritative snapshot first and drops older updates', async () => {
    const run = boundRun();
    const describeGeneration = vi.fn(async () =>
      snapshot({ submissionId: run.submissionId, phase: 'running', updatedAt: 10 }),
    );
    const observeGeneration = vi.fn(() =>
      observe([
        snapshot({ submissionId: run.submissionId, phase: 'running', updatedAt: 9 }),
        snapshot({
          submissionId: run.submissionId,
          phase: 'succeeded',
          updatedAt: 11,
          resultLocators: [resultLocator()],
        }),
      ]),
    );
    const runtime = createRuntime(createJobs({ describeGeneration, observeGeneration }));

    const projections = await collect(
      runtime.observeNode({ identity, workspace, nodeId: 'generation-1', run }),
    );

    expect(projections.map((projection) => projection.phase)).toEqual(['running', 'succeeded']);
    expect(projections).toEqual([
      expect.objectContaining({ createdAt: 1, updatedAt: 10 }),
      expect.objectContaining({ createdAt: 1, updatedAt: 11 }),
    ]);
    expect(projections[1]?.resultLocators).toEqual([resultLocator()]);
    expect(describeGeneration).toHaveBeenCalledWith(run.jobRef);
    expect(observeGeneration).toHaveBeenCalledWith(run.jobRef);
  });

  it('cancels only the exact persisted Job binding', async () => {
    const run = boundRun();
    const cancelGeneration = vi.fn(async () =>
      snapshot({ submissionId: run.submissionId, phase: 'cancelled', updatedAt: 12 }),
    );
    const runtime = createRuntime(createJobs({ cancelGeneration }));

    await expect(
      runtime.cancelNode({ identity, workspace, nodeId: 'generation-1', run }),
    ).resolves.toMatchObject({
      phase: 'cancelled',
      jobRef: run.jobRef,
    });
    expect(cancelGeneration).toHaveBeenCalledWith({ ref: run.jobRef });
  });

  it('rejects active reruns, mismatched snapshots and use after disposal without fallback', async () => {
    const run = boundRun();
    const describeGeneration = vi.fn(async () =>
      snapshot({ submissionId: run.submissionId, phase: 'running' }),
    );
    const jobs = createJobs({ describeGeneration });
    const runtime = createRuntime(jobs);
    const canvas = withRun(configuredCanvas(), run);

    await expect(
      runtime.startNode({
        identity,
        workspace,
        canvas,
        nodeId: 'generation-1',
        persistCanvas: async () => undefined,
      }),
    ).rejects.toThrow('already has an active Job');

    describeGeneration.mockResolvedValueOnce(
      snapshot({ submissionId: 'another-submission', phase: 'running' }),
    );
    await expect(
      collect(runtime.observeNode({ identity, workspace, nodeId: 'generation-1', run })),
    ).rejects.toMatchObject({ code: 'generation-job-binding-mismatch' });

    await runtime.dispose();
    await expect(
      runtime.startNode({
        identity,
        workspace,
        canvas: configuredCanvas(),
        nodeId: 'generation-1',
        persistCanvas: async () => undefined,
      }),
    ).rejects.toThrow('runtime is disposed');
  });
});

function configuredCanvas(): CanvasData {
  return updateCanvasGenerationNodeRecipe({
    canvas: createCanvasGenerationNode({
      canvas: emptyCanvas(),
      nodeId: 'generation-1',
      kind: 'image',
      position: { x: 32, y: 48 },
    }),
    nodeId: 'generation-1',
    recipe: {
      kind: 'image',
      prompt: 'Create a quiet concept frame',
      model: {
        purpose: 'image.generate',
        providerId: 'provider-1',
        modelId: 'image-model-1',
      },
      width: 1024,
      height: 768,
    },
  });
}

function emptyCanvas(): CanvasData {
  return {
    name: 'Fixture',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
  };
}

function withRun(canvas: CanvasData, run: CanvasGenerationRunBinding): CanvasData {
  const node = requireCanvasGenerationNode(canvas, 'generation-1');
  return {
    ...canvas,
    nodes: canvas.nodes.map((candidate) =>
      candidate.id === node.id ? { ...node, data: { ...node.data, latestRun: run } } : candidate,
    ),
  };
}

function requireRun(canvas: CanvasData): CanvasGenerationRunBinding {
  const run = requireCanvasGenerationNode(canvas, 'generation-1').data.latestRun;
  if (!run) throw new Error('Fixture run is missing.');
  return run;
}

function boundRun(): CanvasGenerationRunBinding & {
  readonly jobRef: { readonly kind: 'generation'; readonly jobId: string };
} {
  return {
    submissionId: 'submission-1',
    recipeInputFingerprint: 'sha256:recipe-input',
    jobRef: { kind: 'generation', jobId: 'job-1' },
  };
}

function createRuntime(jobs: GenerationJobPort): CanvasGenerationNodeRuntime {
  return new CanvasGenerationNodeRuntime({
    createContentReader: (workspaceRoot) => createNodeHostContentReadService({ workspaceRoot }),
    generation: {
      getWorkspaceJobs: vi.fn(async () => jobs),
      validateBinding: vi.fn(),
    },
    createSubmissionId: () => 'submission-1',
  });
}

function createJobs(overrides: Partial<GenerationJobPort> = {}): GenerationJobPort {
  const unavailable = async (): Promise<GenerationJobSnapshot> => {
    throw new Error('Unexpected Generation Job operation.');
  };
  return {
    submitGeneration: unavailable,
    describeGeneration: unavailable,
    observeGeneration: () => observe([]),
    cancelGeneration: unavailable,
    retryGeneration: unavailable,
    regenerateGeneration: unavailable,
    reconcileGeneration: unavailable,
    ...overrides,
  };
}

function snapshot(input: {
  readonly submissionId?: string;
  readonly phase: GenerationJobSnapshot['phase'];
  readonly updatedAt?: number;
  readonly resultLocators?: GenerationJobSnapshot['resultLocators'];
}): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'job-1' },
    ...(input.submissionId === undefined ? {} : { submissionId: input.submissionId }),
    lifecycleMode: 'detached',
    phase: input.phase,
    createdAt: 1,
    updatedAt: input.updatedAt ?? 2,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model-1',
      request: {
        prompt: 'Create a quiet concept frame',
        providerId: 'provider-1',
        modelId: 'image-model-1',
      },
    },
    progress: {
      stage: input.phase === 'succeeded' ? 'completed' : 'waiting-provider',
      percent: input.phase === 'succeeded' ? 100 : 50,
    },
    ...(input.resultLocators === undefined ? {} : { resultLocators: input.resultLocators }),
  };
}

function resultLocator() {
  return {
    file: {
      authority: 'workspace' as const,
      path: 'neko/generated/image/output-1.png',
    },
  };
}

async function* observe(
  snapshots: readonly GenerationJobSnapshot[],
): AsyncIterable<GenerationJobSnapshot> {
  for (const current of snapshots) yield current;
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const value of values) collected.push(value);
  return collected;
}
