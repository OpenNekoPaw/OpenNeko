import { describe, expect, it } from 'vitest';
import { AssetCenterContractError, createDefaultAssetCenterFilter } from './contract';
import { AssetCenterSession } from './session';

describe('AssetCenterSession', () => {
  it('owns empty, catalog and exact selected projections', () => {
    const session = createSession();
    expect(session.getSnapshot()).toMatchObject({ catalog: { status: 'loading' } });

    const ready = session.commitCatalog({
      owner: 'media-library',
      entries: [fileEntry()],
    });
    expect(ready).toMatchObject({ catalog: { status: 'ready' } });

    const selected = session.select({
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

  it('keeps the session usable after a rejected selection', () => {
    const session = createSession();
    session.commitCatalog({
      owner: 'media-library',
      entries: [fileEntry()],
    });
    expect(() =>
      session.select({
        owner: 'media-library',
        itemId: 'missing',
      }),
    ).toThrow('unavailable');
    expect(
      session.select({ owner: 'media-library', itemId: 'media-library:item-1' }).selection?.itemId,
    ).toBe('media-library:item-1');
  });

  it('rejects unknown, owner-mismatched and locator-less selections', () => {
    const session = createSession();
    session.commitCatalog({
      owner: 'media-library',
      entries: [fileEntry(), { item: directoryItem() }],
    });
    expect(() => session.select({ owner: 'media-library', itemId: 'unknown' })).toThrow(
      'unavailable',
    );
    expect(() =>
      session.select({
        owner: 'global-asset-library',
        itemId: 'media-library:item-1',
      }),
    ).toThrow('unavailable');
    expect(() =>
      session.select({
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
    expect(() => session.updateFilter(createDefaultAssetCenterFilter())).toThrow('disposed');
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
