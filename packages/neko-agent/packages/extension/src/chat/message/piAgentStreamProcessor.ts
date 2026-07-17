import type { Webview } from 'vscode';

import type { PiProductAgentEvent, PiProductEventSink } from '@neko/agent/pi';
import { buildAgentAssistantMessageFromStream } from '@neko/agent/runtime';
import type {
  AgentEventStreamRuntimeMessage,
  ConversationProjectionStore,
} from '@neko/agent/runtime';
import type {
  AgentPhase,
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  ContentBlock,
  ToolCall,
} from '@neko-agent/types';

import type { ConversationBridge } from '../conversationBridge';
import type { StreamProcessingResult } from './agentStreamProcessor';

export interface PiAgentStreamProcessorOptions {
  readonly webview: Webview;
  readonly conversationId: string;
  readonly messageId: string;
  readonly projection: ConversationProjectionStore;
  readonly conversations?: ConversationBridge;
  readonly onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
  readonly projectMessage: (
    message: AgentEventStreamRuntimeMessage,
  ) => Promise<AgentEventStreamRuntimeMessage>;
  readonly isActive: () => boolean;
}

export interface PiAgentStreamSession {
  readonly events: PiProductEventSink;
  result(): StreamProcessingResult;
  dispose(): void;
}

type TimelineToolItem = Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }>;
type TimelineTextItem = Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>;
type TimelineThinkingItem = Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }>;

