import type { ResourceRef } from '@neko/shared';
import type { GeneratedAssetIndex } from './generated-asset-index';

export interface GeneratedAssetResourceResolution {
  readonly path: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
}

export type GeneratedAssetResourceResolver = (
  ref: ResourceRef,
) => Promise<GeneratedAssetResourceResolution | undefined>;

export function createGeneratedAssetResourceResolver(
  generatedAssetIndex: Pick<GeneratedAssetIndex, 'get'>,
): GeneratedAssetResourceResolver {
  return async (ref) => {
    if (ref.source.kind !== 'generated-asset') return undefined;

    const generatedAssetId = ref.source.generatedAssetId;
    if (!generatedAssetId) return undefined;

    const generatedOutput = generatedAssetIndex.get(generatedAssetId);
    if (!generatedOutput) return undefined;

    return {
      path: generatedOutput.path,
      mimeType: generatedOutput.mimeType,
      ...(generatedOutput.type === 'generated-image' || generatedOutput.type === 'generated-video'
        ? { width: generatedOutput.width, height: generatedOutput.height }
        : {}),
    };
  };
}
