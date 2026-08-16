import type { AssistantMessage } from '@earendil-works/pi-ai';
import type {
  AgentTurnTimelineCompletionStatus,
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  AgentTurnTimelineToolCallItem,
  ConversationProjectionUpdate,
  ToolCall,
} from '@neko/agent-contracts';

import type { PiProductAgentEvent, PiProductEventSink } from './event-projector';
import type { PiToolRunIdentity } from './capability-tool-bridge';
import { projectPiToolResult } from './tool-result-projector';
import type { ConversationProjectionStore } from '../runtime/projection/conversation-projection-store';

type TimelineTextItem = Extract<
  AgentTurnTimelineItem,
  { readonly kind: 'assistant_text' | 'thinking' }
>;

interface PiTimelineProjectorState {
  identity?: PiToolRunIdentity;
  started: boolean;
  terminal: boolean;
  sequence: number;
  readonly textItems: Map<string, TimelineTextItem>;
  readonly toolItems: Map<string, AgentTurnTimelineToolCallItem>;
}

export interface PiTimelineProjectorOptions {
  readonly conversationId: string;
  readonly messageId: string;
  readonly projection: ConversationProjectionStore;
}

export interface PiTimelineProjector extends PiProductEventSink {
  readonly identity: PiToolRunIdentity | undefined;
  readonly terminal: boolean;
}

export function createPiTimelineProjector(
  options: PiTimelineProjectorOptions,
): PiTimelineProjector {
  return new DefaultPiTimelineProjector(options);
}

class DefaultPiTimelineProjector implements PiTimelineProjector {
  private state: PiTimelineProjectorState = {
    started: false,
    terminal: false,
    sequence: 0,
    textItems: new Map(),
    toolItems: new Map(),
  };

  constructor(private readonly options: PiTimelineProjectorOptions) {
    requireIdentity('conversationId', options.conversationId);
    requireIdentity('messageId', options.messageId);
    if (options.projection.conversationId !== options.conversationId) {
      throw new Error(
        `Pi Timeline projection owner mismatch: expected ${options.conversationId}, received ${options.projection.conversationId}.`,
      );
    }
  }

  get identity(): PiToolRunIdentity | undefined {
    return this.state.identity === undefined ? undefined : structuredClone(this.state.identity);
  }

  get terminal(): boolean {
    return this.state.terminal;
  }

  emit(event: PiProductAgentEvent): void {
    if (this.state.terminal) {
      if (event.type === 'usage' || event.type === 'turn.persistence') {
        const next = cloneState(this.state);
        bindAndValidateIdentity(next, event.identity, this.options.conversationId);
        this.state = next;
        return;
      }
      throw new Error(`Pi Timeline event ${event.type} arrived after terminal turn state.`);
    }
    const next = cloneState(this.state);
    bindAndValidateIdentity(next, event.identity, this.options.conversationId);
    const update = this.projectEvent(next, event);
    if (update) this.options.projection.apply(update);
    this.state = next;
  }

  private projectEvent(
    state: PiTimelineProjectorState,
    event: PiProductAgentEvent,
  ): ConversationProjectionUpdate | null {
    if (event.type === 'turn.started') {
      if (state.started) throw new Error('Pi Timeline received duplicate turn.started.');
      state.started = true;
      return null;
    }
    if (!state.started) {
      throw new Error(`Pi Timeline event ${event.type} arrived before turn.started.`);
    }

    switch (event.type) {
      case 'assistant.thinking.delta':
        return this.projectTextDelta(state, event, 'thinking', event.sourceIndex, event.delta);
      case 'assistant.text.delta':
        return this.projectTextDelta(
          state,
          event,
          'assistant_text',
          event.sourceIndex,
          event.delta,
        );
      case 'assistant.message.completed':
        return this.reconcileAssistantMessage(state, event, event.message);
      case 'tool.started':
        return this.projectToolStarted(state, event);
      case 'tool.updated':
        return this.projectToolUpdated(state, event);
      case 'confirmation.required':
        return this.projectConfirmation(state, event);
      case 'confirmation.resolved':
        return this.projectConfirmationResolved(state, event);
      case 'tool.completed':
        return this.projectToolCompleted(state, event);
      case 'turn.failed':
        return this.projectTerminal(state, event, 'failed', event.error);
      case 'turn.cancelled':
        return this.projectTerminal(
          state,
          event,
          'cancelled',
          event.reason ?? 'Pi turn was cancelled.',
        );
      case 'turn.completed':
        return this.projectTerminal(state, event, 'completed');
      case 'usage':
      case 'skill.activated':
      case 'turn.persistence':
        return null;
    }
  }

