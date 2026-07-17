/**
 * Task Manager - Async task management for Agent
 *
 * Manages async tasks like media generation, workflow execution, etc.
 * Supports persistence, recovery, and concurrency control.
 */

import type {
  Task,
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskProgressCallback,
  ITaskManager,
  ITaskStorage,
  ITaskRecoveryStorage,
  TaskRecoveryInfo,
  SerializableTask,
  TaskExecutor,
  TaskLifecycleMetadata,
  TaskRunOwnerScope,
  TaskRunScope,
} from '@neko/shared';
import {
  BaseError,
  ConcurrencyPool,
  KeyedConcurrencyPool,
  createTaskLifecycleMetadata,
  formatTaskRunScope,
  sleepWithAbort,
  withTimeout,
} from '@neko/shared';
import { MemoryTaskStorage } from './task-storage';
import { MemoryTaskRecoveryStorage } from './task-recovery-storage';
import { isTaskCleanupCandidate } from './task-storage-policy';
import { getLogger } from '../utils/logger';

const logger = getLogger('TaskManager');

export interface IRuntimeTaskManager extends ITaskManager {
  initialize(): Promise<void>;
  resumePendingTasks(): Promise<TaskRunScope[]>;
  dispose(): Promise<void>;
  registerExecutor(type: TaskType, executor: TaskExecutor): void;
  onTerminalTask(
    callback: TaskTerminalCallback,
    options?: TaskTerminalSubscriptionOptions,
  ): () => void;
  saveRecoveryInfo(scope: TaskRunScope, externalTaskId: string, providerId: string): Promise<void>;
  deleteRecoveryInfo(scope: TaskRunScope): Promise<void>;
  getRecoveryStorage(): ITaskRecoveryStorage;
  updateLifecycle(scope: TaskRunScope, lifecycle: Partial<TaskLifecycleMetadata>): Promise<boolean>;
  updateOutputData(scope: TaskRunScope, outputData: Record<string, unknown>): Promise<boolean>;
  upsertExternalTask(task: SerializableTask): Promise<void>;
}

export interface TaskTerminalEvent {
  readonly task: Task;
  readonly scope: TaskRunScope;
}

export type TaskTerminalCallback = (event: TaskTerminalEvent) => void;

export interface TaskTerminalSubscriptionOptions {
  readonly replayExisting?: boolean;
}

/**
 * Concurrency configuration
 */
export interface ConcurrencyConfig {
  /** Global max concurrent tasks (default: 10) */
  maxConcurrent?: number;
  /** Per-type concurrency limits */
  perTypeLimits?: Partial<Record<TaskType, number>>;
  /** Queue timeout in ms (default: 60000) */
  queueTimeout?: number;
}

/**
 * Task manager options
 */
export interface TaskManagerOptions {
  /** Custom storage implementation */
  storage?: ITaskStorage;
  /** Custom recovery storage for external task resumption */
  recoveryStorage?: ITaskRecoveryStorage;
  /** Auto-cleanup interval in ms (default: 1 hour) */
  cleanupIntervalMs?: number;
  /** Task retention period in ms (default: 7 days) */
  retentionPeriodMs?: number;
  /** Concurrency configuration */
  concurrency?: ConcurrencyConfig;
  /** Bounded shutdown timeout in ms (default: 2500) */
  shutdownTimeoutMs?: number;
}

