import { describe, expect, it } from 'vitest';
import type { GlobalLibraryItem } from '@neko/assets-domain/global-library/contract';
import {
  applyItemSelection,
  createSelectionRectangle,
  getSelectionCapabilities,
  reconcileSelection,
  rectanglesIntersect,
  selectAllItems,
} from './selection';

describe('Asset Center collection selection', () => {
  it('supports single, toggle, range, select-all, and stale reconciliation', () => {
    const items = [asset('one'), asset('two'), asset('three')];
    const [first, second, third] = items;
    if (!first || !second || !third) throw new Error('Selection fixture is incomplete.');
    const single = applyItemSelection({
      items,
      selectedIds: new Set(),
      anchorId: undefined,
      itemId: first.id,
      toggle: false,
      range: false,
    });
    const toggled = applyItemSelection({
      items,
      selectedIds: single.selectedIds,
      anchorId: single.anchorId,
      itemId: third.id,
      toggle: true,
      range: false,
    });
    expect([...toggled.selectedIds]).toEqual([first.id, third.id]);

    const ranged = applyItemSelection({
      items,
      selectedIds: toggled.selectedIds,
      anchorId: first.id,
      itemId: third.id,
      toggle: false,
      range: true,
    });
    expect([...ranged.selectedIds]).toEqual(items.map((item) => item.id));
    expect([...selectAllItems([...items, directory('folder')])]).toEqual(
      items.map((item) => item.id),
    );
    expect([...reconcileSelection(ranged.selectedIds, items.slice(1))]).toEqual([
      second.id,
      third.id,
    ]);
  });

  it('enables operations only for a complete compatible selection', () => {
    expect(getSelectionCapabilities([asset('one'), asset('two')])).toEqual({
      canMove: true,
      canRemoveAssets: true,
    });
    expect(
      getSelectionCapabilities([mediaFile('one', 'library-a'), mediaFile('two', 'library-a')]),
    ).toEqual({ canMove: true, canRemoveAssets: false });
    expect(
      getSelectionCapabilities([mediaFile('one', 'library-a'), mediaFile('two', 'library-b')]),
    ).toEqual({ canMove: false, canRemoveAssets: false });
    expect(getSelectionCapabilities([asset('one'), mediaFile('two', 'library-a')])).toEqual({
      canMove: false,
      canRemoveAssets: false,
    });
    const unavailableAsset = { ...asset('missing'), availability: 'unavailable' as const };
    expect([...selectAllItems([unavailableAsset])]).toEqual([unavailableAsset.id]);
    expect(getSelectionCapabilities([unavailableAsset])).toEqual({
      canMove: false,
      canRemoveAssets: true,
    });
  });

  it('normalizes and intersects marquee rectangles', () => {
    const rectangle = createSelectionRectangle(30, 40, 10, 20);
    expect(rectangle).toEqual({ left: 10, top: 20, right: 30, bottom: 40 });
    expect(rectanglesIntersect(rectangle, { left: 25, top: 35, right: 50, bottom: 60 })).toBe(true);
    expect(rectanglesIntersect(rectangle, { left: 31, top: 41, right: 50, bottom: 60 })).toBe(
      false,
    );
  });
});

function asset(id: string): GlobalLibraryItem {
  return {
    id: `asset:${id}`,
    owner: 'global-asset-library',
    label: id,
    kind: 'asset',
    availability: 'available',
  };
}

function mediaFile(id: string, libraryId: string): GlobalLibraryItem {
  return {
    id: `media:${libraryId}:${id}`,
    owner: 'media-library',
    libraryId,
    libraryLabel: libraryId,
    label: id,
    kind: 'file',
    locationKind: 'local',
    relativePath: id,
    availability: 'available',
  };
}

function directory(id: string): GlobalLibraryItem {
  return {
    id: `media:library-a:${id}`,
    owner: 'media-library',
    libraryId: 'library-a',
    libraryLabel: 'library-a',
    label: id,
    kind: 'directory',
    locationKind: 'local',
    relativePath: id,
    availability: 'available',
  };
}
