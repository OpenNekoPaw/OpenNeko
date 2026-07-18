import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentWorkItem,
  SubAgentWorkItem,
  TaskWorkItem,
} from '@neko-agent/types';
import type { ChildRunScope, TaskRunScope } from '@neko/shared';
import { AgentWorkItemProjectionSource } from './workItemProjectionSource';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' }, name: 'workspace', index: 0 }],
  },
  EventEmitter: class EventEmitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => this.listeners.delete(listener),
      };
    };

    fire(event: T): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    dispose(): void {
      this.listeners.clear();
    }
  },
}));

describe('AgentWorkItemProjectionSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps media task work items to task projections with safe outputs', async () => {
    const source = new AgentWorkItemProjectionSource();
    source.acceptWebviewMessage({
      type: 'mediaTaskProgress',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({
        id: 'media-1',
        kind: 'media-task',
        status: 'processing',
        progress: 45,
        result: {
          urls: ['https://example.test/out.png'],
          assets: [],
        },
      }),
    });

    await expect(source.getSnapshot()).resolves.toEqual([
      expect.objectContaining({
        taskId: `neko-agent:${taskRuntimeKey('media-1')}`,
        kind: 'media-task',
        status: 'running',
        progress: 45,
        actions: ['cancel'],
        outputs: expect.arrayContaining([
          { kind: 'url', ref: 'https://example.test/out.png', label: 'Generated output' },
        ]),
      }),
    ]);
    source.dispose();
  });

  it('clamps progress and omits raw local output refs', async () => {
    const source = new AgentWorkItemProjectionSource();
    source.acceptWebviewMessage({
      type: 'mediaTaskProgress',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({
        id: 'media-unsafe',
        kind: 'media-task',
        status: 'processing',
        progress: 150,
        result: {
          urls: [],
          assets: [],
        },
      }),
    });

    const snapshot = await source.getSnapshot();
    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        progress: 100,
      }),
    );
    expect(snapshot[0]).not.toHaveProperty('outputs');
    source.dispose();
  });

  it('maps tool-background failures to retryable task projections', async () => {
    const source = new AgentWorkItemProjectionSource();
    source.acceptWebviewMessage({
      type: 'taskUpdated',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({
        id: 'tool-1',
        kind: 'tool-background-task',
        status: 'failed',
        progress: 100,
        error: 'failed',
      }),
    });

    const snapshot = await source.getSnapshot();
    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        taskId: `neko-agent:${taskRuntimeKey('tool-1')}`,
        kind: 'tool-background-task',
        status: 'error',
        actions: ['retry'],
        error: 'failed',
      }),
    );
    source.dispose();
  });

  it('mirrors task work items from authoritative conversation projection updates', async () => {
    const source = new AgentWorkItemProjectionSource();
    const workItem = createTaskWorkItem({
      id: 'tool-timeline-1',
      kind: 'tool-background-task',
      status: 'processing',
      progress: 45,
      parentToolCallId: 'tool-call-1',
    });

    source.acceptWebviewMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'tool-background-task-tool-timeline-1',
            sequence: 2,
            itemRevision: 1,
            kind: 'task',
            status: 'pending',
            parentAnchor: 'tool_call',
            parentToolCallId: 'tool-call-1',
            payload: { workItem },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
    });

    const snapshot = await source.getSnapshot();
    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        taskId: `neko-agent:${taskRuntimeKey('tool-timeline-1')}`,
        kind: 'tool-background-task',
        status: 'running',
        progress: 45,
      }),
    );
    source.dispose();
  });

  it('maps subagent work items without source actions', async () => {
    const source = new AgentWorkItemProjectionSource();
    source.acceptWebviewMessage({
      type: 'subagentEvent',
      conversationId: 'conv-1',
      event: {
        type: 'progress',
        scope: subAgentScope('sub-1'),
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      },
      workItem: createSubAgentWorkItem(),
    });

    const snapshot = await source.getSnapshot();
    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        taskId: `neko-agent:${subAgentRuntimeKey('sub-1')}`,
        kind: 'subagent',
        status: 'running',
        actions: [],
        workItemKind: 'subagent',
      }),
    );
    source.dispose();
  });

  it('delegates cancel and retry to owning agent services', async () => {
    const platform = { media: { cancelTask: vi.fn(async () => true) } };
    const taskManager = {
      get: vi.fn(async () => ({
        scope: taskScope('tool-1'),
        input: { type: 'tool', payload: {} },
      })),
      cancel: vi.fn(async () => undefined),
      submit: vi.fn(async () => taskScope('retry-1')),
    };
    const source = new AgentWorkItemProjectionSource({
      platform: platform as never,
      taskManager: taskManager as never,
    });

    source.acceptWebviewMessage({
      type: 'mediaTaskCreated',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({ id: 'media-1', kind: 'media-task' }),
    });
    source.acceptWebviewMessage({
      type: 'taskUpdated',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({
        id: 'tool-1',
        kind: 'tool-background-task',
        status: 'failed',
      }),
    });

    await source.cancel({ source: 'neko-agent', sourceTaskId: taskRuntimeKey('media-1') });
    await source.retry({ source: 'neko-agent', sourceTaskId: taskRuntimeKey('tool-1') });

    expect(platform.media.cancelTask).toHaveBeenCalledWith(taskScope('media-1'));
    expect(taskManager.get).toHaveBeenCalledWith(taskScope('tool-1'));
    expect(taskManager.submit).toHaveBeenCalledWith(
      { type: 'tool', payload: {} },
      { conversationId: 'conv-1', runId: 'run-1', parentRunId: 'run-1' },
    );
    source.dispose();
  });

  it('uses one projection source for host and Chat delivery snapshots', async () => {
    const source = new AgentWorkItemProjectionSource();
    source.acceptWebviewMessage({
      type: 'mediaTaskProgress',
      conversationId: 'conv-1',
      workItem: createTaskWorkItem({
        id: 'media-1',
        kind: 'media-task',
        status: 'completed',
        progress: 100,
        result: {
          urls: ['https://example.test/out.png'],
          assets: [],
        },
      }),
    });

    await expect(source.projectionSource.getSnapshot()).resolves.toEqual(
      await source.getSnapshot(),
    );
    source.dispose();
  });
});

