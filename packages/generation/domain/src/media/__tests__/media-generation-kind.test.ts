import { describe, expect, it } from 'vitest';
import {
  resolveImageGenerationType,
  resolveMediaModelType,
  resolveVideoGenerationType,
} from '../media-generation-kind';

describe('media generation type resolution', () => {
  it.each([
    ['text-to-image', 'image'],
    ['image-to-image', 'image'],
    ['image-edit', 'image'],
    ['text-to-video', 'video'],
    ['image-to-video', 'video'],
    ['video-to-video', 'video'],
    ['video-edit', 'video'],
    ['text-to-audio', 'audio'],
  ] as const)('maps %s to the configured %s model type', (generationType, modelType) => {
    expect(resolveMediaModelType(generationType)).toBe(modelType);
  });

  it('uses text-to-image without reference inputs', () => {
    expect(resolveImageGenerationType({ prompt: 'paint a cat' })).toBe('text-to-image');
  });

  it('uses image-to-image for a stable reference image locator', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageLocator: { file: { authority: 'workspace', path: 'references/image.png' } },
      }),
    ).toBe('image-to-image');
  });

  it('uses image-edit for an explicit edit operation', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'make the sky darker',
        operation: 'edit',
        referenceImageLocator: {
          file: { authority: 'workspace', path: 'references/image.png' },
        },
      }),
    ).toBe('image-edit');
  });

  it('uses image-to-image for a stable ControlNet locator', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageLocator: { file: { authority: 'workspace', path: 'controls/lineart.png' } },
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
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: { file: { authority: 'workspace', path: 'frames/start.png' } },
          },
        ],
      }),
    ).toBe('image-to-video');
  });

  it('uses video-to-video for a stable reference-video locator', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'edit',
        inputs: [
          {
            type: 'video',
            role: 'reference-video',
            locator: { file: { authority: 'workspace', path: 'videos/source.mp4' } },
          },
        ],
      }),
    ).toBe('video-to-video');
  });

  it('uses video-edit for an explicit transform operation', () => {
    expect(
      resolveVideoGenerationType({
        prompt: 'restyle',
        operation: 'transform',
        inputs: [
          {
            type: 'video',
            role: 'reference-video',
            locator: { file: { authority: 'workspace', path: 'videos/source.mp4' } },
          },
        ],
      }),
    ).toBe('video-edit');
  });
});
