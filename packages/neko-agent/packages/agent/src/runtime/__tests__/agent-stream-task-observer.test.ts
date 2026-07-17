import { describe, expect, it, vi } from 'vitest';
import type { TaskRunScope } from '@neko/shared';
import {
  startAgentStreamBackgroundTaskObserver,
  type ObserveAgentStreamBackgroundTaskProgressInput,
} from '../stream/agent-stream-task-observer';

interface SourceTask {
  readonly id: string;
}

function taskScope(
  conversationId = 'conv-1',
  runId = 'run-1',
  childRunId = 'task-1',
): TaskRunScope {
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}

function createLease(conversationId = 'conv-1', runId = 'run-1') {
  return { conversationId, runId, runStartedAt: 101 };
}

function createBackgroundToolResultEvent(
  taskId = 'task-1',
  conversationId = 'conv-1',
  runId = 'run-1',
) {
  return {
    type: 'tool_result' as const,
    toolResult: {
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskId,
        taskScope: taskScope(conversationId, runId, taskId),
        type: 'image',
        message: 'Generate a cat',
        routedTo: { provider: 'openai' },
      },
    },
  };
}

describe('agent stream task observer runtime', () => {
  it('posts taskCreated and subscribes with conversation isolation settings', () => {
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly kind: 'plan' }>
      | undefined;
    const unsubscribe = vi.fn();
    const postMessage = vi.fn();

    const result = startAgentStreamBackgroundTaskObserver<SourceTask, { readonly kind: 'plan' }>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
        return unsubscribe;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
        deliveryPlan: { kind: 'plan' },
      }),
    });

    expect(result).toMatchObject({
      started: true,
      taskId: 'task-1',
    });
    expect(result.started ? result.unsubscribe : undefined).toEqual(expect.any(Function));
    if (result.started) {
      result.unsubscribe?.();
    }
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskCreated',
        conversationId: 'conv-1',
        messageId: 'msg-stream',
      }),
    );
    expect(observerInput).toMatchObject({
      lease: createLease(),
      taskId: 'task-1',
      conversationId: 'conv-1',
      unsubscribeOnIgnoredConversation: true,
    });
  });

  it('projects progress updates and persists result urls through injected effects', async () => {
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly kind: 'plan' }>
      | undefined;
    const postMessage = vi.fn();
    const persistResultUrls = vi.fn();

    const result = startAgentStreamBackgroundTaskObserver<SourceTask, { readonly kind: 'plan' }>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
          result: { urls: ['neko://generated/cat.png'] },
        },
        deliveryPlan: { kind: 'plan' },
        persistResultUrls: ['/tmp/cat.png'],
      }),
      persistResultUrls,
    });

    expect(observerInput).toBeDefined();
    await observerInput!.onTaskProgress({
      lease: createLease(),
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
          result: { urls: ['neko://generated/cat.png'] },
        },
        deliveryPlan: { kind: 'plan' },
        persistResultUrls: ['/tmp/cat.png'],
      },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: expect.objectContaining({
          id: 'task-1',
          kind: 'tool-background-task',
          status: 'completed',
          progress: 100,
        }),
      }),
    );
    expect(persistResultUrls).toHaveBeenCalledWith({
      lease: createLease(),
      conversationId: 'conv-1',
      taskScope: taskScope(),
      taskId: 'task-1',
      toolCallId: 'tool-1',
      urls: ['/tmp/cat.png'],
      deliveryPlan: { kind: 'plan' },
    });
    await expect(result.started ? result.completion : Promise.resolve(null)).resolves.toEqual({
      status: 'completed',
    });
  });

  it('emits terminal background task events through a narrow port', async () => {
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly kind: 'plan' }>
      | undefined;
    const onTerminalTask = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask, { readonly kind: 'plan' }>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage: vi.fn(),
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
        deliveryPlan: { kind: 'plan' },
      }),
      onTerminalTask,
    });

    await observerInput!.onTaskProgress({
      lease: createLease(),
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
        deliveryPlan: { kind: 'plan' },
      },
    });

    expect(onTerminalTask).toHaveBeenCalledWith({
      lease: createLease(),
      conversationId: 'conv-1',
      taskScope: taskScope(),
      taskId: 'task-1',
      parentMessageId: 'msg-stream',
      parentToolCallId: 'tool-1',
      task: expect.objectContaining({ id: 'task-1', status: 'completed' }),
      sourceTask: { id: 'task-1' },
      deliveryPlan: { kind: 'plan' },
    });
  });

  it('ignores progress delivered for a different conversation', () => {
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();
    const onIgnoredConversationTask = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
      onIgnoredConversationTask,
    });

    observerInput!.onTaskProgress({
      lease: createLease('conv-other', 'run-other'),
      taskScope: taskScope('conv-other', 'run-other'),
      conversationId: 'conv-other',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(onIgnoredConversationTask).toHaveBeenCalledWith({
      lease: createLease(),
      taskScope: taskScope(),
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
  });

  it('marks progress stale when the run lease does not match', async () => {
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();
    const onStaleTaskProgress = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease('conv-1', 'run-1'),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
      onStaleTaskProgress,
    });

    await observerInput!.onTaskProgress({
      lease: createLease('conv-1', 'run-other'),
      taskScope: taskScope('conv-1', 'run-other'),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(onStaleTaskProgress).toHaveBeenCalledWith({
      reason: 'lease-mismatch',
      expectedLease: createLease('conv-1', 'run-1'),
      lease: createLease('conv-1', 'run-other'),
      taskScope: taskScope(),
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
  });

  it('marks late progress stale after a terminal task update settles the observer', async () => {
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();
    const onStaleTaskProgress = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
      onStaleTaskProgress,
    });

    await observerInput!.onTaskProgress({
      lease: createLease(),
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });
    await observerInput!.onTaskProgress({
      lease: createLease(),
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 40,
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
      },
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(onStaleTaskProgress).toHaveBeenCalledWith({
      reason: 'settled',
      expectedLease: createLease(),
      lease: createLease(),
      taskScope: taskScope(),
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
  });

  it('marks late progress stale after observer cancellation settles the lease', async () => {
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();
    const onStaleTaskProgress = vi.fn();
    const unsubscribe = vi.fn();

    const result = startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: createBackgroundToolResultEvent(),
      postMessage,
      observeProgress: (input) => {
        observerInput = input;
        return unsubscribe;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 40,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
      onStaleTaskProgress,
    });

    if (!result.started) {
      throw new Error('expected observer to start');
    }
    result.unsubscribe?.();

    await observerInput!.onTaskProgress({
      lease: createLease(),
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 40,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(onStaleTaskProgress).toHaveBeenCalledWith({
      reason: 'settled',
      expectedLease: createLease(),
      lease: createLease(),
      taskScope: taskScope(),
      taskId: 'task-1',
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
    });
    await expect(result.completion).resolves.toEqual({ status: 'cancelled' });
  });

  it('keeps simultaneous background task progress scoped to each conversation', async () => {
    let observerA: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    let observerB: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    const postMessage = vi.fn();

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease('conv-a', 'run-a'),
      conversationId: 'conv-a',
      messageId: 'msg-a',
      event: createBackgroundToolResultEvent('task-a', 'conv-a', 'run-a'),
      postMessage,
      observeProgress: (input) => {
        observerA = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 40,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
    });

    startAgentStreamBackgroundTaskObserver<SourceTask>({
      lease: createLease('conv-b', 'run-b'),
      conversationId: 'conv-b',
      messageId: 'msg-b',
      event: createBackgroundToolResultEvent('task-b', 'conv-b', 'run-b'),
      postMessage,
      observeProgress: (input) => {
        observerB = input;
      },
      createRecoveryProgress: (task) => ({
        id: task.id,
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: (task) => ({
        progress: {
          id: task.id,
          status: 'processing',
          progress: 60,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
    });

    await observerA!.onTaskProgress({
      lease: createLease('conv-a', 'run-a'),
      taskScope: taskScope('conv-a', 'run-a', 'task-a'),
      conversationId: 'conv-a',
      sourceTask: { id: 'task-a' },
      task: {
        progress: {
          id: 'task-a',
          status: 'processing',
          progress: 40,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });
    await observerB!.onTaskProgress({
      lease: createLease('conv-b', 'run-b'),
      taskScope: taskScope('conv-b', 'run-b', 'task-b'),
      conversationId: 'conv-b',
      sourceTask: { id: 'task-b' },
      task: {
        progress: {
          id: 'task-b',
          status: 'processing',
          progress: 60,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });
    await observerA!.onTaskProgress({
      lease: createLease('conv-b', 'run-b'),
      taskScope: taskScope('conv-b', 'run-b', 'task-b'),
      conversationId: 'conv-b',
      sourceTask: { id: 'task-b' },
      task: {
        progress: {
          id: 'task-b',
          status: 'processing',
          progress: 90,
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
      },
    });

    const taskUpdates = postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === 'taskUpdated');
    expect(taskUpdates).toEqual([
      expect.objectContaining({
        conversationId: 'conv-a',
        workItem: expect.objectContaining({ conversationId: 'conv-a', id: 'task-a' }),
      }),
      expect.objectContaining({
        conversationId: 'conv-b',
        workItem: expect.objectContaining({ conversationId: 'conv-b', id: 'task-b' }),
      }),
    ]);
  });

  it('returns started=false for non-background tool results', () => {
    const result = startAgentStreamBackgroundTaskObserver({
      lease: createLease(),
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      event: {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: { taskId: 'task-1' },
        },
      },
      postMessage: vi.fn(),
      createRecoveryProgress: () => ({
        id: 'task-1',
        status: 'processing',
        progress: 1,
        updatedAt: '2026-01-01T00:00:01.000Z',
      }),
      createProgressDelivery: () => ({
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      }),
    });

    expect(result).toEqual({ started: false });
  });
});
