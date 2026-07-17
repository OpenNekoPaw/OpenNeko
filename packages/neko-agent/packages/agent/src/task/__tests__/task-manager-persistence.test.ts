/**
 * TaskManager Persistence Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TaskManager } from '../task-manager';
import { MemoryTaskStorage } from '../task-storage';
import { MemoryTaskRecoveryStorage } from '../task-recovery-storage';
import type { ITaskStorage, TaskExecutor, TaskRunOwnerScope, TaskRunScope } from '@neko/shared';

const OWNER: TaskRunOwnerScope = {
  conversationId: 'conv-persistence',
  runId: 'run-persistence',
  parentRunId: 'run-persistence',
};

function taskScope(childRunId: string, owner: TaskRunOwnerScope = OWNER): TaskRunScope {
  return {
    ...owner,
    childRunId,
    childKind: 'task',
  };
}

describe('TaskManager Persistence', () => {
  let manager: TaskManager;
  let storage: MemoryTaskStorage;
  let recoveryStorage: MemoryTaskRecoveryStorage;

  beforeEach(() => {
    storage = new MemoryTaskStorage();
    recoveryStorage = new MemoryTaskRecoveryStorage();
    manager = new TaskManager({
      storage,
      recoveryStorage,
      cleanupIntervalMs: 0, // Disable auto-cleanup for tests
    });
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await manager.dispose();
    vi.useRealTimers();
  });

  describe('persistence on submit', () => {
    it('should persist task on submit', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: { test: true },
        },
        OWNER,
      );

      const persisted = await storage.load(taskId);
      expect(persisted).toBeDefined();
      // Task may be pending or running depending on timing
      expect(['pending', 'running']).toContain(persisted?.status);
      expect(persisted?.input.payload).toEqual({ test: true });
    });

    it('should persist task status updates', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'done' });
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      // Wait for execution
      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('completed');
      expect(persisted?.progress).toBe(100);
    });

    it('should persist failure status', async () => {
      const executor: TaskExecutor = vi.fn().mockRejectedValue(new Error('Test error'));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      await vi.advanceTimersByTimeAsync(0);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('failed');
      expect(persisted?.error).toBe('Test error');
    });

    it('should persist cancelled status', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      await manager.cancel(taskId);

      const persisted = await storage.load(taskId);
      expect(persisted?.status).toBe('cancelled');
    });
  });

  describe('initialize', () => {
    it('should load tasks from storage on initialize', async () => {
      // Pre-populate storage
      await storage.save({
        scope: taskScope('task_1000_1'),
        id: 'task_1000_1',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();

      const task = await manager.get(taskScope('task_1000_1'));
      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
    });

    it('should restore task counter to avoid ID collisions', async () => {
      await storage.save({
        scope: taskScope('task_1000_999'),
        id: 'task_1000_999',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await manager.initialize();

      const newTaskScope = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );

      // New task ID should have counter > 999
      const match = newTaskScope.childRunId.match(/task_\d+_(\d+)/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1], 10)).toBeGreaterThan(999);
    });
  });

  describe('resumePendingTasks', () => {
    it('should resume pending tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      // Pre-populate with pending task
      await storage.save({
        scope: taskScope('pending_task'),
        id: 'pending_task',
        type: 'custom',
        status: 'pending',
        input: { type: 'custom', payload: { resumeTest: true } },
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      // Allow async executeTask to complete
      await vi.runAllTimersAsync();

      expect(resumed).toEqual([taskScope('pending_task')]);
      expect(executor).toHaveBeenCalled();
    });

    it('should mark running tasks as pending before resuming', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'resumed' });
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('running_task'),
        id: 'running_task',
        type: 'custom',
        status: 'running',
        input: { type: 'custom', payload: {} },
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([taskScope('running_task')]);

      // Check that retryCount was incremented
      const persisted = await storage.load(taskScope('running_task'));
      expect(persisted?.retryCount).toBe(1);
    });

    it('should not resume completed tasks', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({});
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('completed_task'),
        id: 'completed_task',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([]);
      expect(executor).not.toHaveBeenCalled();
    });

    it('should preserve generic snapshot-only tasks without replaying their executor', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'duplicated mutation' });
      manager.registerExecutor('workflow', executor);

      await storage.save({
        scope: taskScope('snapshot_only_task'),
        id: 'snapshot_only_task',
        type: 'workflow',
        status: 'running',
        input: {
          type: 'workflow',
          payload: {
            kind: 'external-snapshot',
            snapshotId: 'snapshot-1',
          },
          lifecycle: { recoverPolicy: 'snapshot-only' },
        },
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lifecycle: {
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'snapshot-only',
        },
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();
      await vi.runAllTimersAsync();

      expect(resumed).toEqual([taskScope('snapshot_only_task')]);
      expect(executor).not.toHaveBeenCalled();
      expect(await storage.load(taskScope('snapshot_only_task'))).toEqual(
        expect.objectContaining({ status: 'pending', retryCount: 1 }),
      );
    });

    it('should not re-execute tasks that have external recovery info and resume-polling policy', async () => {
      const executor: TaskExecutor = vi.fn().mockResolvedValue({ data: 'duplicated' });
      manager.registerExecutor('custom', executor);

      await storage.save({
        scope: taskScope('external_wait_task'),
        id: 'external_wait_task',
        type: 'custom',
        status: 'running',
        input: {
          type: 'custom',
          payload: { prompt: 'recover external task' },
          lifecycle: {
            recoverPolicy: 'resume-polling',
          },
        },
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
        scope: taskScope('external_wait_task'),
        taskId: 'external_wait_task',
        externalTaskId: 'provider-task-1',
        providerId: 'provider-1',
        taskType: 'custom',
        payload: { prompt: 'recover external task' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await manager.initialize();
      const resumed = await manager.resumePendingTasks();

      expect(resumed).toEqual([taskScope('external_wait_task')]);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldTasks', () => {
    it('should cleanup old completed tasks', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      await storage.save({
        scope: taskScope('old_task'),
        id: 'old_task',
        type: 'custom',
        status: 'completed',
        input: { type: 'custom', payload: {} },
        progress: 100,
        createdAt: oldTime,
        updatedAt: oldTime,
      });

      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 0,
        retentionPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });

      await manager2.initialize();
      const cleaned = await manager2.cleanupOldTasks();

      expect(cleaned).toBe(1);

      const task = await manager2.get(taskScope('old_task'));
      expect(task).toBeUndefined();

      await manager2.dispose();
    });

    it('should remove from both storage and memory', async () => {
      vi.useRealTimers();

      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;

      await storage.save({
        scope: taskScope('old_task'),
        id: 'old_task',
        type: 'custom',
        status: 'failed',
        input: { type: 'custom', payload: {} },
        progress: 0,
        createdAt: oldTime,
        updatedAt: oldTime,
      });

      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 0,
        retentionPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });

      await manager2.initialize();
      await manager2.cleanupOldTasks();

      // Check storage
      const storedTask = await storage.load(taskScope('old_task'));
      expect(storedTask).toBeUndefined();

      // Check memory
      const memTask = await manager2.get(taskScope('old_task'));
      expect(memTask).toBeUndefined();

      await manager2.dispose();
    });
  });

  describe('dispose', () => {
    it('should clear cleanup timer', async () => {
      const manager2 = new TaskManager({
        storage,
        cleanupIntervalMs: 1000,
      });

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      await manager2.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should abort running tasks and snapshot them as pending', async () => {
      const abortListener = vi.fn();
      const executor: TaskExecutor = vi.fn().mockImplementation(
        (_input, _onProgress, context) =>
          new Promise(() => {
            context?.signal.addEventListener('abort', abortListener);
          }),
      );
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      await vi.advanceTimersByTimeAsync(0);

      expect((await manager.get(taskId))?.status).toBe('running');

      await manager.dispose();

      const persisted = await storage.load(taskId);
      expect(abortListener).toHaveBeenCalledTimes(1);
      expect(persisted?.status).toBe('pending');
    });

    it('should not notify progress callbacks for dispose snapshots', async () => {
      const progress = vi.fn();
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      const unsubscribe = manager.onProgress(taskId, progress);

      await vi.advanceTimersByTimeAsync(0);
      progress.mockClear();

      await manager.dispose();

      expect(progress).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('should reject completion waiters during dispose snapshots', async () => {
      const executor: TaskExecutor = vi.fn().mockImplementation(() => new Promise(() => {}));
      manager.registerExecutor('custom', executor);

      const taskId = await manager.submit(
        {
          type: 'custom',
          payload: {},
        },
        OWNER,
      );
      await vi.advanceTimersByTimeAsync(0);

      const waiter = manager.waitForCompletion(taskId, 5000);
      await manager.dispose();

      await expect(waiter).rejects.toThrow('Task manager disposed before completion');
    });
  });
});

describe('TaskManager with custom storage', () => {
  it('should use provided storage implementation', async () => {
    const customStorage: ITaskStorage = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(undefined),
      loadPending: vi.fn().mockResolvedValue([]),
      loadAll: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(0),
    };

    const manager = new TaskManager({
      storage: customStorage,
      cleanupIntervalMs: 0,
    });

    const executor: TaskExecutor = vi.fn().mockResolvedValue({});
    manager.registerExecutor('custom', executor);

    await manager.submit({ type: 'custom', payload: {} }, OWNER);

    expect(customStorage.save).toHaveBeenCalled();
    await manager.dispose();
  });
});
