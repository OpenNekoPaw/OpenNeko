import { describe, expect, it, vi } from 'vitest';
import type { ResourceRef } from '@neko/shared';
import { ConfigManager } from '../../config/config-manager';
import type { IUserConfigManager, UserConfig } from '../../config/user-config';
import type { Model, Provider } from '../../types/provider';
import { MediaGenerationExecutor } from '../media-generation-executor';
import { MediaGenerationService } from '../media-generation-service';
import { MediaRoutingManager } from '../routing/media-routing-manager';

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
    const harness = createService({ ...baseProvider, type: 'dashscope' });
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
});

function createService(providerInput: Provider) {
  const provider = { ...providerInput, id: `${providerInput.type}-provider` };
  const model: Model = {
    id: `${provider.id}-video`,
    name: `${provider.id}-video`,
    displayName: 'Video model',
    providerId: provider.id,
    capabilities: ['image_to_video'],
    enabled: true,
  };
  const config = new ConfigManager({
    userConfigManager: createReadOnlyUserConfigManager(provider, model),
  });
  const routing = new MediaRoutingManager(config);
  const executor = new MediaGenerationExecutor(config);
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

function createReadOnlyUserConfigManager(provider: Provider, model: Model): IUserConfigManager {
  const config = {
    providers: [provider],
    models: [model],
    mcpServers: [],
    providerOverrides: {},
    modelOverrides: {},
    mcpServerOverrides: {},
  } satisfies UserConfig;
  const rejectMutation = async (): Promise<never> => {
    throw new Error('Capability negotiation test config is read-only.');
  };

  return {
    load: () => config,
    loadRaw: () => config,
    loadRawResult: () => ({
      status: 'ok',
      filePath: '<capability-negotiation-test>',
      config,
    }),
    save: rejectMutation,
    updateProviderOverride: rejectMutation,
    addProvider: rejectMutation,
    removeProvider: rejectMutation,
    addModel: rejectMutation,
    removeModel: rejectMutation,
    updateMCPServerOverride: rejectMutation,
    addMCPServer: rejectMutation,
    removeMCPServer: rejectMutation,
    clear: rejectMutation,
    updateScalar: rejectMutation,
    updateScalars: rejectMutation,
    reload: () => {},
  };
}

function keyframeRequest(provider: Provider) {
  return {
    operation: 'generate-from-keyframes' as const,
    prompt: 'Move from dawn to dusk',
    startFrameRef: resourceRef('first-frame'),
    endFrameRef: resourceRef('last-frame'),
    providerId: provider.id,
    modelId: `${provider.id}-video`,
  };
}

function resourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `assets/${id}.png` },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}
