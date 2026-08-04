import type {
  ProjectEntityDiscoveryOccurrenceQuery,
  ProjectEntityDiscoveryProjectionBatch,
  ProjectEntityDiscoveryProjectionPort,
  SemanticEntityOccurrenceRecord,
  SemanticOccurrenceEntityLinks,
  SemanticSourceAnalysisResult,
  SemanticSourceDescriptor,
} from '@neko/search-domain';
import type {
  EntityAssetProjectionRecord,
  ProjectEntityCandidateSourceOwner,
} from '@neko/entity-domain';
import type { DocumentLocator } from '@neko/content';
import { isSemanticSourceDescriptor } from '@neko/search-domain';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type {
  LocalMetadataPartition,
  LocalMetadataPartitionRevision,
  LocalMetadataStore,
} from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type { SemanticProjectionRecord } from '@neko/local-metadata';
import { assertProjectEntityDiscoveryProjectionBatch } from '@neko/search-domain';
import {
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  SEARCH_PROJECTION_MIGRATIONS,
} from '@neko/local-metadata/sqlite';

export interface SemanticEntitySourceCommitRequest {
  readonly source: SemanticSourceDescriptor;
  readonly result: SemanticSourceAnalysisResult;
  readonly expectedStoredFingerprint: string | null;
  readonly updatedAt: string;
}

