import type {
  AgentTurnTimelineAssistantTextItem,
  ConversationProjectionUpdate,
} from '@neko-agent/types';
import type { NpcTranscriptMessage } from '@neko/shared';

export interface CharacterConversationProjection {
  apply(update: ConversationProjectionUpdate): unknown;
}

export interface CharacterResponseProjectionInput {
  readonly conversationId: string;
  readonly response: NpcTranscriptMessage;
}

export function projectCharacterResponse(
  projection: CharacterConversationProjection,
  input: CharacterResponseProjectionInput,
): void {
  const turnIndex = requireTurnIndex(input.response);
  const timestamp = parseTimestamp(input.response.createdAt);
  const turnId = `${input.conversationId}:turn:${turnIndex}`;
  const runId = `${turnId}:run`;
  const item: AgentTurnTimelineAssistantTextItem = {
    kind: 'assistant_text',
    conversationId: input.conversationId,
    turnId,
    runId,
    messageId: input.response.id,
    itemId: `${input.response.id}:assistant-text`,
    sequence: 1,
    itemRevision: 1,
    status: 'complete',
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: {
      content: input.response.content,
      format: 'markdown',
      sourceGeneration: 1,
    },
  };

  projection.apply({
    type: 'agentTurnTimelineUpdate',
    conversationId: input.conversationId,
    turnId,
    runId,
    messageId: input.response.id,
    operations: [{ operation: 'snapshot', item }],
    completion: {
      status: 'completed',
      completedAt: timestamp,
    },
  });
}

function requireTurnIndex(message: NpcTranscriptMessage): number {
  const turnIndex = message.turnIndex;
  if (!Number.isInteger(turnIndex) || turnIndex === undefined || turnIndex <= 0) {
    throw new Error(`Character response ${message.id} requires a positive turn index.`);
  }
  return turnIndex;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Character response timestamp is invalid: ${value}`);
  }
  return timestamp;
}
