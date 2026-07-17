import type { ProjectFileSaveReason } from './store';

export const PROJECT_FILE_SNAPSHOT_REQUEST = 'projectFile:requestSnapshot';
export const PROJECT_FILE_SNAPSHOT_RESPONSE = 'projectFile:snapshot';

export interface ProjectFileSnapshotRequestMessage {
  readonly type: typeof PROJECT_FILE_SNAPSHOT_REQUEST;
  readonly requestId: string;
  readonly formatId?: string;
  readonly saveReason?: ProjectFileSaveReason;
}

export interface ProjectFileSnapshotResponseMessage<TDocument = unknown> {
  readonly type: typeof PROJECT_FILE_SNAPSHOT_RESPONSE;
  readonly requestId: string;
  readonly ok: boolean;
  readonly document?: TDocument;
  readonly error?: string;
}

export function createProjectFileSnapshotRequestId(prefix = 'project-file-snapshot'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isProjectFileSnapshotRequestMessage(
  value: unknown,
): value is ProjectFileSnapshotRequestMessage {
  if (!isRecord(value)) return false;
  return value['type'] === PROJECT_FILE_SNAPSHOT_REQUEST && typeof value['requestId'] === 'string';
}

export function isProjectFileSnapshotResponseMessage<TDocument = unknown>(
  value: unknown,
): value is ProjectFileSnapshotResponseMessage<TDocument> {
  if (!isRecord(value)) return false;
  return (
    value['type'] === PROJECT_FILE_SNAPSHOT_RESPONSE &&
    typeof value['requestId'] === 'string' &&
    typeof value['ok'] === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
