import { describe, expect, it } from 'vitest';

import {
  CONTENT_REPRESENTATION_KINDS,
  isContentRepresentationSpec,
  type ContentRepresentationResult,
} from '../content-representation';

describe('content representation contracts', () => {
  it('accepts every closed semantic representation kind', () => {
    const specs = [
      { kind: 'thumbnail', maxWidth: 320, maxHeight: 180, format: 'webp' },
      { kind: 'proxy', profile: 'editing-720p' },
      { kind: 'preview', maxWidth: 1280 },
      { kind: 'waveform', width: 1024, height: 160 },
      { kind: 'loudness', standard: 'ebu-r128', targetLufs: -14 },
      { kind: 'raster-page', page: 1, scale: 2, format: 'png' },
      {
        kind: 'fov-crop',
        yaw: 0,
        pitch: 0,
        horizontalFov: 90,
        width: 1920,
        height: 1080,
      },
      { kind: 'semantic-sidecar', modality: 'ocr', profile: 'document-v1' },
    ];

    expect(specs.every(isContentRepresentationSpec)).toBe(true);
    expect(specs.map((spec) => spec.kind)).toEqual(CONTENT_REPRESENTATION_KINDS);
  });

  it('rejects source, native document entry, cache, and invalid numeric specs', () => {
    expect(isContentRepresentationSpec({ kind: 'source' })).toBe(false);
    expect(isContentRepresentationSpec({ kind: 'document-entry' })).toBe(false);
    expect(isContentRepresentationSpec({ kind: 'cache-materialize' })).toBe(false);
    expect(isContentRepresentationSpec({ kind: 'thumbnail', maxWidth: 0 })).toBe(false);
    expect(isContentRepresentationSpec({ kind: 'raster-page', page: 0 })).toBe(false);
    expect(isContentRepresentationSpec({ kind: 'proxy', profile: '' })).toBe(false);
    expect(
      isContentRepresentationSpec({ kind: 'loudness', standard: 'ebu-r128', targetLufs: NaN }),
    ).toBe(false);
  });

  it('keeps ready results storage-neutral', () => {
    const result: ContentRepresentationResult = {
      status: 'ready',
      locator: {
        kind: 'content-representation',
        id: 'representation-1',
        representationKind: 'thumbnail',
        sourceFingerprint: 'sha256:source',
        specFingerprint: 'sha256:spec',
        revision: 'thumbnail-generator-v1',
      },
      metadata: {
        mimeType: 'image/webp',
        byteLength: 1024,
        width: 320,
        height: 180,
      },
    };

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('cache');
    expect(serialized).not.toContain('provider');
    expect(serialized).not.toContain('manifest');
    expect(serialized).not.toContain('absolutePath');
    expect(serialized).not.toContain('localPath');
  });
});
