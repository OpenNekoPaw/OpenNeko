import type { SessionTreeEntry } from '@earendil-works/pi-agent-core';
import type { MessageTurnTiming } from '@neko/agent-contracts';

export const PI_TURN_PRESENTATION_TIMING_CUSTOM_TYPE = 'openneko.turn-presentation-timing' as const;

export interface PiTurnPresentationTiming extends Required<MessageTurnTiming> {
  readonly turnId: string;
}

export function isPiTurnPresentationTimingEntry(entry: SessionTreeEntry): entry is Extract<
  SessionTreeEntry,
  { readonly type: 'custom' }
> & {
  readonly customType: typeof PI_TURN_PRESENTATION_TIMING_CUSTOM_TYPE;
} {
  return entry.type === 'custom' && entry.customType === PI_TURN_PRESENTATION_TIMING_CUSTOM_TYPE;
}

export function parsePiTurnPresentationTiming(value: unknown): PiTurnPresentationTiming {
  const record = requireRecord(value);
  const allowed = new Set(['turnId', 'startedAt', 'completedAt']);
  if (!Object.keys(record).every((key) => allowed.has(key))) {
    throw new TypeError('Pi Turn presentation timing contains unknown fields.');
  }
  const turnId = requireText(record['turnId']);
  const startedAt = requireTimestamp(record['startedAt'], 'startedAt');
  const completedAt = requireTimestamp(record['completedAt'], 'completedAt');
  if (completedAt < startedAt) {
    throw new TypeError('Pi Turn presentation timing completedAt precedes startedAt.');
  }
  return { turnId, startedAt, completedAt };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError('Pi Turn presentation timing must be an object.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\u0000')) {
    throw new TypeError('Pi Turn presentation timing turnId must be non-empty text.');
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`Pi Turn presentation timing ${field} must be a finite timestamp.`);
  }
  return value;
}