export interface NodeWorkspaceSemanticEntityMetadataBinding extends ProjectEntityDiscoveryProjectionPort {
  readonly workspaceId: string;
  readonly semanticPartition: LocalMetadataPartition;
  readonly entityPartition: LocalMetadataPartition;
  getSource(sourceId: string): Promise<SemanticProjectionRecord | null>;
  listSources(rootId?: string): Promise<readonly SemanticSourceDescriptor[]>;
  replaceSource(request: SemanticEntitySourceCommitRequest): Promise<void>;
  deleteSource(sourceId: string, updatedAt: string): Promise<boolean>;
  markSourceStale(sourceId: string, diagnostic: string, updatedAt: string): Promise<void>;
  findOccurrencesByEntity(entityId: string): Promise<readonly SemanticEntityOccurrenceRecord[]>;
  findEntityLinksByOccurrence(occurrenceId: string): Promise<SemanticOccurrenceEntityLinks | null>;
  findEntityLinksByLocator(
    sourceId: string,
    locator: DocumentLocator,
  ): Promise<readonly SemanticOccurrenceEntityLinks[]>;
  readSemanticRevision(): Promise<LocalMetadataPartitionRevision | null>;
  readEntityRevision(): Promise<LocalMetadataPartitionRevision | null>;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceSemanticEntityMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly metadataStore?: LocalMetadataStore;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceSemanticEntityMetadataBinding> {
  const ownsMetadataStore = options.metadataStore === undefined;
  const metadataStore =
    options.metadataStore ?? createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    const databasePath = resolveGlobalStorageLayout(options.homedir).database;
    if (metadataStore.state === 'closed') {
      await metadataStore.open({
        databasePath,
        busyTimeoutMs: 2_000,
      });
    } else if (metadataStore.state !== 'open') {
      throw new Error('Semantic Entity metadata requires an open local metadata Store.');
    }
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS, {
      destructiveBackup: {
        destinationPath: `${databasePath}.pre-project-entity-projections-v3.bak`,
        reason: 'migration',
      },
    });
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
    const cleanupAt = (options.now ?? (() => new Date().toISOString()))();
    await metadataStore.transaction(
      {
        mode: 'cache-write',
        ownership: 'cache',
        operation: 'clear-body-bearing-semantic-sources',
      },
      async ({ repositories }) => {
        const sourceIds = await repositories.semanticProjections.clearBodyBearingSources(
          semanticPartition,
          cleanupAt,
        );
        for (const sourceId of sourceIds) {
          await repositories.entityAssetProjections.replaceSource({
            partition: entityPartition,
            sourceId,
            records: [],
            updatedAt: cleanupAt,
          });
        }
      },
    );
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
              records: discoveryProjectionRecords({
                source: {
                  sourceId: request.source.sourceId,
                  owner: request.source.rootKind,
                  fingerprint: request.source.fingerprint,
                },
                candidates: request.result.candidates,
                occurrences: request.result.occurrences,
                updatedAt: request.updatedAt,
              }),
              updatedAt: request.updatedAt,
            });
          },
        ),
      replaceDiscoverySource: (request) =>
        metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'replace-project-entity-discovery-source',
          },
          ({ repositories }) => {
            const checked = assertProjectEntityDiscoveryProjectionBatch(request);
            return repositories.entityAssetProjections.replaceSource({
              partition: entityPartition,
              sourceId: checked.source.sourceId,
              records: discoveryProjectionRecords(checked),
              updatedAt: checked.updatedAt,
            });
          },
        ),
      deleteDiscoverySource: (sourceId, updatedAt) =>
        metadataStore.transaction(
          {
            mode: 'cache-write',
            ownership: 'cache',
            operation: 'delete-project-entity-discovery-source',
          },
          ({ repositories }) =>
            repositories.entityAssetProjections.replaceSource({
              partition: entityPartition,
              sourceId,
              records: [],
              updatedAt,
            }),
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
              records: entityRecords.map((record) => staleProjectionRecord(record, updatedAt)),
              updatedAt,
            });
          },
        ),
      listCandidateProjections: async () => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          kinds: ['entity-candidate'],
        });
        return records.flatMap((record) =>
          record.kind === 'entity-candidate' ? [record.value] : [],
        );
      },
      listDiscoveryOccurrences: async (query = {}) => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          kinds: ['entity-occurrence'],
          ...projectionQuery(query),
        });
        return records.flatMap((record) =>
          record.kind === 'entity-occurrence' ? [record.value] : [],
        );
      },
      findOccurrencesByEntity: async (entityId) => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          kinds: ['entity-occurrence'],
          entityId,
        });
        return loadSemanticOccurrenceRecords(records);
      },
      findEntityLinksByOccurrence: async (occurrenceId) => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          projectionId: occurrenceId,
          kinds: ['entity-occurrence'],
        });
        const occurrences = await loadSemanticOccurrenceRecords(records);
        const occurrence = occurrences[0];
        return occurrence ? occurrenceLinks(occurrence) : null;
      },
      findEntityLinksByLocator: async (sourceId, locator) => {
        const records = await metadataStore.repositories.entityAssetProjections.list({
          partition: entityPartition,
          sourceId,
          kinds: ['entity-occurrence'],
        });
        const occurrences = await loadSemanticOccurrenceRecords(records);
        return occurrences
          .filter((record) => sameDocumentLocator(record.occurrence.locator, locator))
          .map(occurrenceLinks);
      },
      readSemanticRevision: () => metadataStore.readPartitionRevision(semanticPartition),
      readEntityRevision: () => metadataStore.readPartitionRevision(entityPartition),
      dispose: () => (ownsMetadataStore ? metadataStore.dispose() : Promise.resolve()),
    };
  } catch (error) {
    if (ownsMetadataStore) await metadataStore.dispose();
    throw error;
  }
}

async function loadSemanticOccurrenceRecords(
  records: readonly EntityAssetProjectionRecord[],
): Promise<readonly SemanticEntityOccurrenceRecord[]> {
  const results: SemanticEntityOccurrenceRecord[] = [];
  for (const record of records) {
    if (record.kind !== 'entity-occurrence') continue;
    const occurrence = record.value;
    if (
      occurrence.occurrenceId !== record.projectionId ||
      occurrence.source.sourceId !== record.sourceId ||
      !occurrence.sourceFingerprint ||
      !occurrence.locator
    ) {
      throw new Error(`Semantic occurrence projection is inconsistent: ${record.projectionId}`);
    }
    results.push({
      occurrenceId: record.projectionId,
      owner: discoveryOwner(occurrence.source.sourceKind),
      sourceId: record.sourceId,
      sourceFingerprint: occurrence.sourceFingerprint,
      freshness: record.freshness === 'rebuilding' ? 'building' : record.freshness,
      occurrence,
    });
  }
  return results;
}

function occurrenceLinks(
  occurrence: SemanticEntityOccurrenceRecord,
): SemanticOccurrenceEntityLinks {
  return {
    occurrence,
    entityRefs: occurrence.occurrence.entityRef ? [occurrence.occurrence.entityRef] : [],
    candidateIds: occurrence.occurrence.candidateId ? [occurrence.occurrence.candidateId] : [],
  };
}

