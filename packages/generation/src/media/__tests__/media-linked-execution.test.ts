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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('persists an AI SDK video task checkpoint before the first status query', async () => {
    const h3Provider: Provider = {
      ...provider,
      id: 'minimax-provider',
      type: 'minimax',
      apiUrl: 'https://api.minimaxi.com/v2',
    };
    const h3Model: Model = {
      ...model,
      id: 'h3-model',
      name: 'MiniMax-H3',
      providerId: h3Provider.id,
      capabilities: ['text_to_video'],
    };
    let checkpointPersisted = false;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/v2/video_generation')) {
        return new Response(JSON.stringify({ task_id: 'h3-task-1' }), { status: 200 });
      }
      if (url.endsWith('/v2/query/video_generation/h3-task-1')) {
        if (!checkpointPersisted) throw new Error('status queried before checkpoint persistence');
        return new Response(
          JSON.stringify({
            task: {
              id: 'h3-task-1',
              model: 'MiniMax-H3',
              status: 'succeeded',
              content: { url: 'https://cdn.example/output.mp4' },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const config: MediaGenerationConfigPort = {
      getProvider: (id) => (id === h3Provider.id ? h3Provider : undefined),
      getModel: (id) => (id === h3Model.id ? h3Model : undefined),
      getDefaultModelRef: () => ({ providerId: h3Provider.id, modelId: h3Model.id }),
    };
    const executor = new MediaGenerationExecutor(
      config,
      { resolveProvider: async (id) => (id === h3Provider.id ? h3Provider : undefined) },
      { pollingIntervalMs: 1, maxPollingAttempts: 2 },
    );

    await expect(
      executor.executeLinked({
        generationType: 'text-to-video',
        providerId: h3Provider.id,
        modelId: h3Model.id,
        request: {
          prompt: 'cinematic cat',
          duration: 5,
          resolution: '2K',
          aspectRatio: '16:9',
        },
        onExternalTask: async (taskId) => {
          expect(taskId).toBe('h3-task-1');
          checkpointPersisted = true;
        },
      }),
    ).resolves.toEqual({
      outputs: [{ type: 'video', url: 'https://cdn.example/output.mp4', mimeType: 'video/mp4' }],
      metadata: { providerResolutionSource: 'native' },
    });
    expect(checkpointPersisted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps canonical frame and audio roles into the official Seedance task request', async () => {
    const seedanceProvider: Provider = {
      ...provider,
      id: 'bytedance-provider',
      type: 'bytedance',
      apiUrl: 'https://ark.example/api/v3',
    };
    const seedanceModel: Model = {
      ...model,
      id: 'seedance-model',
      name: 'doubao-seedance-2-0-260128',
      providerId: seedanceProvider.id,
      capabilities: ['text_to_video'],
    };
    let submittedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: 'seedance-task-1' }), { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const config: MediaGenerationConfigPort = {
      getProvider: (id) => (id === seedanceProvider.id ? seedanceProvider : undefined),
      getModel: (id) => (id === seedanceModel.id ? seedanceModel : undefined),
      getDefaultModelRef: () => ({
        providerId: seedanceProvider.id,
        modelId: seedanceModel.id,
      }),
    };
    const executor = new MediaGenerationExecutor(
      config,
      {
        resolveProvider: async (id) => (id === seedanceProvider.id ? seedanceProvider : undefined),
      },
      {
        requestAssetMaterializer: {
          readAsBase64: async () => '',
          resolveAsUrl: async (locator) => `https://assets.example/${locator.file.path}`,
        },
      },
    );

    await expect(
      executor.executeLinked({
        generationType: 'image-to-video',
        providerId: seedanceProvider.id,
        modelId: seedanceModel.id,
        request: {
          prompt: 'animate the portrait',
          duration: 5,
          resolution: '1920x1080',
          aspectRatio: '16:9',
          generateAudio: true,
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: { file: { authority: 'workspace', path: 'frames/first.png' } },
              mimeType: 'image/png',
            },
            {
              type: 'image',
              role: 'last-frame',
              locator: { file: { authority: 'workspace', path: 'frames/last.png' } },
              mimeType: 'image/png',
            },
            {
              type: 'audio',
              role: 'reference-audio',
              locator: { file: { authority: 'workspace', path: 'audio/voice.mp3' } },
              mimeType: 'audio/mpeg',
            },
          ],
        },
        onExternalTask: async (taskId) => {
          expect(taskId).toBe('seedance-task-1');
          return {
            status: 'completed',
            outputs: [{ type: 'video', url: 'https://cdn.example/seedance.mp4' }],
          };
        },
      }),
    ).resolves.toEqual({
      outputs: [{ type: 'video', url: 'https://cdn.example/seedance.mp4' }],
      metadata: { providerResolutionSource: 'native' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submittedBody).toEqual({
      model: seedanceModel.name,
      content: [
        { type: 'text', text: 'animate the portrait' },
        {
          type: 'image_url',
          image_url: { url: 'https://assets.example/frames/first.png' },
          role: 'first_frame',
        },
        {
          type: 'image_url',
          image_url: { url: 'https://assets.example/frames/last.png' },
          role: 'last_frame',
        },
        {
          type: 'audio_url',
          audio_url: { url: 'https://assets.example/audio/voice.mp3' },
          role: 'reference_audio',
        },
      ],
      ratio: '16:9',
      duration: 5,
      resolution: '1080p',
      generate_audio: true,
    });
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
        modelId: model.id,
        externalTaskId: 'external-1',
      }),
    ).resolves.toMatchObject({ status: 'processing', progress: 25 });
    expect(getTaskStatus).toHaveBeenCalledWith('external-1', provider);

    currentProvider = undefined;
    await expect(
      executor.cancelExternalTask({
        providerId: provider.id,
        modelId: model.id,
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