  private projectTextDelta(
    state: PiTimelineProjectorState,
    event: PiProductAgentEvent,
    kind: TimelineTextItem['kind'],
    sourceIndex: number,
    delta: string,
  ): ConversationProjectionUpdate {
    assertSourceIndex(sourceIndex);
    const operations =
      kind === 'assistant_text'
        ? completeStreamingItems(state, 'thinking', event.timestamp, 'complete')
        : [];
    const key = textKey(sourceIndex, kind);
    const current = state.textItems.get(key);
    const item = current
      ? updateTextItem(current, delta, event.timestamp)
      : createTextItem({
          state,
          identity: requireBoundIdentity(state),
          messageId: this.options.messageId,
          kind,
          sourceIndex,
          delta,
          timestamp: event.timestamp,
        });
    state.textItems.set(key, item);
    operations.push({
      operation: 'append',
      item: {
        ...item,
        payload: { ...item.payload, content: delta },
      } as TimelineTextItem,
    });
    return buildUpdate(state, this.options.messageId, operations);
  }

  private reconcileAssistantMessage(
    state: PiTimelineProjectorState,
    event: PiProductAgentEvent,
    message: AssistantMessage,
  ): ConversationProjectionUpdate | null {
    const operations: AgentTurnTimelineOperation[] = [];
    const observedTextKeys = new Set<string>();

    for (const [sourceIndex, content] of message.content.entries()) {
      if (content.type === 'text' || content.type === 'thinking') {
        const kind = content.type === 'text' ? 'assistant_text' : 'thinking';
        const finalContent = content.type === 'text' ? content.text : content.thinking;
        const key = textKey(sourceIndex, kind);
        observedTextKeys.add(key);
        const current = state.textItems.get(key);
        if (!current) {
          const item = createCompleteTextItem({
            state,
            identity: requireBoundIdentity(state),
            messageId: this.options.messageId,
            kind,
            sourceIndex,
            content: finalContent,
            timestamp: event.timestamp,
          });
          state.textItems.set(key, item);
          operations.push({ operation: 'snapshot', item });
        } else if (current.payload.content === finalContent) {
          if (current.status === 'streaming') {
            operations.push(completeTextItem(state, key, current, event.timestamp, 'complete'));
          }
        } else {
          const item = replaceTextItem(current, finalContent, event.timestamp);
          state.textItems.set(key, item);
          operations.push({ operation: 'replace', item });
        }
        continue;
      }

      if (content.type === 'toolCall') {
        const current = state.toolItems.get(content.id);
        const toolCall: ToolCall = {
          id: content.id,
          name: content.name,
          arguments: cloneRecord(content.arguments),
        };
        const item: AgentTurnTimelineToolCallItem = current
          ? {
              ...current,
              payload: { ...current.payload, toolCall },
              updatedAt: event.timestamp,
            }
          : createToolItem(
              state,
              requireBoundIdentity(state),
              this.options.messageId,
              toolCall,
              event.timestamp,
            );
        state.toolItems.set(content.id, item);
        operations.push({ operation: 'upsert', item });
        continue;
      }

      throw new Error(
        `Pi Timeline received unsupported assistant content at index ${sourceIndex}.`,
      );
    }

    for (const [key, item] of state.textItems) {
      if (!observedTextKeys.has(key) && item.status === 'streaming') {
        throw new Error(`Pi Timeline provider-final content omitted streamed item ${item.itemId}.`);
      }
    }
    state.textItems.clear();
    return operations.length === 0 ? null : buildUpdate(state, this.options.messageId, operations);
  }

  private projectToolStarted(
    state: PiTimelineProjectorState,
    event: Extract<PiProductAgentEvent, { readonly type: 'tool.started' }>,
  ): ConversationProjectionUpdate {
    const operations = completeStreamingItems(state, undefined, event.timestamp, 'complete');
    const current = state.toolItems.get(event.toolCallId);
    const toolCall: ToolCall = {
      id: event.toolCallId,
      name: event.toolName,
      arguments: cloneRecord(event.args),
    };
    const item = current
      ? {
          ...current,
          status: 'pending' as const,
          payload: { toolCall },
          updatedAt: event.timestamp,
        }
      : createToolItem(
          state,
          requireBoundIdentity(state),
          this.options.messageId,
          toolCall,
          event.timestamp,
        );
    state.toolItems.set(event.toolCallId, item);
    operations.push({ operation: 'upsert', item });
    return buildUpdate(state, this.options.messageId, operations);
  }

