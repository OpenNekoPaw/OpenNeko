import { describe, expect, it } from 'vitest';
import { parseCanvasPreviewDelegateRequest } from './previewDelegateMessage';

describe('parseCanvasPreviewDelegateRequest', () => {
  it('accepts canonical preview and ordinary-open requests', () => {
    expect(
      parseCanvasPreviewDelegateRequest({
        action: { target: 'preview' },
        asset: {
          kind: 'asset-identity',
          path: 'media/panorama.exr',
          mediaType: 'image',
        },
      }),
    ).toEqual({
      target: 'preview',
      assetPath: 'media/panorama.exr',
      mediaType: 'image',
    });

    expect(
      parseCanvasPreviewDelegateRequest({
        action: { target: 'external' },
        asset: { kind: 'asset-identity', uri: 'media/reference.png' },
      }),
    ).toEqual({
      target: 'external',
      assetPath: 'media/reference.png',
    });
  });

  it('rejects removed delegate targets and missing asset identity', () => {
    expect(() =>
      parseCanvasPreviewDelegateRequest({
        action: { target: 'model', command: 'neko.model.open' },
        asset: { kind: 'asset-identity', path: 'model.glb' },
      }),
    ).toThrow('requires target "preview" or "external"');

    expect(() =>
      parseCanvasPreviewDelegateRequest({
        action: { target: 'preview' },
        asset: { kind: 'asset-identity' },
      }),
    ).toThrow('requires an asset path or URI');
  });
});
