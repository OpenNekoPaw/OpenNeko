import { createHash } from 'node:crypto';
import { access, copyFile, readFile, rename } from 'node:fs/promises';
import type { CreativeGraphNode, CreativeRelationEdge } from '../types/creative-entity-graph';
import type { LocalMetadataPartition } from './model';
import type { EntityAssetProjectionRecord, EntityAssetProjectionRepository } from './repositories';

export interface LegacyAssetGraphMigrationUnrecoverable {
  readonly projectionId: string;
  readonly field: string;
  readonly reason: string;
}

export interface LegacyAssetGraphMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly discoveredCount: number;
  readonly importedCount: number;
  readonly preservedExistingCount: number;
  readonly verifiedCount: number;
  readonly unrecoverable: readonly LegacyAssetGraphMigrationUnrecoverable[];
}

interface LegacyAssetGraphSnapshot {
  readonly version: 1;
  readonly nodes: readonly CreativeGraphNode[];
  readonly edges: readonly CreativeRelationEdge[];
}

export async function migrateLegacyAssetGraph(options: {
  readonly assetGraphPath: string;
  readonly partition: LocalMetadataPartition;
  readonly repository: EntityAssetProjectionRepository;
  readonly now?: () => number;
}): Promise<LegacyAssetGraphMigrationReport> {
  if (!(await pathExists(options.assetGraphPath))) return emptyReport(options.assetGraphPath);
  const migratedAt = (options.now ?? (() => Date.now()))();
  const backupPath = `${options.assetGraphPath}.backup-${migratedAt}`;
  try {
    await copyFile(options.assetGraphPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return emptyReport(options.assetGraphPath);
    throw error;
  }

  let snapshot: LegacyAssetGraphSnapshot;
  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isLegacyAssetGraphSnapshot(parsed)) {
      throw new Error('Legacy asset graph must use the valid version 1 node/edge schema.');
    }
    snapshot = parsed;
  } catch (error) {
    const quarantinePath = await quarantineSource(options.assetGraphPath, migratedAt);
    return {
      ...emptyReport(options.assetGraphPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const updatedAt = new Date(migratedAt).toISOString();
  const unrecoverable: LegacyAssetGraphMigrationUnrecoverable[] = [];
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const nodeRecords = snapshot.nodes.flatMap((node) => {
    if (node.refId && !isPortableProjectionRef(node.refId)) {
      unrecoverable.push({
        projectionId: node.id,
        field: 'refId',
        reason: 'Asset graph refId is an absolute or cache-physical path.',
      });
      return [];
    }
    return [nodeToProjection(node, updatedAt)];
  });
  const retainedNodeIds = new Set(nodeRecords.map((record) => record.value.id));
  const edgeRecords = snapshot.edges.flatMap((edge) => {
    if (!retainedNodeIds.has(edge.from) || !retainedNodeIds.has(edge.to)) {
      unrecoverable.push({
        projectionId: edgeProjectionId(edge),
        field: 'from/to',
        reason: 'Asset graph edge references a node that could not be migrated.',
      });
      return [];
    }
    return [edgeToProjection(edge, nodesById, updatedAt)];
  });
  const records = [...nodeRecords, ...edgeRecords];
  const importResult = await options.repository.insertMissing({
    partition: options.partition,
    sourceId: 'legacy-asset-graph',
    records,
    updatedAt,
  });
  const actual = await options.repository.list({
    partition: options.partition,
    kinds: ['asset-graph-node', 'asset-graph-edge'],
  });
  const actualKeys = new Set(actual.map(projectionKey));
  const verifiedCount = records.filter((record) => actualKeys.has(projectionKey(record))).length;
  if (verifiedCount !== records.length) {
    throw new Error(
      `Asset graph migration identity verification failed: expected ${records.length}, received ${verifiedCount}.`,
    );
  }

  const archivedPath = `${options.assetGraphPath}.migrated-${migratedAt}`;
  let retiredPath: string | null = archivedPath;
  try {
    await rename(options.assetGraphPath, archivedPath);
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
    retiredPath = null;
  }
  return {
    sourceStatus: 'migrated',
    sourcePath: options.assetGraphPath,
    backupPath,
    archivedPath: retiredPath,
    quarantinePath: null,
    sourceDiagnostic: null,
    discoveredCount: snapshot.nodes.length + snapshot.edges.length,
    importedCount: importResult.insertedProjectionKeys.length,
    preservedExistingCount: importResult.preservedProjectionKeys.length,
    verifiedCount,
    unrecoverable,
  };
}

function nodeToProjection(
  node: CreativeGraphNode,
  updatedAt: string,
): EntityAssetProjectionRecord & { readonly kind: 'asset-graph-node' } {
  const entityId = node.kind === 'entity' ? node.refId : undefined;
  const assetRef =
    (node.kind === 'asset' || node.kind === 'generated-asset') && node.refId
      ? node.refId
      : undefined;
  return {
    projectionId: node.id,
    kind: 'asset-graph-node',
    sourceId: 'legacy-asset-graph',
    ...(entityId ? { entityId } : {}),
    ...(assetRef ? { assetRef } : {}),
    freshness: 'fresh',
    value: node,
    updatedAt,
  };
}

function edgeToProjection(
  edge: CreativeRelationEdge,
  nodesById: ReadonlyMap<string, CreativeGraphNode>,
  updatedAt: string,
): EntityAssetProjectionRecord & { readonly kind: 'asset-graph-edge' } {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  const entityIds = [from, to].flatMap((node) =>
    node?.kind === 'entity' && node.refId ? [node.refId] : [],
  );
  const assetRef = [from, to].find(
    (node) => (node?.kind === 'asset' || node?.kind === 'generated-asset') && node.refId,
  )?.refId;
  return {
    projectionId: edgeProjectionId(edge),
    kind: 'asset-graph-edge',
    sourceId: 'legacy-asset-graph',
    ...(entityIds[0] ? { entityId: entityIds[0] } : {}),
    ...(entityIds[1] ? { relatedEntityId: entityIds[1] } : {}),
    ...(assetRef ? { assetRef } : {}),
    freshness: 'fresh',
    value: edge,
    updatedAt,
  };
}

function edgeProjectionId(edge: CreativeRelationEdge): string {
  return `edge:${createHash('sha256')
    .update(JSON.stringify([edge.from, edge.to, edge.type, edge.strength]))
    .digest('hex')
    .slice(0, 24)}`;
}

function projectionKey(record: EntityAssetProjectionRecord): string {
  return `${record.kind}:${record.projectionId}`;
}

function isLegacyAssetGraphSnapshot(value: unknown): value is LegacyAssetGraphSnapshot {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['nodes']) ||
    !value['nodes'].every(isCreativeGraphNode) ||
    !Array.isArray(value['edges']) ||
    !value['edges'].every(isCreativeRelationEdge)
  ) {
    return false;
  }
  const nodeIds = value['nodes'].map((node) => node.id);
  const edgeIds = value['edges'].map(edgeProjectionId);
  return new Set(nodeIds).size === nodeIds.length && new Set(edgeIds).size === edgeIds.length;
}

