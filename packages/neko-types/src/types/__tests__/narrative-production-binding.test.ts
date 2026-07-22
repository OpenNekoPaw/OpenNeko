import { describe, expect, it } from 'vitest';
import {
  isNarrativeProductionBinding,
  validateNarrativeProductionBinding,
} from '../narrative-production-binding';

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
});
