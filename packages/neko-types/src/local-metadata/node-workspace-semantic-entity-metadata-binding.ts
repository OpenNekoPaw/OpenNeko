import type {
  CreativeEntityCandidate,
  SemanticSourceAnalysisResult,
  SemanticSourceDescriptor,
} from '../types';
import { isSemanticSourceDescriptor } from '../types';
import { resolveGlobalStorageLayout } from '../types/storage';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import type { EntityAssetProjectionRecord, SemanticProjectionRecord } from './repositories';
import {
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  SEARCH_PROJECTION_MIGRATIONS,
} from './sqlite';

export interface SemanticEntitySourceCommitRequest {
  readonly source: SemanticSourceDescriptor;
  readonly result: SemanticSourceAnalysisResult;
  readonly expectedStoredFingerprint: string | null;
  readonly updatedAt: string;
}

export interface NodeWorkspaceSemanticEntityMetadataBinding {
  readonly workspaceId: string;
  readonly semanticPartition: LocalMetadataPartition;
  readonly entityPartition: LocalMetadataPartition;
  getSource(sourceId: string): Promise<SemanticProjectionRecord | null>;
  listSources(rootId?: string): Promise<readonly SemanticSourceDescriptor[]>;
  replaceSource(request: SemanticEntitySourceCommitRequest): Promise<void>;
  deleteSource(sourceId: string, updatedAt: string): Promise<boolean>;
  markSourceStale(sourceId: string, diagnostic: string, updatedAt: string): Promise<void>;
  listAutomaticCandidates(): Promise<readonly CreativeEntityCandidate[]>;
  readSemanticRevision(): Promise<LocalMetadataPartitionRevision | null>;
  readEntityRevision(): Promise<LocalMetadataPartitionRevision | null>;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceSemanticEntityMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceSemanticEntityMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    const identityResolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: options.workDir,
      homedir: options.homedir,
      metadataStore,
      ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const workspaceId = identityResolution.identity.workspaceId;
    const semanticPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId,
      domain: 'semantic-projection',
    };
    const entityPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId,
      domain: 'entity-asset-projection',
    };
    return {
      workspaceId,
      semanticPartition,
      entityPartition,
      getSource: (sourceId) =>
        metadataStore.repositories.semanticProjections.get(semanticPartition, sourceId),
      listSources: async (rootId) => {
        const records =
          await metadataStore.repositories.semanticProjections.list(semanticPartition);
        return records.flatMap((record) => {
          const descriptor = readSemanticSourceDescriptor(record);
          return descriptor && (!rootId || descriptor.rootId === rootId) ? [descriptor] : [];
        });
      },
      replaceSource: (request) =>
        metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'replace-semantic-entity-source',
          },
          async ({ repositories }) => {
            assertSourceCommit(request);
            const current = await repositories.semanticProjections.get(
              semanticPartition,
              request.source.sourceId,
            );
            const currentFingerprint = current?.sourceFingerprint ?? null;
            if (
              currentFingerprint !== request.expectedStoredFingerprint &&
              currentFingerprint !== request.source.fingerprint
            ) {
              throw new Error(
                `Semantic source ${request.source.sourceId} changed before metadata commit.`,
              );
            }
            await repositories.semanticProjections.replaceSource({
              partition: semanticPartition,
              source: semanticRecord(request),
              updatedAt: request.updatedAt,
            });
            await repositories.entityAssetProjections.replaceSource({
              partition: entityPartition,
              sourceId: request.source.sourceId,
              records: entityProjectionRecords(request),
              updatedAt: request.updatedAt,
            });
          },
        ),
      deleteSource: (sourceId, updatedAt) =>
        metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'delete-semantic-entity-source',
          },
          async ({ repositories }) => {
            const deleted = await repositories.semanticProjections.deleteSource(
              semanticPartition,
              sourceId,
              updatedAt,
            );
            await repositories.entityAssetProjections.replaceSource({
              partition: entityPartition,
              sourceId,
              records: [],
              updatedAt,
            });
            return deleted;
          },
        ),
      markSourceStale: (sourceId, diagnostic, updatedAt) =>
        metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'mark-semantic-entity-source-stale',
          },
          async ({ repositories }) => {
            const current = await repositories.semanticProjections.get(semanticPartition, sourceId);
            if (!current) {
              await repositories.projectionVersions.markStale({
                partition: semanticPartition,
                freshness: 'stale',
                diagnostic,
                updatedAt,
              });
              return;
            }
            await repositories.semanticProjections.replaceSource({
              partition: semanticPartition,
              source: {
                ...current,
                freshness: 'stale',
                updatedAt,
                index: {
                  ...current.index,
                  updatedAt,
                  metadata: {
                    ...(current.index.metadata ?? {}),
                    diagnostic,
                  },
                },
              },
              updatedAt,
            });
            const entityRecords = await repositories.entityAssetProjections.list({
              partition: entityPartition,
              sourceId,
            });
            await repositories.entityAssetProjections.replaceSource({
              partition: entityPartition,
              sourceId,
              records: entityRecords.map((record) => ({
                ...record,
                freshness: 'stale',
                updatedAt,
              })),
              updatedAt,
            });
          },
        ),
      listAutomaticCandidates: async () => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          kinds: ['entity-candidate'],
        });
        return records.flatMap((record) =>
          record.kind === 'entity-candidate' &&
          record.value.metadata?.['projectionKind'] === 'automatic-entity-candidate'
            ? [record.value]
            : [],
        );
      },
      readSemanticRevision: () => metadataStore.readPartitionRevision(semanticPartition),
      readEntityRevision: () => metadataStore.readPartitionRevision(entityPartition),
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}

