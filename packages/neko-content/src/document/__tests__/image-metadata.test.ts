import { describe, expect, it } from 'vitest';
import { probeImageMetadata } from '../image-metadata';

describe('image metadata probe', () => {
  it('reads PNG dimensions from IHDR without decoding image pixels', () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x05, 0xd6, 0x00, 0x00, 0x08, 0x55,
    ]);

    expect(probeImageMetadata(bytes)).toEqual({
      width: 1494,
      height: 2133,
      mimeType: 'image/png',
      byteSize: bytes.length,
    });
  });

  it('reads JPEG dimensions from a start-of-frame segment', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x08, 0x55,
      0x05, 0xd6, 0x03, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);

    expect(probeImageMetadata(bytes)).toEqual({
      width: 1494,
      height: 2133,
      mimeType: 'image/jpeg',
      byteSize: bytes.length,
    });
  });

  it('reads GIF, WebP extended, and BMP dimensions', () => {
    expect(
      probeImageMetadata(
        new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xd6, 0x05, 0x55, 0x08]),
      ),
    ).toEqual({
      width: 1494,
      height: 2133,
      mimeType: 'image/gif',
      byteSize: 10,
    });

    expect(
      probeImageMetadata(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
          0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xd5, 0x05, 0x00, 0x54, 0x08, 0x00,
        ]),
      ),
    ).toEqual({
      width: 1494,
      height: 2133,
      mimeType: 'image/webp',
      byteSize: 30,
    });

    const bmp = new Uint8Array(26);
    bmp.set([0x42, 0x4d]);
    bmp.set([0x28, 0x00, 0x00, 0x00], 14);
    bmp.set([0xd6, 0x05, 0x00, 0x00], 18);
    bmp.set([0xab, 0xf7, 0xff, 0xff], 22);

    expect(probeImageMetadata(bmp)).toEqual({
      width: 1494,
      height: 2133,
      mimeType: 'image/bmp',
      byteSize: 26,
    });
  });

  it('returns null for unknown bytes', () => {
    expect(probeImageMetadata(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
