import { describe, expect, it } from 'vitest';
import { resolveImageGenerationType, resolveVideoGenerationType } from '../media-generation-kind';

describe('media generation type resolution', () => {
  it('uses text-to-image without reference inputs', () => {
    expect(resolveImageGenerationType({ prompt: 'paint a cat' })).toBe('text-to-image');
  });

  it('uses image-to-image for a stable reference image locator', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageLocator: { kind: 'workspace-file', path: 'references/image.png' },
      }),
    ).toBe('image-to-image');
  });

  it('uses image-to-image for a stable ControlNet locator', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageLocator: { kind: 'workspace-file', path: 'controls/lineart.png' },
      }),
    ).toBe('image-to-image');
  });

  it('uses text-to-video without reference inputs', () => {
    expect(resolveVideoGenerationType({ prompt: 'animate a cat' })).toBe('text-to-video');
  });

  it('uses image-to-video for a stable first-frame locator', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'animate',
        startFrameLocator: { kind: 'workspace-file', path: 'frames/start.png' },
      }),
    ).toBe('image-to-video');
  });

  it('uses video-to-video for a stable reference-video locator', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'edit',
        referenceVideoLocator: { kind: 'workspace-file', path: 'videos/source.mp4' },
      }),
    ).toBe('video-to-video');
  });
});
