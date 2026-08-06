import type { GlobalLibraryItem } from '@neko/assets-domain/global-library/contract';

export interface LibrarySelectionCapabilities {
  readonly canMove: boolean;
  readonly canRemoveAssets: boolean;
}

export interface SelectionUpdate {
  readonly selectedIds: ReadonlySet<string>;
  readonly anchorId: string | undefined;
}

export interface SelectionRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function isActionableLibraryItem(item: GlobalLibraryItem): boolean {
  return (
    item.owner === 'global-asset-library' ||
    (item.availability === 'available' && item.kind === 'file')
  );
}

export function applyItemSelection(input: {
  readonly items: readonly GlobalLibraryItem[];
  readonly selectedIds: ReadonlySet<string>;
  readonly anchorId: string | undefined;
  readonly itemId: string;
  readonly toggle: boolean;
  readonly range: boolean;
}): SelectionUpdate {
  const actionableIds = input.items.filter(isActionableLibraryItem).map((item) => item.id);
  if (!actionableIds.includes(input.itemId)) {
    return { selectedIds: input.selectedIds, anchorId: input.anchorId };
  }
  if (input.range && input.anchorId) {
    const anchorIndex = actionableIds.indexOf(input.anchorId);
    const itemIndex = actionableIds.indexOf(input.itemId);
    if (anchorIndex >= 0) {
      const rangeIds = actionableIds.slice(
        Math.min(anchorIndex, itemIndex),
        Math.max(anchorIndex, itemIndex) + 1,
      );
      return {
        selectedIds: input.toggle
          ? new Set([...input.selectedIds, ...rangeIds])
          : new Set(rangeIds),
        anchorId: input.anchorId,
      };
    }
  }
  if (input.toggle) {
    const selectedIds = new Set(input.selectedIds);
    if (selectedIds.has(input.itemId)) selectedIds.delete(input.itemId);
    else selectedIds.add(input.itemId);
    return { selectedIds, anchorId: input.itemId };
  }
  return { selectedIds: new Set([input.itemId]), anchorId: input.itemId };
}

export function selectAllItems(items: readonly GlobalLibraryItem[]): ReadonlySet<string> {
  return new Set(items.filter(isActionableLibraryItem).map((item) => item.id));
}

export function reconcileSelection(
  selectedIds: ReadonlySet<string>,
  items: readonly GlobalLibraryItem[],
): ReadonlySet<string> {
  const currentIds = new Set(items.filter(isActionableLibraryItem).map((item) => item.id));
  return new Set([...selectedIds].filter((itemId) => currentIds.has(itemId)));
}

export function getSelectionCapabilities(
  selectedItems: readonly GlobalLibraryItem[],
): LibrarySelectionCapabilities {
  if (selectedItems.length === 0 || selectedItems.some((item) => !isActionableLibraryItem(item))) {
    return { canMove: false, canRemoveAssets: false };
  }
  const owner = selectedItems[0]?.owner;
  const oneOwner = selectedItems.every((item) => item.owner === owner);
  const oneMediaLibrary =
    owner !== 'media-library' ||
    selectedItems.every(
      (item) =>
        item.owner === 'media-library' &&
        item.libraryId ===
          (selectedItems[0]?.owner === 'media-library' ? selectedItems[0].libraryId : undefined),
    );
  return {
    canMove:
      selectedItems.every((item) => item.availability === 'available') &&
      oneOwner &&
      oneMediaLibrary,
    canRemoveAssets: selectedItems.every((item) => item.owner === 'global-asset-library'),
  };
}

export function createSelectionRectangle(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
): SelectionRectangle {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    right: Math.max(startX, currentX),
    bottom: Math.max(startY, currentY),
  };
}

export function rectanglesIntersect(
  first: SelectionRectangle,
  second: SelectionRectangle,
): boolean {
  return !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  );
}