type CompletionWaiter = {
  resolve: (task: Task) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Task manager implementation with optional persistence
 */
export class TaskManager implements IRuntimeTaskManager {
  private tasks: Map<string, Task> = new Map();
  private executors: Map<TaskType, TaskExecutor> = new Map();
  private progressCallbacks: Map<string, Set<TaskProgressCallback>> = new Map();
  private terminalCallbacks: Set<TaskTerminalCallback> = new Set();
  private taskCounter = 0;
  private storage: ITaskStorage;
  private recoveryStorage: ITaskRecoveryStorage;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private retentionPeriodMs: number;
  private shutdownTimeoutMs: number;
  private executionControllers: Map<string, AbortController> = new Map();
  private completionWaiters: Map<string, Set<CompletionWaiter>> = new Map();
  /** Blocks abort-driven task updates from racing with shutdown persistence snapshots. */
  private isDisposing = false;

  // Concurrency control
  private globalPool: ConcurrencyPool;
  private typePools: KeyedConcurrencyPool;
  private concurrencyConfig: ConcurrencyConfig;

  constructor(options: TaskManagerOptions = {}) {
    this.storage = options.storage ?? new MemoryTaskStorage();
    this.recoveryStorage = options.recoveryStorage ?? new MemoryTaskRecoveryStorage();
    this.retentionPeriodMs = options.retentionPeriodMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 2500;

    // Initialize concurrency control
    this.concurrencyConfig = options.concurrency ?? {};
    const queueTimeout = this.concurrencyConfig.queueTimeout ?? 60000;

    this.globalPool = new ConcurrencyPool({
      maxConcurrent: this.concurrencyConfig.maxConcurrent ?? 10,
      queueTimeout,
    });

    this.typePools = new KeyedConcurrencyPool({
      maxConcurrent: 5, // Default per-type limit
      queueTimeout,
    });

    // Setup auto-cleanup if interval is specified
    const cleanupInterval = options.cleanupIntervalMs ?? 60 * 60 * 1000; // 1 hour
    if (cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupOldTasks().catch((err) => {
          logger.error('Cleanup failed', { error: err });
        });
      }, cleanupInterval);
    }
  }

  /**
   * Initialize storage and recover pending tasks
   */
  async initialize(): Promise<void> {
    // Load all tasks from storage
    const storedTasks = await this.storage.loadAll();

    for (const task of storedTasks) {
      this.tasks.set(formatTaskRunScope(task.scope), task);
      // Update counter to avoid ID collisions
      const match = task.id.match(/task_\d+_(\d+)/);
      const counterText = match?.[1];
      if (counterText) {
        const counter = parseInt(counterText, 10);
        if (counter >= this.taskCounter) {
          this.taskCounter = counter;
        }
      }
    }
  }

  /**
   * Resume pending/running tasks after restart
   * Returns the list of resumed task IDs
   */
  async resumePendingTasks(): Promise<TaskRunScope[]> {
    const pendingTasks = await this.storage.loadPending();
    const resumedScopes: TaskRunScope[] = [];

    for (const task of pendingTasks) {
      // Mark running tasks as pending for retry
      if (task.status === 'running') {
        task.status = 'pending';
        task.retryCount = (task.retryCount ?? 0) + 1;
        await this.storage.save(task);
      }

      // Update in-memory state
      this.tasks.set(formatTaskRunScope(task.scope), task);

      const recoveryInfo = await this.recoveryStorage.load(task.scope).catch(() => undefined);
      const lifecycle = createTaskLifecycleMetadata(task.lifecycle);
      if (
        lifecycle.recoverPolicy === 'snapshot-only' ||
        (recoveryInfo && lifecycle.recoverPolicy === 'resume-polling')
      ) {
        resumedScopes.push(task.scope);
        continue;
      }

      // Re-execute only retryable executor work. Snapshot-only operations are
      // resumed explicitly from their owning project or provider state.
      this.executeTask(task).catch((error) => {
        this.updateTask(task.scope, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      });

      resumedScopes.push(task.scope);
    }

    return resumedScopes;
  }

  /**
   * Cleanup old completed/failed tasks
   */
  async cleanupOldTasks(): Promise<number> {
    const cleaned = await this.storage.cleanup(this.retentionPeriodMs);

    // Also remove from in-memory map
    if (cleaned > 0) {
      const cutoff = Date.now() - this.retentionPeriodMs;
      for (const [key, task] of this.tasks.entries()) {
        if (isTaskCleanupCandidate(task, cutoff)) {
          this.tasks.delete(key);
        }
      }
    }

    return cleaned;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.isDisposing = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    for (const controller of this.executionControllers.values()) {
      controller.abort();
    }

    const snapshots: SerializableTask[] = [];
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.status === 'pending' || task.status === 'running') {
        const snapshot: Task = {
          ...task,
          status: 'pending',
          updatedAt: now,
        };
        this.tasks.set(id, snapshot);
        snapshots.push(snapshot as SerializableTask);
        this.rejectCompletionWaiters(id, new Error('Task manager disposed before completion'));
      }
    }

    await withTimeout(
      Promise.allSettled([
        ...snapshots.map((task) => this.storage.save(task)),
        ...getFlushPromises(this.recoveryStorage),
      ]),
      this.shutdownTimeoutMs,
    ).catch((error) => {
      logger.warn('Timed out while flushing task state during dispose', { error });
    });

    this.globalPool.dispose();
    this.typePools.dispose();
    this.executionControllers.clear();
  }

  /**
   * Get concurrency statistics
   */
  getConcurrencyStats(): {
    global: { running: number; queued: number; maxConcurrent: number };
    perType: Map<string, { running: number; queued: number; maxConcurrent: number }>;
  } {
    return {
      global: this.globalPool.stats,
      perType: this.typePools.getAllStats(),
    };
  }

  // ============================================================================
  // Recovery Methods - Lightweight persistence for external task resumption
  // ============================================================================

  /**
   * Save recovery info for an external task
   * Call this when an external platform returns a task ID
   */
  async saveRecoveryInfo(
    scope: TaskRunScope,
    externalTaskId: string,
    providerId: string,
  ): Promise<void> {
    const task = this.tasks.get(formatTaskRunScope(scope));
    if (!task) {
      logger.warn('Cannot save recovery info: task not found', { scope });
      return;
    }

    const info: TaskRecoveryInfo = {
      scope,
      taskId: scope.childRunId,
      externalTaskId,
      providerId,
      taskType: task.type,
      payload: task.input.payload,
      createdAt: task.createdAt,
      updatedAt: Date.now(),
    };

    await this.recoveryStorage.save(info);
    logger.debug('Saved recovery info', { scope, externalTaskId, providerId });
  }

  /**
   * Delete recovery info for a task
   * Call this when a task completes, fails, or is cancelled
   */
  async deleteRecoveryInfo(scope: TaskRunScope): Promise<void> {
    await this.recoveryStorage.delete(scope);
  }

  /**
   * Get all pending recovery infos
   * Call this on startup to resume external tasks
   */
  async getRecoveryInfos(): Promise<TaskRecoveryInfo[]> {
    return this.recoveryStorage.loadAll();
  }

  /**
   * Get recovery storage instance
   * For external use (e.g., MediaTaskExecutor)
   */
  getRecoveryStorage(): ITaskRecoveryStorage {
    return this.recoveryStorage;
  }

  /**
   * Register a task executor
   */
  registerExecutor(type: TaskType, executor: TaskExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * Submit a new task
   */
  async submit(input: TaskInput, owner: TaskRunOwnerScope): Promise<TaskRunScope> {
    const id = this.generateTaskId();
    const now = Date.now();
    const scope: TaskRunScope = { ...owner, childRunId: id, childKind: 'task' };

    const task: Task = {
      scope,
      id,
      type: input.type,
      status: 'pending',
      input,
      lifecycle: createTaskLifecycleMetadata({
        ...input.lifecycle,
        ownerConversationId: owner.conversationId,
        ownerRunId: owner.runId,
      }),
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(formatTaskRunScope(scope), task);

    logger.debug('Submitting task', {
      id,
      type: input.type,
      registeredExecutors: Array.from(this.executors.keys()),
      hasExecutor: this.executors.has(input.type),
    });

    // Persist to storage
    await this.storage.save(task as SerializableTask);

    // Start execution asynchronously
    this.executeTask(task).catch((error) => {
      // Aborted executions can reject after dispose has already snapshotted pending tasks.
      if (this.isDisposing) {
        return;
      }
      logger.error('Task execution failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.updateTask(scope, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return scope;
  }

  /**
   * Get task by complete scope
   */
  async get(scope: TaskRunScope): Promise<Task | undefined> {
    return this.tasks.get(formatTaskRunScope(scope));
  }

  /**
   * Cancel a task
   */
  async cancel(scope: TaskRunScope): Promise<boolean> {
    const key = formatTaskRunScope(scope);
    const task = this.tasks.get(key);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'running') {
      this.executionControllers.get(key)?.abort();
      this.updateTask(scope, { status: 'cancelled' });
      return true;
    }

    return false;
  }

  /**
   * Wait for task completion
   */
  async waitForCompletion(scope: TaskRunScope, timeoutMs: number = 300000): Promise<Task> {
    const key = formatTaskRunScope(scope);
    const task = this.tasks.get(key);
    if (!task) {
      throw new BaseError({
        category: 'not_found',
        code: 'TASK_NOT_FOUND',
        message: `Task ${formatTaskRunScope(scope)} not found`,
        retryable: false,
      });
    }

    if (isTerminalStatus(task.status)) {
      return task;
    }

    return new Promise<Task>((resolve, reject) => {
      const waiter: CompletionWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.removeCompletionWaiter(key, waiter);
          reject(
            new BaseError({
              category: 'timeout',
              code: 'TASK_TIMEOUT',
              message: `Task ${formatTaskRunScope(scope)} timed out after ${timeoutMs}ms`,
              retryable: false,
            }),
          );
        }, timeoutMs),
      };

      const waiters = this.completionWaiters.get(key) ?? new Set<CompletionWaiter>();
      waiters.add(waiter);
      this.completionWaiters.set(key, waiters);
    });
  }

  /**
   * List tasks by status
   */
  async list(status?: TaskStatus): Promise<Task[]> {
    const tasks = Array.from(this.tasks.values());
    return status ? tasks.filter((t) => t.status === status) : tasks;
  }

  /**
   * Delete a task
   */
  async delete(scope: TaskRunScope): Promise<boolean> {
    const key = formatTaskRunScope(scope);
    const task = this.tasks.get(key) ?? (await this.storage.load(scope));
    if (!task) return false;

    // Remove from in-memory map
    this.tasks.delete(key);

    // Remove from storage
    await this.storage.delete(scope);

    // Remove recovery info
    await this.recoveryStorage.delete(scope);

    // Clean up callbacks
    this.progressCallbacks.delete(key);
    this.rejectCompletionWaiters(
      key,
      new BaseError({
        category: 'not_found',
        code: 'TASK_DELETED',
        message: `Task ${formatTaskRunScope(scope)} was deleted`,
        retryable: false,
      }),
    );

    return true;
  }

  /**
   * Update task output data (e.g., to store local file paths)
   */
  async updateOutputData(
    scope: TaskRunScope,
    outputData: Record<string, unknown>,
  ): Promise<boolean> {
    const task = this.tasks.get(formatTaskRunScope(scope));
    if (!task) return false;

    // Merge new output data with existing
    const updatedOutput = {
      ...task.output,
      data: {
        ...((task.output?.data as object) || {}),
        ...outputData,
      },
    };

    this.updateTask(scope, { output: updatedOutput });
    return true;
  }

  async updateLifecycle(
    scope: TaskRunScope,
    lifecycle: Partial<TaskLifecycleMetadata>,
  ): Promise<boolean> {
    const task = this.tasks.get(formatTaskRunScope(scope));
    if (!task) return false;

    this.updateTask(scope, {
      lifecycle: createTaskLifecycleMetadata({
        ...task.lifecycle,
        ...lifecycle,
      }),
    });
    return true;
  }

  /**
   * Upsert an externally managed task into the shared task plane.
   *
   * Used by runtime adapters that need TaskManager's persistence/listing
   * surface without delegating execution to TaskManager executors.
   */
  async upsertExternalTask(task: SerializableTask): Promise<void> {
    const key = formatTaskRunScope(task.scope);
    const existing = this.tasks.get(key);
    const nextTask: Task = {
      ...task,
      createdAt: existing?.createdAt ?? task.createdAt,
    };

    this.tasks.set(key, nextTask);
    await this.storage.save(nextTask as SerializableTask);
    this._notifyProgress(nextTask);
    if (isTerminalStatus(nextTask.status) && (!existing || !isTerminalStatus(existing.status))) {
      this._notifyTerminal(nextTask);
    }
  }

  /**
   * Subscribe to task progress.
   * If the task is already in a terminal state (completed/failed/cancelled),
   * the callback is invoked immediately with the current task state so that
   * late subscribers (e.g. fast synchronous image generation) never miss it.
   */
  onProgress(scope: TaskRunScope, callback: TaskProgressCallback): () => void {
    const key = formatTaskRunScope(scope);
    let callbacks = this.progressCallbacks.get(key);
    if (!callbacks) {
      callbacks = new Set();
      this.progressCallbacks.set(key, callbacks);
    }
    callbacks.add(callback);

    // Replay terminal state for late subscribers
    const existing = this.tasks.get(key);
    if (
      existing &&
      (existing.status === 'completed' ||
        existing.status === 'failed' ||
        existing.status === 'cancelled')
    ) {
      try {
        callback(existing);
      } catch {
        // Ignore callback errors
      }
    }

    return () => {
      callbacks?.delete(callback);
      if (callbacks?.size === 0) {
        this.progressCallbacks.delete(key);
      }
    };
  }

  onTerminalTask(
    callback: TaskTerminalCallback,
    options: TaskTerminalSubscriptionOptions = {},
  ): () => void {
    this.terminalCallbacks.add(callback);
    if (options.replayExisting) {
      for (const task of this.tasks.values()) {
        if (isTerminalStatus(task.status)) {
          callback(this._toTerminalEvent(task));
        }
      }
    }

    return () => {
      this.terminalCallbacks.delete(callback);
    };
  }

  private async executeTask(task: Task): Promise<void> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      throw new Error(`No executor registered for task type: ${task.type}`);
    }

    // Acquire concurrency slots (global + per-type)
    const priority = task.input.options?.priority ?? 0;
    const typeLimit = this.concurrencyConfig.perTypeLimits?.[task.type];

    // If per-type limit is configured, update the pool
    if (typeLimit !== undefined) {
      this.typePools.getPool(task.type).setMaxConcurrent(typeLimit);
    }

    // Acquire global slot first
    await this.globalPool.acquire(priority);

    try {
      // Then acquire type-specific slot
      await this.typePools.getPool(task.type).acquire(priority);

      try {
        await this.executeTaskCore(task, executor);
      } finally {
        // Release type-specific slot
        this.typePools.getPool(task.type).release();
      }
    } finally {
      // Release global slot
      this.globalPool.release();
    }
  }

  private async executeTaskCore(task: Task, executor: TaskExecutor): Promise<void> {
    // Check if task was cancelled before starting execution
    const currentTask = this.tasks.get(formatTaskRunScope(task.scope));
    if (currentTask?.status === 'cancelled') {
      return;
    }

    const controller = new AbortController();
    this.executionControllers.set(formatTaskRunScope(task.scope), controller);

    this.updateTask(task.scope, { status: 'running' });

    const startTime = Date.now();
    let retries = 0;
    const maxRetries = task.input.options?.retry?.maxRetries || 0;

    while (retries <= maxRetries) {
      // Check if cancelled
      const currentTask = this.tasks.get(formatTaskRunScope(task.scope));
      if (currentTask?.status === 'cancelled') {
        return;
      }

      try {
        const output = await executor(
          task.input,
          (progress) => {
            if (!controller.signal.aborted) {
              this.updateTask(task.scope, { progress });
            }
          },
          {
            scope: task.scope,
            signal: controller.signal,
            reportLifecycle: (update) => {
              if (update.lifecycle) {
                void this.updateLifecycle(task.scope, update.lifecycle);
              }
            },
          },
        );

        if (
          controller.signal.aborted ||
          this.tasks.get(formatTaskRunScope(task.scope))?.status === 'cancelled'
        ) {
          return;
        }

        const endTime = Date.now();

        // Check if executor returned an error (API error, not exception)
        if (output.error) {
          this.updateTask(task.scope, {
            status: 'failed',
            error: output.error,
            output: {
              ...output,
              metrics: {
                startTime,
                endTime,
                duration: endTime - startTime,
                retries,
              },
            },
          });
          return;
        }

        this.updateTask(task.scope, {
          status: 'completed',
          progress: 100,
          output: {
            ...output,
            metrics: {
              startTime,
              endTime,
              duration: endTime - startTime,
              retries,
            },
          },
        });

        return;
      } catch (error) {
        if (
          controller.signal.aborted ||
          this.tasks.get(formatTaskRunScope(task.scope))?.status === 'cancelled'
        ) {
          return;
        }
        retries++;
        if (retries > maxRetries) {
          throw error;
        }

        const backoff = task.input.options?.retry?.backoffMs || 1000;
        await sleepWithAbort(backoff * retries, controller.signal);
      }
    }

    this.executionControllers.delete(formatTaskRunScope(task.scope));
  }

  private updateTask(scope: TaskRunScope, updates: Partial<Task>): void {
    const key = formatTaskRunScope(scope);
    const task = this.tasks.get(key);
    if (!task) return;
    const wasTerminal = isTerminalStatus(task.status);

    const nextUpdates =
      updates.status !== undefined && isTerminalStatus(updates.status)
        ? {
            ...updates,
            lifecycle: createTaskLifecycleMetadata({
              ...task.lifecycle,
              ...updates.lifecycle,
              costPhase: 'idle',
            }),
          }
        : updates;

    const updatedTask: Task = {
      ...task,
      ...nextUpdates,
      updatedAt: Date.now(),
    };

    this.tasks.set(key, updatedTask);

    // Persist to storage (async, don't block)
    this.storage.save(updatedTask as SerializableTask).catch((err) => {
      logger.error('Failed to persist task', { error: err });
    });

    this._notifyProgress(updatedTask);
    if (isTerminalStatus(updatedTask.status)) {
      this.resolveCompletionWaiters(key, updatedTask);
      this.executionControllers.delete(key);
      this.recoveryStorage.delete(scope).catch((err) => {
        logger.error('Failed to delete recovery info for terminal task', { error: err });
      });
      if (!wasTerminal) {
        this._notifyTerminal(updatedTask);
      }
    }
  }

  private generateTaskId(): string {
    this.taskCounter++;
    return `task_${Date.now()}_${this.taskCounter}`;
  }

  private _notifyProgress(task: Task): void {
    if (this.isDisposing) {
      return;
    }

    const callbacks = this.progressCallbacks.get(formatTaskRunScope(task.scope));
    if (!callbacks) {
      return;
    }

    for (const callback of callbacks) {
      try {
        callback(task);
      } catch {
        // Ignore callback errors
      }
    }
  }

  private _notifyTerminal(task: Task): void {
    if (this.isDisposing || !isTerminalStatus(task.status)) {
      return;
    }

    const event = this._toTerminalEvent(task);

    for (const callback of this.terminalCallbacks) {
      try {
        callback(event);
      } catch {
        // Ignore callback errors; observers own diagnostics.
      }
    }
  }

  private _toTerminalEvent(task: Task): TaskTerminalEvent {
    return { task, scope: task.scope };
  }

  private removeCompletionWaiter(key: string, waiter: CompletionWaiter): void {
    const waiters = this.completionWaiters.get(key);
    if (!waiters) {
      return;
    }
    waiters.delete(waiter);
    clearTimeout(waiter.timer);
    if (waiters.size === 0) {
      this.completionWaiters.delete(key);
    }
  }

  private resolveCompletionWaiters(key: string, task: Task): void {
    const waiters = this.completionWaiters.get(key);
    if (!waiters) {
      return;
    }
    this.completionWaiters.delete(key);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(task);
    }
  }

  private rejectCompletionWaiters(key: string, error: Error): void {
    const waiters = this.completionWaiters.get(key);
    if (!waiters) {
      return;
    }
    this.completionWaiters.delete(key);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function getFlushPromises(storage: ITaskRecoveryStorage): Promise<unknown>[] {
  const maybeFlushable = storage as { flush?: () => Promise<void>; dispose?: () => Promise<void> };
  if (typeof maybeFlushable.flush === 'function') {
    return [maybeFlushable.flush()];
  }
  if (typeof maybeFlushable.dispose === 'function') {
    return [maybeFlushable.dispose()];
  }
  return [];
}