  private projectToolUpdated(
    state: PiTimelineProjectorState,
    event: Extract<PiProductAgentEvent, { readonly type: 'tool.updated' }>,
  ): ConversationProjectionUpdate {
    const current = requireToolItem(state, event.toolCallId, 'update');
    const item: AgentTurnTimelineToolCallItem = {
      ...current,
      payload: {
        ...current.payload,
        progress: normalizeToolProgress(event.update),
      },
      updatedAt: event.timestamp,
    };
    state.toolItems.set(event.toolCallId, item);
    return buildUpdate(state, this.options.messageId, [{ operation: 'upsert', item }]);
  }

  private projectConfirmation(
    state: PiTimelineProjectorState,
    event: Extract<PiProductAgentEvent, { readonly type: 'confirmation.required' }>,
  ): ConversationProjectionUpdate {
    const current = requireToolItem(state, event.toolCallId, 'confirmation');
    const item: AgentTurnTimelineToolCallItem = {
      ...current,
      payload: {
        ...current.payload,
        toolCall: {
          ...current.payload.toolCall,
          pendingConfirmation: true,
          confirmation: {
            action: event.toolName,
            description: event.summary,
            details: { confirmationId: event.confirmationId },
          },
        },
      },
      updatedAt: event.timestamp,
    };
    state.toolItems.set(event.toolCallId, item);
    return buildUpdate(state, this.options.messageId, [{ operation: 'upsert', item }]);
  }

  private projectToolCompleted(
    state: PiTimelineProjectorState,
    event: Extract<PiProductAgentEvent, { readonly type: 'tool.completed' }>,
  ): ConversationProjectionUpdate {
    const current = requireToolItem(state, event.toolCallId, 'completion');
    const result = projectPiToolResult(event.result, event.isError);
    const item: AgentTurnTimelineToolCallItem = {
      ...current,
      status: result.success ? 'succeeded' : 'failed',
      payload: {
        ...current.payload,
        toolCall: {
          ...current.payload.toolCall,
          result,
          pendingConfirmation: false,
        },
      },
      updatedAt: event.timestamp,
    };
    state.toolItems.set(event.toolCallId, item);
    return buildUpdate(state, this.options.messageId, [{ operation: 'upsert', item }]);
  }

  private projectConfirmationResolved(
    state: PiTimelineProjectorState,
    event: Extract<PiProductAgentEvent, { readonly type: 'confirmation.resolved' }>,
  ): ConversationProjectionUpdate {
    const current = requireToolItem(state, event.toolCallId, 'confirmation resolution');
    const toolCall = current.payload.toolCall;
    if (
      !toolCall.pendingConfirmation ||
      toolCall.confirmation?.details['confirmationId'] !== event.confirmationId
    ) {
      throw new Error(
        `Pi Timeline confirmation ${event.confirmationId} does not match pending Tool Call ${event.toolCallId}.`,
      );
    }
    const item: AgentTurnTimelineToolCallItem = {
      ...current,
      payload: {
        ...current.payload,
        toolCall: {
          ...toolCall,
          pendingConfirmation: false,
        },
      },
      updatedAt: event.timestamp,
    };
    state.toolItems.set(event.toolCallId, item);
    return buildUpdate(state, this.options.messageId, [{ operation: 'upsert', item }]);
  }

