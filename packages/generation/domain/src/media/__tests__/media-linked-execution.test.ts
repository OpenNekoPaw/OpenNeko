import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MediaGenerationConfigPort,
  MediaModel as Model,
  MediaProvider as Provider,
} from '../types';
import { MediaGenerationExecutor } from '../media-generation-executor';

const unsupportedProvider: Provider = {
  id: 'unsupported-provider',
  name: 'Unsupported Provider',
  displayName: 'Unsupported Provider',
  type: 'runway',
  apiUrl: 'https://example.test',
  apiKey: 'test-key',
  enabled: true,
};

const unsupportedModel: Model = {
  id: 'unsupported-image',
  name: 'unsupported-image',
  displayName: 'Unsupported Image',
  providerId: unsupportedProvider.id,
  type: 'image',
  capabilities: ['text_to_image'],
  enabled: true,
};

describe('MediaGenerationExecutor linked execution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fails visibly when the selected provider has no AI SDK model contract', async () => {
    const executor = new MediaGenerationExecutor(
      createConfig(unsupportedProvider, unsupportedModel),
      createProviderResolver(unsupportedProvider),
    );

    await expect(
      executor.executeLinked({
        generationType: 'text-to-image',
        providerId: unsupportedProvider.id,
        modelId: unsupportedModel.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow('No owning media runtime is registered for provider type "runway".');
  });

  it('rejects unverified NewAPI video before provider submission', async () => {
    const newApiProvider: Provider = {
      ...unsupportedProvider,
      id: 'newapi-provider',
      type: 'newapi',
    };
    const newApiVideoModel: Model = {
      ...unsupportedModel,
      id: 'newapi-video',
      name: 'unverified-video-model',
      providerId: newApiProvider.id,
      type: 'video',
      capabilities: ['text_to_video'],
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const executor = new MediaGenerationExecutor(
      createConfig(newApiProvider, newApiVideoModel),
      createProviderResolver(newApiProvider),
    );

    await expect(
      executor.executeLinked({
        generationType: 'text-to-video',
        providerId: newApiProvider.id,
        modelId: newApiVideoModel.id,
        request: { prompt: 'cat' },
      }),
    ).rejects.toThrow('Provider newapi does not expose an AI SDK video model runtime.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('executes image-edit through the AI SDK image edit contract', async () => {
    const provider: Provider = {
      ...unsupportedProvider,
      id: 'newapi-provider',
      type: 'newapi',
      apiUrl: 'https://www.nekoapi.com',
    };
    const model: Model = {
      ...unsupportedModel,
      id: 'image-edit-model',
      name: 'gpt-image-2',
      providerId: provider.id,
      capabilities: ['image.generate', 'image.edit'],
    };
    let submittedForm: FormData | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        submittedForm = init?.body as FormData;
        return new Response(
          JSON.stringify({
            created: 0,
            data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const executor = new MediaGenerationExecutor(
      createConfig(provider, model),
      createProviderResolver(provider),
      {
        requestAssetMaterializer: {
          readAsBase64: async () => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        },
      },
    );

    await expect(
      executor.executeLinked({
        generationType: 'image-edit',
        providerId: provider.id,
        modelId: model.id,
        request: {
          prompt: 'A portrait',
          operation: 'edit',
          editInstruction: 'Change the background to blue',
          referenceImageLocator: {
            file: { authority: 'workspace', path: 'references/source.png' },
          },
        },
      }),
    ).resolves.toMatchObject({
      outputs: [{ type: 'image', mimeType: 'image/png' }],
      metadata: { providerResolutionSource: 'ai-sdk' },
    });
    expect(submittedForm).toBeInstanceOf(FormData);
    expect(submittedForm?.getAll('image')).toHaveLength(1);
    expect(submittedForm?.get('prompt')).toBe('A portrait\n\nChange the background to blue');
  });

  it('executes video-edit through the AI SDK task lifecycle with the reference video', async () => {
    const provider: Provider = {
      ...unsupportedProvider,
      id: 'minimax-provider',
      type: 'minimax',
      apiUrl: 'https://api.minimaxi.com/v2',
    };
    const model: Model = {
      ...unsupportedModel,
      id: 'h3-model',
      name: 'MiniMax-H3',
      providerId: provider.id,
      type: 'video',
      capabilities: ['video.generate', 'video_to_video', 'video_edit'],
    };
    let submittedBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ task_id: 'h3-edit-task' }), { status: 200 });
      }),
    );
    const executor = new MediaGenerationExecutor(
      createConfig(provider, model),
      createProviderResolver(provider),
      {
        requestAssetMaterializer: {
          readAsBase64: async () => '',
          resolveAsUrl: async () => 'https://assets.example/source.mp4',
        },
      },
    );

    await expect(
      executor.executeLinked({
        generationType: 'video-edit',
        providerId: provider.id,
        modelId: model.id,
        request: {
          prompt: 'Restyle this clip',
          operation: 'transform',
          editInstruction: 'Use a watercolor look',
          duration: 5,
          resolution: '768P',
          inputs: [
            {
              type: 'video',
              role: 'reference-video',
              locator: { file: { authority: 'workspace', path: 'videos/source.mp4' } },
              mimeType: 'video/mp4',
            },
          ],
        },
        onExternalTask: async () => ({
          status: 'completed',
          outputs: [{ type: 'video', url: 'https://cdn.example/edited.mp4' }],
        }),
      }),
    ).resolves.toEqual({
      outputs: [{ type: 'video', url: 'https://cdn.example/edited.mp4' }],
      metadata: { providerResolutionSource: 'ai-sdk' },
    });
    expect(submittedBody).toMatchObject({
      content: [
        { type: 'text', text: 'Restyle this clip\n\nUse a watercolor look' },
        {
          type: 'video_url',
          video_url: { url: 'https://assets.example/source.mp4' },
          role: 'reference_video',
        },
      ],
    });
  });

  it('submits one MiniMax first frame through the AI SDK image-to-video path', async () => {
    const provider: Provider = {
      ...unsupportedProvider,
      id: 'minimax-provider',
      type: 'minimax',
      apiUrl: 'https://api.minimaxi.com/v2',
    };
    const model: Model = {
      ...unsupportedModel,
      id: 'h3-model',
      name: 'MiniMax-H3',
      providerId: provider.id,
      type: 'video',
      capabilities: ['video.generate', 'image_to_video'],
    };
    let submittedBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ task_id: 'h3-image-task' }), { status: 200 });
      }),
    );
    const executor = new MediaGenerationExecutor(
      createConfig(provider, model),
      createProviderResolver(provider),
      {
        requestAssetMaterializer: {
          readAsBase64: async () => '',
          resolveAsUrl: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        },
      },
    );

    await expect(
      executor.executeLinked({
        generationType: 'image-to-video',
        providerId: provider.id,
        modelId: model.id,
        request: {
          prompt: 'A slow upward push',
          operation: 'generate-from-image',
          duration: 6,
          resolution: '768P',
          aspectRatio: '16:9',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: { file: { authority: 'workspace', path: 'frames/first.png' } },
              mimeType: 'image/png',
            },
          ],
        },
        onExternalTask: async () => ({
          status: 'completed',
          outputs: [{ type: 'video', url: 'https://cdn.example/output.mp4' }],
        }),
      }),
    ).resolves.toEqual({
      outputs: [{ type: 'video', url: 'https://cdn.example/output.mp4' }],
      metadata: { providerResolutionSource: 'ai-sdk' },
    });
    expect(submittedBody).toMatchObject({
      model: 'MiniMax-H3',
      resolution: '768P',
      duration: 6,
      ratio: 'adaptive',
    });
    const content = submittedBody?.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw new Error('MiniMax request content was not an array.');
    expect(
      content.filter(
        (entry: unknown) =>
          typeof entry === 'object' &&
          entry !== null &&
          'role' in entry &&
          entry.role === 'first_frame',
      ),
    ).toHaveLength(1);
  });

  it('persists an AI SDK video task checkpoint before the first status query', async () => {
    const h3Provider: Provider = {
      ...unsupportedProvider,
      id: 'minimax-provider',
      type: 'minimax',
      apiUrl: 'https://api.minimaxi.com/v2',
    };
    const h3Model: Model = {
      ...unsupportedModel,
      id: 'h3-model',
      name: 'MiniMax-H3',
      providerId: h3Provider.id,
      type: 'video',
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
    const executor = new MediaGenerationExecutor(
      createConfig(h3Provider, h3Model),
      createProviderResolver(h3Provider),
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
      metadata: { providerResolutionSource: 'ai-sdk' },
    });
    expect(checkpointPersisted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps canonical frame and audio roles into the official Seedance task request', async () => {
    const seedanceProvider: Provider = {
      ...unsupportedProvider,
      id: 'bytedance-provider',
      type: 'bytedance',
      apiUrl: 'https://ark.example/api/v3',
    };
    const seedanceModel: Model = {
      ...unsupportedModel,
      id: 'seedance-model',
      name: 'doubao-seedance-2-0-260128',
      providerId: seedanceProvider.id,
      type: 'video',
      capabilities: ['text_to_video'],
    };
    let submittedBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: 'seedance-task-1' }), { status: 200 });
      }),
    );
    const executor = new MediaGenerationExecutor(
      createConfig(seedanceProvider, seedanceModel),
      createProviderResolver(seedanceProvider),
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
      metadata: { providerResolutionSource: 'ai-sdk' },
    });
    expect(submittedBody).toMatchObject({
      model: seedanceModel.name,
      ratio: '16:9',
      duration: 5,
      resolution: '1080p',
      generate_audio: true,
    });
  });
});

function createConfig(selectedProvider: Provider, selectedModel: Model): MediaGenerationConfigPort {
  return {
    getProvider: (id) =>
      id === selectedProvider.id ? { ...selectedProvider, apiKey: undefined } : undefined,
    getModel: (id) => (id === selectedModel.id ? selectedModel : undefined),
    getDefaultModelRef: () => ({
      providerId: selectedProvider.id,
      modelId: selectedModel.id,
    }),
  };
}

function createProviderResolver(selectedProvider: Provider) {
  return {
    resolveProvider: async (providerId: string) =>
      providerId === selectedProvider.id ? selectedProvider : undefined,
  };
}
