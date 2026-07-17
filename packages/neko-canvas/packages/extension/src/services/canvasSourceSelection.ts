import { inferCanvasDroppedAssetKind, type CanvasDroppedAssetKind } from '@neko/shared';

export function resolveCanvasPickerAssetKind(
  requestedKind: CanvasDroppedAssetKind | null,
  fileName: string,
): CanvasDroppedAssetKind | null {
  const inferredKind = inferCanvasDroppedAssetKind(fileName);
  if (requestedKind === 'script' && inferredKind !== 'text') {
    throw new Error(`Script file addition only supports text sources: ${fileName}`);
  }
  return inferredKind ?? requestedKind;
}
