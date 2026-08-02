import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MediaGenerationConfigPort,
  MediaModel as Model,
  MediaProvider as Provider,
} from '../types';
import type {
  MediaAdapter,
  MediaAdapterResult,
  MediaAudioSubmitter,
  MediaImageSubmitter,
  MediaTaskCanceller,
  MediaTaskDescriber,
  MediaVideoSubmitter,
} from '@neko/generation';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { MediaGenerationExecutor } from '../media-generation-executor';

const provider: Provider = {
  id: 'linked-provider',
  name: 'Linked Provider',
  displayName: 'Linked Provider',
  type: 'runway',
  apiUrl: 'https://example.test',
  apiKey: 'test-key',
  enabled: true,
};

const model: Model = {
  id: 'linked-image',
  name: 'linked-image',
  displayName: 'Linked Image',
  providerId: provider.id,
  capabilities: ['text_to_image'],
  enabled: true,
};

describe('MediaGenerationExecutor linked execution', () => {
  afterEach(() => {
    getMediaAdapterRegistry().unregisterBuiltin('runway');
  });

  it('returns terminal outputs without registering a generic Task', async () => {
    const adapter = createAdapter({
      generateImage: vi.fn(async (): Promise<MediaAdapterResult> => ({
        status: 'completed',
        outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
      })),
    });
    getMediaAdapterRegistry().registerBuiltin('runway', adapter);
    const progress = vi.fn();
    const executor = new MediaGenerationExecutor(createConfig());

    const result = await executor.executeLinked({
      generationType: 'text-to-image',
      providerId: provider.id,
      modelId: model.id,
      request: { prompt: 'cat' },
      onProgress: progress,
    });

    expect(result).toEqual({
      outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
      metadata: { providerResolutionSource: 'media-adapter' },
    });
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('propagates the Tool Call AbortSignal through external provider polling', async () => {
    const adapter = createAdapter({
      generateImage: vi.fn(async (): Promise<MediaAdapterResult> => ({
        status: 'processing',
        externalTaskId: 'external-1',
      })),
      getTaskStatus: vi.fn(async (): Promise<MediaAdapterResult> => ({
        status: 'processing',
        progress: 10,
      })),
    });
    getMediaAdapterRegistry().registerBuiltin('runway', adapter);
    const controller = new AbortController();
    const executor = new MediaGenerationExecutor(createConfig());

    const execution = executor.executeLinked({
      generationType: 'text-to-image',
      providerId: provider.id,
      modelId: model.id,
      request: { prompt: 'cat' },
      signal: controller.signal,
    });
    controller.abort(new Error('tool call cancelled'));

    await expect(execution).rejects.toThrow(/Task aborted|tool call cancelled/);
    expect(adapter.getTaskStatus).not.toHaveBeenCalled();
  });

  it('fails visibly when an asynchronous result has no describe capability', async () => {
    const adapter = createAdapterWithoutTaskCapabilities({
      generateImage: vi.fn(async (): Promise<MediaAdapterResult> => ({
        status: 'processing',
        externalTaskId: 'external-1',
      })),
    });
    getMediaAdapterRegistry().registerBuiltin('runway', adapter);
    const executor = new MediaGenerationExecutor(createConfig());

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: provider.id,
        modelId: model.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow(/does not support asynchronous task description/);
  });

  it('keeps provider execution behind GenerationJob and poisons direct Agent Tool execution', () => {
    const serviceSource = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'media-generation-service.ts'),
      'utf8',
    );
    const toolSource = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '..',
        '..',
        '..',
        '..',
        'agent',
        'runtime',
        'src',
        'tools',
        'generation',
        'media-agent-tools.ts',
      ),
      'utf8',
    );

    expect(serviceSource).not.toContain('GenerationJobCoordinator');
    expect(toolSource).not.toContain('GenerationJobCoordinator');
    expect(toolSource).not.toContain('createInMemoryGenerationJobStore');
    expect(toolSource).toContain('jobs.submitGeneration');
    expect(toolSource).toContain('jobs.observeGeneration');
    expect(toolSource).not.toContain('media.generateImage');
    expect(toolSource).not.toContain('media.generateVideo');
    expect(toolSource).not.toContain('media.generateAudio');
  });
});

function createConfig(): MediaGenerationConfigPort {
  return {
    getProvider: (id: string) => (id === provider.id ? provider : undefined),
    getModel: (id: string) => (id === model.id ? model : undefined),
    getDefaultModelRef: () => undefined,
  };
}

function createAdapter(
  overrides: Partial<
    MediaAdapter &
      MediaImageSubmitter &
      MediaVideoSubmitter &
      MediaAudioSubmitter &
      MediaTaskDescriber &
      MediaTaskCanceller
  > = {},
): MediaAdapter &
  MediaImageSubmitter &
  MediaVideoSubmitter &
  MediaAudioSubmitter &
  MediaTaskDescriber &
  MediaTaskCanceller {
  const completed = async (): Promise<MediaAdapterResult> => ({
    status: 'completed',
    outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
  });
  return {
    type: 'runway',
    getSupportedTypes: () => ['text-to-image'],
    supportsType: () => true,
    generateImage: completed,
    generateVideo: completed,
    generateAudio: completed,
    getTaskStatus: completed,
    cancelTask: async () => undefined,
    ...overrides,
  };
}

function createAdapterWithoutTaskCapabilities(
  overrides: Partial<MediaAdapter & MediaImageSubmitter> = {},
): MediaAdapter & MediaImageSubmitter {
  const completed = async (): Promise<MediaAdapterResult> => ({
    status: 'completed',
    outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
  });
  return {
    type: 'runway',
    getSupportedTypes: () => ['text-to-image'],
    supportsType: () => true,
    generateImage: completed,
    ...overrides,
  };
}
