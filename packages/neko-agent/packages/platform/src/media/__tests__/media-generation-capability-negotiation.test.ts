import { describe, expect, it, vi } from 'vitest';
import type { ITaskManager, ResourceRef, TaskInput } from '@neko/shared';
import { ConfigManager } from '../../config/config-manager';
import type { Provider } from '../../types/provider';
import { MediaGenerationService } from '../media-generation-service';
import { MediaRoutingManager } from '../routing/media-routing-manager';

function createResourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `assets/${id.replaceAll(':', '-')}` },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}

function createService(provider: Provider) {
  const configManager = {
    getProvider: (providerId: string) => (providerId === provider.id ? provider : undefined),
  } as unknown as ConfigManager;
  const routingManager = {
    selectProvider: vi.fn().mockResolvedValue({
      providerId: provider.id,
      modelId: `${provider.id}-video-model`,
      score: 100,
      reason: 'explicit provider selection',
    }),
  } as unknown as MediaRoutingManager;
  const submit = vi.fn<(input: TaskInput) => Promise<string>>().mockResolvedValue('task-1');
  const taskManager = { submit } as unknown as ITaskManager;

  return {
    service: new MediaGenerationService(taskManager, configManager, routingManager),
    submit,
  };
}

const baseProvider: Provider = {
  id: 'provider',
  name: 'provider',
  displayName: 'Provider',
  type: 'generic',
  apiUrl: 'https://example.com',
  apiKey: 'test-key',
  enabled: true,
};

const OWNER_METADATA = { conversationId: 'conv-1', runId: 'run-1' } as const;

describe('MediaGenerationService capability negotiation', () => {
  it('rejects unsupported keyframe controls before submitting a provider task', async () => {
    const provider: Provider = {
      ...baseProvider,
      id: 'runway-provider',
      name: 'runway',
      displayName: 'Runway',
      type: 'runway',
    };
    const { service, submit } = createService(provider);

    await expect(
      service.generateVideo({
        operation: 'generate-from-keyframes',
        prompt: 'Move from dawn to dusk',
        startFrameRef: createResourceRef('asset:image:first-frame'),
        endFrameRef: createResourceRef('asset:image:last-frame'),
        providerId: provider.id,
        modelId: `${provider.id}-video-model`,
      }),
    ).rejects.toThrow('Media provider capability negotiation failed');
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits stable keyframe controls when the provider declares support', async () => {
    const provider: Provider = {
      ...baseProvider,
      id: 'dashscope-provider',
      name: 'dashscope',
      displayName: 'DashScope',
      type: 'dashscope',
    };
    const { service, submit } = createService(provider);
    const startFrameRef = createResourceRef('asset:image:first-frame');
    const endFrameRef = createResourceRef('asset:image:last-frame');

    await expect(
      service.generateVideo({
        operation: 'generate-from-keyframes',
        prompt: 'Move from dawn to dusk',
        startFrameRef,
        endFrameRef,
        duration: 5,
        aspectRatio: '16:9',
        providerId: provider.id,
        modelId: `${provider.id}-video-model`,
        metadata: OWNER_METADATA,
      }),
    ).resolves.toMatchObject({ type: 'image-to-video' });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0].payload).toMatchObject({
      request: {
        operation: 'generate-from-keyframes',
        startFrameRef,
        endFrameRef,
        metadata: OWNER_METADATA,
      },
    });
  });
});