export function createPiAgentStreamSession(
  options: PiAgentStreamProcessorOptions,
): PiAgentStreamSession {
  if (options.projection.conversationId !== options.conversationId) {
    throw new Error(
      `Pi stream projection owner mismatch: expected ${options.conversationId}, received ${options.projection.conversationId}.`,
    );
  }
  let turnId: string | undefined;
  let sequence = 0;
  let accumulatedResponse = '';
  let accumulatedThinking = '';
  let terminalStatus: StreamProcessingResult['terminalStatus'] | undefined;
  let errorMessage: string | undefined;
  let disposed = false;
  let activeText: TimelineTextItem | undefined;
  let activeThinking: TimelineThinkingItem | undefined;
  const toolItems = new Map<string, TimelineToolItem>();
  const collectedToolCalls = new Map<string, ToolCall>();
  const contentBlocks: ContentBlock[] = [];

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  const requireTurnId = (event: PiProductAgentEvent): string => {
    turnId ??= event.identity.turnId;
    if (
      turnId !== event.identity.turnId ||
      event.identity.conversationId !== options.conversationId
    ) {
      throw new Error(
        `Pi stream identity mismatch for ${event.identity.conversationId}/${event.identity.turnId}.`,
      );
    }
    return turnId;
  };

  const applyProjection = (input: {
    readonly operations: readonly AgentTurnTimelineOperation[];
    readonly completion?: {
      readonly status: StreamProcessingResult['terminalStatus'];
      readonly completedAt: number;
      readonly finalContentBlocks?: readonly ContentBlock[];
    };
  }): void => {
    if (!turnId || !options.isActive()) return;
    options.projection.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: options.conversationId,
      turnId,
      messageId: options.messageId,
      operations: input.operations,
      ...(input.completion === undefined ? {} : { completion: input.completion }),
    });
  };

  const post = async (message: AgentEventStreamRuntimeMessage) => {
    if (!options.isActive()) return;
    const projected = await options.projectMessage(message);
    await options.webview.postMessage(projected);
  };

  const completeOpenTextItems = (timestamp: number): AgentTurnTimelineOperation[] => {
    const operations: AgentTurnTimelineOperation[] = [];
    if (activeText) {
      operations.push({
        operation: 'complete',
        itemId: activeText.itemId,
        itemRevision: activeText.itemRevision + 1,
        kind: 'assistant_text',
        sourceGeneration: activeText.payload.sourceGeneration,
        status: 'complete',
        updatedAt: timestamp,
      });
      activeText = undefined;
    }
    if (activeThinking) {
      operations.push({
        operation: 'complete',
        itemId: activeThinking.itemId,
        itemRevision: activeThinking.itemRevision + 1,
        kind: 'thinking',
        sourceGeneration: activeThinking.payload.sourceGeneration,
        status: 'complete',
        updatedAt: timestamp,
      });
      activeThinking = undefined;
    }
    for (const block of contentBlocks) {
      if (block.type === 'text') block.isStreaming = false;
      if (block.type === 'thinking') block.isThinkingComplete = true;
    }
    return operations;
  };

  const upsertAssistantMessage = (isStreaming: boolean): void => {
    if (!options.isActive()) return;
    const message = buildAgentAssistantMessageFromStream({
      id: options.messageId,
      timestamp: Date.now(),
      stream: {
        accumulatedResponse,
        accumulatedThinking,
        hasError: terminalStatus === 'failed',
        terminalStatus: terminalStatus ?? 'completed',
        ...(errorMessage === undefined ? {} : { errorMessage }),
        collectedToolCalls: [...collectedToolCalls.values()],
        contentBlocks,
      },
    });
    if (message) {
      options.conversations?.upsertMessageToConversation(options.conversationId, {
        ...message,
        isStreaming,
        contentBlocks: message.contentBlocks?.map((block) => ({ ...block })),
      });
    }
  };

  const finalize = async (
    status: StreamProcessingResult['terminalStatus'],
    timestamp: number,
  ): Promise<void> => {
    if (terminalStatus !== undefined) {
      throw new Error(`Pi stream received duplicate terminal state ${status}.`);
    }
    terminalStatus = status;
    options.onPhaseChange('idle');
    applyProjection({
      operations: completeOpenTextItems(timestamp),
      completion: {
        status,
        completedAt: timestamp,
        ...(contentBlocks.length === 0
          ? {}
          : { finalContentBlocks: contentBlocks.map((block) => ({ ...block })) }),
      },
    });
    upsertAssistantMessage(false);
    await post({
      type: 'streamComplete',
      conversationId: options.conversationId,
      messageId: options.messageId,
      ...(contentBlocks.length === 0
        ? {}
        : { contentBlocks: contentBlocks.map((block) => ({ ...block })) }),
    });
  };

  const events: PiProductEventSink = {
    emit: async (event) => {
      if (disposed) throw new Error('Pi stream session is disposed.');
      const currentTurnId = requireTurnId(event);
      switch (event.type) {
        case 'turn.started':
          options.onPhaseChange('thinking');
          return;
        case 'assistant.thinking.delta': {
          options.onPhaseChange('thinking');
          accumulatedThinking += event.delta;
          const block = contentBlocks.find(
            (candidate) => candidate.id === activeThinking?.payload.sourceBlockId,
          );
          if (block?.type === 'thinking') block.thinking = `${block.thinking ?? ''}${event.delta}`;
          if (activeThinking) {
            activeThinking = {
              ...activeThinking,
              itemRevision: activeThinking.itemRevision + 1,
              payload: {
                ...activeThinking.payload,
                content: `${activeThinking.payload.content}${event.delta}`,
              },
              updatedAt: event.timestamp,
            };
          } else {
            const sourceBlockId = `block-thinking-${currentTurnId}-${nextSequence()}`;
            contentBlocks.push({
              id: sourceBlockId,
              type: 'thinking',
              timestamp: event.timestamp,
              thinking: event.delta,
              isThinkingComplete: false,
            });
            activeThinking = {
              conversationId: options.conversationId,
              turnId: currentTurnId,
              messageId: options.messageId,
              itemId: `thinking-${sequence}`,
              sequence,
              itemRevision: 1,
              kind: 'thinking',
              status: 'streaming',
              payload: { content: event.delta, sourceBlockId, sourceGeneration: 1 },
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
            };
          }
          applyProjection({
            operations: [
              {
                operation: 'append',
                item: {
                  ...activeThinking,
                  payload: { ...activeThinking.payload, content: event.delta },
                },
              },
            ],
          });
          await post({
            type: 'streamThinking',
            conversationId: options.conversationId,
            messageId: options.messageId,
            content: event.delta,
          });
          upsertAssistantMessage(true);
          return;
        }
        case 'assistant.text.delta': {
          options.onPhaseChange('streaming');
          const priorThinking = activeThinking;
          if (priorThinking) {
            const thinkingBlock = contentBlocks.find(
              (candidate) => candidate.id === priorThinking.payload.sourceBlockId,
            );
            if (thinkingBlock?.type === 'thinking') thinkingBlock.isThinkingComplete = true;
          }
          const priorCompletion: AgentTurnTimelineOperation[] = priorThinking
            ? [
                {
                  operation: 'complete',
                  itemId: priorThinking.itemId,
                  itemRevision: priorThinking.itemRevision + 1,
                  kind: 'thinking',
                  sourceGeneration: priorThinking.payload.sourceGeneration,
                  status: 'complete',
                  updatedAt: event.timestamp,
                },
              ]
            : [];
          activeThinking = undefined;
          accumulatedResponse += event.delta;
          const block = contentBlocks.find(
            (candidate) => candidate.id === activeText?.payload.sourceBlockId,
          );
          if (block?.type === 'text') block.content = `${block.content ?? ''}${event.delta}`;
          if (activeText) {
            activeText = {
              ...activeText,
              itemRevision: activeText.itemRevision + 1,
              payload: {
                ...activeText.payload,
                content: `${activeText.payload.content}${event.delta}`,
              },
              updatedAt: event.timestamp,
            };
          } else {
            const sourceBlockId = `block-text-${currentTurnId}-${nextSequence()}`;
            contentBlocks.push({
              id: sourceBlockId,
              type: 'text',
              timestamp: event.timestamp,
              content: event.delta,
              isStreaming: true,
            });
            activeText = {
              conversationId: options.conversationId,
              turnId: currentTurnId,
              messageId: options.messageId,
              itemId: `text-${sequence}`,
              sequence,
              itemRevision: 1,
              kind: 'assistant_text',
              status: 'streaming',
              payload: {
                content: event.delta,
                format: 'markdown',
                sourceBlockId,
                sourceGeneration: 1,
              },
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
            };
          }
          applyProjection({
            operations: [
              ...priorCompletion,
              {
                operation: 'append',
                item: { ...activeText, payload: { ...activeText.payload, content: event.delta } },
              },
            ],
          });
          await post({
            type: 'streamText',
            conversationId: options.conversationId,
            messageId: options.messageId,
            content: event.delta,
          });
          upsertAssistantMessage(true);
          return;
        }
        case 'tool.started': {
          options.onPhaseChange('acting', event.toolName);
          const operations = completeOpenTextItems(event.timestamp);
          const toolCall: ToolCall = {
            id: event.toolCallId,
            name: event.toolName,
            arguments: toRecord(event.args),
          };
          const item: TimelineToolItem = {
            conversationId: options.conversationId,
            turnId: currentTurnId,
            messageId: options.messageId,
            itemId: `tool-${event.toolCallId}`,
            sequence: nextSequence(),
            itemRevision: 1,
            kind: 'tool_call',
            status: 'pending',
            payload: { toolCall },
            createdAt: event.timestamp,
            updatedAt: event.timestamp,
          };
          toolItems.set(event.toolCallId, item);
          collectedToolCalls.set(event.toolCallId, toolCall);
          contentBlocks.push({
            id: `block-tool-${event.toolCallId}`,
            type: 'tool_call',
            timestamp: event.timestamp,
            toolCall,
          });
          applyProjection({ operations: [...operations, { operation: 'upsert', item }] });
          await post({
            type: 'toolCall',
            conversationId: options.conversationId,
            messageId: options.messageId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            arguments: toolCall.arguments,
          });
          upsertAssistantMessage(true);
          return;
        }
        case 'tool.updated':
          return;
        case 'tool.completed': {
          const existing = toolItems.get(event.toolCallId);
          if (!existing) throw new Error(`Pi completed unknown tool call ${event.toolCallId}.`);
          const projectedResult = readToolResult(event.result, event.isError);
          const toolCall: ToolCall = {
            id: existing.payload.toolCall.id,
            name: existing.payload.toolCall.name,
            arguments: existing.payload.toolCall.arguments,
            result: projectedResult,
          };
          const item: TimelineToolItem = {
            ...existing,
            itemRevision: existing.itemRevision + 1,
            status: projectedResult.success ? 'succeeded' : 'failed',
            payload: { toolCall },
            updatedAt: event.timestamp,
          };
          toolItems.set(event.toolCallId, item);
          collectedToolCalls.set(event.toolCallId, toolCall);
          const block = contentBlocks.find(
            (candidate) =>
              candidate.type === 'tool_call' && candidate.toolCall?.id === event.toolCallId,
          );
          if (block) block.toolCall = toolCall;
          applyProjection({ operations: [{ operation: 'upsert', item }] });
          await post({
            type: 'toolResult',
            conversationId: options.conversationId,
            messageId: options.messageId,
            toolCallId: event.toolCallId,
            success: projectedResult.success,
            data: projectedResult.data,
          });
          upsertAssistantMessage(true);
          return;
        }
        case 'confirmation.required': {
          const existing = toolItems.get(event.toolCallId);
          if (!existing) {
            throw new Error(`Pi requested confirmation for unknown tool call ${event.toolCallId}.`);
          }
          const toolCall: ToolCall = {
            ...existing.payload.toolCall,
            pendingConfirmation: true,
            confirmation: {
              action: event.toolName,
              description: event.summary,
              details: { confirmationId: event.confirmationId },
            },
          };
          const item: TimelineToolItem = {
            ...existing,
            itemRevision: existing.itemRevision + 1,
            status: 'pending',
            payload: { toolCall },
            updatedAt: event.timestamp,
          };
          toolItems.set(event.toolCallId, item);
          collectedToolCalls.set(event.toolCallId, toolCall);
          const block = contentBlocks.find(
            (candidate) =>
              candidate.type === 'tool_call' && candidate.toolCall?.id === event.toolCallId,
          );
          if (block) block.toolCall = toolCall;
          applyProjection({ operations: [{ operation: 'upsert', item }] });
          upsertAssistantMessage(true);
          return;
        }
        case 'turn.failed': {
          errorMessage = event.error;
          const item: AgentTurnTimelineItem = {
            conversationId: options.conversationId,
            turnId: currentTurnId,
            messageId: options.messageId,
            itemId: `error-${nextSequence()}`,
            sequence,
            itemRevision: 1,
            kind: 'error',
            status: 'failed',
            payload: { message: event.error, code: 'pi-turn-failed' },
            createdAt: event.timestamp,
            updatedAt: event.timestamp,
          };
          applyProjection({ operations: [{ operation: 'upsert', item }] });
          await post({
            type: 'error',
            conversationId: options.conversationId,
            message: event.error,
          });
          await finalize('failed', event.timestamp);
          return;
        }
        case 'turn.cancelled':
          await finalize('cancelled', event.timestamp);
          return;
        case 'turn.completed':
          await finalize('completed', event.timestamp);
          return;
        case 'assistant.message.completed':
        case 'usage':
        case 'task.observed':
        case 'turn.persistence':
          return;
      }
    },
  };

  return {
    events,
    result: () => {
      if (terminalStatus === undefined) {
        throw new Error('Pi stream completed without a terminal turn event.');
      }
      return {
        messageId: options.messageId,
        accumulatedResponse,
        accumulatedThinking,
        hasError: terminalStatus === 'failed',
        ...(errorMessage === undefined ? {} : { errorMessage }),
        terminalStatus,
        collectedToolCalls: [...collectedToolCalls.values()],
        contentBlocks: contentBlocks.map((block) => ({ ...block })),
      };
    },
    dispose: () => {
      disposed = true;
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}

function readToolResult(value: unknown, isError: boolean): NonNullable<ToolCall['result']> {
  if (isRecord(value) && isRecord(value.details) && typeof value.details.success === 'boolean') {
    return {
      success: value.details.success,
      data: value.details.data,
      ...(typeof value.details.error === 'string' ? { error: value.details.error } : {}),
    };
  }
  return {
    success: !isError,
    data: isRecord(value) && 'details' in value ? value.details : value,
    ...(isError ? { error: 'Pi tool execution failed.' } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
