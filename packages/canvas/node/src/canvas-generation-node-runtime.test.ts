import type { GenerationJobPort, GenerationJobRef, GenerationJobSnapshot } from '@neko/generation';
import type { CanvasGenerationWorkspace, CanvasMaterialActionTarget } from '@neko/canvas-domain';
import { JobLifecycleError } from '@neko/shared/job-lifecycle';
import { WorkspaceGenerationApplicationRuntime } from '@neko/generation/job';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGenerationNodeRuntime } from './canvas-generation-node-runtime';

const workspace: CanvasGenerationWorkspace = {
  workspaceId: 'workspace-1',
  workspacePath: '/fixture/workspace',
};

const resultLocator = {
  kind: 'generated-output' as const,
  outputId: 'generated-output-1',
  digest: 'sha256:generated-output-1',
  path: 'neko/generated/image/generated-output-1.png',
};

const target: CanvasMaterialActionTarget = {
  nodeId: 'generated-media-1',
  mediaKind: 'image',
  origin: 'generated',
  locator: resultLocator,
  generation: {
    jobRef: { kind: 'generation', jobId: 'generation-job-1' },
    summary: {
      prompt: 'Historical Canvas summary',
      model: 'historical-model',
    },
  },
};

describe('CanvasGenerationNodeRuntime', () => {
  it('exposes regeneration only for an authoritative succeeded Job that owns the exact output', async () => {
    const { owner, describeGeneration } = createOwner({
      current: generationSnapshot({
        phase: 'succeeded',
        resultLocators: [resultLocator],
      }),
    });
    const runtime = createRuntime(owner);

    await expect(runtime.resolveResultActions({ workspace, target })).resolves.toEqual({
      regenerate: true,
      editAndGenerate: false,
    });
    expect(describeGeneration).toHaveBeenCalledWith(target.generation?.jobRef);

    await runtime.dispose();
  });

  it('does not expose generated actions for missing Jobs, referenced nodes, or locator mismatches', async () => {
    const missingOwner = createOwner({
      describeError: new JobLifecycleError('job-not-found', 'missing fixture Job'),
    });
    const missingRuntime = createRuntime(missingOwner.owner);
    await expect(missingRuntime.resolveResultActions({ workspace, target })).resolves.toEqual({
      regenerate: false,
      editAndGenerate: false,
    });
    await missingRuntime.dispose();

    const mismatchedOwner = createOwner({
      current: generationSnapshot({
        phase: 'succeeded',
        resultLocators: [{ ...resultLocator, outputId: 'another-output' }],
      }),
    });
    const mismatchedRuntime = createRuntime(mismatchedOwner.owner);
    await expect(mismatchedRuntime.resolveResultActions({ workspace, target })).resolves.toEqual({
      regenerate: false,
      editAndGenerate: false,
    });
    await expect(
      mismatchedRuntime.resolveResultActions({
        workspace,
        target: {
          nodeId: 'referenced-media-1',
          mediaKind: 'image',
          origin: 'referenced',
          locator: { kind: 'workspace-file', path: 'media/reference.png' },
        },
      }),
    ).resolves.toEqual({
      regenerate: false,
      editAndGenerate: false,
    });
    await mismatchedRuntime.dispose();
  });

  it('regenerates from the authoritative Job and projects new immutable Job lineage', async () => {
    const current = generationSnapshot({
      phase: 'succeeded',
      resultLocators: [resultLocator],
    });
    const started = generationSnapshot({
      jobId: 'generation-job-2',
      phase: 'running',
      regenerateOf: current.ref,
      prompt: 'Authoritative regenerated prompt',
      modelId: 'image-model-regenerated',
      width: 1536,
      height: 1024,
    });
    const completed = generationSnapshot({
      jobId: 'generation-job-2',
      phase: 'succeeded',
      regenerateOf: current.ref,
      prompt: 'Authoritative regenerated prompt',
      modelId: 'image-model-regenerated',
      width: 1536,
      height: 1024,
      resultLocators: [
        {
          ...resultLocator,
          outputId: 'generated-output-2',
          digest: 'sha256:generated-output-2',
          path: 'neko/generated/image/generated-output-2.png',
        },
      ],
    });
    const { owner, regenerateGeneration, observeGeneration } = createOwner({
      current,
      regenerated: started,
      observed: [completed],
    });
    const runtime = createRuntime(owner);

    await expect(runtime.regenerateResult({ workspace, target })).resolves.toEqual({
      ref: completed.ref,
      regenerateOf: current.ref,
      phase: 'succeeded',
      title: 'Regenerate image',
      inputNodeIds: [],
      mediaKind: 'image',
      summary: {
        prompt: 'Authoritative regenerated prompt',
        model: 'image-model-regenerated',
        width: 1536,
        height: 1024,
      },
      resultLocators: completed.resultLocators,
    });
    expect(regenerateGeneration).toHaveBeenCalledWith({ ref: current.ref });
    expect(observeGeneration).toHaveBeenCalledWith(started.ref);

    await runtime.dispose();
  });

  it('delegates exact Workspace ownership without disposing the shared Generation runtime', async () => {
    const fixture = createOwner({
      current: generationSnapshot({
        phase: 'succeeded',
        resultLocators: [resultLocator],
      }),
    });
    const createWorkspaceOwner = vi.fn(async () => ({
      jobs: fixture.owner.jobs as GenerationJobPort,
      dispose: fixture.owner.dispose,
    }));
    const generation = new WorkspaceGenerationApplicationRuntime({
      createOwner: createWorkspaceOwner,
    });
    const runtime = new CanvasGenerationNodeRuntime({
      generation,
    });

    await runtime.resolveResultActions({ workspace, target });
    await runtime.resolveResultActions({ workspace, target });
    expect(createWorkspaceOwner).toHaveBeenCalledTimes(1);
    await expect(
      runtime.resolveResultActions({
        workspace: { ...workspace, workspacePath: '/fixture/rebound-workspace' },
        target,
      }),
    ).rejects.toThrow('already bound to another authorized root');

    await runtime.dispose();
    await runtime.dispose();
    expect(fixture.dispose).not.toHaveBeenCalled();
    await expect(runtime.resolveResultActions({ workspace, target })).rejects.toThrow(
      'runtime is disposed',
    );
    await generation.dispose();
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
  });
});

