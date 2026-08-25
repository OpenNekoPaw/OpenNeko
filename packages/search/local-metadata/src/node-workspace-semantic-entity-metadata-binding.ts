import type {
  ProjectEntityDiscoveryOccurrenceQuery,
  ProjectEntityDiscoveryProjectionBatch,
  ProjectEntityDiscoveryProjectionPort,
  SemanticEntityOccurrenceRecord,
  SemanticOccurrenceEntityLinks,
  SemanticSourceAnalysisResult,
  SemanticSourceDescriptor,
  SemanticSourceProjectionListResult,
} from '@neko/search-domain';
import type {
  ProjectEntityProjectionRecord,
  ProjectEntityCandidateSourceOwner,
} from '@neko/entity-domain';
import { contentLocatorsEqual, type ContentLocator } from '@neko/content-domain';
import { isSemanticSourceDescriptor } from '@neko/search-domain';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type { LocalMetadataPartition, LocalMetadataStore } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type { SemanticProjectionRecord } from '@neko/local-metadata';
import { assertProjectEntityDiscoveryProjectionBatch } from '@neko/search-domain';
import {
  initializeProjectEntityProjectionTables,
  initializeCoreLocalMetadataTables,
  initializeSearchProjectionTables,
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
  listSources(rootId?: string): Promise<SemanticSourceProjectionListResult>;
  replaceSource(request: SemanticEntitySourceCommitRequest): Promise<void>;
  deleteSource(sourceId: string, updatedAt: string): Promise<boolean>;
  markSourceStale(sourceId: string, diagnostic: string, updatedAt: string): Promise<void>;
  findOccurrencesByEntity(entityId: string): Promise<readonly SemanticEntityOccurrenceRecord[]>;
  findEntityLinksByOccurrence(occurrenceId: string): Promise<SemanticOccurrenceEntityLinks | null>;
  findEntityLinksByLocator(
    sourceId: string,
    locator: ContentLocator,
  ): Promise<readonly SemanticOccurrenceEntityLinks[]>;
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
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeSearchProjectionTables(metadataStore);
    await initializeProjectEntityProjectionTables(metadataStore);
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
      domain: 'project-entity-projection',
    };
    return {
      workspaceId,
      semanticPartition,
      entityPartition,
      getSource: (sourceId) =>
        metadataStore.repositories.semanticProjections.get(semanticPartition, sourceId),
      listSources: async (rootId) => {
        const result = await metadataStore.repositories.semanticProjections.list(semanticPartition);
        const sources = result.records.flatMap((record) => {
          const descriptor = readSemanticSourceDescriptor(record);
          return descriptor && (!rootId || descriptor.rootId === rootId) ? [descriptor] : [];
        });
        return {
          sources,
          diagnostics: result.diagnostics.map((diagnostic) => ({
            severity: 'error',
            code: diagnostic.code,
            message: diagnostic.message,
            sourceId: diagnostic.sourceId,
          })),
        };
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
            await repositories.projectEntityProjections.replaceSource({
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
            return repositories.projectEntityProjections.replaceSource({
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
            repositories.projectEntityProjections.replaceSource({
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
            await repositories.projectEntityProjections.replaceSource({
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
            if (!current) return;
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
            const entityRecords = await repositories.projectEntityProjections.list({
              partition: entityPartition,
              sourceId,
            });
            await repositories.projectEntityProjections.replaceSource({
              partition: entityPartition,
              sourceId,
              records: entityRecords.records.map((record) =>
                staleProjectionRecord(record, updatedAt),
              ),
              updatedAt,
            });
          },
        ),
      listCandidateProjections: async () => {
        const result = await metadataStore.repositories.projectEntityProjections.list({
          partition: entityPartition,
          kinds: ['entity-candidate'],
        });
        return result.records.flatMap((record) =>
          record.kind === 'entity-candidate' ? [record.value] : [],
        );
      },
      listDiscoveryOccurrences: async (query = {}) => {
        const result = await metadataStore.repositories.projectEntityProjections.list({
          partition: entityPartition,
          kinds: ['entity-occurrence'],
          ...projectionQuery(query),
        });
        return result.records.flatMap((record) =>
          record.kind === 'entity-occurrence' ? [record.value] : [],
        );
      },
      findOccurrencesByEntity: async (entityId) => {
        const result = await metadataStore.repositories.projectEntityProjections.list({
          partition: entityPartition,
          kinds: ['entity-occurrence'],
          entityId,
        });
        return loadSemanticOccurrenceRecords(result.records);
      },
      findEntityLinksByOccurrence: async (occurrenceId) => {
        const result = await metadataStore.repositories.projectEntityProjections.list({
          partition: entityPartition,
          projectionId: occurrenceId,
          kinds: ['entity-occurrence'],
        });
        const occurrences = await loadSemanticOccurrenceRecords(result.records);
        const occurrence = occurrences[0];
        return occurrence ? occurrenceLinks(occurrence) : null;
      },
      findEntityLinksByLocator: async (sourceId, locator) => {
        const result = await metadataStore.repositories.projectEntityProjections.list({
          partition: entityPartition,
          sourceId,
          kinds: ['entity-occurrence'],
        });
        const occurrences = await loadSemanticOccurrenceRecords(result.records);
        return occurrences
          .filter((record) => sameContentLocator(record.occurrence.locator, locator))
          .map(occurrenceLinks);
      },
      dispose: () => (ownsMetadataStore ? metadataStore.dispose() : Promise.resolve()),
    };
  } catch (error) {
    if (ownsMetadataStore) await metadataStore.dispose();
    throw error;
  }
}

async function loadSemanticOccurrenceRecords(
  records: readonly ProjectEntityProjectionRecord[],
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

function sameContentLocator(left: ContentLocator | undefined, right: ContentLocator): boolean {
  return left !== undefined && contentLocatorsEqual(left, right);
}

function semanticRecord(request: SemanticEntitySourceCommitRequest): SemanticProjectionRecord {
  return {
    sourceId: request.source.sourceId,
    sourceFingerprint: request.source.fingerprint,
    provider: {
      providerId: 'neko.text-entity.deterministic',
      sourceIdentity: request.source.sourceId,
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

function discoveryProjectionRecords(
  request: ProjectEntityDiscoveryProjectionBatch,
): readonly ProjectEntityProjectionRecord[] {
  const checked = assertProjectEntityDiscoveryProjectionBatch(request);
  const occurrenceRecords: ProjectEntityProjectionRecord[] = checked.occurrences.map(
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
  const candidateRecords: ProjectEntityProjectionRecord[] = checked.candidates.map((candidate) => ({
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
  record: ProjectEntityProjectionRecord,
  updatedAt: string,
): ProjectEntityProjectionRecord {
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
): ProjectEntityProjectionRecord['freshness'] {
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
