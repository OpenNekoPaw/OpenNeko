import { describe, expect, it } from 'vitest';
import {
  createAssetCenterSessionId,
  createDefaultAssetCenterFilter,
  parseAssetCenterPresentationSnapshot,
  parseAssetCenterSessionProjection,
} from './contract';

describe('Asset Center session contract', () => {
  it('opens the stable Asset membership catalog in list mode', () => {
    expect(createDefaultAssetCenterFilter()).toEqual({
      catalog: 'global-asset-library',
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      viewMode: 'list',
    });
  });

  it('parses an exact empty session projection', () => {
    expect(
      parseAssetCenterSessionProjection({
        identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
        filter: createDefaultAssetCenterFilter(),
        catalog: { status: 'loading' },
        preview: { status: 'empty' },
      }),
    ).toMatchObject({ catalog: { status: 'loading' } });
    expect(createAssetCenterSessionId('window-1')).toBe('asset-center:window-1');
  });

  it('rejects unknown fields, owner mismatches and physical paths', () => {
    const projection = readyProjection();
    expect(() =>
      parseAssetCenterSessionProjection({ ...projection, activeProjectId: 'project-1' }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAssetCenterSessionProjection({
        ...projection,
        catalog: { ...projection.catalog, owner: 'global-asset-library' },
      }),
    ).toThrow('owner');
    expect(() =>
      parseAssetCenterSessionProjection({
        ...projection,
        catalog: {
          ...projection.catalog,
          entries: [
            {
              ...projection.catalog.entries[0],
              absolutePath: '/private/library/shot.png',
            },
          ],
        },
      }),
    ).toThrow('invalid');
  });

  it('limits presentation snapshots to filter and selection identity', () => {
    const snapshot = parseAssetCenterPresentationSnapshot({
      filter: { ...createDefaultAssetCenterFilter(), query: 'shot' },
      selection: { owner: 'global-asset-library', itemId: 'asset:shot' },
    });
    expect(snapshot).toEqual({
      filter: { ...createDefaultAssetCenterFilter(), query: 'shot' },
      selection: { owner: 'global-asset-library', itemId: 'asset:shot' },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/absolutePath|contentLocator|previewSessionId/u);
    expect(() =>
      parseAssetCenterPresentationSnapshot({
        ...snapshot,
        previewSessionId: 'preview:stale',
      }),
    ).toThrow('unsupported fields');
  });
});

function readyProjection() {
  return {
    identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
    filter: { ...createDefaultAssetCenterFilter(), catalog: 'media-library' as const },
    catalog: {
      status: 'ready' as const,
      owner: 'media-library' as const,
      entries: [
        {
          item: {
            id: 'media-library:item-1',
            owner: 'media-library' as const,
            libraryId: 'library-1',
            libraryLabel: 'Footage',
            label: 'shot.png',
            kind: 'file' as const,
            locationKind: 'local' as const,
            relativePath: 'shot.png',
            availability: 'available' as const,
          },
          contentLocator: {
            file: { authority: 'workspace' as const, path: 'shot.png' },
          },
        },
      ],
    },
    preview: { status: 'empty' as const },
  };
}
