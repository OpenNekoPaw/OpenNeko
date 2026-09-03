import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort } from '../contracts';
import { createPurposeGenerationJobPort } from '../purpose-port';
import { resolveVideoGenerationModelParameterProfile } from '../../model-parameter-profile';

describe('createPurposeGenerationJobPort', () => {
  it('resolves one immutable binding before submitting to the canonical Job port', async () => {
    const submitGeneration = vi.fn(async (input) => input);
    const jobs = createJobs({ submitGeneration });
    const port = createPurposeGenerationJobPort({
      jobs,
      bindings: {
        resolveGenerationBinding: vi.fn(() => ({
          providerId: 'image-provider',
          modelId: 'image-model',
        })),
      },
    });

    await port.submitGeneration({
      lifecycleMode: 'detached',
      purpose: 'image.generate',
      generationType: 'text-to-image',
      request: {
        prompt: 'A quiet harbor at sunrise',
        providerId: 'untrusted-caller-provider',
        modelId: 'untrusted-caller-model',
      },
    });

    expect(submitGeneration).toHaveBeenCalledWith({
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      providerId: 'image-provider',
      modelId: 'image-model',
      request: {
        prompt: 'A quiet harbor at sunrise',
        providerId: 'image-provider',
        modelId: 'image-model',
      },
    });
  });

  it('fails before Job creation when the Host has no purpose binding', async () => {
    const submitGeneration = vi.fn();
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: { resolveGenerationBinding: () => undefined },
    });

    await expect(
      port.submitGeneration({
        lifecycleMode: 'detached',
        purpose: 'video.generate',
        generationType: 'text-to-video',
        request: { prompt: 'A slow camera move through fog' },
      }),
    ).rejects.toThrow('No explicit generation model binding');
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('conforms Agent video parameters to the Host-bound model profile before Job creation', async () => {
    const submitGeneration = vi.fn(async (input) => input);
    const profile = resolveVideoGenerationModelParameterProfile({
      providerType: 'minimax',
      modelName: 'MiniMax-H3',
    });
    if (!profile) throw new Error('MiniMax H3 parameter profile is unavailable.');
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: {
        resolveGenerationBinding: () => ({
          providerId: 'minimax-provider',
          modelId: 'minimax-h3',
          parameterProfile: profile,
        }),
      },
    });

    await port.submitGeneration({
      lifecycleMode: 'detached',
      purpose: 'video.generate',
      generationType: 'image-to-video',
      request: {
        prompt: 'Slowly push upward through the structure',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: { file: { authority: 'workspace', path: 'shots/SH01.png' } },
          },
        ],
        negativePrompt: 'text',
        duration: 6,
        resolution: '1080p',
        fps: 24,
        aspectRatio: '16:9',
        generateAudio: false,
        motionStrength: 0.25,
        cameraMovement: 'dolly-in',
      },
    });

    expect(submitGeneration).toHaveBeenCalledWith({
      lifecycleMode: 'detached',
      generationType: 'image-to-video',
      providerId: 'minimax-provider',
      modelId: 'minimax-h3',
      parameterAdjustments: [
        { parameter: 'negativePrompt', reason: 'unsupported' },
        { parameter: 'resolution', reason: 'invalid' },
        { parameter: 'fps', reason: 'unsupported' },
        { parameter: 'generateAudio', reason: 'unsupported' },
        { parameter: 'motionStrength', reason: 'unsupported' },
        { parameter: 'cameraMovement', reason: 'unsupported' },
      ],
      request: {
        prompt: 'Slowly push upward through the structure',
        providerId: 'minimax-provider',
        modelId: 'minimax-h3',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: { file: { authority: 'workspace', path: 'shots/SH01.png' } },
          },
        ],
        duration: 6,
        resolution: '768P',
        aspectRatio: '16:9',
      },
    });
  });
});

function createJobs(overrides: Partial<GenerationJobPort>): GenerationJobPort {
  return {
    submitGeneration: vi.fn(),
    describeGeneration: vi.fn(),
    observeGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    regenerateGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
    ...overrides,
  } as GenerationJobPort;
}
