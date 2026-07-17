import { describe, expect, it } from 'vitest';
import type { AssetEntity, EntityAssetBinding } from '@neko/shared';
import {
  buildAssetBindingCandidate,
  buildCancelEntityBindingPlan,
  buildDeleteAssetPlan,
  buildRepresentationPackageDetail,
} from '../../service';

describe('EntityAssetCompositionService', () => {
  it('projects character image assets as portrait/reference binding candidates', () => {
    const entity = createAssetEntity({
      id: 'asset_linxia_portrait',
      name: 'Linxia portrait',
      tags: ['portrait'],
      files: [{ id: 'file-main', name: 'portrait.png', path: 'assets/portrait.png' }],
    });

    expect(buildAssetBindingCandidate(entity)).toEqual({
      assetEntityId: 'asset_linxia_portrait',
      assetRef: 'project://assets/asset_linxia_portrait',
      suggestedRoles: ['portrait'],
      confidence: 0.7,
      reason: 'Matches portrait representation signals',
    });
  });

  it('describes Live2D representation packages with component roles and missing files', () => {
    const entity = createAssetEntity({
      id: 'asset_linxia_live2d',
      name: 'Linxia Live2D',
      tags: ['live2d'],
      files: [
        { id: 'model', name: 'linxia.moc3', path: 'avatars/linxia/linxia.moc3' },
        {
          id: 'expression',
          name: 'happy.exp3.json',
          path: 'avatars/linxia/happy.exp3.json',
          purpose: 'source',
        },
      ],
    });

    expect(buildRepresentationPackageDetail(entity)).toMatchObject({
      assetEntityId: 'asset_linxia_live2d',
      assetRef: 'project://assets/asset_linxia_live2d',
      representationKinds: ['live2d'],
      capabilities: ['expression', 'live2d-runtime'],
      files: [
        expect.objectContaining({ fileId: 'model', role: 'model' }),
        expect.objectContaining({ fileId: 'expression', role: 'expression' }),
      ],
      missingRoles: ['texture'],
    });
  });

  it('keeps cancel-binding separate from delete-asset plans', () => {
    const binding: EntityAssetBinding = {
      id: 'binding-1',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/asset_linxia_portrait',
      role: 'portrait',
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      updatedAt: '2026-05-10T00:00:00.000Z',
    };
    const entity = createAssetEntity({
      id: 'asset_linxia_portrait',
      name: 'Linxia portrait',
      tags: ['portrait'],
      files: [{ id: 'file-main', name: 'portrait.png', path: 'assets/portrait.png' }],
    });

    expect(buildCancelEntityBindingPlan(binding)).toEqual({
      kind: 'cancel-binding',
      bindingId: 'binding-1',
      assetRef: 'project://assets/asset_linxia_portrait',
      assetEntityId: 'asset_linxia_portrait',
      deletesAsset: false,
    });
    expect(buildDeleteAssetPlan(entity, [binding])).toEqual({
      kind: 'delete-asset',
      assetEntityId: 'asset_linxia_portrait',
      bindingIds: ['binding-1'],
      deletesAsset: true,
    });
  });
});

function createAssetEntity(input: {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly files: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly purpose?: 'main' | 'thumbnail' | 'preview' | 'texture' | 'reference' | 'source';
  }>;
}): AssetEntity {
  return {
    id: input.id,
    name: input.name,
    category: 'character',
    metadata: {},
    variants: [
      {
        id: 'variant-default',
        entityId: input.id,
        name: 'Default',
        attributes: {},
        files: input.files.map((file) => ({
          id: file.id,
          variantId: 'variant-default',
          name: file.name,
          path: file.path,
          mediaType: inferMediaType(file.path),
          metadata: { fileSize: 1, mimeType: 'application/octet-stream' },
          purpose: file.purpose ?? 'main',
          createdAt: 1,
        })),
        createdAt: 1,
      },
    ],
    tags: [...input.tags],
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

function inferMediaType(path: string): 'audio' | 'image' | 'video' | 'document' {
  if (path.endsWith('.mp3') || path.endsWith('.wav')) return 'audio';
  if (path.endsWith('.mp4')) return 'video';
  if (path.endsWith('.png') || path.endsWith('.jpg')) return 'image';
  return 'document';
}
