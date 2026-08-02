import { describe, expect, it } from 'vitest';
import {
  buildEntityAssetRequirementsFromGeneratedMediaLineage,
  buildVisualIdentityDraftsFromGeneratedMediaLineage,
} from './creativeEntityLineage';
import type { GeneratedMediaLineageAsset } from './creativeEntityLineage';

function generatedImage(
  overrides: Partial<GeneratedMediaLineageAsset>,
): GeneratedMediaLineageAsset {
  return {
    id: 'gen-1',
    type: 'generated-image',
    ...overrides,
  };
}

describe('creative entity generated media lineage helpers', () => {
  it('groups generated images into visual identity drafts by character and source node', () => {
    const drafts = buildVisualIdentityDraftsFromGeneratedMediaLineage({
      source: 'agent',
      assets: [
        generatedImage({
          id: 'gen-1',
          prompt: 'blue coat',
          characterIds: ['char_linxia', 'char_linxia'],
          sourceNodeId: 'shot-1',
        }),
        generatedImage({
          id: 'gen-2',
          prompt: 'blue coat variation',
          characterIds: ['char_linxia'],
          sourceNodeId: 'shot-1',
        }),
        {
          id: 'audio-1',
          type: 'generated-audio',
          characterIds: ['char_linxia'],
          sourceNodeId: 'shot-1',
        },
      ],
    });

    expect(drafts).toEqual([
      {
        id: 'visual-draft:agent:char_linxia:canvas:-node-shot-1',
        characterId: 'char_linxia',
        source: 'agent',
        prompt: 'blue coat',
        generatedAssetIds: ['gen-1', 'gen-2'],
        status: 'drafting',
      },
    ]);
  });

  it('creates generated-state requirements from lineage without creating asset files', () => {
    const requirements = buildEntityAssetRequirementsFromGeneratedMediaLineage({
      source: 'canvas',
      requiredKinds: ['portrait', 'reference'],
      assets: [
        generatedImage({
          id: 'gen-1',
          characterIds: ['char_alice', 'char_bob'],
          sourceNodeId: 'gallery-1',
        }),
        generatedImage({
          id: 'gen-2',
          characterIds: ['char_alice'],
        }),
      ],
    });

    expect(requirements).toEqual([
      expect.objectContaining({
        id: 'asset-requirement:canvas:char_alice:canvas:-node-gallery-1',
        entityId: 'char_alice',
        entityKind: 'character',
        source: 'canvas',
        sourceRef: 'canvas://node/gallery-1',
        requiredKinds: ['portrait', 'reference'],
        status: 'generated',
      }),
      expect.objectContaining({
        id: 'asset-requirement:canvas:char_alice:generated:-asset-gen-2',
        entityId: 'char_alice',
        sourceRef: 'generated://asset/gen-2',
      }),
      expect.objectContaining({
        id: 'asset-requirement:canvas:char_bob:canvas:-node-gallery-1',
        entityId: 'char_bob',
        sourceRef: 'canvas://node/gallery-1',
      }),
    ]);
  });

  it('ignores generated assets without character lineage', () => {
    expect(
      buildVisualIdentityDraftsFromGeneratedMediaLineage({
        source: 'agent',
        assets: [generatedImage({ characterIds: [] })],
      }),
    ).toEqual([]);
    expect(
      buildEntityAssetRequirementsFromGeneratedMediaLineage({
        source: 'agent',
        requiredKinds: ['portrait'],
        assets: [generatedImage({})],
      }),
    ).toEqual([]);
  });
});
