import { describe, expect, it } from 'vitest';
import {
  createNarrativeProductionBindingContentAccessRequest,
  isNarrativeProductionBinding,
  validateNarrativeProductionBinding,
} from '../narrative-production-binding';
import { validateContentAccessRequest } from '../content-access';

describe('narrative production binding contracts', () => {
  it('recognizes storyboard shot bindings and rejects runtime media refs', () => {
    expect(
      isNarrativeProductionBinding({
        bindingId: 'bind-1',
        role: 'source',
        target: {
          kind: 'storyboard-shot',
          sceneId: 'scene-1',
          shotId: 'scene-1-shot-1',
        },
      }),
    ).toBe(true);

    expect(
      validateNarrativeProductionBinding({
        bindingId: 'bind-2',
        role: 'primary',
        target: {
          kind: 'generated-video',
          ref: {
            kind: 'generated-asset',
            assetId: 'asset-1',
            resourceRef: {
              id: 'blob://runtime',
              scope: 'project',
              provider: 'generated',
              kind: 'generated',
              source: { kind: 'generated-asset', generatedAssetId: 'asset-1' },
              fingerprint: { strategy: 'provider', value: 'asset-1' },
            },
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        code: 'non-durable-production-binding',
      }),
    ]);
  });

  it('projects generated media bindings to shared preview and export content access requests', () => {
    const binding = {
      bindingId: 'bind-video-1',
      role: 'primary' as const,
      target: {
        kind: 'generated-video' as const,
        ref: {
          kind: 'generated-asset' as const,
          assetId: 'generated-video-1',
          resourceRef: {
            id: 'generated-video-1',
            scope: 'project' as const,
            provider: 'generated',
            kind: 'generated' as const,
            source: {
              kind: 'generated-asset' as const,
              generatedAssetId: 'generated-video-1',
            },
            fingerprint: { strategy: 'provider' as const, value: 'generated-video-1' },
          },
        },
      },
    };

    const preview = createNarrativeProductionBindingContentAccessRequest(binding, {
      intent: 'interactive-preview',
    });
    expect(preview).toMatchObject({
      intent: 'interactive-preview',
      target: 'webview-uri',
      metadata: {
        bindingId: 'bind-video-1',
        productionTargetKind: 'generated-video',
      },
    });
    expect(preview ? validateContentAccessRequest(preview) : []).toEqual([]);

    const exportRequest = createNarrativeProductionBindingContentAccessRequest(binding, {
      intent: 'final-export',
    });
    expect(exportRequest).toMatchObject({
      intent: 'final-export',
      target: 'local-path',
    });
    expect(exportRequest ? validateContentAccessRequest(exportRequest) : []).toEqual([]);
  });

  it('does not invent media access requests for structural storyboard bindings', () => {
    expect(
      createNarrativeProductionBindingContentAccessRequest(
        {
          bindingId: 'bind-shot-1',
          role: 'source',
          target: {
            kind: 'storyboard-shot',
            sceneId: 'scene-1',
            shotId: 'scene-1-shot-1',
          },
        },
        { intent: 'interactive-preview' },
      ),
    ).toBeUndefined();
  });
});
