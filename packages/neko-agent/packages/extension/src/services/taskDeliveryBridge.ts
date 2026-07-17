import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import { buildTaskDeliveryReplayMessage } from '@neko-agent/types';

export interface TaskDeliveryCursor {
  readonly updatedAt: number;
  readonly taskId: string;
}

export interface TaskDeliveryCursorStorage {
  load(
    conversationId: string,
  ): TaskDeliveryCursor | undefined | PromiseLike<TaskDeliveryCursor | undefined>;
  save(conversationId: string, cursor: TaskDeliveryCursor): void | PromiseLike<void>;
}

export interface TaskDeliveryProjectionSource {
  getSnapshot(): Promise<readonly DashboardTask[]>;
}

export interface TaskDeliveryTarget {
  postMessage(message: unknown): PromiseLike<boolean> | boolean;
}

export interface TaskDeliveryBridgeOptions {
  readonly projectionSource: TaskDeliveryProjectionSource;
  readonly cursorStorage: TaskDeliveryCursorStorage;
}

export class TaskDeliveryBridge {
  constructor(private readonly options: TaskDeliveryBridgeOptions) {}

  async replayConversation(conversationId: string, target: TaskDeliveryTarget): Promise<number> {
    const cursor = await this.options.cursorStorage.load(conversationId);
    const tasks = await this.options.projectionSource.getSnapshot();
    const pending = tasks
      .filter((task) => task.conversationId === conversationId)
      .filter((task) => isTerminalTask(task))
      .filter((task) => isAfterCursor(task, cursor))
      .sort(compareByCursor);

    for (const task of pending) {
      await target.postMessage(buildTaskDeliveryReplayMessage({ conversationId, task }));
      await this.options.cursorStorage.save(conversationId, toCursor(task));
    }

    return pending.length;
  }
}

export class StateTaskDeliveryCursorStorage implements TaskDeliveryCursorStorage {
  constructor(
    private readonly storageKey: string,
    private readonly state: {
      get<T>(key: string, fallback: T): T;
      update(key: string, value: unknown): PromiseLike<void> | void;
    },
  ) {}

  load(conversationId: string): TaskDeliveryCursor | undefined {
    return this.loadAll()[conversationId];
  }

  async save(conversationId: string, cursor: TaskDeliveryCursor): Promise<void> {
    await this.state.update(this.storageKey, {
      ...this.loadAll(),
      [conversationId]: cursor,
    });
  }

  private loadAll(): Record<string, TaskDeliveryCursor> {
    const value = this.state.get<unknown>(this.storageKey, {});
    if (!value || typeof value !== 'object') {
      return {};
    }

    const cursors: Record<string, TaskDeliveryCursor> = {};
    for (const [conversationId, cursor] of Object.entries(value)) {
      if (isTaskDeliveryCursor(cursor)) {
        cursors[conversationId] = cursor;
      }
    }
    return cursors;
  }
}

function isTerminalTask(task: DashboardTask): boolean {
  return task.status === 'done' || task.status === 'error' || task.status === 'cancelled';
}

function isAfterCursor(task: DashboardTask, cursor: TaskDeliveryCursor | undefined): boolean {
  if (!cursor) {
    return true;
  }
  const current = toCursor(task);
  return (
    current.updatedAt > cursor.updatedAt ||
    (current.updatedAt === cursor.updatedAt && current.taskId > cursor.taskId)
  );
}

function toCursor(task: DashboardTask): TaskDeliveryCursor {
  return {
    updatedAt: task.completedAt ?? task.startedAt,
    taskId: task.taskId,
  };
}

function compareByCursor(a: DashboardTask, b: DashboardTask): number {
  const cursorA = toCursor(a);
  const cursorB = toCursor(b);
  if (cursorA.updatedAt !== cursorB.updatedAt) {
    return cursorA.updatedAt - cursorB.updatedAt;
  }
  return cursorA.taskId.localeCompare(cursorB.taskId);
}

function isTaskDeliveryCursor(value: unknown): value is TaskDeliveryCursor {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<TaskDeliveryCursor>;
  return (
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt) &&
    candidate.updatedAt >= 0 &&
    typeof candidate.taskId === 'string' &&
    candidate.taskId.length > 0
  );
}
