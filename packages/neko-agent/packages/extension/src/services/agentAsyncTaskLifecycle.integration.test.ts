import { describe, expect, it, vi } from 'vitest';
import { MemoryTaskRecoveryStorage, MemoryTaskStorage, TaskManager } from '@neko/agent';
import type { TaskRunScope } from '@neko/shared';
import type { TaskProjection } from '@neko/shared/types/task-projection';
import type { ConfigManager } from '@neko/platform';
import type { Model, Provider } from '@neko/platform';
import type { MediaAdapter, MediaAdapterResult } from '@neko/platform';
import { createMediaTaskInput, MediaTaskExecutor } from '@neko/platform/media/media-task-executor';
import { getMediaAdapterRegistry } from '@neko/platform/media/adapters/media-adapter-registry';
import { TaskDeliveryBridge } from './taskDeliveryBridge';

describe('agent async task lifecycle integration', () => {
  it('recovers external wait task and replays the visible Chat task projection', async () => {
    const storage = new MemoryTaskStorage();
    const recoveryStorage = new MemoryTaskRecoveryStorage();
    const adapter = createAdapter();

    const firstManager = createManager(storage, recoveryStorage, adapter);
    const taskScope = await firstManager.submit(
      createMediaTaskInput('text-to-video', 'provider-1', 'model-1', { prompt: 'cat' }),
      { conversationId: 'conv-1', runId: 'run-1', parentRunId: 'run-1' },
    );
    const taskId = taskScope.childRunId;

    await waitForRecoveryInfo(recoveryStorage, taskScope);
    await firstManager.dispose();

    const secondManager = createManager(storage, recoveryStorage, adapter);
    const recoveryExecutor = new MediaTaskExecutor(createConfigManager());
    await secondManager.initialize();
    await expect(recoveryExecutor.resumeFromRecovery(secondManager)).resolves.toBe(0);
    await expect(secondManager.resumePendingTasks()).resolves.toEqual([]);

    expect(adapter.generateVideo).toHaveBeenCalledTimes(1);
    expect(adapter.getTaskStatus).toHaveBeenCalledWith(
      'external-resume',
      expect.objectContaining({ id: 'provider-1' }),
    );

    const recoveredTask = await secondManager.get(taskScope);
    expect(recoveredTask?.status).toBe('completed');

    const taskProjection = toTaskProjection(recoveredTask!);
    const projectionSource = {
      getSnapshot: vi.fn(async () => [taskProjection]),
    };
    const posted: unknown[] = [];
    const bridge = new TaskDeliveryBridge({
      projectionSource,
      cursorStorage: {
        load: () => undefined,
        save: vi.fn(),
      },
    });

    await expect(
      bridge.replayConversation('conv-1', {
        postMessage: (message) => {
          posted.push(message);
          return true;
        },
      }),
    ).resolves.toBe(1);

    expect(posted).toEqual([
      expect.objectContaining({
        type: 'taskDeliveryReplay',
        conversationId: 'conv-1',
        task: expect.objectContaining({
          sourceTaskId: taskId,
          status: 'done',
          outputs: [{ kind: 'url', ref: 'https://example.test/recovered.mp4' }],
        }),
      }),
    ]);
    await expect(projectionSource.getSnapshot()).resolves.toEqual([
      expect.objectContaining({ sourceTaskId: taskId, status: 'done' }),
    ]);
  });
});

function createManager(
  storage: MemoryTaskStorage,
  recoveryStorage: MemoryTaskRecoveryStorage,
  adapter: MediaAdapter,
): TaskManager {
  const manager = new TaskManager({
    storage,
    recoveryStorage,
    cleanupIntervalMs: 0,
  });
  const executor = new MediaTaskExecutor(createConfigManager());
  getMediaAdapterRegistry().register('integration-provider', adapter);
  executor.registerWith(manager);
  return manager;
}

function createConfigManager(): ConfigManager {
  const provider: Provider = {
    id: 'provider-1',
    name: 'Provider',
    displayName: 'Provider',
    type: 'integration-provider' as Provider['type'],
    apiUrl: 'https://example.test',
    apiKey: 'key',
    enabled: true,
  };
  const model: Model = {
    id: 'model-1',
    name: 'model-1',
    displayName: 'Model',
    providerId: 'provider-1',
    capabilities: ['text_to_video'],
    enabled: true,
  };
  return {
    getProvider: () => provider,
    getModel: () => model,
  } as unknown as ConfigManager;
}

function createAdapter(): MediaAdapter {
  const statusResults: MediaAdapterResult[] = [
    {
      status: 'completed',
      progress: 100,
      outputs: [{ type: 'video', url: 'https://example.test/recovered.mp4' }],
    },
  ];
  return {
    type: 'integration-provider',
    getSupportedTypes: () => ['text-to-video'],
    supportsType: () => true,
    generateImage: async () => ({ status: 'failed' }),
    generateVideo: vi.fn(async (): Promise<MediaAdapterResult> => ({
      externalTaskId: 'external-resume',
      status: 'processing',
    })),
    generateAudio: async () => ({ status: 'failed' }),
    getTaskStatus: vi.fn(async () => statusResults.shift() ?? { status: 'processing' }),
    cancelTask: vi.fn(async () => undefined),
  };
}

async function waitForRecoveryInfo(
  recoveryStorage: MemoryTaskRecoveryStorage,
  scope: TaskRunScope,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const info = await recoveryStorage.load(scope);
    if (info) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for recovery info');
}

function toTaskProjection(
  task: NonNullable<Awaited<ReturnType<TaskManager['get']>>>,
): TaskProjection {
  const outputs =
    task.output?.data && typeof task.output.data === 'object'
      ? ((task.output.data as { outputs?: Array<{ url: string }> }).outputs ?? [])
      : [];
  return {
    taskId: `neko-agent:${task.id}`,
    source: 'neko-agent',
    sourceTaskId: task.id,
    kind: 'media-task',
    title: 'Recovered media task',
    status: 'done',
    progress: 100,
    actions: [],
    startedAt: task.createdAt,
    completedAt: task.updatedAt,
    conversationId: 'conv-1',
    outputs: outputs.map((output) => ({ kind: 'url', ref: output.url })),
  };
}
