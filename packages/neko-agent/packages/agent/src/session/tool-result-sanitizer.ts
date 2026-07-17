import type {
  PerceptionCard,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
} from '@neko/shared';

export interface SanitizableToolResult {
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export interface SanitizedToolResultFields {
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export function sanitizeToolCallArgumentsForHistory(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeToolCallArgumentValueInternal(value, new WeakSet<object>());
  return isRecord(sanitized) ? sanitized : {};
}

export function sanitizeToolResultFieldsForHistory(
  result: SanitizableToolResult,
): SanitizedToolResultFields {
  return {
    data: sanitizeToolResultValueForHistory(result.data),
    attachments: sanitizeToolResultValueForHistory(result.attachments) as
      readonly ToolResultAttachment[] | undefined,
    perceptionCards: sanitizeToolResultValueForHistory(result.perceptionCards) as
      readonly PerceptionCard[] | undefined,
    artifacts: sanitizeToolResultValueForHistory(result.artifacts) as
      readonly ToolResultArtifactTransfer[] | undefined,
  };
}

export function sanitizeToolResultValueForHistory(value: unknown): unknown {
  return sanitizeToolResultValueInternal(value, new WeakSet<object>());
}

function sanitizeToolCallArgumentValueInternal(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = sanitizeToolCallArgumentValueInternal(item, visited);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const next = sanitizeToolCallArgumentValueInternal(item, visited);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

function sanitizeToolResultValueInternal(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitized = sanitizeToolResultValueInternal(item, visited);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const next = sanitizeToolResultValueInternal(item, visited);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
