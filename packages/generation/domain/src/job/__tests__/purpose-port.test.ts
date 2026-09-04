import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort } from '../contracts';
import { createPurposeGenerationJobPort } from '../purpose-port';
import {
  resolveImageGenerationModelParameterProfile,
  resolveVideoGenerationModelParameterProfile,
} from '../../model-parameter-profile';

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

  it('fails before Job creation when image references contradict the declared generation type', async () => {
    const submitGeneration = vi.fn();
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: {
        resolveGenerationBinding: () => ({
          providerId: 'image-provider',
          modelId: 'image-model',
        }),
      },
    });

    await expect(
      port.submitGeneration({
        lifecycleMode: 'detached',
        purpose: 'image.generate',
        generationType: 'text-to-image',
        request: {
          prompt: 'Keep the subject identity',
          referenceImageLocator: {
            file: { authority: 'workspace', path: 'story.epub' },
            selector: { kind: 'entry', path: 'OEBPS/images/page-1.png' },
          },
        },
      }),
    ).rejects.toThrow('expected image-to-image');
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('fails before Job creation when video inputs contradict the declared generation type', async () => {
    const submitGeneration = vi.fn();
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: {
        resolveGenerationBinding: () => ({
          providerId: 'video-provider',
          modelId: 'video-model',
        }),
      },
    });

    await expect(
      port.submitGeneration({
        lifecycleMode: 'detached',
        purpose: 'video.generate',
        generationType: 'text-to-video',
        request: {
          prompt: 'Animate the supplied first frame',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: { file: { authority: 'workspace', path: 'frames/SH01.png' } },
            },
          ],
        },
      }),
    ).rejects.toThrow('expected image-to-video');
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('rejects model-specific image controls before creating a Job', async () => {
    const submitGeneration = vi.fn();
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: {
        resolveGenerationBinding: () => ({
          providerId: 'image-provider',
          modelId: 'image-model',
          providerType: 'generic',
          modelCapabilities: ['image.generate'],
        }),
      },
    });

    await expect(
      port.submitGeneration({
        lifecycleMode: 'detached',
        purpose: 'image.generate',
        generationType: 'image-to-image',
        request: {
          prompt: 'Keep the subject identity',
          ipAdapterRefs: [
            {
              imageLocator: { file: { authority: 'workspace', path: 'references/subject.png' } },
              mode: 'subject',
            },
          ],
        },
      }),
    ).rejects.toThrow('image.reference.ip-adapter');
    expect(submitGeneration).not.toHaveBeenCalled();
  });

  it('rejects image parameters outside the Host-bound model profile before Job creation', async () => {
    const submitGeneration = vi.fn();
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');
    const port = createPurposeGenerationJobPort({
      jobs: createJobs({ submitGeneration }),
      bindings: {
        resolveGenerationBinding: () => ({
          providerId: 'image-provider',
          modelId: 'gpt-image-2',
          parameterProfile: profile,
        }),
      },
    });

    await expect(
      port.submitGeneration({
        lifecycleMode: 'linked',
        purpose: 'image.edit',
        generationType: 'image-edit',
        request: {
          prompt: 'Recompose this page.',
          operation: 'edit',
          referenceImageLocator: {
            file: { authority: 'workspace', path: 'volume.epub' },
            selector: { kind: 'entry', path: 'image/page.jpg' },
          },
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
        },
      }),
    ).rejects.toThrow('rejects parameter size');
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
