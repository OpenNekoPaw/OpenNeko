import { describe, expect, it } from 'vitest';
import type { PreviewVariantRequest } from '@neko/shared';
import type { PanoramicPreviewApi } from '../panoramic-api';
import { PANORAMIC_IMAGE_VIEW_TYPE } from '../panoramic-api';

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
    await expect(
      previewApi.requestPreviewVariant('asset-1', variantRequest),
    ).resolves.toMatchObject({
      role: 'thumbnail',
    });
    expect(PANORAMIC_IMAGE_VIEW_TYPE).toBe('neko.preview.panoramicImage');
  });
});
