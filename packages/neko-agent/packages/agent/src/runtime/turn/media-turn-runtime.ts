import {
  buildAgentErrorAssistantMessage,
  type BuildAgentErrorAssistantMessageInput,
} from './message-runtime';
import {
  buildAgentPhaseMessage,
  buildErrorMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildStreamCompleteMessage,
  projectMediaTaskToWorkItem,
  type AgentPhaseMessage,
  type AgentMediaTaskView,
  type ErrorMessage,
  type MediaModelCategory,
  type MediaTaskCreatedMessage,
  type MediaTaskProgressMessage,
  type Message,
  type ModelRef,
  type StreamCompleteMessage,
} from '@neko-agent/types';

export type AgentMediaTurnRuntimeMessage =
  | AgentPhaseMessage
  | ErrorMessage
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | StreamCompleteMessage;

export interface AgentMediaTurnTaskEvent<
  TTaskView extends AgentMediaTaskView = AgentMediaTaskView,
  TSourceTask = unknown,
> {
  readonly conversationId: string;
  readonly task: TTaskView;
  readonly sourceTask: TSourceTask;
}

export interface AgentMediaTurnIgnoredTaskEvent<TSourceTask = unknown> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
}

export interface AgentMediaTurnProgressErrorEvent<
  TTaskView extends AgentMediaTaskView = AgentMediaTaskView,
  TSourceTask = unknown,
> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
  readonly error: unknown;
  readonly recoveryTask?: TTaskView;
}

export interface AgentMediaTurnExecutionInput<
  TTaskView extends AgentMediaTaskView = AgentMediaTaskView,
  TSourceTask = unknown,
> {
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
  readonly conversationId: string;
  readonly onTaskCreated: (
    event: AgentMediaTurnTaskEvent<TTaskView, TSourceTask>,
  ) => void | Promise<void>;
  readonly onTaskProgress: (
    event: AgentMediaTurnTaskEvent<TTaskView, TSourceTask>,
  ) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (event: AgentMediaTurnIgnoredTaskEvent<TSourceTask>) => void;
  readonly onAlreadyTerminalTask?: (event: AgentMediaTurnIgnoredTaskEvent<TSourceTask>) => void;
  readonly onProgressDeliveryError?: (
    event: AgentMediaTurnProgressErrorEvent<TTaskView, TSourceTask>,
  ) => void;
}

export interface RunAgentMediaTurnInput<
  TTaskView extends AgentMediaTaskView = AgentMediaTaskView,
  TSourceTask = unknown,
> {
  readonly conversationId: string;
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
  readonly executeMediaTurn?: (
    input: AgentMediaTurnExecutionInput<TTaskView, TSourceTask>,
  ) => Promise<unknown>;
  readonly postMessage: (message: AgentMediaTurnRuntimeMessage) => void;
  readonly now?: () => number;
  readonly persistErrorMessage?: (message: Message) => void;
  readonly buildErrorMessageInput?: (message: string) => BuildAgentErrorAssistantMessageInput;
  readonly unavailableMessage?: string;
  readonly failureMessage?: string;
  readonly onExecutionError?: (error: unknown) => void;
  readonly onIgnoredConversationTask?: (event: AgentMediaTurnIgnoredTaskEvent<TSourceTask>) => void;
  readonly onAlreadyTerminalTask?: (event: AgentMediaTurnIgnoredTaskEvent<TSourceTask>) => void;
  readonly onProgressDeliveryError?: (
    event: AgentMediaTurnProgressErrorEvent<TTaskView, TSourceTask>,
  ) => void;
}

export type RunAgentMediaTurnResult =
  | { readonly status: 'submitted' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed'; readonly error: unknown };

export async function runAgentMediaTurn<
  TTaskView extends AgentMediaTaskView = AgentMediaTaskView,
  TSourceTask = unknown,
>(input: RunAgentMediaTurnInput<TTaskView, TSourceTask>): Promise<RunAgentMediaTurnResult> {
  const publishErrorMessage = (message: string): void => {
    const errorMessageInput = input.buildErrorMessageInput?.(message) ?? {
      id: `media-error-${Date.now()}`,
      timestamp: Date.now(),
      message,
    };
    input.persistErrorMessage?.(buildAgentErrorAssistantMessage(errorMessageInput));
    input.postMessage(
      buildErrorMessage({
        conversationId: input.conversationId,
        message,
      }),
    );
  };
  const executeMediaTurn = input.executeMediaTurn;
  if (!executeMediaTurn) {
    publishErrorMessage(input.unavailableMessage ?? 'Media generation is unavailable');
    return { status: 'unavailable' };
  }

  try {
    await executeMediaTurn({
      prompt: input.prompt,
      mediaModel: input.mediaModel,
      conversationId: input.conversationId,
      onTaskCreated: (event) => {
        if (!isMediaTurnEventForConversation(event, input.conversationId)) {
          input.onIgnoredConversationTask?.({
            taskId: event.task.id,
            conversationId: input.conversationId,
            sourceTask: event.sourceTask,
          });
          return;
        }
        input.postMessage(
          buildMediaTaskCreatedMessage({
            conversationId: input.conversationId,
            parentScope: 'turn',
            workItem: projectMediaTaskToWorkItem({
              conversationId: input.conversationId,
              task: event.task,
            }),
          }),
        );
      },
      onTaskProgress: (event) => {
        if (!isMediaTurnEventForConversation(event, input.conversationId)) {
          input.onIgnoredConversationTask?.({
            taskId: event.task.id,
            conversationId: input.conversationId,
            sourceTask: event.sourceTask,
          });
          return;
        }
        input.postMessage(
          buildMediaTaskProgressMessage({
            conversationId: input.conversationId,
            parentScope: 'turn',
            workItem: projectMediaTaskToWorkItem({
              conversationId: input.conversationId,
              task: event.task,
            }),
          }),
        );
        if (isTerminalMediaTurnStatus(event.task.status)) {
          input.postMessage(
            buildStreamCompleteMessage({
              conversationId: input.conversationId,
              messageId: `media-turn:${event.task.id}`,
            }),
          );
          input.postMessage(
            buildAgentPhaseMessage({
              conversationId: input.conversationId,
              phase: 'idle',
              timestamp: input.now?.() ?? Date.now(),
            }),
          );
        }
      },
      onIgnoredConversationTask: input.onIgnoredConversationTask,
      onAlreadyTerminalTask: input.onAlreadyTerminalTask,
      onProgressDeliveryError: input.onProgressDeliveryError,
    });
    return { status: 'submitted' };
  } catch (error) {
    input.onExecutionError?.(error);
    publishErrorMessage(
      error instanceof Error ? error.message : (input.failureMessage ?? 'Media generation failed'),
    );
    return { status: 'failed', error };
  }
}

function isMediaTurnEventForConversation(
  event: AgentMediaTurnTaskEvent<AgentMediaTaskView, unknown>,
  conversationId: string,
): boolean {
  return event.conversationId === conversationId;
}

function isTerminalMediaTurnStatus(status: AgentMediaTaskView['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
