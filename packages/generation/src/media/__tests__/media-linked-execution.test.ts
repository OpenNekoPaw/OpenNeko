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
import { GenerationExecutionOutcomeUnknownError } from '@neko/generation';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { MediaGenerationExecutor } from '../media-generation-executor';
import { MediaGenerationService } from '../media-generation-service';
import { MediaRoutingManager } from '../routing/media-routing-manager';

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
    const executor = new MediaGenerationExecutor(createConfig(), createProviderResolver());

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
    expect(adapter.generateImage).toHaveBeenCalledWith(
      expect.any(Object),
      model,
      expect.objectContaining({ id: provider.id, apiKey: 'test-key' }),
    );
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
    const executor = new MediaGenerationExecutor(createConfig(), createProviderResolver());

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
    const executor = new MediaGenerationExecutor(createConfig(), createProviderResolver());

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: provider.id,
        modelId: model.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow(/does not support asynchronous task description/);
  });

  it('preserves an ambiguous synchronous provider submission as outcome unknown', async () => {
    const generateImage = vi.fn(async (): Promise<MediaAdapterResult> => {
      throw Object.assign(new Error('connection closed after submission'), {
        isRetryable: false,
        outcomeUnknown: true,
      });
    });
    getMediaAdapterRegistry().registerBuiltin('runway', createAdapter({ generateImage }));
    const executor = new MediaGenerationExecutor(createConfig(), createProviderResolver());

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: provider.id,
        modelId: model.id,
        request: { prompt: 'cat', count: 2 },
      }),
    ).rejects.toBeInstanceOf(GenerationExecutionOutcomeUnknownError);
    expect(generateImage).toHaveBeenCalledTimes(1);
  });

  it('never switches stacks after a terminal MediaAdapter failure', async () => {
    const generateImage = vi.fn(async (): Promise<MediaAdapterResult> => ({
      status: 'failed',
      error: {
        code: 'provider-rejected',
        message: 'Provider rejected the request.',
        retryable: false,
      },
    }));
    getMediaAdapterRegistry().registerBuiltin('runway', createAdapter({ generateImage }));
    const executor = new MediaGenerationExecutor(createConfig(), createProviderResolver());

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: provider.id,
        modelId: model.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow(/Provider rejected the request/);
    expect(generateImage).toHaveBeenCalledTimes(1);
  });

  it('fails before provider execution when the exact credential disappears', async () => {
    const generateImage = vi.fn(async (): Promise<MediaAdapterResult> => ({
      status: 'completed',
      outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
    }));
    getMediaAdapterRegistry().registerBuiltin('runway', createAdapter({ generateImage }));
    const executor = new MediaGenerationExecutor(createConfig(), {
      resolveProvider: async () => undefined,
    });

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: provider.id,
        modelId: model.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow(`Provider or model not found: ${provider.id}/${model.id}`);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('re-resolves the exact provider between routing and linked execution', async () => {
    const generateImage = vi.fn(async (): Promise<MediaAdapterResult> => ({
      status: 'completed',
      outputs: [{ type: 'image', url: 'https://example.test/generated.png' }],
    }));
    getMediaAdapterRegistry().registerBuiltin('runway', createAdapter({ generateImage }));
    let resolution = 0;
    const providerResolver = {
      resolveProvider: vi.fn(async () => (++resolution === 1 ? provider : undefined)),
    };
    const config = createConfig();
    const service = new MediaGenerationService(
      config,
      new MediaRoutingManager(config, providerResolver),
      new MediaGenerationExecutor(config, providerResolver),
    );

    await expect(
      service.generateImage({
        prompt: 'cat',
        providerId: provider.id,
        modelId: model.id,
      }),
    ).rejects.toThrow(`Provider or model not found: ${provider.id}/${model.id}`);
    expect(providerResolver.resolveProvider).toHaveBeenNthCalledWith(1, provider.id);
    expect(providerResolver.resolveProvider).toHaveBeenNthCalledWith(2, provider.id);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('re-resolves the provider for external-task observation and cancellation', async () => {
    const getTaskStatus = vi.fn(async (): Promise<MediaAdapterResult> => ({
      status: 'processing',
      progress: 25,
    }));
    const cancelTask = vi.fn(async () => undefined);
    getMediaAdapterRegistry().registerBuiltin(
      'runway',
      createAdapter({ getTaskStatus, cancelTask }),
    );
    let currentProvider: Provider | undefined = provider;
    const providerResolver = {
      resolveProvider: vi.fn(async () => currentProvider),
    };
    const executor = new MediaGenerationExecutor(createConfig(), providerResolver);

    await expect(
      executor.describeExternalTask({
        providerId: provider.id,
        externalTaskId: 'external-1',
      }),
    ).resolves.toMatchObject({ status: 'processing', progress: 25 });
    expect(getTaskStatus).toHaveBeenCalledWith('external-1', provider);

    currentProvider = undefined;
    await expect(
      executor.cancelExternalTask({
        providerId: provider.id,
        externalTaskId: 'external-1',
      }),
    ).rejects.toThrow(`Configured media provider ${provider.id} is unavailable.`);
    expect(providerResolver.resolveProvider).toHaveBeenCalledTimes(2);
    expect(cancelTask).not.toHaveBeenCalled();
  });
});

function createConfig(): MediaGenerationConfigPort {
  return {
    getProvider: (id: string) =>
      id === provider.id ? { ...provider, apiKey: undefined } : undefined,
    getModel: (id: string) => (id === model.id ? model : undefined),
    getDefaultModelRef: () => undefined,
  };
}

function createProviderResolver() {
  return {
    resolveProvider: async (providerId: string) =>
      providerId === provider.id ? provider : undefined,
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
