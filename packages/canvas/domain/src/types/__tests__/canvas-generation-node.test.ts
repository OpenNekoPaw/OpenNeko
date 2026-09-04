import { describe, expect, it } from 'vitest';
import { loadNkc, saveNkc } from '../../nkc';
import type { CanvasData, GenerationCanvasNode } from '../canvas';
import {
  applyCanvasGenerationOutputs,
  beginCanvasGenerationRun,
  bindCanvasGenerationJob,
  createCanvasGenerationNodeData,
  isCanvasGenerationNodeData,
  isCanvasGenerationRecipe,
  selectCanvasGenerationOutput,
  updateCanvasGenerationRecipe,
} from '../canvas-generation-node';

describe('Canvas Generation Node contract', () => {
  it('round-trips canonical Recipe, run, output, and selection facts without runtime state', () => {
    const node = generationNode();
    const canvas: CanvasData = {
      name: 'Generation',
      nodes: [node],
      connections: [],
    };

    const loaded = loadNkc(saveNkc(canvas));

    expect(loaded.validation.valid).toBe(true);
    expect(loaded.data).toEqual(canvas);
    expect(JSON.stringify(loaded.data)).not.toMatch(
      /schemaVersion|contractVersion|providerTask|runtimeUrl|runtimePath|credential|phase/,
    );
  });

  it('loads persisted image Recipes whose selected model uses standard or HD quality names', () => {
    for (const quality of ['standard', 'hd'] as const) {
      const loaded = loadNkc(
        JSON.stringify({
          name: 'Persisted image generation',
          nodes: [
            {
              ...generationNode(),
              data: {
                recipe: {
                  kind: 'image',
                  prompt: 'A wide environment frame',
                  model: {
                    purpose: 'image.generate',
                    providerId: 'image-provider',
                    modelId: 'image-model',
                  },
                  width: 1920,
                  height: 1080,
                  aspectRatio: '16:9',
                  quality,
                },
                latestRun: {
                  recipeInputFingerprint: 'recipe-fingerprint',
                  jobRef: { kind: 'generation', jobId: 'generation-job' },
                },
                outputs: [],
              },
            },
          ],
          connections: [],
        }),
      );

      expect(loaded.validation.errors).toEqual([]);
      expect(loaded.data.nodes[0]).toMatchObject({
        type: 'generation',
        data: { recipe: { kind: 'image', quality } },
      });
    }
  });

  it('keeps valid sibling content visible when one Generation Node is invalid', () => {
    const loaded = loadNkc(
      JSON.stringify({
        name: 'Local failure',
        nodes: [
          {
            id: 'markdown-1',
            type: 'markdown',
            position: { x: 0, y: 0 },
            size: { width: 280, height: 180 },
            zIndex: 0,
            data: { content: 'preserved' },
          },
          {
            ...generationNode(),
            data: { recipe: { kind: 'image', prompt: '' }, outputs: [], phase: 'running' },
          },
        ],
        connections: [],
      }),
    );

    expect(loaded.validation.valid).toBe(false);
    expect(loaded.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'nodes[1].data',
          message: expect.stringContaining('canonical Recipe/run/output contract'),
        }),
      ]),
    );
    expect(loaded.data.nodes[0]).toMatchObject({
      type: 'markdown',
      data: { content: 'preserved' },
    });
  });

  it('fences Job and result apply to the exact persisted run while preserving history', () => {
    const recipe = {
      kind: 'image' as const,
      prompt: 'a quiet station',
      model: {
        purpose: 'image.generate' as const,
        providerId: 'provider-1',
        modelId: 'image-model',
      },
      aspectRatio: '16:9',
    };
    const configured = updateCanvasGenerationRecipe(
      createCanvasGenerationNodeData('image'),
      recipe,
    );
    const running = beginCanvasGenerationRun(configured, {
      submissionId: 'submission-1',
      recipeInputFingerprint: 'sha256:recipe-1',
    });
    const jobRef = { kind: 'generation' as const, jobId: 'job-1' };
    const bound = bindCanvasGenerationJob(running, {
      submissionId: 'submission-1',
      recipeInputFingerprint: 'sha256:recipe-1',
      jobRef,
    });
    expect(bound.status).toBe('applied');
    if (bound.status !== 'applied') throw new Error('Expected bound Generation data.');

    expect(
      applyCanvasGenerationOutputs(bound.data, {
        recipeInputFingerprint: 'sha256:stale-recipe',
        jobRef: { kind: 'generation', jobId: 'stale-job' },
        outputs: [output('output-1', jobRef, 'image', 'sha256:recipe-1')],
      }),
    ).toMatchObject({ status: 'rejected', diagnostic: { code: 'stale-result' } });

    const applied = applyCanvasGenerationOutputs(bound.data, {
      recipeInputFingerprint: 'sha256:recipe-1',
      jobRef,
      outputs: [output('output-1', jobRef, 'image', 'sha256:recipe-1')],
    });
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') throw new Error('Expected applied Generation output.');
    expect(applied.data.selectedOutputId).toBe('output-1');
    expect(applied.data.outputs).toHaveLength(1);
  });

  it('keeps generated Prompt content locator-backed without an inline authored body', () => {
    const jobRef = { kind: 'generation' as const, jobId: 'job-text' };
    const initial = {
      recipe: {
        kind: 'prompt' as const,
        prompt: 'write a scene',
        model: {
          purpose: 'canvas.prompt' as const,
          providerId: 'provider-1',
          modelId: 'text-model',
        },
      },
      latestRun: {
        submissionId: 'submission-text',
        recipeInputFingerprint: 'sha256:text-recipe',
        jobRef,
      },
      outputs: [output('text-output', jobRef, 'prompt', 'sha256:text-recipe')],
      selectedOutputId: 'text-output',
    };
    expect(isCanvasGenerationNodeData(initial)).toBe(true);

    expect(
      isCanvasGenerationNodeData({
        ...initial,
        authoredText: { text: 'Edited scene', sourceOutputId: 'text-output' },
      }),
    ).toBe(false);
    expect(selectCanvasGenerationOutput(initial, 'text-output')).toEqual(initial);
  });

  it('does not invent video parameters when the selected model has no verified profile', () => {
    const model = {
      purpose: 'video.generate' as const,
      providerId: 'custom-provider',
      modelId: 'custom-video-model',
    };

    expect(createCanvasGenerationNodeData('video', model)).toEqual({
      recipe: { kind: 'video', prompt: '', model },
      outputs: [],
    });
    expect(
      isCanvasGenerationRecipe({
        kind: 'video',
        prompt: 'A city at night',
        model,
        generateAudio: true,
      }),
    ).toBe(true);
  });
});

function generationNode(): GenerationCanvasNode {
  return {
    id: 'generation-1',
    type: 'generation',
    position: { x: 10, y: 20 },
    size: { width: 320, height: 240 },
    zIndex: 1,
    data: createCanvasGenerationNodeData('image'),
  };
}

function output(
  outputId: string,
  jobRef: { readonly kind: 'generation'; readonly jobId: string },
  kind: 'prompt' | 'image' | 'audio' | 'video',
  recipeInputFingerprint: string,
) {
  return {
    outputId,
    jobRef,
    kind,
    recipeInputFingerprint,
    locator: {
      file: {
        authority: 'workspace' as const,
        path: `neko/generated/${outputId}.png`,
      },
    },
  };
}
