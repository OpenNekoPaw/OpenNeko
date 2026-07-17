import { describe, expect, it } from 'vitest';
import type { EnvironmentPlacement, PreviewVariantRequest } from '@neko/shared';
import type { PanoramicModelApi, PanoramicPreviewApi } from '../panoramic-api';
import { PANORAMIC_IMAGE_VIEW_TYPE, USE_AS_MODEL_ENVIRONMENT_COMMAND } from '../panoramic-api';

describe('panoramic extension API boundaries', () => {
  it('declares local minimal interfaces over shared DTOs', async () => {
    const variantRequest: PreviewVariantRequest = { role: 'thumbnail', width: 320, height: 180 };
    const previewApi: Pick<PanoramicPreviewApi, 'requestPreviewVariant'> = {
      requestPreviewVariant: async (assetId, request) => ({
        id: 'variant-1',
        assetId,
        role: request.role,
        dimensions: { width: request.width ?? 0, height: request.height ?? 0 },
      }),
    };
    const placement: EnvironmentPlacement = {
      sourceAssetId: 'asset-1',
      mode: 'skybox',
      rotationDeg: 0,
      intensity: 1,
      exposure: 0,
      visibleAsBackground: true,
    };
    const modelApi: PanoramicModelApi = {
      useEnvironment: async (input) => {
        expect(input.rotationDeg).toBe(0);
      },
    };

    await expect(
      previewApi.requestPreviewVariant('asset-1', variantRequest),
    ).resolves.toMatchObject({
      role: 'thumbnail',
    });
    await expect(modelApi.useEnvironment(placement)).resolves.toBeUndefined();
    expect(PANORAMIC_IMAGE_VIEW_TYPE).toBe('neko.preview.panoramicImage');
    expect(USE_AS_MODEL_ENVIRONMENT_COMMAND).toBe('neko.model.useEnvironment');
  });
});
