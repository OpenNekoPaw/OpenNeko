import * as vscode from 'vscode';
import {
  TASK_PROJECTION_CONTRACT_VERSION,
  type TaskProjection,
  type TaskProjectionEvent,
  type TaskProjectionRef,
  type TaskProjectionSource,
} from '@neko/shared/types/task-projection';
import { formatTaskRunScope, type TaskRunScope } from '@neko/shared';
import {
  type ConversationProjectionUpdate,
  getAgentWorkItemRuntimeKey,
  isTaskWorkItem,
  type AgentWorkItem,
  type MediaTaskCreatedMessage,
  type MediaTaskProgressMessage,
  type SubAgentEventMessage,
  type TaskCreatedMessage,
  type TaskRemovedMessage,
  type TasksUpdatedMessage,
  type TaskUpdatedMessage,
} from '@neko-agent/types';
import type { Platform } from '@neko/platform';
import type { IRuntimeTaskManager } from '@neko/agent';
import { AgentTaskProjectionSource } from './taskProjectionSource';

const SOURCE_ID = 'neko-agent';
const SOURCE_NAME = 'Neko Agent';

type MirroredWorkItemMessage =
  | ConversationProjectionUpdate
  | TasksUpdatedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskRemovedMessage
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | SubAgentEventMessage;

export interface AgentWorkItemProjectionSourceDeps {
  readonly platform?: Platform;
  readonly taskManager?: IRuntimeTaskManager;
}

export class AgentWorkItemProjectionSource implements TaskProjectionSource, vscode.Disposable {
  readonly contractVersion = TASK_PROJECTION_CONTRACT_VERSION;
  readonly source = SOURCE_ID;
  readonly sourceDisplayName = SOURCE_NAME;
  readonly capabilities = {
    cancel: true,
    retry: true,
    revealOutput: true,
  };

  private readonly emitter = new vscode.EventEmitter<TaskProjectionEvent>();
  private readonly projection = new AgentTaskProjectionSource();
  readonly projectionSource = {
    getSnapshot: async (): Promise<TaskProjection[]> => this.getProjectionSnapshot(),
  };
  private readonly workItemsByConversation = new Map<string, Map<string, AgentWorkItem>>();
  private deps: AgentWorkItemProjectionSourceDeps;

  constructor(deps: AgentWorkItemProjectionSourceDeps = {}) {
    this.deps = deps;
  }

  updateDeps(deps: AgentWorkItemProjectionSourceDeps): void {
    this.deps = deps;
  }

  acceptWebviewMessage(message: unknown): void {
    if (!isMirroredWorkItemMessage(message)) {
      return;
    }

    switch (message.type) {
      case 'agentTurnTimelineUpdate':
        this.upsertTimelineWorkItems(message);
        return;
      case 'tasksUpdated':
        this.replaceBackgroundTasks(message);
        return;
      case 'taskCreated':
      case 'taskUpdated':
      case 'mediaTaskCreated':
      case 'mediaTaskProgress':
        this.upsertWorkItem(message.conversationId, message.workItem);
        return;
      case 'subagentEvent':
        this.upsertWorkItem(message.conversationId, message.workItem);
        return;
      case 'taskRemoved':
        this.removeWorkItem(message.conversationId, message.taskScope);
        return;
      default:
        assertNever(message);
    }
  }

  async getSnapshot(): Promise<TaskProjection[]> {
    return this.getProjectionSnapshot();
  }

  onDidChangeTask(listener: (event: TaskProjectionEvent) => void): vscode.Disposable {
    return this.emitter.event(listener);
  }

  async cancel(task: TaskProjectionRef): Promise<void> {
    const item = this.getWorkItem(task);
    if (!item || item.kind === 'subagent') {
      throw new Error(`Task cannot be cancelled: ${task.sourceTaskId}`);
    }

    if (item.kind === 'media-task') {
      if (!this.deps.platform?.media) {
        throw new Error('Agent media task service is unavailable.');
      }
      const cancelled = await this.deps.platform.media.cancelTask(item.task.scope);
      if (cancelled === false) {
        throw new Error(`Media task was not cancelled: ${item.id}`);
      }
      return;
    }

    if (!this.deps.taskManager) {
      throw new Error('Agent task manager is unavailable.');
    }
    await this.deps.taskManager.cancel(item.task.scope);
  }

  async retry(task: TaskProjectionRef): Promise<void> {
    const item = this.getWorkItem(task);
    if (!item || item.kind !== 'tool-background-task') {
      throw new Error(`Task cannot be retried: ${task.sourceTaskId}`);
    }
    if (!this.deps.taskManager) {
      throw new Error('Agent task manager is unavailable.');
    }

    const sourceTask = await this.deps.taskManager.get(item.task.scope);
    if (!sourceTask) {
      throw new Error(`Task unavailable for retry: ${item.id}`);
    }

    await this.deps.taskManager.submit(sourceTask.input, {
      conversationId: sourceTask.scope.conversationId,
      runId: sourceTask.scope.runId,
      parentRunId: sourceTask.scope.parentRunId,
    });
  }

