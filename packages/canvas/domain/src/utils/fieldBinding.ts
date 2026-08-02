// =============================================================================
// Field Binding Utilities
//
// Pure JSON Pointer-style read/write helpers used by composable Canvas content.
// =============================================================================

import type { FieldBinding, JsonPointerPath } from '../types/canvas-layered';

export interface FieldBindingReadResult {
  found: boolean;
  value: unknown;
}

export interface FieldBindingWriteResult<TData> {
  data: TData;
  changed: boolean;
}

export function readFieldBinding(data: unknown, binding: FieldBinding): FieldBindingReadResult {
  const result = readJsonPointer(data, binding.path);

  if (!result.found && binding.defaultValue !== undefined) {
    return { found: false, value: binding.defaultValue };
  }

  return result;
}

export function writeFieldBinding<TData>(
  data: TData,
  binding: FieldBinding,
  value: unknown,
): FieldBindingWriteResult<TData> {
  if (binding.mode === 'read') {
    return { data, changed: false };
  }

  return writeJsonPointer(data, binding.path, value);
}

export function readJsonPointer(data: unknown, path: JsonPointerPath): FieldBindingReadResult {
  if (path === '') {
    return { found: true, value: data };
  }

  let current: unknown = data;
  for (const segment of parseJsonPointer(path)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }

    if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
      continue;
    }

    return { found: false, value: undefined };
  }

  return { found: true, value: current };
}

export function writeJsonPointer<TData>(
  data: TData,
  path: JsonPointerPath,
  value: unknown,
): FieldBindingWriteResult<TData> {
  if (path === '') {
    return { data: value as TData, changed: true };
  }

  const segments = parseJsonPointer(path);
  if (segments.length === 0) {
    return { data, changed: false };
  }

  const nextData = cloneContainer(data, segments[0]);
  let current: unknown = nextData;

  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (segment === undefined || nextSegment === undefined) {
      return { data, changed: false };
    }

    if (!isContainer(current)) {
      return { data, changed: false };
    }

    const existing = getContainerValue(current, segment);
    const next = cloneContainer(existing, nextSegment);
    setContainerValue(current, segment, next);
    current = next;
  }

  const leaf = segments[segments.length - 1];
  if (leaf === undefined || !isContainer(current)) {
    return { data, changed: false };
  }

  setContainerValue(current, leaf, value);

  return { data: nextData as TData, changed: true };
}

export function isJsonPointerPath(path: string): path is JsonPointerPath {
  return path === '' || path.startsWith('/');
}

export function parseJsonPointer(path: JsonPointerPath): string[] {
  if (path === '') {
    return [];
  }

  return path
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function cloneContainer(value: unknown, nextSegment: string | undefined): unknown {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (isRecord(value)) {
    return { ...value };
  }

  return nextSegment !== undefined && /^\d+$/.test(nextSegment) ? [] : {};
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return isRecord(value) || Array.isArray(value);
}

function getContainerValue(container: Record<string, unknown> | unknown[], key: string): unknown {
  if (Array.isArray(container)) {
    return container[Number(key)];
  }

  return container[key];
}

function setContainerValue(
  container: Record<string, unknown> | unknown[],
  key: string,
  value: unknown,
): void {
  if (Array.isArray(container)) {
    container[Number(key)] = value;
    return;
  }

  container[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
