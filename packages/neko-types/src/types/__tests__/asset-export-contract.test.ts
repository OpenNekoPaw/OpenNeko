import { describe, expect, it } from 'vitest';
import { isNkEntityArtifact, migrateNkEntityArtifactToV2 } from '../asset-export';
import { nativePuppetEntityFixture } from '../__fixtures__/native-puppet-contract';

describe('asset export contracts', () => {
  it('validates .nkentity artifacts with bound character assets', () => {
    expect(
      isNkEntityArtifact({
        format: 'nkentity',
        version: 1,
        entity: {
          kind: 'character',
          name: 'Sakura',
          aliases: ['桜'],
          status: 'confirmed',
        },
        bindings: [
          {
            role: 'live2d',
            ref: './sakura-model.zip',
            mediaKind: 'puppet-model',
            dimension: 'model',
          },
          {
            role: 'motion',
            ref: './sakura-motions.zip',
            mediaKind: 'puppet-motion',
            dimension: 'motion',
          },
        ],
        exportedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('validates .nkentity v2 native puppet bindings', () => {
    const roundTripped = JSON.parse(JSON.stringify(nativePuppetEntityFixture)) as unknown;

    expect(isNkEntityArtifact(roundTripped)).toBe(true);
    expect(roundTripped).toEqual(nativePuppetEntityFixture);
  });

  it('migrates .nkentity v1 artifacts to v2 without changing bindings', () => {
    const legacy = {
      format: 'nkentity',
      version: 1,
      entity: { kind: 'character', name: 'Sakura' },
      bindings: [
        {
          role: 'live2d',
          ref: './sakura.zip',
          mediaKind: 'puppet-model',
          dimension: 'model',
        },
      ],
      exportedAt: '2026-05-20T00:00:00.000Z',
    } as const;

    expect(migrateNkEntityArtifactToV2(legacy)).toEqual({
      ...legacy,
      version: 2,
    });
  });

  it('rejects invalid media kinds in .nkentity bindings', () => {
    expect(
      isNkEntityArtifact({
        format: 'nkentity',
        version: 1,
        entity: { kind: 'character', name: 'Sakura' },
        bindings: [
          {
            role: 'live2d',
            ref: './sakura.zip',
            mediaKind: 'zip-blunder',
            dimension: 'model',
          },
        ],
        exportedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
