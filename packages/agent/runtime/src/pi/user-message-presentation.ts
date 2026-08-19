import type { SessionTreeEntry } from '@earendil-works/pi-agent-core';
import { parseMessageContextReference, type MessageContextReference } from '@neko/agent-contracts';

export const PI_USER_MESSAGE_PRESENTATION_CUSTOM_TYPE =
  'openneko.user-message-presentation' as const;

export interface PiUserMessagePresentation {
  readonly turnId: string;
  readonly content: string;
  readonly contextReferences?: readonly MessageContextReference[];
}

export function isPiUserMessagePresentationEntry(entry: SessionTreeEntry): entry is Extract<
  SessionTreeEntry,
  { readonly type: 'custom' }
> & {
  readonly customType: typeof PI_USER_MESSAGE_PRESENTATION_CUSTOM_TYPE;
} {
  return entry.type === 'custom' && entry.customType === PI_USER_MESSAGE_PRESENTATION_CUSTOM_TYPE;
}

export function parsePiUserMessagePresentation(value: unknown): PiUserMessagePresentation {
  const record = requireRecord(value, 'Pi user message presentation must be an object.');
  const allowed = new Set(['turnId', 'content', 'contextReferences']);
  if (!Object.keys(record).every((key) => allowed.has(key))) {
    throw new TypeError('Pi user message presentation contains unknown fields.');
  }
  const turnId = requireText(record['turnId'], 'Pi user message presentation turnId');
  const content = requireText(record['content'], 'Pi user message presentation content', true);
  const references = record['contextReferences'];
  if (references !== undefined && !Array.isArray(references)) {
    throw new TypeError('Pi user message presentation contextReferences must be an array.');
  }
  const contextReferences = references?.map(parseMessageContextReference);
  return {
    turnId,
    content,
    ...(contextReferences && contextReferences.length > 0 ? { contextReferences } : {}),
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.includes('\u0000')
  ) {
    throw new TypeError(`${label} must be ${allowEmpty ? 'valid' : 'non-empty'} text.`);
  }
  return value;
}
