import { describe, expect, it } from 'vitest';
import {
  containsGpanoEquirectangularMetadata,
  getPanoramicPreviewRoute,
  isLowConfidencePanoramicAspectRatio,
} from '../panoramic-preview';

describe('panoramic preview routing contracts', () => {
  it('routes HDR/EXR and trusted filename hints as high-confidence images', () => {
    expect(getPanoramicPreviewRoute({ filePath: '/assets/studio.hdr' })).toMatchObject({
      kind: 'image',
      command: 'neko.preview.openPanoramicImage',
      viewType: 'neko.preview.panoramicImage',
      confidence: 'high',
      signal: 'extension',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/studio_360.jpg' })).toMatchObject({
      kind: 'image',
      confidence: 'high',
      signal: 'trusted-filename',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/studio.exr' })).toMatchObject({
      kind: 'image',
      confidence: 'high',
    });
  });

  it('routes half-panorama filename hints only when pano context is present', () => {
    expect(getPanoramicPreviewRoute({ filePath: '/assets/scene.halfpano.png' })).toMatchObject({
      kind: 'image',
      confidence: 'high',
      signal: 'trusted-filename',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/photo.180pano.jpg' })).toMatchObject({
      kind: 'image',
      confidence: 'high',
      signal: 'trusted-filename',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/city.pano180.jpg' })).toMatchObject({
      kind: 'image',
      confidence: 'high',
      signal: 'trusted-filename',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/photo_180.jpg' })).toBeNull();
    expect(getPanoramicPreviewRoute({ filePath: '/assets/IMG_1800.jpg' })).toBeNull();
  });

  it('routes GPano XMP as high-confidence metadata without requiring filename hints', () => {
    const metadataText = `
      <rdf:Description
        xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"
        GPano:ProjectionType="equirectangular"
        GPano:UsePanoramaViewer="True" />
    `;

    expect(containsGpanoEquirectangularMetadata(metadataText)).toBe(true);
    expect(
      getPanoramicPreviewRoute({
        filePath: '/assets/mobile-photo.jpg',
        metadataText,
      }),
    ).toMatchObject({
      kind: 'image',
      confidence: 'high',
      signal: 'gpano-metadata',
    });
  });

  it('keeps ordinary 2:1 aspect-ratio heuristics explicit-only at routing layer', () => {
    expect(isLowConfidencePanoramicAspectRatio({ width: 4096, height: 2048 })).toBe(true);
    expect(getPanoramicPreviewRoute({ filePath: '/assets/flat-wide.jpg' })).toBeNull();
    expect(
      getPanoramicPreviewRoute({ filePath: '/assets/flat-wide.jpg', explicitOpen: true }),
    ).toMatchObject({
      kind: 'image',
      confidence: 'explicit',
      signal: 'manual',
    });
  });

  it('routes trusted 360 videos but not ordinary videos unless explicit', () => {
    expect(getPanoramicPreviewRoute({ filePath: '/assets/tour_360.mp4' })).toMatchObject({
      kind: 'video',
      command: 'neko.preview.openPanoramicVideo',
      viewType: 'neko.preview.panoramicVideo',
      confidence: 'high',
    });
    expect(getPanoramicPreviewRoute({ filePath: '/assets/ordinary.mp4' })).toBeNull();
    expect(
      getPanoramicPreviewRoute({ filePath: '/assets/ordinary.mp4', explicitOpen: true }),
    ).toMatchObject({
      kind: 'video',
      confidence: 'explicit',
    });
  });
});
