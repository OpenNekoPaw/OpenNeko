// =============================================================================
// NKV Format SDK — Operation History Persistence
//
// Serializes/deserializes undo/redo stacks for persistence across sessions.
// Large binary data (e.g., sketch RegionSnapshot.data) is stripped to keep
// history files compact.
// =============================================================================

import type { BatchOperation, EditOperation } from '../operations/types';
import type { ProjectData } from '../types/project';

// =============================================================================
// Types
// =============================================================================

/** Serialized form of an EditOperation — JSON-safe, no non-serializable data */
export interface SerializedOperation {
  type: string;
  meta: {
    id: string;
    timestamp: number;
    source: string;
    description?: string;
  };
  payload: Record<string, unknown>;
  before?: Record<string, unknown>;
}

/** Snapshot of the full undo/redo history */
export interface OperationHistorySnapshot {
  /** History format version */
  version: '1.0';
  /** Corresponding .nkv project version */
  projectVersion: string;
  /** Project name for identification */
  projectName: string;
  /** Serialized undo stack (oldest first) */
  undoStack: SerializedOperation[];
  /** Serialized redo stack (oldest first) */
  redoStack: SerializedOperation[];
  /** Timestamp when history was saved */
  savedAt: number;
}

// =============================================================================
// Sentinel for skipped binary data
// =============================================================================

const SKIPPED_SENTINEL = '__skipped__';

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize undo/redo stacks into a persistable snapshot.
 *
 * Strips large binary data (sketch RegionSnapshot.data) to keep size compact.
 * Pure function — does not mutate inputs.
 */
export function serializeHistory(
  undoStack: EditOperation[],
  redoStack: EditOperation[],
  project: ProjectData,
): OperationHistorySnapshot {
  return {
    version: '1.0',
    projectVersion: project.version,
    projectName: project.name,
    undoStack: undoStack.map(serializeOperation),
    redoStack: redoStack.map(serializeOperation),
    savedAt: Date.now(),
  };
}

/**
 * Deserialize a history snapshot back into undo/redo stacks.
 *
 * Operations with skipped binary data will have sentinel values —
 * these operations cannot be undone/redone (they are informational only).
 */
export function deserializeHistory(snapshot: OperationHistorySnapshot): {
  undoStack: EditOperation[];
  redoStack: EditOperation[];
} {
  return {
    undoStack: snapshot.undoStack.map(deserializeOperation),
    redoStack: snapshot.redoStack.map(deserializeOperation),
  };
}

/**
 * Serialize a history snapshot to a JSON string.
 */
export function saveHistory(snapshot: OperationHistorySnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Parse a JSON string into a history snapshot.
 * Returns null if the JSON is invalid or the snapshot is malformed.
 */
export function loadHistory(json: string): OperationHistorySnapshot | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!isValidSnapshot(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

function serializeOperation(op: EditOperation): SerializedOperation {
  let payload: Record<string, unknown>;
  if (op.type === 'batch') {
    payload = { operations: (op as BatchOperation).payload.operations.map(serializeOperation) };
  } else {
    payload =
      (op as Exclude<EditOperation, BatchOperation> & { payload: Record<string, unknown> })
        .payload ?? {};
  }

  const result: SerializedOperation = {
    type: op.type,
    meta: { ...op.meta },
    payload: stripBinaryData(payload),
  };

  if ('before' in op && op.before !== undefined) {
    result.before = stripBinaryData(op.before as Record<string, unknown>);
  }

  return result;
}

function deserializeOperation(serialized: SerializedOperation): EditOperation {
  const base: Record<string, unknown> = {
    type: serialized.type,
    meta: { ...serialized.meta },
    payload: serialized.payload,
  };

  if (serialized.before !== undefined) {
    base.before = serialized.before;
  }

  return base as unknown as EditOperation;
}

/**
 * Deep-clone a record, replacing large base64 strings with a sentinel.
 * Applies to any large base64-like operation field, independent of the owning domain.
 */
function stripBinaryData(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      // Skip large base64 strings before history persistence.
      if (typeof value === 'string' && value.length > 1024 && isBase64Like(value)) {
        return SKIPPED_SENTINEL;
      }
      return value;
    }),
  ) as Record<string, unknown>;
}

/** Heuristic check for base64-encoded data */
function isBase64Like(s: string): boolean {
  // Base64 strings are alphanumeric with +/= padding, no spaces
  return /^[A-Za-z0-9+/]+=*$/.test(s.slice(0, 100));
}

/** Validate that parsed JSON matches OperationHistorySnapshot shape */
function isValidSnapshot(data: unknown): data is OperationHistorySnapshot {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    obj['version'] === '1.0' &&
    typeof obj['projectVersion'] === 'string' &&
    typeof obj['projectName'] === 'string' &&
    Array.isArray(obj['undoStack']) &&
    Array.isArray(obj['redoStack']) &&
    typeof obj['savedAt'] === 'number'
  );
}
