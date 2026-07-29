import { inferCanvasDroppedAssetKind, type CanvasDroppedAssetKind } from '@neko/shared';

export function resolveCanvasPickerAssetKind(
  requestedKind: CanvasDroppedAssetKind | null,
  fileName: string,
): CanvasDroppedAssetKind | null {
  const inferredKind = inferCanvasDroppedAssetKind(fileName);
  return inferredKind ?? requestedKind;
}
