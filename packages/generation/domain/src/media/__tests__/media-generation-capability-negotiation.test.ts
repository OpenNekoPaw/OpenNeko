import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator } from '@neko/content-domain';
import { MediaGenerationExecutor } from '../media-generation-executor';
import { MediaGenerationService } from '../media-generation-service';
import { MediaRoutingManager } from '../routing/media-routing-manager';
import type {
  MediaGenerationConfigPort,
  MediaModel as Model,
  MediaProvider as Provider,
} from '../types';

const baseProvider: Provider = {
  id: 'provider',
  name: 'provider',
  displayName: 'Provider',
  type: 'generic',
  apiUrl: 'https://example.test',
  apiKey: 'test-key',
  enabled: true,
};

describe('MediaGenerationService capability negotiation', () => {
  it('rejects unsupported keyframe controls before linked execution', async () => {
    const harness = createService({ ...baseProvider, type: 'runway' });

    await expect(harness.service.generateVideo(keyframeRequest(harness.provider))).rejects.toThrow(
      'Media provider capability negotiation failed',
    );
    expect(harness.executeLinked).not.toHaveBeenCalled();
  });

  it('passes supported keyframe controls to linked execution', async () => {
    const harness = createService({ ...baseProvider, type: 'bytedance' });
    const request = keyframeRequest(harness.provider);

    await expect(harness.service.generateVideo(request)).resolves.toMatchObject({
      type: 'image-to-video',
      outputs: [{ type: 'video', url: 'https://example.test/video.mp4' }],
    });
    expect(harness.executeLinked).toHaveBeenCalledWith(
      expect.objectContaining({
        generationType: 'image-to-video',
        providerId: harness.provider.id,
        modelId: harness.model.id,
        request,
      }),
    );
  });

  it('rejects parameters outside the selected model profile before linked execution', async () => {
    const harness = createService(
      { ...baseProvider, type: 'minimax' },
      { modelName: 'MiniMax-H3' },
    );

    await expect(
      harness.service.generateVideo({
        prompt: 'A cat waving at the camera',
        providerId: harness.provider.id,
        modelId: harness.model.id,
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
        fps: 24,
      }),
    ).rejects.toThrow('Selected generation model rejects parameter resolution');
    expect(harness.executeLinked).not.toHaveBeenCalled();
  });

  it('passes parameters accepted by the selected model profile', async () => {
    const harness = createService(
      { ...baseProvider, type: 'minimax' },
      { modelName: 'MiniMax-H3' },
    );
    const request = {
      prompt: 'A cat waving at the camera',
      providerId: harness.provider.id,
      modelId: harness.model.id,
      aspectRatio: '16:9',
      resolution: '768P',
      duration: 5,
    };

    await expect(harness.service.generateVideo(request)).resolves.toMatchObject({
      type: 'text-to-video',
    });
    expect(harness.executeLinked).toHaveBeenCalledWith(expect.objectContaining({ request }));
  });
});

function createService(providerInput: Provider, options: { readonly modelName?: string } = {}) {
  const provider = { ...providerInput, id: `${providerInput.type}-provider` };
  const model: Model = {
    id: `${provider.id}-video`,
    name: options.modelName ?? `${provider.id}-video`,
    displayName: 'Video model',
    providerId: provider.id,
    type: 'video',
    capabilities: ['image_to_video'],
    enabled: true,
  };
  const config = createReadOnlyConfig(provider, model);
  const providerResolver = {
    resolveProvider: async (providerId: string) =>
      providerId === provider.id ? provider : undefined,
  };
  const routing = new MediaRoutingManager(config, providerResolver);
  const executor = new MediaGenerationExecutor(config, providerResolver);
  const executeLinked = vi.spyOn(executor, 'executeLinked').mockResolvedValue({
    outputs: [{ type: 'video', url: 'https://example.test/video.mp4' }],
  });
  return {
    provider,
    model,
    executeLinked,
    service: new MediaGenerationService(config, routing, executor),
  };
}

function createReadOnlyConfig(provider: Provider, model: Model): MediaGenerationConfigPort {
  return {
    getProvider: (id) => (id === provider.id ? provider : undefined),
    getModel: (id) => (id === model.id ? model : undefined),
    getDefaultModelRef: () => ({ providerId: provider.id, modelId: model.id }),
  };
}

function keyframeRequest(provider: Provider) {
  return {
    operation: 'generate-from-keyframes' as const,
    prompt: 'Move from dawn to dusk',
    inputs: [
      {
        type: 'image' as const,
        role: 'first-frame' as const,
        locator: workspaceLocator('assets/first-frame.png'),
      },
      {
        type: 'image' as const,
        role: 'last-frame' as const,
        locator: workspaceLocator('assets/last-frame.png'),
      },
    ],
    providerId: provider.id,
    modelId: `${provider.id}-video`,
  };
}

function workspaceLocator(path: string): ContentLocator {
  return {
    file: { authority: 'workspace', path },
  };
}
