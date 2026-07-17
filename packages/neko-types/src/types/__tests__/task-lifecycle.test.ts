import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_LIFECYCLE_METADATA,
  TASK_TYPES,
  createTaskLifecycleMetadata,
  isTaskType,
  type SerializableTask,
  type TaskExecutionContext,
  type TaskLifecycleMetadata,
} from '../task';

describe('task lifecycle contracts', () => {
  it('provides conservative defaults for legacy tasks', () => {
    expect(DEFAULT_TASK_LIFECYCLE_METADATA).toEqual({
      runMode: 'foreground',
      costPhase: 'idle',
      interruptPolicy: 'cancel-with-agent',
      recoverPolicy: 'retry-executor',
    });

    expect(
      createTaskLifecycleMetadata({
        ownerConversationId: 'conversation-1',
        ownerRunId: 'run-1',
        ownerRunStartedAt: 101,
        runMode: 'background',
        costPhase: 'external-wait',
        interruptPolicy: 'detach-and-continue',
        recoverPolicy: 'resume-polling',
      }),
    ).toEqual({
      ownerConversationId: 'conversation-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'external-wait',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'resume-polling',
    });
  });

  it('allows older persisted tasks without lifecycle metadata', () => {
    const legacyTask: SerializableTask = {
      id: 'task-1',
      type: 'image_generation',
      status: 'pending',
      input: { type: 'image_generation', payload: { prompt: 'cat' } },
      progress: 0,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(legacyTask.lifecycle).toBeUndefined();
    expect(createTaskLifecycleMetadata(legacyTask.lifecycle)).toEqual(
      DEFAULT_TASK_LIFECYCLE_METADATA,
    );
  });

  it('exposes the canonical runtime task type validator', () => {
    expect(TASK_TYPES).toContain('image_generation');
    expect(isTaskType('workflow')).toBe(true);
    expect(isTaskType('speech_generation')).toBe(false);
  });

  it('keeps runtime cancellation handles out of serializable lifecycle metadata', () => {
    const lifecycle: TaskLifecycleMetadata = createTaskLifecycleMetadata({
      ownerConversationId: 'conversation-1',
      costPhase: 'token-active',
    });
    const controller = new AbortController();
    const context: TaskExecutionContext = {
      taskId: 'task-1',
      signal: controller.signal,
      reportLifecycle() {},
    };

    expect(JSON.stringify(lifecycle)).not.toContain('signal');
    expect(Object.keys(lifecycle)).not.toContain('signal');
    expect(context.signal).toBe(controller.signal);
  });
});