  dispose(): void {
    this.workItemsByConversation.clear();
    this.emitter.dispose();
  }

  private replaceBackgroundTasks(message: TasksUpdatedMessage): void {
    const conversationItems = new Map(this.workItemsByConversation.get(message.conversationId));
    const incomingKeys = new Set(message.workItems.map(getAgentWorkItemRuntimeKey));

    for (const [itemId, item] of conversationItems) {
      if (item.kind === 'tool-background-task' && !incomingKeys.has(itemId)) {
        conversationItems.delete(itemId);
        this.emitter.fire({
          type: 'removed',
          task: this.projection.toTaskProjection(item),
        });
      }
    }

    for (const item of message.workItems) {
      conversationItems.set(getAgentWorkItemRuntimeKey(item), item);
      this.emitUpsert(item);
    }

    this.workItemsByConversation.set(message.conversationId, conversationItems);
  }

  private upsertWorkItem(conversationId: string, item: AgentWorkItem): void {
    const conversationItems = new Map(this.workItemsByConversation.get(conversationId));
    const key = getAgentWorkItemRuntimeKey(item);
    const existing = conversationItems.get(key);
    const merged = existing ? mergeWorkItem(existing, item) : item;
    conversationItems.set(key, merged);
    this.workItemsByConversation.set(conversationId, conversationItems);
    this.emitUpsert(merged, existing);
  }

  private upsertTimelineWorkItems(message: ConversationProjectionUpdate): void {
    for (const operation of message.operations) {
      if (!('item' in operation)) {
        continue;
      }
      const item = operation.item;
      if (item.kind !== 'task' && item.kind !== 'media') {
        continue;
      }
      this.upsertWorkItem(message.conversationId, item.payload.workItem);
    }
  }

  private removeWorkItem(conversationId: string, taskScope: TaskRunScope): void {
    const conversationItems = this.workItemsByConversation.get(conversationId);
    const itemKey = formatTaskRunScope(taskScope);
    const item = conversationItems?.get(itemKey);
    if (!conversationItems || !item) {
      return;
    }

    conversationItems.delete(itemKey);
    this.emitter.fire({
      type: 'removed',
      task: this.projection.toTaskProjection(item),
    });
  }

  private emitUpsert(item: AgentWorkItem, previous?: AgentWorkItem): void {
    this.emitter.fire({
      type: previous ? 'updated' : 'added',
      task: this.projection.toTaskProjection(item),
    });
  }

  private getProjectionSnapshot(): TaskProjection[] {
    return this.projection.getSnapshot(this.iterWorkItems());
  }

  private *iterWorkItems(): Iterable<AgentWorkItem> {
    for (const conversationItems of this.workItemsByConversation.values()) {
      yield* conversationItems.values();
    }
  }

  private getWorkItem(ref: TaskProjectionRef): AgentWorkItem | undefined {
    if (ref.source !== SOURCE_ID) {
      return undefined;
    }

    for (const conversationItems of this.workItemsByConversation.values()) {
      const item = conversationItems.get(ref.sourceTaskId);
      if (item) {
        return item;
      }
    }

    return undefined;
  }
}

function isMirroredWorkItemMessage(message: unknown): message is MirroredWorkItemMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  return (
    message.type === 'tasksUpdated' ||
    message.type === 'agentTurnTimelineUpdate' ||
    message.type === 'taskCreated' ||
    message.type === 'taskUpdated' ||
    message.type === 'taskRemoved' ||
    message.type === 'mediaTaskCreated' ||
    message.type === 'mediaTaskProgress' ||
    message.type === 'subagentEvent'
  );
}

function mergeWorkItem(existing: AgentWorkItem, incoming: AgentWorkItem): AgentWorkItem {
  if (existing.kind !== incoming.kind) {
    return incoming;
  }

  if (existing.kind === 'subagent' && incoming.kind === 'subagent') {
    return {
      ...existing,
      ...incoming,
      createdAt: existing.createdAt || incoming.createdAt,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      subAgent: { ...existing.subAgent, ...incoming.subAgent },
    };
  }

  if (isTaskWorkItem(existing) && isTaskWorkItem(incoming)) {
    return {
      ...existing,
      ...incoming,
      createdAt: existing.createdAt || incoming.createdAt,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      task: {
        ...existing.task,
        ...incoming.task,
        result: incoming.task.result ?? existing.task.result,
      },
      result: incoming.result ?? existing.result,
    };
  }

  return incoming;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled work item message: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
