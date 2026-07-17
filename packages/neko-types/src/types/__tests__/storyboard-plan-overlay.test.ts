import { describe, expect, it } from 'vitest';
import {
  normalizeStoryboardPlanOverlay,
  validateStoryboardPlanOverlay,
  type StoryboardTable,
} from '..';

const table: StoryboardTable = {
  schemaVersion: 1,
  kind: 'storyboard-table',
  title: 'Episode 1',
  scenes: [
    {
      sceneId: 'scene-1',
      sceneTitle: 'Opening',
      shots: [
        {
          shotId: 'scene-1-shot-1',
          shotNumber: 1,
          duration: 3,
          visualDescription: 'A door opens.',
          characterAction: 'Mika enters.',
          imageStrategy: 'generate-new',
        },
      ],
    },
  ],
};

describe('storyboard plan overlay contract', () => {
  it('normalizes AnimationPlan overlay payloads into shot overlays', () => {
    const result = normalizeStoryboardPlanOverlay(
      {
        kind: 'domain',
        domainKind: 'AnimationPlan',
        payload: {
          kind: 'animation-plan-overlay',
          sourceStoryboardRef: { kind: 'artifact', artifactId: 'artifact-storyboard-1' },
          shotOverlays: [
            {
              sceneId: 'scene-1',
              shotId: 'scene-1-shot-1',
              motionIntent: 'subtle cloth movement',
              cameraIntent: 'slow push-in',
              videoPromptIntent: { positive: 'video-ready prompt' },
              requiresImagePrep: true,
              requiresVideoGeneration: true,
            },
          ],
        },
      },
      { sourceStoryboard: table },
    );

    expect(result.overlay).toMatchObject({
      kind: 'animation-plan-overlay',
      overlayType: 'AnimationPlan',
      sourceStoryboardRef: { kind: 'artifact', artifactId: 'artifact-storyboard-1' },
      shotOverlays: [
        {
          shotId: 'scene-1-shot-1',
          motionIntent: 'subtle cloth movement',
          cameraIntent: 'slow push-in',
          videoPromptIntent: { positive: 'video-ready prompt' },
          requiresImagePrep: true,
          requiresVideoGeneration: true,
        },
      ],
    });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('diagnoses orphan shot overlays by stable shotId', () => {
    const result = validateStoryboardPlanOverlay(
      {
        kind: 'animation-plan-overlay',
        overlayType: 'AnimationPlan',
        sourceStoryboardRef: { kind: 'artifact', artifactId: 'artifact-storyboard-1' },
        shotOverlays: [{ shotId: 'missing-shot', motionIntent: 'pan left' }],
      },
      { sourceStoryboard: table },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'orphan-shot-overlay',
    );
  });

  it('rejects runtime URLs while preserving provider-neutral prompt intent', () => {
    const result = normalizeStoryboardPlanOverlay(
      {
        kind: 'animation-plan-overlay',
        overlayType: 'AnimationPlan',
        sourceStoryboardRef: { kind: 'artifact', artifactId: 'artifact-storyboard-1' },
        shotOverlays: [
          {
            shotId: 'scene-1-shot-1',
            videoPromptIntent: {
              positive: 'same intent can target another provider',
              providerPromptCache: {
                providerA: 'provider specific cache',
              },
            },
            generatedVideoRefs: [
              {
                kind: 'generated-asset',
                assetId: 'blob:https://example.invalid/runtime',
              },
            ],
          },
        ],
      },
      { sourceStoryboard: table },
    );

    expect(result.overlay).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'non-durable-media-ref',
    );
  });
});
