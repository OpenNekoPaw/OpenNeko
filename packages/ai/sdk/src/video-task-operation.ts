import type { JSONValue } from '@ai-sdk/provider';

export interface VideoTaskOperation {
  readonly taskId: string;
}

export function createVideoTaskOperation(taskId: string): JSONValue {
  const normalized = taskId.trim();
  if (normalized.length === 0) {
    throw new Error('Video task operation requires a non-empty taskId.');
  }
  return { taskId: normalized };
}

export function decodeVideoTaskOperation(value: JSONValue): VideoTaskOperation {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof value['taskId'] !== 'string' ||
    value['taskId'].trim().length === 0
  ) {
    throw new Error('Video task operation must contain a non-empty taskId.');
  }
  return { taskId: value['taskId'].trim() };
}
