import { requireExactRecord, requireIdentity, requireIsoDate } from './codec';
import {
  parseNarrativeStorylineNodeSelection,
  type NarrativeStorylineNodeSelection,
} from './character-conversation-launch';

export type CharacterNarrativeConversationRef =
  | { readonly topology: 'dialogue'; readonly dialogueRunId: string }
  | { readonly topology: 'chatroom'; readonly roomRunId: string };

export interface CharacterNarrativeTurnReceipt {
  readonly turnId: string;
  readonly primaryAgentSessionId: string;
  readonly characterRunId: string;
  readonly characterVersionId: string;
  readonly conversation: CharacterNarrativeConversationRef;
  readonly storyline?: NarrativeStorylineNodeSelection;
  readonly startedAt: string;
}

export function parseCharacterNarrativeTurnReceipt(value: unknown): CharacterNarrativeTurnReceipt {
  const record = requireExactRecord(
    value,
    [
      'turnId',
      'primaryAgentSessionId',
      'characterRunId',
      'characterVersionId',
      'conversation',
      'storyline',
      'startedAt',
    ],
    'Character Narrative turn receipt',
  );
  return {
    turnId: requireIdentity(record['turnId'], 'Character Narrative turn'),
    primaryAgentSessionId: requireIdentity(
      record['primaryAgentSessionId'],
      'Character Narrative primary AgentSession',
    ),
    characterRunId: requireIdentity(record['characterRunId'], 'Character Narrative CharacterRun'),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character Narrative CharacterVersion',
    ),
    conversation: parseConversationRef(record['conversation']),
    ...(record['storyline'] === undefined
      ? {}
      : { storyline: parseNarrativeStorylineNodeSelection(record['storyline']) }),
    startedAt: requireIsoDate(record['startedAt'], 'Character Narrative turn startedAt'),
  };
}

function parseConversationRef(value: unknown): CharacterNarrativeConversationRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Character Narrative Conversation ref must be an object.');
  }
  const topology = (value as Record<string, unknown>)['topology'];
  if (topology === 'dialogue') {
    const record = requireExactRecord(
      value,
      ['topology', 'dialogueRunId'],
      'Character Narrative Dialogue ref',
    );
    return {
      topology,
      dialogueRunId: requireIdentity(record['dialogueRunId'], 'Character Narrative DialogueRun'),
    };
  }
  const record = requireExactRecord(
    value,
    ['topology', 'roomRunId'],
    'Character Narrative Room ref',
  );
  if (record['topology'] !== 'chatroom') {
    throw new Error('Character Narrative Conversation topology is unsupported.');
  }
  return {
    topology: 'chatroom',
    roomRunId: requireIdentity(record['roomRunId'], 'Character Narrative RoomRun'),
  };
}
