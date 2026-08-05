import { describe, expect, it } from 'vitest';
import { type GeneratedOutputContentLocator } from '@neko/content';
import { createEmptyCanvasData, type CanvasData } from '@neko/canvas-domain';
import { projectResolvedCanvasMaterialToCanvas } from '../canvas-content-authoring';
import {
  projectGenerationSnapshotToCanvas,
  type CanvasGenerationProjectionSnapshot,
} from '../canvas-generation-projection';

const IDENTITY = {
  projectId: 'project-1',
  canvasId: 'canvas-1',
  canvasSessionId: 'session-1',
} as const;

describe('Canvas Generation Job projection', () => {
  it('projects owner state into one read-only Job node', () => {
    const pending = project(
      emptyWithSource(),
      snapshot({ phase: 'pending', position: { x: 240, y: 180 } }),
    );
    const running = project(pending, snapshot({ phase: 'running' }));

    expect(running.nodes.filter((node) => node.type === 'job')).toEqual([
      expect.objectContaining({
        id: 'generation-job:generation-1',
        position: { x: 240, y: 180 },
        data: expect.objectContaining({
          jobRef: { kind: 'generation', jobId: 'generation-1' },
          status: 'running',
          inputRefs: [{ kind: 'canvas-node', nodeId: 'source-node' }],
          outputRefs: [],
        }),
      }),
    ]);
    expect(running.connections).toEqual([
      expect.objectContaining({
        sourceId: 'source-node',
        targetId: 'generation-job:generation-1',
        type: 'derived-from',
      }),
    ]);
  });

  it('commits exact generated locators, immutable evidence and Job lineage once', () => {
    const succeeded = project(
      emptyWithSource(),
      snapshot({
        phase: 'succeeded',
        resultLocators: [resultLocator('output-1'), resultLocator('output-2')],
      }),
    );
    const replayed = project(
      succeeded,
      snapshot({
        phase: 'succeeded',
        resultLocators: [resultLocator('output-1'), resultLocator('output-2')],
      }),
    );

    const generated = replayed.nodes.filter(
      (node) => node.type === 'media' && node.data.contentLocator?.kind === 'generated-output',
    );
    expect(generated).toHaveLength(2);
    expect(generated[0]?.data).toMatchObject({
      contentLocator: resultLocator('output-1'),
      generation: {
        jobRef: { kind: 'generation', jobId: 'generation-1' },
        summary: { prompt: 'Create a concept frame', model: 'fixture-model' },
      },
    });
    const job = replayed.nodes.find((node) => node.type === 'job');
    expect(job?.data).toMatchObject({
      status: 'completed',
      outputRefs: generated.map((node) => ({ kind: 'canvas-node', nodeId: node.id })),
    });
    expect(replayed.connections).toHaveLength(3);
    expect(
      generated.every((node) =>
        replayed.connections.some(
          (connection) =>
            connection.sourceId === job?.id &&
            connection.targetId === node.id &&
            connection.type === 'derived-from',
        ),
      ),
    ).toBe(true);
  });

  it.each([
    {
      phase: 'failed' as const,
      failure: {
        code: 'provider-failed',
        message: 'Provider rejected the request',
        retryable: true,
      },
    },
    {
      phase: 'cancelled' as const,
      failure: { code: 'cancelled', message: 'Cancelled by creator' },
    },
  ])('keeps $phase Jobs visible without source-less results', ({ phase, failure }) => {
    const canvas = project(emptyWithSource(), snapshot({ phase, failure }));

    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.nodes.find((node) => node.type === 'job')?.data).toMatchObject({
      status: phase,
      diagnostic: `${failure.code}: ${failure.message}`,
      outputRefs: [],
    });
  });

  it('projects retry as a distinct Job with explicit lineage', () => {
    const failed = project(
      emptyWithSource(),
      snapshot({
        phase: 'failed',
        failure: { code: 'provider-failed', message: 'Failed', retryable: true },
      }),
    );
    const retried = project(
      failed,
      snapshot({
        ref: { kind: 'generation', jobId: 'generation-2' },
        retryOf: { kind: 'generation', jobId: 'generation-1' },
        phase: 'pending',
      }),
    );

    expect(retried.nodes.filter((node) => node.type === 'job')).toHaveLength(2);
    expect(retried.connections).toContainEqual(
      expect.objectContaining({
        sourceId: 'generation-job:generation-1',
        targetId: 'generation-job:generation-2',
        type: 'derived-from',
      }),
    );
  });

  it('projects regeneration as a distinct Job with explicit lineage', () => {
    const succeeded = project(
      emptyWithSource(),
      snapshot({
        phase: 'succeeded',
        resultLocators: [resultLocator('output-1')],
      }),
    );
    const regenerated = project(
      succeeded,
      snapshot({
        ref: { kind: 'generation', jobId: 'generation-2' },
        regenerateOf: { kind: 'generation', jobId: 'generation-1' },
        phase: 'pending',
      }),
    );

    expect(regenerated.connections).toContainEqual(
      expect.objectContaining({
        sourceId: 'generation-job:generation-1',
        targetId: 'generation-job:generation-2',
        type: 'derived-from',
      }),
    );
  });

  it('rejects regressive, mismatched and source-less successful projections', () => {
    const completed = project(
      emptyWithSource(),
      snapshot({ phase: 'succeeded', resultLocators: [resultLocator('output-1')] }),
    );
    expect(() => project(completed, snapshot({ phase: 'running' }))).toThrow(
      'cannot move from completed to running',
    );
    expect(() =>
      projectGenerationSnapshotToCanvas({
        identity: { ...IDENTITY, canvasSessionId: 'wrong-session' },
        expectedIdentity: IDENTITY,
        canvas: completed,
        snapshot: snapshot({ phase: 'succeeded', resultLocators: [resultLocator('output-1')] }),
      }),
    ).toThrow('canvasSessionId does not match');
    expect(() =>
      project(emptyWithSource(), snapshot({ phase: 'succeeded', resultLocators: [] })),
    ).toThrow('requires at least one committed result locator');
  });
});

function project(canvas: CanvasData, value: CanvasGenerationProjectionSnapshot): CanvasData {
  return projectGenerationSnapshotToCanvas({
    identity: IDENTITY,
    expectedIdentity: IDENTITY,
    canvas,
    snapshot: value,
  });
}

function snapshot(
  overrides: Partial<CanvasGenerationProjectionSnapshot>,
): CanvasGenerationProjectionSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'generation-1' },
    phase: 'pending',
    title: 'Generate concept frame',
    inputNodeIds: ['source-node'],
    mediaKind: 'image',
    summary: { prompt: 'Create a concept frame', model: 'fixture-model' },
    ...overrides,
  };
}

function resultLocator(outputId: string): GeneratedOutputContentLocator {
  return {
    kind: 'generated-output',
    outputId,
    revision: '1',
    digest: `sha256:${outputId}`,
    path: `neko/generated/${outputId}.png`,
  };
}

function emptyWithSource(): CanvasData {
  const canvas = projectResolvedCanvasMaterialToCanvas({
    canvas: createEmptyCanvasData('Generation projection fixture'),
    material: {
      locator: { kind: 'workspace-file', path: 'media/source.png' },
      title: 'source.png',
      mediaKind: 'image',
    },
    generateId: () => 'source-node',
  });
  return canvas;
}
