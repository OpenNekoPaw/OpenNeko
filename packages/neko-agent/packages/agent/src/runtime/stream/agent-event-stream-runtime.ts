import type {
  AgentPhase,
  ContentBlock,
  Message,
  TaskCreatedMessage,
  TaskUpdatedMessage,
} from '@neko-agent/types';
import type { TaskRunLease } from '@neko/shared';
import type { AgentEvent } from '../../session/types';
import {
  applyAgentStreamEventToState,
  buildStreamCompleteProjectionMessage,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToHostMessages,
  type AgentStreamProjectionMessage,
  type AgentStreamCompositeProjector,
} from './agent-stream-state';
import {
  startAgentStreamBackgroundTaskObserver,
  type AgentStreamBackgroundTaskObservedProgress,
  type AgentStreamBackgroundTaskCompletion,
  type AgentStreamBackgroundTaskProgressErrorEvent,
  type AgentStreamBackgroundTaskTerminalEvent,
  type AgentStreamBackgroundTaskWaitInput,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type StartAgentStreamBackgroundTaskObserverInput,
} from './agent-stream-task-observer';
import type { AgentStreamPersistenceSnapshot } from '../turn/message-runtime';
import type { AgentStreamBackgroundTaskPersistInput } from './agent-stream-background-task';
import { buildAgentAssistantMessageFromStream } from '../turn/message-runtime';
import {
  createAgentTurnTimelineAccumulator,
  type AgentTurnTimelineAccumulator,
  type AgentTurnTimelineAccumulatorUpdate,
} from './agent-turn-timeline-accumulator';

export type AgentEventStreamRuntimeMessage =
  | AgentStreamProjectionMessage
  | AgentTurnTimelineAccumulatorUpdate
  | TaskCreatedMessage
  | TaskUpdatedMessage;

export interface AgentEventStreamRuntimeBackgroundTasks<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly waitForCompletion?: (input: AgentStreamBackgroundTaskWaitInput) => Promise<TSourceTask>;
  readonly createRecoveryProgress: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['createRecoveryProgress'];
  readonly createProgressDelivery: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['createProgressDelivery'];
  readonly persistResultUrls?: (
    input: AgentStreamBackgroundTaskPersistInput<TDeliveryPlan>,
  ) => void;
  readonly onTerminalTask?: (
    event: AgentStreamBackgroundTaskTerminalEvent<TSourceTask, TDeliveryPlan>,
  ) => void | Promise<void>;
  readonly onIgnoredConversationTask?: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['onIgnoredConversationTask'];
  readonly onProgressDeliveryError?: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['onProgressDeliveryError'];
  readonly onStaleTaskProgress?: StartAgentStreamBackgroundTaskObserverInput<
    TSourceTask,
    TDeliveryPlan
  >['onStaleTaskProgress'];
  readonly shouldForgetSubscriptionAfterProgressDelivery?: (
    progress: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>,
  ) => boolean;
  readonly shouldForgetSubscriptionAfterProgressError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => boolean;
}

export interface ProcessAgentEventStreamRuntimeInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly conversationId: string;
  readonly events: AsyncIterable<AgentEvent>;
  readonly messageId?: string;
  readonly createMessageId?: () => string;
  readonly postMessage: (message: AgentEventStreamRuntimeMessage) => void | Promise<void>;
  readonly onPhaseChange?: (phase: AgentPhase, toolName?: string) => void;
  readonly onPartialAssistantMessage?: (message: Message) => void;
  readonly partialAssistantSnapshotIntervalMs?: number;
  readonly backgroundTasks?: AgentEventStreamRuntimeBackgroundTasks<TSourceTask, TDeliveryPlan>;
  readonly projectCompositeBlock?: AgentStreamCompositeProjector;
  readonly now?: () => number;
  readonly timelineAccumulator?: AgentTurnTimelineAccumulator;
}

const DEFAULT_PARTIAL_ASSISTANT_SNAPSHOT_INTERVAL_MS = 250;

export class AgentEventStreamRuntimeProcessor<TSourceTask = unknown, TDeliveryPlan = unknown> {
  private readonly progressSubscriptionsByConversation = new Map<string, Set<() => void>>();