function createTaskWorkItem(
  overrides: Partial<TaskWorkItem> & {
    id: string;
    kind: TaskWorkItem['kind'];
    result?: AgentBackgroundTask['result'];
  },
): TaskWorkItem {
  const task: AgentBackgroundTask = {
    scope: overrides.task?.scope ?? taskScope(overrides.id),
    id: overrides.id,
    type: 'image',
    name: 'Generate image',
    prompt: 'Generate image',
    providerId: 'provider',
    providerName: 'model',
    status: overrides.status ?? 'processing',
    progress: overrides.progress ?? 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    ...(overrides.result ? { result: overrides.result } : {}),
    ...(overrides.error ? { error: overrides.error } : {}),
  };

  return {
    id: overrides.id,
    conversationId: 'conv-1',
    kind: overrides.kind,
    parentMessageId: overrides.parentMessageId ?? null,
    parentToolCallId: overrides.parentToolCallId ?? null,
    title: task.name,
    summary: task.prompt,
    status: task.status,
    progress: task.progress,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    task,
  };
}

function createSubAgentWorkItem(): SubAgentWorkItem {
  return {
    id: 'sub-1',
    conversationId: 'conv-1',
    kind: 'subagent',
    scope: subAgentScope('sub-1'),
    parentMessageId: null,
    parentToolCallId: null,
    title: 'Subagent',
    status: 'processing',
    progress: 25,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    subAgent: {
      parentAgentId: 'agent-1',
    },
  } satisfies AgentWorkItem as SubAgentWorkItem;
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function subAgentScope(childRunId: string): ChildRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'subagent',
  };
}

function taskRuntimeKey(childRunId: string): string {
  const scope = taskScope(childRunId);
  return `${scope.conversationId}/${scope.runId}/${scope.parentRunId}/task:${scope.childRunId}`;
}

function subAgentRuntimeKey(childRunId: string): string {
  const scope = subAgentScope(childRunId);
  return `${scope.conversationId}/${scope.runId}/${scope.parentRunId}/subagent:${scope.childRunId}`;
}
