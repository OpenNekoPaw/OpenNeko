import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort } from '../contracts';
import { createPurposeGenerationJobPort } from '../purpose-port';

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
});

function createJobs(overrides: Partial<GenerationJobPort>): GenerationJobPort {
  return {
    submitGeneration: vi.fn(),
    describeGeneration: vi.fn(),
    observeGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
    ...overrides,
  } as GenerationJobPort;
}