  async process(
    input: ProcessAgentEventStreamRuntimeInput<TSourceTask, TDeliveryPlan>,
  ): Promise<AgentStreamPersistenceSnapshot> {
    const streamingMessageId =
      input.messageId ?? input.createMessageId?.() ?? createAgentStreamMessageId();
    const streamState = createAgentStreamProjectionState();
    const partialSnapshotIntervalMs =
      input.partialAssistantSnapshotIntervalMs ?? DEFAULT_PARTIAL_ASSISTANT_SNAPSHOT_INTERVAL_MS;
    const timeline =
      input.timelineAccumulator ??
      createAgentTurnTimelineAccumulator({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        now: input.now,
      });
    const backgroundTaskCompletions: Promise<AgentStreamBackgroundTaskCompletion>[] = [];
    let awaitedBackgroundTaskCompletionCount = 0;
    let lastPartialSnapshotAt = 0;
    const awaitBackgroundTaskCompletions = async (): Promise<void> => {
      if (awaitedBackgroundTaskCompletionCount >= backgroundTaskCompletions.length) {
        return;
      }
      const pending = backgroundTaskCompletions.slice(awaitedBackgroundTaskCompletionCount);
      awaitedBackgroundTaskCompletionCount = backgroundTaskCompletions.length;
      await Promise.all(pending);
    };

    for await (const event of input.events) {
      const eventTime = input.now?.() ?? Date.now();
      const stateUpdate = applyAgentStreamEventToState(streamState, event, {
        now: () => eventTime,
      });
      if (stateUpdate.phaseChange) {
        input.onPhaseChange?.(stateUpdate.phaseChange.phase, stateUpdate.phaseChange.toolName);
      }

      const timelineMessage = timeline.project(event, eventTime);
      if (timelineMessage) {
        await input.postMessage(timelineMessage);
      }

      const messages = projectAgentStreamEventToHostMessages({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        event,
      });
      for (const message of messages) {
        if (message.type === 'streamComplete') {
          continue;
        }
        if (!shouldPostProjectionMessageToWebview(message)) {
          continue;
        }
        await input.postMessage(message);
      }

      if (event.type === 'tool_result') {
        const completion = this.subscribeToBackgroundTaskProgress(
          input,
          streamingMessageId,
          event,
          timeline,
        );
        if (completion) {
          backgroundTaskCompletions.push(completion);
        }
      }

      if (
        shouldEmitPartialAssistantSnapshot({
          event,
          eventTime,
          lastPartialSnapshotAt,
          partialSnapshotIntervalMs,
        })
      ) {
        const partialMessage = buildAgentAssistantMessageFromStream({
          id: streamingMessageId,
          timestamp: eventTime,
          stream: {
            accumulatedResponse: streamState.accumulatedResponse,
            accumulatedThinking: streamState.accumulatedThinking,
            hasError: streamState.hasError,
            terminalStatus: streamState.terminalStatus,
            ...(streamState.errorMessage ? { errorMessage: streamState.errorMessage } : {}),
            collectedToolCalls: streamState.collectedToolCalls,
            contentBlocks: streamState.contentBlocks,
          },
        });
        if (partialMessage) {
          lastPartialSnapshotAt = eventTime;
          input.onPartialAssistantMessage?.({
            ...partialMessage,
            isStreaming: true,
            contentBlocks: partialMessage.contentBlocks?.map((block) => ({ ...block })),
          });
        }
      }

      if (event.type === 'done') {
        await awaitBackgroundTaskCompletions();
      }
    }

    finalizeAgentStreamProjectionState(streamState, {
      projectCompositeBlock: input.projectCompositeBlock,
    });
    await awaitBackgroundTaskCompletions();
    const finalTimelineMessage = timeline.complete(
      streamState.contentBlocks,
      streamState.terminalStatus,
    );
    if (finalTimelineMessage) {
      await input.postMessage(finalTimelineMessage);
    }
    await input.postMessage(
      buildStreamCompleteProjectionMessage({
        conversationId: input.conversationId,
        messageId: streamingMessageId,
        contentBlocks: streamState.contentBlocks,
      }),
    );

    return {
      accumulatedResponse: streamState.accumulatedResponse,
      accumulatedThinking: streamState.accumulatedThinking,
      hasError: streamState.hasError,
      terminalStatus: streamState.terminalStatus,
      ...(streamState.errorMessage ? { errorMessage: streamState.errorMessage } : {}),
      collectedToolCalls: streamState.collectedToolCalls,
      contentBlocks: streamState.contentBlocks,
    };
  }

  clearConversation(conversationId: string): void {
    const subscriptions = this.progressSubscriptionsByConversation.get(conversationId);
    if (!subscriptions) {
      return;
    }

    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    this.progressSubscriptionsByConversation.delete(conversationId);
  }

  dispose(): void {
    for (const conversationId of Array.from(this.progressSubscriptionsByConversation.keys())) {
      this.clearConversation(conversationId);
    }
  }

