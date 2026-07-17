import { describe, expect, it } from 'vitest';
import type { AssetManifest, InstalledPackage } from '@neko/shared';
import {
  isMarketProjectedEntity,
  marketAssetProjectionToEntityInput,
  projectMarketAssetInstalls,
} from '../../service/MarketAssetProjection';

describe('MarketAssetProjection', () => {
  it('projects only usable media and identity installs for AssetLibrary', () => {
    const projections = projectMarketAssetInstalls([
      installed(createManifest('@market/video', 'media', 'video')),
      installed(createIdentityManifest('@market/hero')),
      installed(createManifest('@market/expired', 'media', 'image'), { status: 'expired' }),
      installed(createManifest('@market/disabled', 'media', 'image'), { enabled: false }),
      installed(createManifest('@market/skill', 'skill')),
    ]);

    expect(projections.map((item) => item.packageId)).toEqual(['@market/video', '@market/hero']);
    expect(projections[0]).toMatchObject({
      category: 'effect',
      detailCommand: 'neko.market.open',
      detailArgs: { packageId: '@market/video' },
    });
    expect(projections[1]).toMatchObject({ category: 'character' });
  });

  it('marks projected entities as read-only market sourced assets', () => {
    const [projection] = projectMarketAssetInstalls([
      installed(createManifest('@market/audio', 'media', 'audio')),
    ]);

    const input = marketAssetProjectionToEntityInput(projection!);

    expect(input).toMatchObject({
      category: 'audio',
      tags: ['market', 'media'],
      ownership: { scope: 'purchased', access: 'readonly' },
      metadata: {
        source: {
          provider: 'neko-market',
          sourceUrl: 'market://@market/audio',
        },
      },
    });
    expect(
      isMarketProjectedEntity(
        {
          id: 'entity-1',
          name: input.name,
          category: input.category,
          metadata: input.metadata!,
          variants: [],
          tags: [],
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
        },
        '@market/audio',
      ),
    ).toBe(true);
  });
});

function installed(
  manifest: AssetManifest,
  overrides: Partial<InstalledPackage> = {},
): InstalledPackage {
  return {
    packageId: manifest.id,
    version: manifest.version,
    type: manifest.type,
    installedAt: 1,
    installedPath: `/market/${manifest.id.replace(/[^\w-]/g, '_')}`,
    manifest,
    enabled: true,
    status: 'active',
    ...overrides,
  };
}

function createManifest(
  id: string,
  type: AssetManifest['type'],
  mediaKind?: 'audio' | 'image' | 'video' | 'sequence' | 'document',
): AssetManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    type,
    source: { kind: 'local', path: `/tmp/${id}` },
    distributionKind: 'archive',
    typeMetadata:
      type === 'media' && mediaKind
        ? { type: 'media', data: { mediaKind, fileSize: 1 } }
        : undefined,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createIdentityManifest(id: string): AssetManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    type: 'identity',
    source: { kind: 'local', path: `/tmp/${id}` },
    distributionKind: 'registration',
    typeMetadata: {
      type: 'identity',
      data: { identityKind: 'character', identityId: 'hero', forms: [] },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
