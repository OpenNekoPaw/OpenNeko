import { describe, expect, it } from 'vitest';
import { contentLocatorKey, type WorkspaceFileContentLocator } from '@neko/content-domain';
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
  it('projects owner state into one canonical Generation node', () => {
    const pending = project(
      emptyWithSource(),
      snapshot({ phase: 'pending', position: { x: 240, y: 180 } }),
    );
    const running = project(pending, snapshot({ phase: 'running' }));

    expect(running.nodes.filter((node) => node.type === 'generation')).toEqual([
      expect.objectContaining({
        id: 'generation:generation-1',
        position: { x: 240, y: 180 },
        data: expect.objectContaining({
          recipe: expect.objectContaining({ kind: 'image', prompt: 'Create a concept frame' }),
          latestRun: expect.objectContaining({
            jobRef: { kind: 'generation', jobId: 'generation-1' },
          }),
          outputs: [],
        }),
      }),
    ]);
    expect(running.connections).toEqual([
      expect.objectContaining({
        sourceId: 'source-node',
        targetId: 'generation:generation-1',
        type: 'derived-from',
      }),
    ]);
  });

  it('uses the Generation JobRef as the durable run identity when Agent submission metadata is absent', () => {
    const { submissionId: _submissionId, ...agentSnapshot } = snapshot({ phase: 'running' });
    const canvas = project(emptyWithSource(), agentSnapshot);
    const generation = canvas.nodes.find((node) => node.type === 'generation');

    expect(generation?.data.latestRun).toEqual({
      jobRef: { kind: 'generation', jobId: 'generation-1' },
      recipeInputFingerprint: 'recipe-input-1',
    });
  });

  it('binds exact Workspace output locators inside the Generation node without sibling refs', () => {
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

    expect(replayed.nodes).toHaveLength(2);
    const generation = replayed.nodes.find((node) => node.type === 'generation');
    expect(generation?.data.outputs).toEqual([
      expect.objectContaining({ locator: resultLocator('output-1'), kind: 'image' }),
      expect.objectContaining({ locator: resultLocator('output-2'), kind: 'image' }),
    ]);
    expect(generation?.data.selectedOutputId).toBe(contentLocatorKey(resultLocator('output-2')));
    expect(replayed.connections).toHaveLength(1);
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
  ])('keeps $phase Generation nodes visible without source-less results', ({ phase, failure }) => {
    const canvas = project(emptyWithSource(), snapshot({ phase, failure }));

    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.nodes.find((node) => node.type === 'generation')?.data).toMatchObject({
      outputs: [],
      latestRun: { jobRef: { kind: 'generation', jobId: 'generation-1' } },
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

    expect(retried.nodes.filter((node) => node.type === 'generation')).toHaveLength(2);
    expect(retried.connections).toContainEqual(
      expect.objectContaining({
        sourceId: 'generation:generation-1',
        targetId: 'generation:generation-2',
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
        sourceId: 'generation:generation-1',
        targetId: 'generation:generation-2',
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
      'must not project result artifacts',
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
    recipe: {
      kind: 'image',
      prompt: 'Create a concept frame',
      model: { purpose: 'image.generate', providerId: 'fixture', modelId: 'fixture-model' },
    },
    submissionId: 'submission-1',
    recipeInputFingerprint: 'recipe-input-1',
    ...overrides,
  };
}

function resultLocator(outputId: string): WorkspaceFileContentLocator {
  return { file: { authority: 'workspace', path: `neko/generated/${outputId}.png` } };
}

function emptyWithSource(): CanvasData {
  const canvas = projectResolvedCanvasMaterialToCanvas({
    canvas: createEmptyCanvasData('Generation projection fixture'),
    material: {
      locator: { file: { authority: 'workspace', path: 'media/source.png' } },
      title: 'source.png',
      mediaKind: 'image',
    },
    generateId: () => 'source-node',
  });
  return canvas;
}
