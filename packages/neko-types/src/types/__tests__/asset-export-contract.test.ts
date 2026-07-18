import { describe, expect, it } from 'vitest';
import { isNkEntityArtifact } from '../asset-export';

describe('asset export contracts', () => {
  it('validates retained v1 entity artifacts with Live2D bindings', () => {
    expect(
      isNkEntityArtifact({
        format: 'nkentity',
        version: 1,
        entity: { kind: 'character', name: 'Sakura', status: 'confirmed' },
        bindings: [
          {
            role: 'live2d',
            ref: './sakura-model.zip',
            mediaKind: 'live2d-model',
            dimension: 'model',
          },
        ],
        exportedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects removed artifact versions and invalid media kinds', () => {
    const base = {
      format: 'nkentity',
      entity: { kind: 'character', name: 'Sakura' },
      bindings: [],
      exportedAt: '2026-05-20T00:00:00.000Z',
    };

    expect(isNkEntityArtifact({ ...base, version: 2 })).toBe(false);
    expect(
      isNkEntityArtifact({
        ...base,
        version: 1,
        bindings: [
          { role: 'live2d', ref: './sakura.zip', mediaKind: 'invalid', dimension: 'model' },
        ],
      }),
    ).toBe(false);
  });
});
