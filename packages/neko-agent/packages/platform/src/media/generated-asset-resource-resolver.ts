import type { GeneratedAssetDerivativeResourceCacheProviderOptions } from '@neko/shared/content-access';
import type { GeneratedAssetIndex } from './generated-asset-index';

export type GeneratedAssetResourceResolver = NonNullable<
  GeneratedAssetDerivativeResourceCacheProviderOptions['resolveAsset']
>;

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