  private projectTerminal(
    state: PiTimelineProjectorState,
    event: PiProductAgentEvent,
    status: AgentTurnTimelineCompletionStatus,
    diagnostic?: string,
  ): ConversationProjectionUpdate {
    const operations = completeStreamingItems(
      state,
      undefined,
      event.timestamp,
      status === 'completed' ? 'complete' : 'failed',
    );
    const pendingTools = [...state.toolItems.values()].filter((item) => item.status === 'pending');
    if (status === 'completed' && pendingTools.length > 0) {
      throw new Error(
        `Pi Timeline cannot complete with pending Tool Calls: ${pendingTools
          .map((item) => item.payload.toolCall.id)
          .join(', ')}.`,
      );
    }
    for (const current of pendingTools) {
      const item: AgentTurnTimelineToolCallItem = {
        ...current,
        status: 'failed',
        payload: {
          ...current.payload,
          toolCall: {
            ...current.payload.toolCall,
            pendingConfirmation: false,
            result: {
              success: false,
              data: null,
              error: diagnostic ?? `Pi turn ${status}.`,
            },
          },
        },
        updatedAt: event.timestamp,
      };
      state.toolItems.set(item.payload.toolCall.id, item);
      operations.push({ operation: 'upsert', item });
    }
    if (status === 'failed') {
      const identity = requireBoundIdentity(state);
      const item: AgentTurnTimelineItem = {
        conversationId: identity.conversationId,
        turnId: identity.turnId,
        runId: identity.runId,
        messageId: this.options.messageId,
        itemId: `error-${nextSequence(state)}`,
        sequence: state.sequence,
        kind: 'error',
        status: 'failed',
        payload: {
          code: 'pi-turn-failed',
          message: diagnostic ?? 'Pi turn failed without a diagnostic.',
        },
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      operations.push({ operation: 'upsert', item });
    }
    state.terminal = true;
    return buildUpdate(state, this.options.messageId, operations, {
      status,
      completedAt: event.timestamp,
    });
  }
}

function buildUpdate(
  state: PiTimelineProjectorState,
  messageId: string,
  operations: readonly AgentTurnTimelineOperation[],
  completion?: {
    readonly status: AgentTurnTimelineCompletionStatus;
    readonly completedAt: number;
  },
): ConversationProjectionUpdate {
  const identity = requireBoundIdentity(state);
  return {
    type: 'agentTurnTimelineUpdate',
    conversationId: identity.conversationId,
    turnId: identity.turnId,
    runId: identity.runId,
    messageId,
    operations,
    ...(completion === undefined ? {} : { completion }),
  };
}

function bindAndValidateIdentity(
  state: PiTimelineProjectorState,
  identity: PiToolRunIdentity,
  conversationId: string,
): void {
  if (identity.conversationId !== conversationId) {
    throw new Error(
      `Pi Timeline identity mismatch: expected conversation ${conversationId}, received ${identity.conversationId}.`,
    );
  }
  if (!state.identity) {
    validateIdentity(identity);
    state.identity = structuredClone(identity);
    return;
  }
  for (const field of ['workspaceId', 'conversationId', 'branchId', 'turnId', 'runId'] as const) {
    if (state.identity[field] !== identity[field]) {
      throw new Error(
        `Pi Timeline identity mismatch for ${field}: expected ${state.identity[field]}, received ${identity[field]}.`,
      );
    }
  }
}

function validateIdentity(identity: PiToolRunIdentity): void {
  for (const [field, value] of Object.entries(identity)) {
    requireIdentity(field, value);
  }
}

function requireIdentity(field: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Pi Timeline ${field} must be non-empty.`);
  }
}

function requireBoundIdentity(state: PiTimelineProjectorState): PiToolRunIdentity {
  if (!state.identity) throw new Error('Pi Timeline identity has not been established.');
  return state.identity;
}

function createTextItem(input: {
  readonly state: PiTimelineProjectorState;
  readonly identity: PiToolRunIdentity;
  readonly messageId: string;
  readonly kind: TimelineTextItem['kind'];
  readonly sourceIndex: number;
  readonly delta: string;
  readonly timestamp: number;
}): TimelineTextItem {
  const sequence = nextSequence(input.state);
  const itemId = `${input.kind === 'assistant_text' ? 'text' : 'thinking'}-${sequence}`;
  const core = {
    conversationId: input.identity.conversationId,
    turnId: input.identity.turnId,
    runId: input.identity.runId,
    messageId: input.messageId,
    itemId,
    sequence,
    status: 'streaming' as const,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
  return input.kind === 'assistant_text'
    ? {
        ...core,
        kind: 'assistant_text',
        payload: {
          content: input.delta,
          format: 'markdown',
          sourceBlockId: itemId,
        },
      }
    : {
        ...core,
        kind: 'thinking',
        payload: {
          content: input.delta,
          sourceBlockId: itemId,
        },
      };
}

function createCompleteTextItem(input: {
  readonly state: PiTimelineProjectorState;
  readonly identity: PiToolRunIdentity;
  readonly messageId: string;
  readonly kind: TimelineTextItem['kind'];
  readonly sourceIndex: number;
  readonly content: string;
  readonly timestamp: number;
}): TimelineTextItem {
  const item = createTextItem({
    ...input,
    delta: input.content,
  });
  return { ...item, status: 'complete' };
}

function updateTextItem(
  current: TimelineTextItem,
  delta: string,
  timestamp: number,
): TimelineTextItem {
  return {
    ...current,
    payload: {
      ...current.payload,
      content: `${current.payload.content}${delta}`,
    },
    updatedAt: timestamp,
  } as TimelineTextItem;
}

function replaceTextItem(
  current: TimelineTextItem,
  content: string,
  timestamp: number,
): TimelineTextItem {
  return {
    ...current,
    status: 'complete',
    payload: {
      ...current.payload,
      content,
    },
    updatedAt: timestamp,
  } as TimelineTextItem;
}

function completeStreamingItems(
  state: PiTimelineProjectorState,
  kind: TimelineTextItem['kind'] | undefined,
  timestamp: number,
  status: 'complete' | 'failed',
): AgentTurnTimelineOperation[] {
  const operations: AgentTurnTimelineOperation[] = [];
  for (const [key, current] of state.textItems) {
    if (current.status !== 'streaming' || (kind !== undefined && current.kind !== kind)) {
      continue;
    }
    operations.push(completeTextItem(state, key, current, timestamp, status));
  }
  return operations;
}

function completeTextItem(
  state: PiTimelineProjectorState,
  key: string,
  current: TimelineTextItem,
  timestamp: number,
  status: 'complete' | 'failed',
): AgentTurnTimelineOperation {
  state.textItems.set(key, {
    ...current,
    status,
    updatedAt: timestamp,
  });
  return {
    operation: 'complete',
    itemId: current.itemId,
    kind: current.kind,
    status,
    updatedAt: timestamp,
  };
}

function createToolItem(
  state: PiTimelineProjectorState,
  identity: PiToolRunIdentity,
  messageId: string,
  toolCall: ToolCall,
  timestamp: number,
): AgentTurnTimelineToolCallItem {
  const sequence = nextSequence(state);
  return {
    conversationId: identity.conversationId,
    turnId: identity.turnId,
    runId: identity.runId,
    messageId,
    itemId: `tool-${toolCall.id}`,
    sequence,
    kind: 'tool_call',
    status: 'pending',
    payload: { toolCall },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function requireToolItem(
  state: PiTimelineProjectorState,
  toolCallId: string,
  eventName: string,
): AgentTurnTimelineToolCallItem {
  const item = state.toolItems.get(toolCallId);
  if (!item) {
    throw new Error(`Pi Timeline ${eventName} references unknown Tool Call ${toolCallId}.`);
  }
  return item;
}

function normalizeToolProgress(value: unknown): {
  readonly summary: string;
  readonly data?: unknown;
} {
  const record = asRecord(value);
  const details = asRecord(record?.['details']);
  const data = details?.['data'];
  const dataRecord = asRecord(data);
  const summary =
    readTextContent(record?.['content']) ??
    readNonEmptyString(dataRecord?.['stage']) ??
    readNonEmptyString(dataRecord?.['message']);
  if (!summary) {
    throw new Error('Pi Timeline received unsupported Tool progress payload.');
  }
  return {
    summary,
    ...(data === undefined ? {} : { data: structuredClone(data) }),
  };
}

function readTextContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const text = value
    .flatMap((part) => {
      const record = asRecord(part);
      return record?.['type'] === 'text' && typeof record['text'] === 'string'
        ? [record['text'].trim()]
        : [];
    })
    .filter((part) => part.length > 0)
    .join('\n');
  return text.length > 0 ? text : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return {};
  return structuredClone(record);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textKey(sourceIndex: number, kind: TimelineTextItem['kind']): string {
  return `${sourceIndex}:${kind}`;
}

function assertSourceIndex(sourceIndex: number): void {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    throw new Error(`Pi Timeline source index must be non-negative, received ${sourceIndex}.`);
  }
}

function nextSequence(state: PiTimelineProjectorState): number {
  state.sequence += 1;
  return state.sequence;
}

function cloneState(state: PiTimelineProjectorState): PiTimelineProjectorState {
  return {
    ...(state.identity === undefined ? {} : { identity: structuredClone(state.identity) }),
    started: state.started,
    terminal: state.terminal,
    sequence: state.sequence,
    textItems: new Map([...state.textItems].map(([key, item]) => [key, structuredClone(item)])),
    toolItems: new Map([...state.toolItems].map(([key, item]) => [key, structuredClone(item)])),
  };
}