  private subscribeToBackgroundTaskProgress(
    input: ProcessAgentEventStreamRuntimeInput<TSourceTask, TDeliveryPlan>,
    streamingMessageId: string,
    event: AgentEvent,
    timeline: AgentTurnTimelineAccumulator,
  ): Promise<AgentStreamBackgroundTaskCompletion> | undefined {
    const backgroundTasks = input.backgroundTasks;
    if (!backgroundTasks) {
      return undefined;
    }

    let trackedUnsubscribe: (() => void) | undefined;
    const forgetSubscription = () => {
      if (trackedUnsubscribe) {
        this.progressSubscriptionsByConversation
          .get(input.conversationId)
          ?.delete(trackedUnsubscribe);
      }
    };

    const observer = startAgentStreamBackgroundTaskObserver<TSourceTask, TDeliveryPlan>({
      lease: readBackgroundTaskRunLease(input.conversationId, event),
      conversationId: input.conversationId,
      messageId: streamingMessageId,
      event,
      postMessage: async (message) => {
        const timelineMessage = timeline.projectWorkItem(message.workItem);
        if (timelineMessage) {
          await input.postMessage(timelineMessage);
        }
      },
      observeProgress: backgroundTasks.observeProgress,
      waitForCompletion: backgroundTasks.waitForCompletion,
      createRecoveryProgress: backgroundTasks.createRecoveryProgress,
      createProgressDelivery: async (task, context) => {
        const progress = await backgroundTasks.createProgressDelivery(task, context);
        if (backgroundTasks.shouldForgetSubscriptionAfterProgressDelivery?.(progress)) {
          forgetSubscription();
        }
        return progress;
      },
      persistResultUrls: backgroundTasks.persistResultUrls,
      onTerminalTask: backgroundTasks.onTerminalTask,
      onIgnoredConversationTask: (ignoredEvent) => {
        backgroundTasks.onIgnoredConversationTask?.(ignoredEvent);
        forgetSubscription();
      },
      onProgressDeliveryError: (errorEvent) => {
        backgroundTasks.onProgressDeliveryError?.(errorEvent);
        if (backgroundTasks.shouldForgetSubscriptionAfterProgressError?.(errorEvent)) {
          forgetSubscription();
        }
      },
      onStaleTaskProgress: backgroundTasks.onStaleTaskProgress,
      now: input.now,
    });

    if (observer.started && observer.unsubscribe) {
      trackedUnsubscribe = observer.unsubscribe;
      this.trackProgressSubscription(input.conversationId, trackedUnsubscribe);
    }
    return observer.started ? observer.completion : undefined;
  }

  private trackProgressSubscription(conversationId: string, unsubscribe: () => void): void {
    const subscriptions = this.progressSubscriptionsByConversation.get(conversationId) ?? new Set();
    subscriptions.add(unsubscribe);
    this.progressSubscriptionsByConversation.set(conversationId, subscriptions);
  }
}

function shouldEmitPartialAssistantSnapshot(input: {
  readonly event: AgentEvent;
  readonly eventTime: number;
  readonly lastPartialSnapshotAt: number;
  readonly partialSnapshotIntervalMs: number;
}): boolean {
  if (!isPersistablePartialEvent(input.event)) {
    return false;
  }
  if (input.lastPartialSnapshotAt === 0) {
    return true;
  }
  if (input.partialSnapshotIntervalMs <= 0) {
    return true;
  }
  if (isStructuralPartialEvent(input.event)) {
    return true;
  }
  return input.eventTime - input.lastPartialSnapshotAt >= input.partialSnapshotIntervalMs;
}

function shouldPostProjectionMessageToWebview(message: AgentStreamProjectionMessage): boolean {
  switch (message.type) {
    case 'messageQueued':
    case 'contextTokenCount':
    case 'streamComplete':
      return true;
    case 'streamThinking':
    case 'streamText':
    case 'toolCall':
    case 'toolResult':
    case 'toolResultBackfill':
    case 'toolConfirmation':
    case 'error':
      return false;
  }
  return false;
}

function isPersistablePartialEvent(event: AgentEvent): boolean {
  return (
    event.type === 'thinking_content' ||
    event.type === 'text' ||
    event.type === 'text_delta' ||
    event.type === 'assistant_text_replacement' ||
    event.type === 'tool_call' ||
    event.type === 'tool_result' ||
    event.type === 'tool_result_backfill' ||
    event.type === 'error'
  );
}

function isStructuralPartialEvent(event: AgentEvent): boolean {
  return (
    event.type === 'tool_call' ||
    event.type === 'tool_result' ||
    event.type === 'tool_result_backfill' ||
    event.type === 'error'
  );
}

function readBackgroundTaskRunLease(
  conversationId: string,
  event: AgentEvent,
): TaskRunLease | undefined {
  if (event.type !== 'tool_result') {
    return undefined;
  }

  const data = event.toolResult?.data;
  const dataRecord = isRecord(data) ? data : undefined;
  const candidateRecords = [
    event.toolResult?.metadata,
    dataRecord,
    isRecord(dataRecord?.['trace']) ? dataRecord['trace'] : undefined,
  ];

  for (const candidate of candidateRecords) {
    if (!candidate) {
      continue;
    }
    const runId = readString(candidate, 'runId');
    if (!runId) {
      continue;
    }
    const candidateConversationId = readString(candidate, 'conversationId') ?? conversationId;
    const runStartedAt = readNumber(candidate, 'runStartedAt');
    return {
      conversationId: candidateConversationId,
      runId,
      ...(runStartedAt !== undefined ? { runStartedAt } : {}),
    };
  }

  return undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
