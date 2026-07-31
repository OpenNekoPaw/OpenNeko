import {
  parsePortableMediaLibrarySnapshotCheckpointPayload,
  parsePortableMediaLibrarySnapshotTaskPayload,
  type PortableMediaLibrarySnapshotCheckpointPayload,
  type PortableMediaLibrarySnapshotTaskPayload,
} from '../types/asset/workspace-media-library-sync';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';
import type {
  LocalMetadataRepositories,
  MediaMetadataRepository,
  TaskCheckpointRecord,
  TaskStateRecord,
} from './repositories';

export const WORKSPACE_MEDIA_LIBRARY_SYNC_METADATA_DOMAIN = 'workspace-media-library-sync' as const;
export const WORKSPACE_MEDIA_LIBRARY_PROBE_METADATA_DOMAIN =
  'workspace-media-library-probe' as const;

export interface WorkspaceMediaLibrarySyncMetadataBinding {
  readonly workspaceId: string;
  readonly projectionPartition: LocalMetadataPartition;
  readonly mediaProbePartition: LocalMetadataPartition;
  readonly mediaMetadata: MediaMetadataRepository;
  readProjectionRevision(): Promise<LocalMetadataPartitionRevision | null>;
  recordProjection(input: {
    readonly freshness: LocalMetadataPartitionRevision['freshness'];
    readonly diagnostic: string | null;
    readonly updatedAt: string;
  }): Promise<LocalMetadataPartitionRevision>;
  markProjectionStale(input: {
    readonly diagnostic: string;
    readonly updatedAt: string;
  }): Promise<LocalMetadataPartitionRevision>;
  writeSnapshotTask(
    payload: PortableMediaLibrarySnapshotTaskPayload,
    timestamp: number,
  ): Promise<void>;
  readSnapshotTask(snapshotId: string): Promise<PortableMediaLibrarySnapshotTaskPayload | null>;
  findCompletedSnapshot(
    requirementRevision: string,
  ): Promise<PortableMediaLibrarySnapshotTaskPayload | null>;
  findResumableSnapshot(): Promise<PortableMediaLibrarySnapshotTaskPayload | null>;
  writeSnapshotCheckpoint(
    payload: PortableMediaLibrarySnapshotCheckpointPayload,
    timestamp: number,
  ): Promise<void>;
  readSnapshotCheckpoint(
    snapshotId: string,
  ): Promise<PortableMediaLibrarySnapshotCheckpointPayload | null>;
}

export function createWorkspaceMediaLibrarySyncMetadataBinding(input: {
  readonly workspaceId: string;
  readonly repositories: LocalMetadataRepositories;
}): WorkspaceMediaLibrarySyncMetadataBinding {
  const projectionPartition: LocalMetadataPartition = {
    scope: 'workspace',
    workspaceId: input.workspaceId,
    domain: WORKSPACE_MEDIA_LIBRARY_SYNC_METADATA_DOMAIN,
  };
  const mediaProbePartition: LocalMetadataPartition = {
    scope: 'workspace',
    workspaceId: input.workspaceId,
    domain: WORKSPACE_MEDIA_LIBRARY_PROBE_METADATA_DOMAIN,
  };
  return {
    workspaceId: input.workspaceId,
    projectionPartition,
    mediaProbePartition,
    mediaMetadata: input.repositories.mediaMetadata,
    readProjectionRevision: () => input.repositories.projectionVersions.get(projectionPartition),
    recordProjection: ({ freshness, diagnostic, updatedAt }) =>
      input.repositories.projectionVersions.increment({
        partition: projectionPartition,
        freshness,
        diagnostic,
        updatedAt,
      }),
    markProjectionStale: ({ diagnostic, updatedAt }) =>
      input.repositories.projectionVersions.markStale({
        partition: projectionPartition,
        freshness: 'stale',
        diagnostic,
        updatedAt,
      }),
    async writeSnapshotTask(payload, timestamp): Promise<void> {
      const parsed = parsePortableMediaLibrarySnapshotTaskPayload(payload);
      requireWorkspace(input.workspaceId, parsed.workspaceId);
      const existing = await input.repositories.tasks.get(
        input.workspaceId,
        snapshotTaskKey(parsed.snapshotId),
      );
      const record: TaskStateRecord = {
        workspaceId: input.workspaceId,
        taskKey: snapshotTaskKey(parsed.snapshotId),
        taskId: parsed.snapshotId,
        status: parsed.status,
        payload: parsed,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await input.repositories.tasks.upsert(record);
    },
    async readSnapshotTask(snapshotId): Promise<PortableMediaLibrarySnapshotTaskPayload | null> {
      const record = await input.repositories.tasks.get(
        input.workspaceId,
        snapshotTaskKey(snapshotId),
      );
      return record ? parsePortableMediaLibrarySnapshotTaskPayload(record.payload) : null;
    },
    async findCompletedSnapshot(
      requirementRevision,
    ): Promise<PortableMediaLibrarySnapshotTaskPayload | null> {
      const records = await input.repositories.tasks.list({
        workspaceId: input.workspaceId,
        statuses: ['completed'],
      });
      const matches = records
        .filter((record) => record.taskKey.startsWith(SNAPSHOT_TASK_KEY_PREFIX))
        .map((record) => ({
          payload: parsePortableMediaLibrarySnapshotTaskPayload(record.payload),
          updatedAt: record.updatedAt,
        }))
        .filter(({ payload }) => payload.requirementRevision === requirementRevision)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      return matches[0]?.payload ?? null;
    },
    async findResumableSnapshot(): Promise<PortableMediaLibrarySnapshotTaskPayload | null> {
      const records = await input.repositories.tasks.list({
        workspaceId: input.workspaceId,
        statuses: ['planned', 'running', 'failed'],
      });
      const matches = records
        .filter((record) => record.taskKey.startsWith(SNAPSHOT_TASK_KEY_PREFIX))
        .map((record) => ({
          payload: parsePortableMediaLibrarySnapshotTaskPayload(record.payload),
          updatedAt: record.updatedAt,
        }))
        .sort((left, right) => right.updatedAt - left.updatedAt);
      return matches[0]?.payload ?? null;
    },
    async writeSnapshotCheckpoint(payload, timestamp): Promise<void> {
      const parsed = parsePortableMediaLibrarySnapshotCheckpointPayload(payload);
      requireWorkspace(input.workspaceId, parsed.workspaceId);
      const record: TaskCheckpointRecord = {
        workspaceId: input.workspaceId,
        taskKey: snapshotTaskKey(parsed.snapshotId),
        taskId: parsed.snapshotId,
        payload: parsed,
        updatedAt: timestamp,
      };
      await input.repositories.taskCheckpoints.upsert(record);
    },
    async readSnapshotCheckpoint(
      snapshotId,
    ): Promise<PortableMediaLibrarySnapshotCheckpointPayload | null> {
      const record = await input.repositories.taskCheckpoints.get(
        input.workspaceId,
        snapshotTaskKey(snapshotId),
      );
      return record ? parsePortableMediaLibrarySnapshotCheckpointPayload(record.payload) : null;
    },
  };
}

function snapshotTaskKey(snapshotId: string): string {
  return `${SNAPSHOT_TASK_KEY_PREFIX}${snapshotId}`;
}

const SNAPSHOT_TASK_KEY_PREFIX = 'system:media-library-portable-snapshot:';

function requireWorkspace(expected: string, actual: string): void {
  if (expected !== actual) {
    throw new Error('Portable snapshot payload belongs to another workspace.');
  }
}
