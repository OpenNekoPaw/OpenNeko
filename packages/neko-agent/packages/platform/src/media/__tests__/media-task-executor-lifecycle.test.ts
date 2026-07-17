import { describe, expect, it, vi } from 'vitest';
import { MemoryTaskRecoveryStorage, MemoryTaskStorage, TaskManager } from '@neko/agent';
import type { TaskLifecycleMetadata, TaskRunScope } from '@neko/shared';
import type { ConfigManager } from '../../config/config-manager';
import type { Provider, Model } from '../../types/provider';
import type { MediaAdapter, MediaAdapterResult } from '../types';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { createMediaTaskInput, MediaTaskExecutor } from '../media-task-executor';

const OWNER = {
  conversationId: 'conv-1',
  runId: 'run-1',
  parentRunId: 'run-1',
} as const;

function taskScope(childRunId: string): TaskRunScope {
  return { ...OWNER, childRunId, childKind: 'task' };
}

describe('MediaTaskExecutor lifecycle reporting', () => {
  it('projects Agent task ownership and result delivery policy from media request metadata', () => {
    const input = createMediaTaskInput('text-to-image', 'provider-1', 'model-1', {
      prompt: 'cat',
      metadata: {
        conversationId: 'conv-1',
        runId: 'run-1',
        runStartedAt: 101,
        resultDeliveryPolicy: { kind: 'auto-resume-agent' },
      },
    });

    expect(input.lifecycle).toMatchObject({
      ownerConversationId: 'conv-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      resultDeliveryPolicy: { kind: 'auto-resume-agent' },
    });
  });

  it('fails visibly for unknown media task result delivery policies', () => {
    expect(() =>
      createMediaTaskInput('text-to-image', 'provider-1', 'model-1', {
        prompt: 'cat',
        metadata: {
          resultDeliveryPolicy: { kind: 'unknown-policy' },
        },
      }),
    ).toThrow('Unknown media task result delivery policy');
  });

  it('writes recovery info before reporting external wait', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        adapter: createAdapter({
          generateImage: async () => ({
            externalTaskId: 'external-1',
            status: 'processing',
          }),
          statuses: [
            { status: 'processing', progress: 40 },
            {
              status: 'completed',
              progress: 100,
              outputs: [{ type: 'image', url: PNG_BASE64 }],
            },
          ],
        }),
      });
      const saveRecoveryInfo = vi.spyOn(harness.manager, 'saveRecoveryInfo');
      const lifecycleReports: string[] = [];
      const originalUpdateLifecycle = harness.manager.updateLifecycle.bind(harness.manager);
      vi.spyOn(harness.manager, 'updateLifecycle').mockImplementation(
        async (scope: TaskRunScope, lifecycle: Partial<TaskLifecycleMetadata>) => {
          if (lifecycle.costPhase === 'external-wait') {
            expect(saveRecoveryInfo).toHaveBeenCalledWith(scope, 'external-1', 'provider-1');
          }
          if (lifecycle.costPhase) {
            lifecycleReports.push(lifecycle.costPhase);
          }
          return originalUpdateLifecycle(scope, lifecycle);
        },
      );

      const taskId = await harness.manager.submit(
        createMediaTaskInput('text-to-image', 'provider-1', 'model-1', { prompt: 'cat' }),
        OWNER,
      );
      const waiter = harness.manager.waitForCompletion(taskId, 30000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(6000);
      const task = await waiter;

      expect(task.status).toBe('completed');
      expect(lifecycleReports).toEqual(['token-active', 'external-wait', 'local-finalize']);
      await expect(harness.recoveryStorage.load(taskId)).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks completed owning-adapter outputs with provider resolution metadata', async () => {
    const harness = createHarness({
      adapter: createAdapter({
        generateImage: async () => ({
          status: 'completed',
          outputs: [{ type: 'image', url: PNG_BASE64 }],
          metadata: { providerResolutionSource: 'spoofed-source' },
        }),
        statuses: [],
      }),
    });

    const taskId = await harness.manager.submit(
      createMediaTaskInput('text-to-image', 'provider-1', 'model-1', { prompt: 'cat' }),
      OWNER,
    );
    const task = await harness.manager.waitForCompletion(taskId, 30000);

    expect(task.status).toBe('completed');
    expect(task.output?.data).toMatchObject({
      metadata: { providerResolutionSource: 'media-adapter' },
    });
  });

  it('does not fall back from a native provider runtime to a registered media adapter', async () => {
    const adapter = createAdapter({
      generateVideo: vi.fn(async (): Promise<MediaAdapterResult> => ({
        status: 'completed',
        outputs: [{ type: 'video', url: 'https://example.test/video.mp4' }],
      })),
      statuses: [],
    });
    const harness = createHarness({
      adapter,
      providerType: 'openai',
    });

    const taskId = await harness.manager.submit(
      createMediaTaskInput('text-to-video', 'provider-1', 'model-1', { prompt: 'cat' }),
      OWNER,
    );
    const task = await harness.manager.waitForCompletion(taskId, 30000);

    expect(task.status).toBe('failed');
    expect(task.output?.error).toContain('does not expose a video model runtime');
    expect(adapter.generateVideo).not.toHaveBeenCalled();
  });

  it('fails stuck image provider calls after the executor timeout', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        adapter: createAdapter({
          generateImage: vi.fn(() => new Promise<MediaAdapterResult>(() => {})),
          statuses: [],
        }),
        imageTaskTimeoutMs: 10,
      });

      const taskId = await harness.manager.submit(
        createMediaTaskInput('text-to-image', 'provider-1', 'model-1', { prompt: 'cat' }),
        OWNER,
      );
      await waitForTaskRunning(harness.manager, taskId);

      const waiter = harness.manager.waitForCompletion(taskId, 1000);
      await vi.advanceTimersByTimeAsync(10);
      const task = await waiter;

      expect(task.status).toBe('failed');
      expect(task.error).toContain('Image generation timed out after 10ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates cancellation during external wait', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        adapter: createAdapter({
          generateImage: async () => ({
            externalTaskId: 'external-cancel',
            status: 'processing',
          }),
          statuses: [{ status: 'processing', progress: 10 }],
        }),
      });

      const taskId = await harness.manager.submit(
        createMediaTaskInput('text-to-image', 'provider-1', 'model-1', { prompt: 'cat' }),
        OWNER,
      );
      await waitForTaskRunning(harness.manager, taskId);
      await harness.manager.cancel(taskId);

      const task = await harness.manager.waitForCompletion(taskId, 1000);
      expect(task.status).toBe('cancelled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes polling with the same external task id and does not resubmit provider work', async () => {
    vi.useFakeTimers();
    try {
      const adapter = createAdapter({
        generateVideo: vi.fn(async (): Promise<MediaAdapterResult> => ({
          externalTaskId: 'external-resume',
          status: 'processing',
        })),
        statuses: [
          {
            status: 'completed',
            progress: 100,
            outputs: [{ type: 'image', url: 'https://example.test/recovered.png' }],
          },
        ],
      });
      const storage = new MemoryTaskStorage();
      const recoveryStorage = new MemoryTaskRecoveryStorage();
      const harness = createHarness({ adapter, storage, recoveryStorage });

      await storage.save({
        scope: taskScope('task-resume'),
        id: 'task-resume',
        type: 'video_generation',
        status: 'running',
        input: createMediaTaskInput('text-to-video', 'provider-1', 'model-1', { prompt: 'cat' }),
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lifecycle: {
          runMode: 'background',
          costPhase: 'external-wait',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        },
      });
      await recoveryStorage.save({
        scope: taskScope('task-resume'),
        taskId: 'task-resume',
        externalTaskId: 'external-resume',
        providerId: 'provider-1',
        taskType: 'video_generation',
        payload: { prompt: 'cat' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await harness.manager.initialize();
      await expect(harness.executor.resumeFromRecovery(harness.manager)).resolves.toBe(0);
      await expect(harness.manager.resumePendingTasks()).resolves.toEqual([]);

      expect(adapter.generateVideo).not.toHaveBeenCalled();
      const task = await harness.manager.get(taskScope('task-resume'));
      expect(task?.status).toBe('completed');
      await expect(recoveryStorage.load(taskScope('task-resume'))).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

function createHarness(options: {
  adapter: MediaAdapter;
  providerType?: Provider['type'];
  imageTaskTimeoutMs?: number;
  storage?: MemoryTaskStorage;
  recoveryStorage?: MemoryTaskRecoveryStorage;
}) {
  const providerType = options.providerType ?? ('test-provider' as Provider['type']);
  getMediaAdapterRegistry().register(providerType, options.adapter);
  const storage = options.storage ?? new MemoryTaskStorage();
  const recoveryStorage = options.recoveryStorage ?? new MemoryTaskRecoveryStorage();
  const manager = new TaskManager({ storage, recoveryStorage, cleanupIntervalMs: 0 });
  const executor = new MediaTaskExecutor(createConfigManager(providerType), {
    ...(options.imageTaskTimeoutMs !== undefined
      ? { imageTaskTimeoutMs: options.imageTaskTimeoutMs }
      : {}),
  });
  executor.registerWith(manager);

  return { manager, executor, storage, recoveryStorage };
}

function createConfigManager(
  providerType: Provider['type'] = 'test-provider' as Provider['type'],
): ConfigManager {
  const provider: Provider = {
    id: 'provider-1',
    name: 'Provider',
    displayName: 'Provider',
    type: providerType,
    apiUrl: 'https://example.test',
    apiKey: 'key',
    enabled: true,
  };
  const model: Model = {
    id: 'model-1',
    name: 'model-1',
    displayName: 'Model',
    providerId: 'provider-1',
    capabilities: ['text_to_image'],
    enabled: true,
  };

  return {
    getProvider: () => provider,
    getModel: () => model,
  } as unknown as ConfigManager;
}

function createAdapter(options: {
  generateImage?: (
    request: unknown,
    model: unknown,
    provider: unknown,
  ) => Promise<MediaAdapterResult>;
  generateVideo?: (
    request: unknown,
    model: unknown,
    provider: unknown,
  ) => Promise<MediaAdapterResult>;
  statuses: MediaAdapterResult[];
}): MediaAdapter {
  const statuses = [...options.statuses];
  return {
    type: 'test-provider',
    getSupportedTypes: () => ['text-to-image'],
    supportsType: () => true,
    generateImage:
      options.generateImage ??
      (async () => ({
        status: 'completed',
        outputs: [{ type: 'image', url: PNG_BASE64 }],
      })),
    generateVideo:
      options.generateVideo ??
      (async () => ({
        status: 'completed',
        outputs: [{ type: 'video', url: 'https://example.test/out.mp4' }],
      })),
    generateAudio: async () => ({ status: 'failed' }),
    getTaskStatus: vi.fn(async () => statuses.shift() ?? options.statuses.at(-1)!),
    cancelTask: vi.fn(async () => undefined),
  };
}

async function waitForTaskRunning(manager: TaskManager, scope: TaskRunScope): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const task = await manager.get(scope);
    if (task?.status === 'running') {
      return;
    }
    await vi.advanceTimersByTimeAsync(0);
  }
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
