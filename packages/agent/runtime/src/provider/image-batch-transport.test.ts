import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { normalizeProviderImage } from './image-batch-transport';

describe('provider image normalization', () => {
  it('preserves a supported image whose declared MIME matches its bytes', async () => {
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const normalized = await normalizeProviderImage(bytes, 'image/png');

    expect(normalized.mimeType).toBe('image/png');
    expect(normalized.bytes).toEqual(bytes);
  });

  it('rejects undecodable bytes and a declared MIME that disagrees with the image', async () => {
    await expect(normalizeProviderImage(new Uint8Array([1, 2, 3]), 'image/png')).rejects.toThrow(
      /not a decodable supported image/u,
    );

    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await expect(normalizeProviderImage(jpeg, 'image/png')).rejects.toThrow(/does not match/u);
  });

  it('bounds an oversized image to the canonical JPEG payload', async () => {
    const bytes = await sharp({
      create: { width: 4096, height: 8, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const normalized = await normalizeProviderImage(bytes, 'image/png');
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe('image/jpeg');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(2048);
  });
});
