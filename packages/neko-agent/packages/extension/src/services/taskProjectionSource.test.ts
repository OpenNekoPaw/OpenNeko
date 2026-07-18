import { describe, expect, it } from 'vitest';
import type { AgentBackgroundTask, TaskWorkItem } from '@neko-agent/types';
import type { TaskRunScope } from '@neko/shared';
import { AgentTaskProjectionSource } from './taskProjectionSource';

describe('AgentTaskProjectionSource', () => {
  it('maps work items to task projections with safe output refs', () => {
    const source = new AgentTaskProjectionSource();

    expect(
      source.toTaskProjection(
        createTaskWorkItem({
          id: 'media-1',
          kind: 'media-task',
          status: 'completed',
          progress: 100,
          result: {
            urls: ['https://example.test/out.png'],
            assets: [],
          },
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        taskId: `neko-agent:${taskRuntimeKey('media-1')}`,
        status: 'done',
        actions: [],
        outputs: expect.arrayContaining([
          { kind: 'url', ref: 'https://example.test/out.png', label: 'Generated output' },
        ]),
      }),
    );
  });

  it('does not own task actions beyond projection declarations', () => {
    const source = new AgentTaskProjectionSource();

    expect(
      source.toTaskProjection(
        createTaskWorkItem({
          id: 'tool-1',
          kind: 'tool-background-task',
          status: 'failed',
          progress: 100,
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        actions: ['retry'],
      }),
    );
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
    parentMessageId: null,
    parentToolCallId: null,
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

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function taskRuntimeKey(childRunId: string): string {
  const scope = taskScope(childRunId);
  return `${scope.conversationId}/${scope.runId}/${scope.parentRunId}/task:${scope.childRunId}`;
}