function semanticRecord(request: SemanticEntitySourceCommitRequest): SemanticProjectionRecord {
  return {
    sourceId: request.source.sourceId,
    sourceFingerprint: request.source.fingerprint,
    provider: {
      providerId: 'neko.text-entity.deterministic',
      sourceIdentity: request.source.sourceId,
      indexVersion: 'text-entity-v1',
      schemaVersion: '1',
    },
    coverage: ['entity-mention'],
    freshness: 'fresh',
    index: {
      ...request.result.index,
      updatedAt: request.updatedAt,
      metadata: {
        ...(request.result.index.metadata ?? {}),
        semanticSource: {
          sourceId: request.source.sourceId,
          workspaceId: request.source.workspaceId,
          rootId: request.source.rootId,
          rootKind: request.source.rootKind,
          relativePath: request.source.relativePath,
          portablePath: request.source.portablePath,
          format: request.source.format,
          analysisMode: request.source.analysisMode,
          fingerprint: request.source.fingerprint,
          sizeBytes: request.source.sizeBytes,
          modifiedAtMs: request.source.modifiedAtMs,
        },
      },
    },
    updatedAt: request.updatedAt,
  };
}

function entityProjectionRecords(
  request: SemanticEntitySourceCommitRequest,
): readonly EntityAssetProjectionRecord[] {
  const occurrenceRecords: EntityAssetProjectionRecord[] = request.result.occurrences.map(
    (occurrence, index) => ({
      projectionId: `${request.source.sourceId}:occurrence:${index}`,
      kind: 'entity-occurrence',
      sourceId: request.source.sourceId,
      ...(occurrence.entityRef ? { entityId: occurrence.entityRef.entityId } : {}),
      ...(occurrence.candidateId ? { candidateId: occurrence.candidateId } : {}),
      freshness: 'fresh',
      value: occurrence,
      updatedAt: request.updatedAt,
    }),
  );
  const candidateRecords: EntityAssetProjectionRecord[] = request.result.candidates.map(
    (candidate) => ({
      projectionId: `${request.source.sourceId}:candidate:${candidate.id}`,
      kind: 'entity-candidate',
      sourceId: request.source.sourceId,
      candidateId: candidate.id,
      freshness: 'fresh',
      value: candidate,
      updatedAt: request.updatedAt,
    }),
  );
  return [...occurrenceRecords, ...candidateRecords];
}

function readSemanticSourceDescriptor(
  record: SemanticProjectionRecord,
): SemanticSourceDescriptor | undefined {
  const descriptor = record.index.metadata?.['semanticSource'];
  return isSemanticSourceDescriptor(descriptor) ? descriptor : undefined;
}

function assertSourceCommit(request: SemanticEntitySourceCommitRequest): void {
  if (request.source.sourceId !== request.result.sourceId) {
    throw new Error('Semantic analysis result source identity does not match the commit source.');
  }
  if (request.source.fingerprint !== request.result.sourceFingerprint) {
    throw new Error('Semantic analysis result fingerprint does not match the commit source.');
  }
  if (request.updatedAt !== request.result.index.updatedAt) {
    throw new Error('Semantic analysis result timestamp does not match the commit timestamp.');
  }
}
