import { describe, expect, it } from 'vitest';
import {
  ASSET_CENTER_SESSION_CONTRACT_VERSION,
  createAssetCenterSessionId,
  createDefaultAssetCenterFilter,
  parseAssetCenterSessionProjection,
} from './contract';

describe('Asset Center session contract', () => {
  it('parses an exact empty session projection', () => {
    expect(
      parseAssetCenterSessionProjection({
        schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
        identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
        revision: 0,
        filter: createDefaultAssetCenterFilter(),
        catalog: { status: 'loading' },
        preview: { status: 'empty' },
      }),
    ).toMatchObject({ revision: 0, catalog: { status: 'loading' } });
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
});

function readyProjection() {
  return {
    schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
    identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
    revision: 1,
    filter: createDefaultAssetCenterFilter(),
    catalog: {
      status: 'ready' as const,
      owner: 'media-library' as const,
      catalogRevision: 3,
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
          contentLocator: { kind: 'workspace-file' as const, path: 'shot.png' },
        },
      ],
    },
    preview: { status: 'empty' as const },
  };
}