function createRuntime(
  owner: ReturnType<typeof createOwner>['owner'],
): CanvasGenerationNodeRuntime {
  return new CanvasGenerationNodeRuntime({
    generation: {
      getWorkspaceJobs: vi.fn(async () => owner.jobs as GenerationJobPort),
    },
  });
}

function createOwner(options: {
  readonly current?: GenerationJobSnapshot;
  readonly describeError?: Error;
  readonly regenerated?: GenerationJobSnapshot;
  readonly observed?: readonly GenerationJobSnapshot[];
}) {
  const describeGeneration = vi.fn(
    async (_ref: GenerationJobRef): Promise<GenerationJobSnapshot> => {
      if (options.describeError) throw options.describeError;
      if (!options.current) throw new Error('Fixture current Job is missing.');
      return options.current;
    },
  );
  const regenerateGeneration = vi.fn(async (): Promise<GenerationJobSnapshot> => {
    if (!options.regenerated) throw new Error('Fixture regenerated Job is missing.');
    return options.regenerated;
  });
  const observeGeneration = vi.fn((_ref: GenerationJobRef): AsyncIterable<GenerationJobSnapshot> =>
    observe(options.observed ?? []),
  );
  const jobs: Pick<
    GenerationJobPort,
    'describeGeneration' | 'observeGeneration' | 'regenerateGeneration'
  > = {
    describeGeneration,
    regenerateGeneration,
    observeGeneration,
  };
  const dispose = vi.fn(async () => undefined);
  return {
    owner: { jobs, dispose },
    describeGeneration,
    regenerateGeneration,
    observeGeneration,
    dispose,
  };
}

async function* observe(
  snapshots: readonly GenerationJobSnapshot[],
): AsyncIterable<GenerationJobSnapshot> {
  for (const snapshot of snapshots) yield snapshot;
}

function generationSnapshot(options: {
  readonly jobId?: string;
  readonly phase: GenerationJobSnapshot['phase'];
  readonly regenerateOf?: GenerationJobRef;
  readonly prompt?: string;
  readonly modelId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resultLocators?: GenerationJobSnapshot['resultLocators'];
}): GenerationJobSnapshot {
  const ref = {
    kind: 'generation' as const,
    jobId: options.jobId ?? 'generation-job-1',
  };
  return {
    ref,
    ...(options.regenerateOf ? { regenerateOf: options.regenerateOf } : {}),
    lifecycleMode: 'linked',
    phase: options.phase,
    createdAt: 100,
    updatedAt: options.phase === 'succeeded' ? 102 : 101,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: options.modelId ?? 'image-model-default',
      request: {
        prompt: options.prompt ?? 'Authoritative original prompt',
        providerId: 'provider-1',
        modelId: options.modelId ?? 'image-model-default',
        ...(options.width !== undefined ? { width: options.width } : {}),
        ...(options.height !== undefined ? { height: options.height } : {}),
      },
    },
    progress: {
      stage: options.phase === 'succeeded' ? 'completed' : 'waiting-provider',
      percent: options.phase === 'succeeded' ? 100 : 50,
    },
    ...(options.resultLocators ? { resultLocators: options.resultLocators } : {}),
  };
}
