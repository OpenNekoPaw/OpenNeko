import {
  createPiTimelineProjector,
  type PiProductAgentEvent,
  type PiProductEventSink,
} from '@neko/agent/pi';
import type { ConversationProjectionStore } from '@neko/agent/runtime';
import type { AgentPhase, AgentTurnTimelineItem, ContentBlock, ToolCall } from '@neko-agent/types';

export interface CollectedToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly result?: ToolCall['result'];
}

/** Frozen terminal history derived from the canonical conversation projection. */
export interface StreamProcessingResult {
  readonly messageId: string;
  readonly identity: {
    readonly turnId: string;
    readonly runId: string;
  };
  readonly accumulatedResponse: string;
  readonly accumulatedThinking: string;
  readonly hasError: boolean;
  readonly errorMessage?: string;
  readonly terminalStatus: 'completed' | 'cancelled' | 'failed';
  readonly collectedToolCalls: readonly CollectedToolCall[];
  readonly contentBlocks: readonly ContentBlock[];
}

export interface PiAgentStreamProcessorOptions {
  readonly conversationId: string;
  readonly messageId: string;
  readonly projection: ConversationProjectionStore;
  readonly onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
}

export interface PiAgentStreamSession {
  readonly events: PiProductEventSink;
  result(): StreamProcessingResult;
  dispose(): void;
}

export function createPiAgentStreamSession(
  options: PiAgentStreamProcessorOptions,
): PiAgentStreamSession {
  const projector = createPiTimelineProjector({
    conversationId: options.conversationId,
    messageId: options.messageId,
    projection: options.projection,
  });
  let disposed = false;

  const events: PiProductEventSink = {
    emit(event): void {
      if (disposed) throw new Error('Pi stream session is disposed.');
      projector.emit(event);
      projectPhase(options.onPhaseChange, event);
    },
  };

  return {
    events,
    result: () => {
      if (!projector.terminal) {
        throw new Error('Pi stream completed without a terminal turn event.');
      }
      const identity = projector.identity;
      if (!identity) throw new Error('Pi stream completed without an established identity.');
      const turn = options.projection
        .snapshot()
        .turns.find(
          (candidate) =>
            candidate.turnId === identity.turnId &&
            candidate.runId === identity.runId &&
            candidate.messageId === options.messageId,
        );
      if (!turn?.completion) {
        throw new Error(
          `Pi stream terminal projection is missing for ${identity.turnId}/${identity.runId}/${options.messageId}.`,
        );
      }
      return projectTerminalResult(options.messageId, identity, turn.items, turn.completion.status);
    },
    dispose: () => {
      disposed = true;
    },
  };
}

function projectPhase(
  onPhaseChange: (phase: AgentPhase, toolName?: string) => void,
  event: PiProductAgentEvent,
): void {
  switch (event.type) {
    case 'turn.started':
    case 'assistant.thinking.delta':
      onPhaseChange('thinking');
      return;
    case 'assistant.text.delta':
      onPhaseChange('streaming');
      return;
    case 'tool.started':
      onPhaseChange('acting', event.toolName);
      return;
    case 'turn.completed':
    case 'turn.cancelled':
    case 'turn.failed':
      onPhaseChange('idle');
      return;
    case 'assistant.message.completed':
    case 'tool.updated':
    case 'tool.completed':
    case 'usage':
    case 'confirmation.required':
    case 'turn.persistence':
      return;
  }
}

function projectTerminalResult(
  messageId: string,
  identity: { readonly turnId: string; readonly runId: string },
  items: readonly AgentTurnTimelineItem[],
  terminalStatus: StreamProcessingResult['terminalStatus'],
): StreamProcessingResult {
  const textItems = items.filter(
    (item): item is Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }> =>
      item.kind === 'assistant_text',
  );
  const thinkingItems = items.filter(
    (item): item is Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }> =>
      item.kind === 'thinking',
  );
  const toolItems = items.filter(
    (item): item is Extract<AgentTurnTimelineItem, { readonly kind: 'tool_call' }> =>
      item.kind === 'tool_call',
  );
  const errorItems = items.filter(
    (item): item is Extract<AgentTurnTimelineItem, { readonly kind: 'error' }> =>
      item.kind === 'error',
  );
  const errorMessage = errorItems
    .map((item) => item.payload.message)
    .find((message): message is string => message !== undefined);

  return {
    messageId,
    identity,
    accumulatedResponse: textItems.map((item) => item.payload.content).join(''),
    accumulatedThinking: thinkingItems.map((item) => item.payload.content).join(''),
    hasError: terminalStatus === 'failed',
    ...(errorMessage === undefined ? {} : { errorMessage }),
    terminalStatus,
    collectedToolCalls: toolItems.map((item) => structuredClone(item.payload.toolCall)),
    contentBlocks: items.flatMap(projectTerminalContentBlock),
  };
}

function projectTerminalContentBlock(item: AgentTurnTimelineItem): ContentBlock[] {
  switch (item.kind) {
    case 'assistant_text':
      return [
        {
          id: item.itemId,
          type: 'text',
          timestamp: item.createdAt,
          content: item.payload.content,
          isStreaming: false,
        },
      ];
    case 'thinking':
      return [
        {
          id: item.itemId,
          type: 'thinking',
          timestamp: item.createdAt,
          thinking: item.payload.content,
          isThinkingComplete: true,
        },
      ];
    case 'tool_call':
      return [
        {
          id: item.itemId,
          type: 'tool_call',
          timestamp: item.createdAt,
          toolCall: structuredClone(item.payload.toolCall) as ToolCall,
        },
      ];
    case 'composite':
      return [
        {
          id: item.itemId,
          type: 'composite',
          timestamp: item.createdAt,
          composite: structuredClone(item.payload.composite),
        },
      ];
    case 'error':
      return [];
  }
}
