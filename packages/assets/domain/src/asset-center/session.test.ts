import { describe, expect, it } from 'vitest';
import { AssetCenterContractError, createDefaultAssetCenterFilter } from './contract';
import { AssetCenterSession } from './session';

describe('AssetCenterSession', () => {
  it('owns empty, catalog and exact selected projections behind revision CAS', () => {
    const session = createSession();
    expect(session.getSnapshot()).toMatchObject({ revision: 0, catalog: { status: 'loading' } });

    const ready = session.commitCatalog({
      expectedRevision: 0,
      owner: 'media-library',
      catalogRevision: 4,
      entries: [fileEntry()],
    });
    expect(ready).toMatchObject({ revision: 1, catalog: { status: 'ready' } });

    const selected = session.select({
      expectedRevision: 1,
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    expect(selected.selection).toEqual({
      owner: 'media-library',
      itemId: 'media-library:item-1',
      item: fileEntry().item,
      contentLocator: { kind: 'workspace-file', path: 'shots/shot.png' },
    });
    expect(JSON.stringify(selected)).not.toContain('/private/');
  });

  it('rejects stale revisions without retrying against current state', () => {
    const session = createSession();
    session.commitCatalog({
      expectedRevision: 0,
      owner: 'media-library',
      catalogRevision: 1,
      entries: [fileEntry()],
    });
    expect(() =>
      session.select({
        expectedRevision: 0,
        owner: 'media-library',
        itemId: 'media-library:item-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AssetCenterContractError>>({
        code: 'asset-center-stale-revision',
      }),
    );
    expect(session.getSnapshot()).not.toHaveProperty('selection');
  });

  it('rejects unknown, owner-mismatched and locator-less selections', () => {
    const session = createSession();
    session.commitCatalog({
      expectedRevision: 0,
      owner: 'media-library',
      catalogRevision: 1,
      entries: [fileEntry(), { item: directoryItem() }],
    });
    expect(() =>
      session.select({ expectedRevision: 1, owner: 'media-library', itemId: 'unknown' }),
    ).toThrow('unavailable');
    expect(() =>
      session.select({
        expectedRevision: 1,
        owner: 'global-asset-library',
        itemId: 'media-library:item-1',
      }),
    ).toThrow('unavailable');
    expect(() =>
      session.select({
        expectedRevision: 1,
        owner: 'media-library',
        itemId: 'media-library:directory-1',
      }),
    ).toThrow('not previewable');
  });

  it('fails visibly after disposal', () => {
    const session = createSession();
    session.dispose();
    expect(() => session.getSnapshot()).toThrowError(
      expect.objectContaining<Partial<AssetCenterContractError>>({
        code: 'asset-center-session-disposed',
      }),
    );
    expect(() => session.updateFilter(0, createDefaultAssetCenterFilter())).toThrow('disposed');
  });
});

function createSession(): AssetCenterSession {
  return new AssetCenterSession({
    assetCenterSessionId: 'asset-center:window-1',
    windowId: 'window-1',
  });
}

function fileEntry() {
  return {
    item: {
      id: 'media-library:item-1',
      owner: 'media-library' as const,
      libraryId: 'library-1',
      libraryLabel: 'Footage',
      label: 'shot.png',
      kind: 'file' as const,
      locationKind: 'local' as const,
      relativePath: 'shots/shot.png',
      availability: 'available' as const,
    },
    contentLocator: { kind: 'workspace-file' as const, path: 'shots/shot.png' },
  };
}

function directoryItem() {
  return {
    id: 'media-library:directory-1',
    owner: 'media-library' as const,
    libraryId: 'library-1',
    libraryLabel: 'Footage',
    label: 'shots',
    kind: 'directory' as const,
    locationKind: 'local' as const,
    relativePath: 'shots',
    availability: 'available' as const,
  };
}
