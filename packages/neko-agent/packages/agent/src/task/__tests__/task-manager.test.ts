/**
 * TaskManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskManager } from '../task-manager';
import type { TaskInput, Task, TaskExecutor, TaskRunOwnerScope, TaskRunScope } from '@neko/shared';

const OWNER: TaskRunOwnerScope = {
  conversationId: 'conversation-1',
  runId: 'run-1',
  parentRunId: 'run-1',
};

function taskScope(childRunId: string, owner: TaskRunOwnerScope = OWNER): TaskRunScope {
  return { ...owner, childRunId, childKind: 'task' };
}

describe('TaskManager', () => {
  let manager: TaskManager;
  const submit = (input: TaskInput, owner: TaskRunOwnerScope = OWNER) =>
    manager.submit(input, owner);

  beforeEach(() => {
    manager = new TaskManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerExecutor', () => {
    it('should register executor for task type', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'result' });
      manager.registerExecutor('image_generation', executor);

      await submit({
        type: 'image_generation',
        payload: { prompt: 'test' },
      });

      // Advance timers to allow task execution
      await vi.advanceTimersByTimeAsync(0);

      expect(executor).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('should create a new task with pending status', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      manager.registerExecutor('image_generation', executor);

      const taskId = await submit({
        type: 'image_generation',
        payload: { prompt: 'test' },
      });

      expect(taskId.childRunId).toMatch(/^task_\d+_\d+$/);

      const task = await manager.get(taskId);
      expect(task).toBeDefined();
      expect(task?.type).toBe('image_generation');
      expect(task?.input.payload).toEqual({ prompt: 'test' });
    });

    it('should generate unique task IDs', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'result' });
      manager.registerExecutor('embedding', executor);

      const id1 = await submit({ type: 'embedding', payload: {} });
      const id2 = await submit({ type: 'embedding', payload: {} });
      const id3 = await submit({ type: 'embedding', payload: {} });

      expect(id1.childRunId).not.toBe(id2.childRunId);
      expect(id2.childRunId).not.toBe(id3.childRunId);
      expect(id1.childRunId).not.toBe(id3.childRunId);
    });

    it('should set initial progress to 0', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });
      const task = await manager.get(taskId);

      expect(task?.progress).toBe(0);
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('mcp', executor);

      const taskId = await submit({ type: 'mcp', payload: {} });
      const task = await manager.get(taskId);

      expect(task?.createdAt).toBe(now);
      expect(task?.updatedAt).toBe(now);
    });
  });

  describe('get', () => {
    it('should return task by ID', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      const taskId = await submit({
        type: 'custom',
        payload: { key: 'value' },
      });

      const task = await manager.get(taskId);
      expect(task?.id).toBe(taskId.childRunId);
    });

    it('should return undefined for non-existent task', async () => {
      const task = await manager.get(taskScope('non-existent-id'));
      expect(task).toBeUndefined();
    });
  });

  describe('cancel', () => {
    it('isolates identical local task IDs by complete owner scope', async () => {
      const scopeA = taskScope('shared-task', {
        conversationId: 'conversation-a',
        runId: 'run-a',
        parentRunId: 'run-a',
      });
      const scopeB = taskScope('shared-task', {
        conversationId: 'conversation-b',
        runId: 'run-b',
        parentRunId: 'run-b',
      });
      const createExternalTask = (scope: TaskRunScope): Task => ({
        scope,
        id: scope.childRunId,
        type: 'workflow',
        status: 'running',
        input: { type: 'workflow', payload: {} },
        progress: 50,
        createdAt: 1,
        updatedAt: 1,
      });

      await manager.upsertExternalTask(createExternalTask(scopeA));
      await manager.upsertExternalTask(createExternalTask(scopeB));

      await expect(manager.cancel(scopeA)).resolves.toBe(true);
      await expect(manager.get(scopeA)).resolves.toEqual(
        expect.objectContaining({ scope: scopeA, status: 'cancelled' }),
      );
      await expect(manager.get(scopeB)).resolves.toEqual(
        expect.objectContaining({ scope: scopeB, status: 'running' }),
      );
    });

    it('should cancel pending task', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
      });

      const cancelled = await manager.cancel(taskId);
      expect(cancelled).toBe(true);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('cancelled');
    });

    it('should cancel running task', async () => {
      const executor: TaskExecutor = vi
        .fn()
        .mockImplementation(() => new Promise<{ data: string }>(() => {}));
      manager.registerExecutor('audio_generation', executor);

      const taskId = await submit({
        type: 'audio_generation',
        payload: {},
      });

      // Let task start running
      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('running');

      const cancelled = await manager.cancel(taskId);
      expect(cancelled).toBe(true);

      const cancelledTask = await manager.get(taskId);
      expect(cancelledTask?.status).toBe('cancelled');
    });

    it('should propagate abort to running executor', async () => {
      const aborted = vi.fn();
      const executor: TaskExecutor = vi.fn().mockImplementation(
        (_input, _onProgress, context) =>
          new Promise(() => {
            context?.signal.addEventListener('abort', aborted);
          }),
      );
      manager.registerExecutor('audio_generation', executor);

      const taskId = await submit({
        type: 'audio_generation',
        payload: {},
      });
      await vi.advanceTimersByTimeAsync(0);

      await manager.cancel(taskId);

      expect(aborted).toHaveBeenCalledTimes(1);
      expect((await manager.get(taskId))?.status).toBe('cancelled');
    });

    it('should return false for non-existent task', async () => {
      const cancelled = await manager.cancel(taskScope('non-existent'));
      expect(cancelled).toBe(false);
    });

    it('should return false for already completed task', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'done' });
      manager.registerExecutor('embedding', executor);

      const taskId = await submit({ type: 'embedding', payload: {} });

      // Wait for completion
      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('completed');

      const cancelled = await manager.cancel(taskId);
      expect(cancelled).toBe(false);
    });

    it('should return false for already failed task', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Failed'));
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });

      // Wait for failure
      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('failed');

      const cancelled = await manager.cancel(taskId);
      expect(cancelled).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await submit({ type: 'custom', payload: { a: 1 } });
      await submit({ type: 'custom', payload: { b: 2 } });
      await submit({ type: 'custom', payload: { c: 3 } });

      const tasks = await manager.list();
      expect(tasks.length).toBe(3);
    });

    it('should filter tasks by status', async () => {
      const completedExecutor: TaskExecutor = vi.fn().mockResolvedValue({});
      const pendingExecutor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));

      manager.registerExecutor('embedding', completedExecutor);
      manager.registerExecutor('workflow', pendingExecutor);

      await submit({ type: 'embedding', payload: {} });
      await submit({ type: 'embedding', payload: {} });
      await submit({ type: 'workflow', payload: {} });

      // Allow completed tasks to finish
      await vi.advanceTimersByTimeAsync(0);

      const completedTasks = await manager.list('completed');
      expect(completedTasks.length).toBe(2);
      expect(completedTasks.every((t) => t.status === 'completed')).toBe(true);
    });

    it('should return empty array when no tasks match status', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('mcp', executor);

      await submit({ type: 'mcp', payload: {} });
      await vi.advanceTimersByTimeAsync(0);

      const failedTasks = await manager.list('failed');
      expect(failedTasks.length).toBe(0);
    });
  });

  describe('upsertExternalTask', () => {
    it('should persist externally projected tasks without invoking executors', async () => {
      const progressCallback = vi.fn();

      await manager.upsertExternalTask({
        scope: taskScope('creation:run-1:item-1', {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'run-1',
        }),
        id: 'creation:run-1:item-1',
        type: 'workflow',
        status: 'running',
        input: {
          type: 'workflow',
          payload: { source: 'creation', runId: 'run-1', itemId: 'item-1' },
        },
        progress: 50,
        createdAt: 10,
        updatedAt: 20,
      });
      const unsubscribe = manager.onProgress(
        taskScope('creation:run-1:item-1', {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'run-1',
        }),
        progressCallback,
      );

      await manager.upsertExternalTask({
        scope: taskScope('creation:run-1:item-1', {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'run-1',
        }),
        id: 'creation:run-1:item-1',
        type: 'workflow',
        status: 'completed',
        input: {
          type: 'workflow',
          payload: { source: 'creation', runId: 'run-1', itemId: 'item-1' },
        },
        progress: 100,
        createdAt: 10,
        updatedAt: 30,
      });

      const task = await manager.get(
        taskScope('creation:run-1:item-1', {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'run-1',
        }),
      );
      expect(task).toEqual(
        expect.objectContaining({
          id: 'creation:run-1:item-1',
          type: 'workflow',
          status: 'completed',
          progress: 100,
        }),
      );
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'creation:run-1:item-1',
          status: 'completed',
        }),
      );
      unsubscribe();
    });
  });

  describe('onProgress', () => {
    it('should subscribe to task progress updates', async () => {
      const progressCallback = vi.fn();
      let reportProgress: (progress: number) => void;

      const executor: TaskExecutor = vi.fn().mockImplementation(async (input, onProgress) => {
        reportProgress = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { data: 'done' };
      });
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
      });

      const unsubscribe = manager.onProgress(taskId, progressCallback);

      // Start task
      await vi.advanceTimersByTimeAsync(0);

      // Report progress
      reportProgress!(50);

      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall[0].progress).toBe(50);

      unsubscribe();
    });

    it('should allow multiple subscribers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      let reportProgress: (progress: number) => void;

      const executor: TaskExecutor = vi.fn().mockImplementation(async (input, onProgress) => {
        reportProgress = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {};
      });
      manager.registerExecutor('image_generation', executor);

      const taskId = await submit({
        type: 'image_generation',
        payload: {},
      });

      manager.onProgress(taskId, callback1);
      manager.onProgress(taskId, callback2);

      await vi.advanceTimersByTimeAsync(0);
      reportProgress!(25);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', async () => {
      const callback = vi.fn();
      let reportProgress: (progress: number) => void;

      const executor: TaskExecutor = vi.fn().mockImplementation(async (input, onProgress) => {
        reportProgress = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {};
      });
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });

      const unsubscribe = manager.onProgress(taskId, callback);
      await vi.advanceTimersByTimeAsync(0);

      reportProgress!(30);
      expect(callback).toHaveBeenCalled();

      const callCount = callback.mock.calls.length;
      unsubscribe();

      reportProgress!(60);
      expect(callback.mock.calls.length).toBe(callCount);
    });
  });

  describe('task execution', () => {
    it('should complete task successfully', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({
        data: { url: 'https://example.com/image.png' },
      });
      manager.registerExecutor('image_generation', executor);

      const taskId = await submit({
        type: 'image_generation',
        payload: { prompt: 'A sunset' },
      });

      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.progress).toBe(100);
      expect(task?.output?.data).toEqual({ url: 'https://example.com/image.png' });
    });

    it('should fail task on executor error', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Generation failed'));
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Generation failed');
    });

    it('should fail when no executor registered', async () => {
      const taskId = await submit({
        type: 'custom',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toContain('No executor registered');
    });

    it('should record metrics on completion', async () => {
      const startTime = 1000;
      vi.setSystemTime(startTime);

      const executor: TaskExecutor = vi.fn().mockImplementation(async () => {
        vi.advanceTimersByTime(500);
        return { data: 'done' };
      });
      manager.registerExecutor('embedding', executor);

      const taskId = await submit({ type: 'embedding', payload: {} });
      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.output?.metrics).toBeDefined();
      expect(task?.output?.metrics?.duration).toBeGreaterThanOrEqual(0);
      expect(task?.output?.metrics?.retries).toBe(0);
    });

    it('should update progress during execution', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const progressUpdates: number[] = [];
      let startExecution: () => void;
      const executionStarted = new Promise<void>((resolve) => {
        startExecution = resolve;
      });

      const executor: TaskExecutor = vi.fn().mockImplementation(async (input, onProgress) => {
        // Wait for test to be ready
        await executionStarted;
        onProgress(25);
        await new Promise((r) => setTimeout(r, 10));
        onProgress(50);
        await new Promise((r) => setTimeout(r, 10));
        onProgress(75);
        return { data: 'done' };
      });
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });

      // Subscribe before releasing execution
      manager.onProgress(taskId, (task) => {
        progressUpdates.push(task.progress);
      });

      // Now start the execution
      startExecution!();

      // Wait for task to complete
      await new Promise((r) => setTimeout(r, 150));

      // Should have received progress updates
      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
      expect(progressUpdates).toContain(100);
    });

    it('should persist lifecycle updates reported by executor context', async () => {
      const executor: TaskExecutor = vi
        .fn()
        .mockImplementation(async (_input, _onProgress, context) => {
          context?.reportLifecycle({
            lifecycle: {
              ownerConversationId: 'conversation-1',
              runMode: 'background',
              costPhase: 'external-wait',
              interruptPolicy: 'detach-and-continue',
              recoverPolicy: 'resume-polling',
            },
          });
          return { data: 'done' };
        });
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
        lifecycle: {
          ownerConversationId: 'conversation-1',
          runMode: 'background',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.lifecycle).toEqual(
        expect.objectContaining({
          ownerConversationId: 'conversation-1',
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        }),
      );
    });

    it('should stop processing when cancelled during execution', async () => {
      // The cancel check happens at the start of retry loop, so we need
      // to test that cancelled status is set correctly
      const executor: TaskExecutor = vi.fn().mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      manager.registerExecutor('mcp', executor);

      const taskId = await submit({ type: 'mcp', payload: {} });

      // Let task start
      await vi.advanceTimersByTimeAsync(0);

      // Cancel while running
      const cancelled = await manager.cancel(taskId);
      expect(cancelled).toBe(true);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('cancelled');
    });
  });

  describe('retry behavior', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const executor: TaskExecutor = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { data: 'success after retry' };
      });
      manager.registerExecutor('image_generation', executor);

      const taskId = await submit({
        type: 'image_generation',
        payload: {},
        options: {
          retry: {
            maxRetries: 3,
            backoffMs: 100,
          },
        },
      });

      // Advance through retries
      await vi.advanceTimersByTimeAsync(0); // First attempt
      await vi.advanceTimersByTimeAsync(100); // First retry after 100ms
      await vi.advanceTimersByTimeAsync(200); // Second retry after 200ms

      const task = await manager.get(taskId);
      expect(task?.status).toBe('completed');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries exceeded', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Permanent failure'));
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
        options: {
          retry: {
            maxRetries: 2,
            backoffMs: 50,
          },
        },
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(150);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('failed');
      expect(executor).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should record retry count in metrics', async () => {
      let attempts = 0;
      const executor: TaskExecutor = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Retry needed');
        }
        return { data: 'done' };
      });
      manager.registerExecutor('embedding', executor);

      const taskId = await submit({
        type: 'embedding',
        payload: {},
        options: {
          retry: {
            maxRetries: 3,
            backoffMs: 50,
          },
        },
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50);

      const task = await manager.get(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.output?.metrics?.retries).toBe(1);
    });
  });

  describe('waitForCompletion', () => {
    it('should wait for task to complete', async () => {
      vi.useRealTimers(); // Need real timers for this test

      const executor: TaskExecutor = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { data: 'done' };
      });
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });

      const task = await manager.waitForCompletion(taskId, 5000);
      expect(task.status).toBe('completed');
    });

    it('should return immediately if already completed', async () => {
      vi.useRealTimers();

      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'done' });
      manager.registerExecutor('mcp', executor);

      const taskId = await submit({ type: 'mcp', payload: {} });

      // Wait a bit for completion
      await new Promise((r) => setTimeout(r, 50));

      const startTime = Date.now();
      const task = await manager.waitForCompletion(taskId);
      const duration = Date.now() - startTime;

      expect(task.status).toBe('completed');
      expect(duration).toBeLessThan(200); // Should return quickly
    });

    it('should throw on timeout', async () => {
      vi.useRealTimers();

      const executor: TaskExecutor = vi.fn().mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      manager.registerExecutor('custom', executor);

      const taskId = await submit({ type: 'custom', payload: {} });

      await expect(manager.waitForCompletion(taskId, 200)).rejects.toThrow('timed out');
    });

    it('should throw for non-existent task', async () => {
      vi.useRealTimers();

      await expect(manager.waitForCompletion(taskScope('non-existent'))).rejects.toThrow(
        'not found',
      );
    });

    it('should return on task failure', async () => {
      vi.useRealTimers();

      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Task failed'));
      manager.registerExecutor('audio_generation', executor);

      const taskId = await submit({
        type: 'audio_generation',
        payload: {},
      });

      const task = await manager.waitForCompletion(taskId, 5000);
      expect(task.status).toBe('failed');
    });

    it('should return on task cancellation', async () => {
      vi.useRealTimers();

      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('video_generation', executor);

      const taskId = await submit({
        type: 'video_generation',
        payload: {},
      });

      // Cancel after a short delay
      setTimeout(async () => {
        await manager.cancel(taskId);
      }, 50);

      const task = await manager.waitForCompletion(taskId, 5000);
      expect(task.status).toBe('cancelled');
    });

    it('should resolve multiple waiters from one terminal update', async () => {
      vi.useRealTimers();

      let finish!: () => void;
      const executor: TaskExecutor = vi.fn().mockImplementation(
        () =>
          new Promise<{ data: string }>((resolve) => {
            finish = () => resolve({ data: 'done' });
          }),
      );
      manager.registerExecutor('workflow', executor);

      const taskId = await submit({ type: 'workflow', payload: {} });
      await waitFor(() => expect(finish).toBeTypeOf('function'));

      const waiter1 = manager.waitForCompletion(taskId, 5000);
      const waiter2 = manager.waitForCompletion(taskId, 5000);

      finish();

      await expect(waiter1).resolves.toEqual(expect.objectContaining({ status: 'completed' }));
      await expect(waiter2).resolves.toEqual(expect.objectContaining({ status: 'completed' }));
    });
  });
});

async function waitFor(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
}
