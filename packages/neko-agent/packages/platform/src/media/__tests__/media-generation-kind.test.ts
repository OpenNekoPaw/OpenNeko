import { describe, expect, it } from 'vitest';
import { resolveImageGenerationType, resolveVideoGenerationType } from '../media-generation-kind';

describe('media generation type resolution', () => {
  it('uses text-to-image without reference inputs', () => {
    expect(resolveImageGenerationType({ prompt: 'paint a cat' })).toBe('text-to-image');
  });

  it('uses image-to-image for URL, base64, or local URI reference inputs', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageUrl: 'https://example.test/image.png',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageBase64: 'base64',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageUri: 'file:///tmp/image.png',
      }),
    ).toBe('image-to-image');
  });

  it('uses image-to-image for ControlNet base64 or local URI inputs', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageBase64: 'base64',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageUri: 'file:///tmp/control.png',
      }),
    ).toBe('image-to-image');
  });

  it('uses text-to-video without reference inputs', () => {
    expect(resolveVideoGenerationType({ prompt: 'animate a cat' })).toBe('text-to-video');
  });

  it('uses image-to-video for URL, base64, local URI, or first-frame inputs', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'animate',
        referenceImageUrl: 'https://example.test/image.png',
      }),
    ).toBe('image-to-video');
    expect(
      resolveVideoGenerationType({
        prompt: 'animate',
        referenceImageBase64: 'base64',
      }),
    ).toBe('image-to-video');
    expect(
      resolveVideoGenerationType({
        prompt: 'animate',
        referenceImageUri: 'file:///tmp/image.png',
      }),
    ).toBe('image-to-video');
    expect(
      resolveVideoGenerationType({
        prompt: 'animate',
        startFrameImageBase64: 'base64',
      }),
    ).toBe('image-to-video');
  });

  it('uses video-to-video for reference or source video inputs', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'edit',
        referenceVideoUrl: 'https://example.test/video.mp4',
      }),
    ).toBe('video-to-video');
    expect(
      resolveVideoGenerationType({
        prompt: 'edit',
        sourceVideoUrl: 'https://example.test/source.mp4',
      }),
    ).toBe('video-to-video');
  });
});
