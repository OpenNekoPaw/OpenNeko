import { describe, expect, it } from 'vitest';

import {
  CONTENT_REPRESENTATION_KINDS,
  isContentRepresentationHandle,
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
      { kind: 'semantic-sidecar', modality: 'ocr', profile: 'document-default' },
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
  });

  it('returns only an opaque runtime handle', () => {
    const result: ContentRepresentationResult = {
      status: 'ready',
      handle: { kind: 'content-representation-handle', id: 'representation-1' },
      metadata: { mimeType: 'image/webp', byteLength: 1024, width: 320, height: 180 },
    };

    expect(isContentRepresentationHandle(result.handle)).toBe(true);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'source',
      'spec',
      'generatorId',
      'sourceFingerprint',
      'specFingerprint',
      'cache',
      'localPath',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects rich locator fields at the handle boundary', () => {
    expect(
      isContentRepresentationHandle({
        kind: 'content-representation-handle',
        id: 'representation-1',
        source: { file: { authority: 'workspace', path: 'media/source.png' } },
      }),
    ).toBe(false);
    expect(
      isContentRepresentationHandle({ kind: 'content-representation', id: 'representation-1' }),
    ).toBe(false);
  });
});