function isCreativeGraphNode(value: unknown): value is CreativeGraphNode {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].trim().length > 0 &&
    (value['kind'] === 'entity' ||
      value['kind'] === 'occurrence' ||
      value['kind'] === 'asset' ||
      value['kind'] === 'canvas-node' ||
      value['kind'] === 'script-range' ||
      value['kind'] === 'generated-asset') &&
    optionalString(value['refId']) &&
    optionalString(value['label'])
  );
}

function isCreativeRelationEdge(value: unknown): value is CreativeRelationEdge {
  return (
    isRecord(value) &&
    typeof value['from'] === 'string' &&
    value['from'].trim().length > 0 &&
    typeof value['to'] === 'string' &&
    value['to'].trim().length > 0 &&
    typeof value['type'] === 'string' &&
    value['type'].trim().length > 0 &&
    (value['strength'] === 'confirmed' || value['strength'] === 'inferred') &&
    (value['confidence'] === undefined ||
      (typeof value['confidence'] === 'number' && Number.isFinite(value['confidence']))) &&
    (value['provenance'] === undefined ||
      value['provenance'] === 'user' ||
      value['provenance'] === 'lineage' ||
      value['provenance'] === 'rule' ||
      value['provenance'] === 'ai' ||
      value['provenance'] === 'import')
  );
}

function isPortableProjectionRef(value: string): boolean {
  const normalized = value.replace(/\\/gu, '/');
  return (
    !/^([A-Za-z]:\/|\/)/u.test(normalized) &&
    !normalized.includes('/.neko/.cache/') &&
    !normalized.startsWith('.neko/.cache/')
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function quarantineSource(sourcePath: string, migratedAt: number): Promise<string | null> {
  const quarantinePath = `${sourcePath}.quarantine-${migratedAt}`;
  try {
    await rename(sourcePath, quarantinePath);
    return quarantinePath;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function emptyReport(sourcePath: string): LegacyAssetGraphMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    discoveredCount: 0,
    importedCount: 0,
    preservedExistingCount: 0,
    verifiedCount: 0,
    unrecoverable: [],
  };
}
