import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readRange } = vi.hoisted(() => ({
  readRange: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../document/PreviewFileServer', () => ({
  previewFileServer: { readRange },
}));

import * as vscode from 'vscode';
import {
  getPanoramicImageRoute,
  getPanoramicVideoRoute,
  getHighConfidencePanoramicImageRoute,
  isHighConfidencePanoramicImageCandidate,
  openBestPanoramicPreview,
  openPanoramicImage,
  openPanoramicVideo,
} from '../panoramicRouting';

describe('panoramic image routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readRange.mockRejectedValue(new Error('not mocked'));
  });

  it('routes high-confidence HDR/EXR and filename hints', () => {
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio.hdr')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio.exr')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/studio_360.jpg')).toBe(true);
    expect(isHighConfidencePanoramicImageCandidate('/assets/flat-wide.jpg')).toBe(false);
  });

  it('keeps low-confidence 2:1 images explicit-only at the route layer', () => {
    expect(getPanoramicImageRoute('/assets/flat-wide.jpg', false)).toBeNull();
    expect(getPanoramicImageRoute('/assets/flat-wide.jpg', true)).toMatchObject({
      command: 'neko.preview.openPanoramicImage',
      viewType: 'neko.preview.panoramicImage',
      confidence: 'explicit',
      signal: 'manual',
    });
  });

  it('routes GPano metadata as a high-confidence image without filename hints', async () => {
    readRange.mockResolvedValue(
      new TextEncoder().encode(
        '<x:xmpmeta><rdf:Description GPano:ProjectionType="equirectangular" /></x:xmpmeta>',
      ).buffer,
    );
    const uri = { fsPath: '/assets/mobile-photo.jpg' } as vscode.Uri;

    await expect(getHighConfidencePanoramicImageRoute(uri)).resolves.toMatchObject({
      confidence: 'high',
      signal: 'gpano-metadata',
    });
    expect(readRange).toHaveBeenCalledWith('/assets/mobile-photo.jpg', 0, 256 * 1024 - 1, {
      sourceDocumentUri: uri,
    });
  });

  it('opens the manifest-backed panoramic custom editor', async () => {
    const uri = { fsPath: '/assets/studio_360.jpg' } as vscode.Uri;

    await openPanoramicImage(uri);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      uri,
      'neko.preview.panoramicImage',
    );
  });

  it('routes explicit and high-confidence panoramic videos', async () => {
    expect(getPanoramicVideoRoute('/assets/tour_360.mp4', false)).toMatchObject({
      viewType: 'neko.preview.panoramicVideo',
      confidence: 'high',
    });
    expect(getPanoramicVideoRoute('/assets/ordinary.mp4', false)).toBeNull();
    expect(getPanoramicVideoRoute('/assets/ordinary.mp4', true)).toMatchObject({
      command: 'neko.preview.openPanoramicVideo',
      confidence: 'explicit',
    });

    const uri = { fsPath: '/assets/tour_360.mp4' } as vscode.Uri;
    await openPanoramicVideo(uri);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      uri,
      'neko.preview.panoramicVideo',
    );
  });

  it('opens only high-confidence candidates through the best panoramic entry', async () => {
    await expect(
      openBestPanoramicPreview({ fsPath: '/assets/studio_360.jpg' } as vscode.Uri),
    ).resolves.toBe(true);
    readRange.mockRejectedValue(new Error('not mocked'));
    await expect(
      openBestPanoramicPreview({ fsPath: '/assets/ordinary.jpg' } as vscode.Uri),
    ).resolves.toBe(false);
  });
});
