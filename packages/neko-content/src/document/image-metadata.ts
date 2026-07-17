export interface ImageMetadata {
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly byteSize: number;
}

export interface ImageMetadataProbe {
  probeBytes(bytes: Uint8Array): ImageMetadata | null;
}

export const imageMetadataProbe: ImageMetadataProbe = {
  probeBytes: probeImageMetadata,
};

export function probeImageMetadata(bytes: Uint8Array): ImageMetadata | null {
  const png = readPngMetadata(bytes);
  if (png) return png;

  const jpeg = readJpegMetadata(bytes);
  if (jpeg) return jpeg;

  const gif = readGifMetadata(bytes);
  if (gif) return gif;

  const webp = readWebpMetadata(bytes);
  if (webp) return webp;

  const bmp = readBmpMetadata(bytes);
  if (bmp) return bmp;

  return null;
}

function readPngMetadata(bytes: Uint8Array): ImageMetadata | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }

  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
    mimeType: 'image/png',
    byteSize: bytes.length,
  };
}

function readJpegMetadata(bytes: Uint8Array): ImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === undefined) {
      return null;
    }
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }
    if (offset + 1 >= bytes.length) {
      return null;
    }

    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7 || offset + 6 >= bytes.length) {
        return null;
      }
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5),
        mimeType: 'image/jpeg',
        byteSize: bytes.length,
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readGifMetadata(bytes: Uint8Array): ImageMetadata | null {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38 ||
    (bytes[4] !== 0x37 && bytes[4] !== 0x39) ||
    bytes[5] !== 0x61
  ) {
    return null;
  }

  return {
    width: readUint16LE(bytes, 6),
    height: readUint16LE(bytes, 8),
    mimeType: 'image/gif',
    byteSize: bytes.length,
  };
}

function readWebpMetadata(bytes: Uint8Array): ImageMetadata | null {
  if (bytes.length < 16 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) {
      return null;
    }

    if (chunkType === 'VP8 ' && chunkSize >= 10) {
      if (
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a
      ) {
        return null;
      }
      return {
        width: readUint16LE(bytes, dataOffset + 6) & 0x3fff,
        height: readUint16LE(bytes, dataOffset + 8) & 0x3fff,
        mimeType: 'image/webp',
        byteSize: bytes.length,
      };
    }

    if (chunkType === 'VP8L' && chunkSize >= 5) {
      if (bytes[dataOffset] !== 0x2f) {
        return null;
      }
      const bits = readUint32LE(bytes, dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        mimeType: 'image/webp',
        byteSize: bytes.length,
      };
    }

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
        mimeType: 'image/webp',
        byteSize: bytes.length,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function readBmpMetadata(bytes: Uint8Array): ImageMetadata | null {
  if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    return null;
  }

  const dibHeaderSize = readUint32LE(bytes, 14);
  if (dibHeaderSize === 12 && bytes.length >= 26) {
    return {
      width: readUint16LE(bytes, 18),
      height: readUint16LE(bytes, 20),
      mimeType: 'image/bmp',
      byteSize: bytes.length,
    };
  }

  if (dibHeaderSize >= 40 && bytes.length >= 26) {
    return {
      width: readInt32LE(bytes, 18),
      height: Math.abs(readInt32LE(bytes, 22)),
      mimeType: 'image/bmp',
      byteSize: bytes.length,
    };
  }

  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0))
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) +
    (bytes[offset + 1] ?? 0) * 0x100 +
    (bytes[offset + 2] ?? 0) * 0x10000 +
    (bytes[offset + 3] ?? 0) * 0x1000000
  );
}

function readInt32LE(bytes: Uint8Array, offset: number): number {
  const value = readUint32LE(bytes, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}