function sameDocumentLocator(left: DocumentLocator | undefined, right: DocumentLocator): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

function semanticRecord(request: SemanticEntitySourceCommitRequest): SemanticProjectionRecord {
  return {
    sourceId: request.source.sourceId,
    sourceFingerprint: request.source.fingerprint,
    provider: {
      providerId: 'neko.text-entity.deterministic',
      sourceIdentity: request.source.sourceId,
      indexVersion: 'text-entity-v2',
      schemaVersion: '2',
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
    evidence: request.result.evidence,
    updatedAt: request.updatedAt,
  };
}

function discoveryProjectionRecords(
  request: ProjectEntityDiscoveryProjectionBatch,
): readonly EntityAssetProjectionRecord[] {
  const checked = assertProjectEntityDiscoveryProjectionBatch(request);
  const occurrenceRecords: EntityAssetProjectionRecord[] = checked.occurrences.map(
    (occurrence) => ({
      projectionId: requireSemanticOccurrenceId(occurrence),
      kind: 'entity-occurrence',
      sourceId: checked.source.sourceId,
      ...(occurrence.entityRef ? { entityId: occurrence.entityRef.entityId } : {}),
      ...(occurrence.candidateId ? { candidateId: occurrence.candidateId } : {}),
      freshness: projectionRecordFreshness(occurrence.source.freshness),
      value: occurrence,
      updatedAt: checked.updatedAt,
    }),
  );
  const candidateRecords: EntityAssetProjectionRecord[] = checked.candidates.map((candidate) => ({
    projectionId: `${checked.source.sourceId}:candidate:${candidate.candidateId}`,
    kind: 'entity-candidate',
    sourceId: checked.source.sourceId,
    candidateId: candidate.candidateId,
    freshness: projectionRecordFreshness(candidate.freshness),
    value: candidate,
    updatedAt: checked.updatedAt,
  }));
  return [...occurrenceRecords, ...candidateRecords];
}

function staleProjectionRecord(
  record: EntityAssetProjectionRecord,
  updatedAt: string,
): EntityAssetProjectionRecord {
  if (record.kind === 'entity-candidate') {
    return {
      ...record,
      freshness: 'stale',
      value: { ...record.value, freshness: 'stale' },
      updatedAt,
    };
  }
  if (record.kind === 'entity-occurrence') {
    return {
      ...record,
      freshness: 'stale',
      value: {
        ...record.value,
        source: { ...record.value.source, freshness: 'stale', updatedAt },
      },
      updatedAt,
    };
  }
  return { ...record, freshness: 'stale', updatedAt };
}

function projectionRecordFreshness(
  freshness: 'fresh' | 'stale' | 'building' | 'partial' | 'failed' | undefined,
): EntityAssetProjectionRecord['freshness'] {
  if (freshness === 'building') return 'rebuilding';
  if (freshness === 'stale' || freshness === 'partial' || freshness === 'failed') return 'stale';
  return 'fresh';
}

function projectionQuery(query: ProjectEntityDiscoveryOccurrenceQuery): {
  readonly sourceId?: string;
  readonly entityId?: string;
  readonly candidateId?: string;
} {
  return {
    ...(query.sourceId === undefined ? {} : { sourceId: query.sourceId }),
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
    ...(query.candidateId === undefined ? {} : { candidateId: query.candidateId }),
  };
}

function discoveryOwner(sourceKind: string): ProjectEntityCandidateSourceOwner {
  if (
    sourceKind === 'workspace' ||
    sourceKind === 'document' ||
    sourceKind === 'managed-asset' ||
    sourceKind === 'media-library'
  ) {
    return sourceKind;
  }
  throw new Error(`Project Entity occurrence source owner is invalid: ${sourceKind}`);
}

function requireSemanticOccurrenceId(
  occurrence: SemanticSourceAnalysisResult['occurrences'][number],
): string {
  if (!occurrence.occurrenceId?.trim()) {
    throw new Error('Semantic Entity occurrence is missing its canonical occurrence identity.');
  }
  return occurrence.occurrenceId;
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
