import { describe, expect, it } from 'vitest';
import type { PanoramaViewState, PreviewManifest } from '@neko/shared';
import { DEFAULT_PANORAMA_VIEW_STATE } from '@neko/shared';

describe('preview shared contracts in Webview-facing code', () => {
  it('imports preview DTOs without VSCode or React dependencies', () => {
    const state: PanoramaViewState = { ...DEFAULT_PANORAMA_VIEW_STATE, yawDeg: 12 };
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId: 'asset-webview',
      token: 'token-webview',
      kind: 'image',
      status: 'ready',
      sourceName: 'room_360.jpg',
      sourceUrl: 'http://127.0.0.1:3000/v1/preview/file/token-webview',
      projection: {
        type: 'equirectangular',
        confidence: 'trusted-filename',
        source: 'filename',
      },
      media: {
        dimensions: { width: 2048, height: 1024 },
        fileSizeBytes: 2048,
        mimeType: 'image/jpeg',
        dynamicRange: 'sdr',
      },
      defaultViewState: state,
      variants: [],
      createdAt: '2026-05-07T00:00:00.000Z',
    };

    expect(manifest.defaultViewState?.yawDeg).toBe(12);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});
