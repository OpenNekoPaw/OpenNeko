import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort, GenerationJobSnapshot } from '../contracts';
import { createDirectGenerationOperationPort } from '../direct-operation-port';

describe('DirectGenerationOperationPort', () => {
  it.each([
    ['image', 'image.generate', 'text-to-image'],
    ['video', 'video.generate', 'text-to-video'],
    ['audio', 'audio.generate', 'text-to-audio'],
  ] as const)(
    'submits one detached %s Job with exact purpose and model binding',
    async (mediaKind, purpose, generationType) => {
      const jobs = createJobs();
      const validate = vi.fn();
      const port = createDirectGenerationOperationPort({ jobs, bindings: { validate } });

      const result = await port.submit({
        mediaKind,
        prompt: 'A precise request',
        providerId: 'provider-exact',
        modelId: 'model-exact',
      });

      expect(validate).toHaveBeenCalledWith({
        purpose,
        providerId: 'provider-exact',
        modelId: 'model-exact',
      });
      expect(jobs.submitGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycleMode: 'detached',
          generationType,
          providerId: 'provider-exact',
          modelId: 'model-exact',
          request: expect.objectContaining({
            prompt: 'A precise request',
            providerId: 'provider-exact',
            modelId: 'model-exact',
          }),
        }),
      );
      expect(result).toMatchObject({
        jobId: 'job-direct',
        mediaKind,
        purpose,
        providerId: 'provider-exact',
        modelId: 'model-exact',
        phase: 'succeeded',
        resultLocators: [{ kind: 'generated-output', outputId: 'output-direct' }],
      });
    },
  );

  it('rejects an unavailable purpose binding before creating a Job', async () => {
    const jobs = createJobs();
    const port = createDirectGenerationOperationPort({
      jobs,
      bindings: {
        validate: () => {
          throw new Error('Selected model does not support image.generate.');
        },
      },
    });

    await expect(
      port.submit({
        mediaKind: 'image',
        prompt: 'No fallback',
        providerId: 'wrong-provider',
        modelId: 'wrong-model',
      }),
    ).rejects.toThrow('does not support image.generate');
    expect(jobs.submitGeneration).not.toHaveBeenCalled();
  });

  it('returns a failed Job diagnostic without submitting through another entry', async () => {
    const jobs = createJobs({
      phase: 'failed',
      resultLocators: undefined,
      failure: { code: 'provider-rejected', message: 'Provider rejected the request.' },
    });
    const port = createDirectGenerationOperationPort({
      jobs,
      bindings: { validate: vi.fn() },
    });

    await expect(
      port.submit({
        mediaKind: 'video',
        prompt: 'No fallback',
        providerId: 'provider-exact',
        modelId: 'model-exact',
      }),
    ).resolves.toMatchObject({
      phase: 'failed',
      diagnostic: { code: 'provider-rejected', message: 'Provider rejected the request.' },
    });
    expect(jobs.submitGeneration).toHaveBeenCalledTimes(1);
  });
});

function createJobs(
  terminalOverrides: Partial<GenerationJobSnapshot> = {},
): GenerationJobPort & { submitGeneration: ReturnType<typeof vi.fn> } {
  const initial = createSnapshot({ phase: 'pending', resultLocators: undefined });
  const terminal = createSnapshot(terminalOverrides);
  return {
    submitGeneration: vi.fn(async () => initial),
    describeGeneration: vi.fn(async () => terminal),
    observeGeneration: vi.fn(async function* () {
      yield terminal;
    }),
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    regenerateGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
  };
}

function createSnapshot(overrides: Partial<GenerationJobSnapshot>): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'job-direct' },
    phase: 'succeeded',
    lifecycleMode: 'detached',
    createdAt: 1,
    updatedAt: 2,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-exact',
      modelId: 'model-exact',
      request: {
        prompt: 'A precise request',
        providerId: 'provider-exact',
        modelId: 'model-exact',
      },
    },
    progress: { stage: 'completed', percent: 100 },
    resultLocators: [
      {
        kind: 'generated-output',
        outputId: 'output-direct',
        digest: 'sha256:direct',
        path: 'neko/assets/generated/image/output-direct.png',
      },
    ],
    ...overrides,
  };
}
