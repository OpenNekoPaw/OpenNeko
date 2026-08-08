import { describe, expect, it } from 'vitest';
import {
  parseDirectGenerationOperationInput,
  parseDirectGenerationOperationProjection,
} from '../direct-operation';

describe('Direct Generation operation contract', () => {
  it('parses exact media operation inputs', () => {
    expect(
      parseDirectGenerationOperationInput({
        mediaKind: 'video',
        prompt: 'A tracking shot',
        providerId: 'provider-1',
        modelId: 'video-1',
        aspectRatio: '16:9',
        resolution: '1080p',
        duration: 5,
        fps: 24,
      }),
    ).toEqual({
      mediaKind: 'video',
      prompt: 'A tracking shot',
      providerId: 'provider-1',
      modelId: 'video-1',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 5,
      fps: 24,
    });
  });

  it('rejects unsupported fields and invalid positive values', () => {
    expect(() =>
      parseDirectGenerationOperationInput({
        mediaKind: 'image',
        prompt: 'Image',
        providerId: 'provider-1',
        modelId: 'image-1',
        duration: 3,
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseDirectGenerationOperationInput({
        mediaKind: 'audio',
        prompt: 'Sound',
        providerId: 'provider-1',
        modelId: 'audio-1',
        duration: 0,
      }),
    ).toThrow('positive number');
  });

  it('rejects a projection whose media kind and purpose disagree', () => {
    expect(() =>
      parseDirectGenerationOperationProjection({
        jobId: 'job-1',
        mediaKind: 'image',
        purpose: 'video.generate',
        providerId: 'provider-1',
        modelId: 'image-1',
        phase: 'succeeded',
        resultLocators: [
          {
            kind: 'generated-output',
            outputId: 'output-1',
            digest: 'sha256:output',
            path: 'neko/assets/generated/image/output.png',
          },
        ],
      }),
    ).toThrow('does not match');
  });
});
