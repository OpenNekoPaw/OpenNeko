import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  validateCanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceArtifactRole,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../types/canvas-workspace-board';
import {
  isDocumentArchiveResourceRef,
  type DocumentArchiveResourceRef,
} from '../types/document-reading';
import type {
  CanvasConnection,
  CanvasData,
  CanvasNode,
  CanvasSerializableRecord,
} from '../types/canvas';
import type { CanvasHeadlessAuthoringOperation } from '../types/canvas-headless-authoring';
import { hashStableValue, isResourceRef, type ResourceRef } from '../types/resource-cache';
import {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
} from './canvasHeadlessAuthoring';

/** Existing Board inbox identity retained for rendering; new projections never create it. */
export const CANVAS_WORKSPACE_INBOX_NODE_ID = 'workspace-inbox' as const;

const CONTENT_ORIGIN = { x: 40, y: 40 } as const;
const CONTENT_HORIZONTAL_GAP = 48;
const CONTENT_VERTICAL_GAP = 24;
const CONTENT_LANE_WIDTH = 316;

export interface CanvasWorkspaceBoardProjectionPlan {
  readonly status: 'projected' | 'noop';
  readonly canvasData: CanvasData;
  readonly nodeIds: readonly string[];
  readonly connectionIds: readonly string[];
}

interface ResolvedProjectionArtifact {
  readonly node: CanvasNode;
}

export function planCanvasWorkspaceBoardProjection(
  canvasData: CanvasData,
  request: CanvasWorkspaceProjectionRequest,
): CanvasWorkspaceBoardProjectionPlan {
  const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('; '));
  }

  const artifacts = sortArtifactsByDependencies(request.artifacts);
  const roleLanes = createRoleLanes(artifacts);
  const existingContentNodes = indexExistingContentNodes(canvasData.nodes);
  const occupiedNodeIds = new Map(canvasData.nodes.map((node) => [node.id, node]));
  const layoutNodes = [...canvasData.nodes];
  const resolvedByArtifactId = new Map<string, ResolvedProjectionArtifact>();
  const resolvedByContentIdentity = new Map<string, ResolvedProjectionArtifact>();
  const operations: CanvasHeadlessAuthoringOperation[] = [];

  for (const artifact of artifacts) {
    const contentIdentity = createArtifactContentIdentity(artifact);
    const alreadyResolved = resolvedByContentIdentity.get(contentIdentity);
    if (alreadyResolved) {
      resolvedByArtifactId.set(artifact.provenance.artifactId, alreadyResolved);
      continue;
    }

    const existing = existingContentNodes.get(contentIdentity)?.[0];
    if (existing) {
      const resolved = { node: existing } as const;
      resolvedByContentIdentity.set(contentIdentity, resolved);
      resolvedByArtifactId.set(artifact.provenance.artifactId, resolved);
      continue;
    }

    const id = createContentNodeId(contentIdentity);
    const occupied = occupiedNodeIds.get(id);
    if (occupied) {
      throw new Error(
        `projection-conflict: Canvas node ${id} is occupied by unrelated creative content.`,
      );
    }
    const sourceNodes = (artifact.provenance.sourceArtifactIds ?? []).map((sourceArtifactId) => {
      const source = resolvedByArtifactId.get(sourceArtifactId);
      if (!source) {
        throw new Error(
          `invalid-artifact-relation: Source artifact ${sourceArtifactId} was not resolved before ${artifact.provenance.artifactId}.`,
        );
      }
      return source.node;
    });
    const position = findAvailableContentPosition(
      createPreferredPosition(artifact.provenance.role, sourceNodes, roleLanes),
      artifactNodeSize(artifact),
      layoutNodes,
    );
    const node = createArtifactNode(artifact, id, position, nextZIndex(layoutNodes));
    const resolved = { node } as const;
    resolvedByContentIdentity.set(contentIdentity, resolved);
    resolvedByArtifactId.set(artifact.provenance.artifactId, resolved);
    occupiedNodeIds.set(node.id, node);
    layoutNodes.push(node);
    operations.push({ kind: 'node.create', node });
  }

  const projectedConnections = planArtifactConnections(
    artifacts,
    resolvedByArtifactId,
    canvasData.connections,
  );
  operations.push(
    ...projectedConnections.created.map((connection): CanvasHeadlessAuthoringOperation => ({
      kind: 'connection.create',
      connection,
    })),
  );

  const nodeIds = uniqueStrings(
    artifacts.map((artifact) => resolvedByArtifactId.get(artifact.provenance.artifactId)!.node.id),
  );
  if (operations.length === 0) {
    return {
      status: 'noop',
      canvasData,
      nodeIds,
      connectionIds: projectedConnections.connectionIds,
    };
  }

  const nextCanvasData = applyCanvasHeadlessAuthoringOperations(canvasData, operations);
  assertNoRuntimeResourceIdentity(nextCanvasData, 'workspaceBoard');
  return {
    status: 'projected',
    canvasData: nextCanvasData,
    nodeIds,
    connectionIds: projectedConnections.connectionIds,
  };
}

function sortArtifactsByDependencies(
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
): readonly CanvasWorkspaceProjectionArtifact[] {
  const pending = artifacts
    .map((artifact, index) => ({ artifact, index }))
    .sort(comparePendingArtifacts);
  const emitted = new Set<string>();
  const sorted: CanvasWorkspaceProjectionArtifact[] = [];

  while (pending.length > 0) {
    const nextIndex = pending.findIndex(({ artifact }) =>
      (artifact.provenance.sourceArtifactIds ?? []).every((sourceId) => emitted.has(sourceId)),
    );
    if (nextIndex < 0) {
      throw new Error('invalid-artifact-relation: Creative-content relations contain a cycle.');
    }
    const [next] = pending.splice(nextIndex, 1);
    sorted.push(next!.artifact);
    emitted.add(next!.artifact.provenance.artifactId);
  }
  return sorted;
}

function comparePendingArtifacts(
  left: { readonly artifact: CanvasWorkspaceProjectionArtifact; readonly index: number },
  right: { readonly artifact: CanvasWorkspaceProjectionArtifact; readonly index: number },
): number {
  const roleDifference =
    roleRank(left.artifact.provenance.role) - roleRank(right.artifact.provenance.role);
  return roleDifference === 0 ? left.index - right.index : roleDifference;
}

function createRoleLanes(
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
): ReadonlyMap<CanvasWorkspaceArtifactRole, number> {
  const roles = uniqueStrings(artifacts.map((artifact) => artifact.provenance.role)).sort(
    (left, right) => roleRank(left) - roleRank(right),
  );
  return new Map(roles.map((role, index) => [role, index]));
}

function indexExistingContentNodes(
  nodes: readonly CanvasNode[],
): ReadonlyMap<string, readonly CanvasNode[]> {
  const index = new Map<string, CanvasNode[]>();
  for (const node of nodes) {
    const identity = readNodeContentIdentity(node);
    if (!identity) continue;
    const matches = index.get(identity) ?? [];
    matches.push(node);
    matches.sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
    index.set(identity, matches);
  }
  return index;
}

function createArtifactContentIdentity(artifact: CanvasWorkspaceProjectionArtifact): string {
  if (artifact.kind !== 'markdown' && artifact.resourceRef) {
    return createResourceContentIdentity(artifact.resourceRef);
  }
  if (artifact.kind !== 'markdown' && artifact.documentResourceRef) {
    return createDocumentContentIdentity(artifact.documentResourceRef);
  }
  return createPortableArtifactContentIdentity(
    artifact.provenance.artifactId,
    artifact.provenance.revision,
  );
}

function readNodeContentIdentity(node: CanvasNode): string | undefined {
  const resourceRef = 'resourceRef' in node.data ? node.data.resourceRef : undefined;
  if (isResourceRef(resourceRef)) return createResourceContentIdentity(resourceRef);
  const documentResourceRef =
    'documentResourceRef' in node.data ? node.data.documentResourceRef : undefined;
  if (isDocumentArchiveResourceRef(documentResourceRef)) {
    return createDocumentContentIdentity(documentResourceRef);
  }
  const provenance = 'provenance' in node.data ? node.data.provenance : undefined;
  if (!isSerializableRecord(provenance)) return undefined;
  const artifactId = provenance['artifactId'];
  const revision = provenance['revision'];
  return typeof artifactId === 'string' && typeof revision === 'string'
    ? createPortableArtifactContentIdentity(artifactId, revision)
    : undefined;
}

function createResourceContentIdentity(resourceRef: ResourceRef): string {
  return hashStableValue({
    kind: 'resource',
    id: resourceRef.id,
    scope: resourceRef.scope,
    provider: resourceRef.provider,
    resourceKind: resourceRef.kind,
    ...(resourceRef.locator ? { locator: resourceRef.locator } : {}),
    fingerprint: {
      strategy: resourceRef.fingerprint.strategy,
      value: resourceRef.fingerprint.value,
      ...(resourceRef.fingerprint.providerId
        ? { providerId: resourceRef.fingerprint.providerId }
        : {}),
    },
  });
}

function createDocumentContentIdentity(resourceRef: DocumentArchiveResourceRef): string {
  const source = resourceRef.source;
  return hashStableValue({
    kind: 'document-entry',
    source: {
      format: source.format,
      filePath: source.filePath,
      ...(source.fileId ? { fileId: source.fileId } : {}),
      ...(source.identity ? { identity: source.identity } : {}),
      ...(source.uri ? { uri: source.uri } : {}),
    },
    ...(resourceRef.entryPath ? { entryPath: resourceRef.entryPath } : {}),
    ...(resourceRef.locator ? { locator: resourceRef.locator } : {}),
  });
}

function createPortableArtifactContentIdentity(artifactId: string, revision: string): string {
  return hashStableValue({ kind: 'artifact', artifactId, revision });
}

function createContentNodeId(contentIdentity: string): string {
  return `workspace-content-${contentIdentity.slice(0, 24)}`;
}

function createPreferredPosition(
  role: CanvasWorkspaceArtifactRole,
  sourceNodes: readonly CanvasNode[],
  roleLanes: ReadonlyMap<CanvasWorkspaceArtifactRole, number>,
): CanvasNode['position'] {
  if (sourceNodes.length > 0) {
    return {
      x:
        Math.max(...sourceNodes.map((source) => source.position.x + source.size.width)) +
        CONTENT_HORIZONTAL_GAP,
      y: Math.min(...sourceNodes.map((source) => source.position.y)),
    };
  }
  const lane = roleLanes.get(role);
  if (lane === undefined) throw new Error(`Unsupported Workspace Board artifact role: ${role}`);
  return { x: CONTENT_ORIGIN.x + lane * CONTENT_LANE_WIDTH, y: CONTENT_ORIGIN.y };
}

function findAvailableContentPosition(
  preferred: CanvasNode['position'],
  size: CanvasNode['size'],
  existingNodes: readonly CanvasNode[],
): CanvasNode['position'] {
  let y = preferred.y;
  while (true) {
    const intersecting = existingNodes.filter((node) =>
      rectanglesOverlap({ position: { x: preferred.x, y }, size }, node),
    );
    if (intersecting.length === 0) return { x: preferred.x, y };
    y = Math.max(
      ...intersecting.map((node) => node.position.y + node.size.height + CONTENT_VERTICAL_GAP),
    );
  }
}

function rectanglesOverlap(
  left: Pick<CanvasNode, 'position' | 'size'>,
  right: Pick<CanvasNode, 'position' | 'size'>,
): boolean {
  return !(
    left.position.x + left.size.width <= right.position.x ||
    right.position.x + right.size.width <= left.position.x ||
    left.position.y + left.size.height <= right.position.y ||
    right.position.y + right.size.height <= left.position.y
  );
}

function createArtifactNode(
  artifact: CanvasWorkspaceProjectionArtifact,
  id: string,
  position: CanvasNode['position'],
  zIndex: number,
): CanvasNode {
  const base = { id, position, zIndex };
  const provenance = createSerializableProvenance(artifact);

  if (artifact.kind === 'markdown') {
    return {
      ...base,
      type: 'text',
      size: artifactNodeSize(artifact),
      preset: 'text.basic',
      data: {
        title: artifact.title,
        content: artifact.markdown,
        format: 'markdown',
        provenance,
      },
    };
  }

  if (artifact.kind === 'image' || artifact.kind === 'audio' || artifact.kind === 'video') {
    return {
      ...base,
      type: 'media',
      size: artifactNodeSize(artifact),
      preset: 'media.basic',
      data: {
        assetPath: '',
        mediaType: artifact.kind,
        title: artifact.title,
        ...(artifact.resourceRef ? { resourceRef: artifact.resourceRef } : {}),
        ...(artifact.documentResourceRef
          ? { documentResourceRef: artifact.documentResourceRef }
          : {}),
        ...(artifact.generationContext ? { generationContext: artifact.generationContext } : {}),
        provenance,
      },
    };
  }

  return {
    ...base,
    type: 'document',
    size: artifactNodeSize(artifact),
    preset: 'document.basic',
    data: {
      docPath: '',
      docType: inferDocumentType(artifact.title, artifact.mimeType),
      title: artifact.title,
      ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {}),
      ...(artifact.resourceRef ? { resourceRef: artifact.resourceRef } : {}),
      ...(artifact.documentResourceRef
        ? { documentResourceRef: artifact.documentResourceRef }
        : {}),
      provenance,
    },
  };
}

function artifactNodeSize(artifact: CanvasWorkspaceProjectionArtifact): CanvasNode['size'] {
  return artifact.kind === 'file-reference' || artifact.kind === 'file'
    ? { width: 220, height: 180 }
    : { width: 268, height: 180 };
}

function createSerializableProvenance(
  artifact: CanvasWorkspaceProjectionArtifact,
): CanvasSerializableRecord {
  const provenance = artifact.provenance;
  return {
    version: provenance.version,
    deliveryId: provenance.deliveryId,
    artifactId: provenance.artifactId,
    revision: provenance.revision,
    kind: provenance.kind,
    role: provenance.role,
    sourceId: provenance.sourceId,
    ...(provenance.sourceArtifactIds
      ? { sourceArtifactIds: [...provenance.sourceArtifactIds] }
      : {}),
    ...(provenance.taskId ? { taskId: provenance.taskId } : {}),
    ...(provenance.runId ? { runId: provenance.runId } : {}),
    createdAt: provenance.createdAt,
  };
}

function planArtifactConnections(
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
  resolvedByArtifactId: ReadonlyMap<string, ResolvedProjectionArtifact>,
  existingConnections: readonly CanvasConnection[],
): {
  readonly created: readonly CanvasConnection[];
  readonly connectionIds: readonly string[];
} {
  const created: CanvasConnection[] = [];
  const connectionIds: string[] = [];
  const allConnections = [...existingConnections];

  for (const artifact of artifacts) {
    const target = resolvedByArtifactId.get(artifact.provenance.artifactId);
    if (!target) throw new Error(`Artifact ${artifact.provenance.artifactId} was not resolved.`);
    for (const sourceArtifactId of artifact.provenance.sourceArtifactIds ?? []) {
      const source = resolvedByArtifactId.get(sourceArtifactId);
      if (!source) throw new Error(`Source artifact ${sourceArtifactId} was not resolved.`);
      if (source.node.id === target.node.id) continue;
      const equivalent = allConnections.find(
        (connection) =>
          connection.sourceId === source.node.id &&
          connection.targetId === target.node.id &&
          connection.type === 'derived-from',
      );
      if (equivalent) {
        connectionIds.push(equivalent.id);
        continue;
      }

      const id = createRelationId(source.node.id, target.node.id);
      const occupied = allConnections.find((connection) => connection.id === id);
      if (occupied) {
        throw new Error(
          `projection-conflict: Canvas connection ${id} is occupied by another relation.`,
        );
      }
      const connection: CanvasConnection = {
        id,
        sourceId: source.node.id,
        targetId: target.node.id,
        type: 'derived-from',
        sourceEndpoint: { nodeId: source.node.id, scope: 'node' },
        targetEndpoint: { nodeId: target.node.id, scope: 'node' },
      };
      created.push(connection);
      connectionIds.push(connection.id);
      allConnections.push(connection);
    }
  }
  return { created, connectionIds: uniqueStrings(connectionIds) };
}

function createRelationId(sourceNodeId: string, targetNodeId: string): string {
  return `workspace-relation-${hashStableValue({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    type: 'derived-from',
    sourceNodeId,
    targetNodeId,
  }).slice(0, 24)}`;
}

function isSerializableRecord(value: unknown): value is CanvasSerializableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings<Value extends string>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

function roleRank(role: CanvasWorkspaceArtifactRole): number {
  if (role === 'source') return 0;
  if (role === 'analysis') return 1;
  return 2;
}

function nextZIndex(nodes: readonly CanvasNode[]): number {
  return nodes.reduce((maximum, node) => Math.max(maximum, node.zIndex), 0) + 10;
}

function inferDocumentType(
  title: string,
  mimeType: string | undefined,
): 'pdf' | 'docx' | 'epub' | 'cbz' | 'markdown' | 'text' | 'file' {
  const normalized = title.toLowerCase();
  if (mimeType === 'application/pdf' || normalized.endsWith('.pdf')) return 'pdf';
  if (normalized.endsWith('.docx')) return 'docx';
  if (normalized.endsWith('.epub')) return 'epub';
  if (normalized.endsWith('.cbz')) return 'cbz';
  if (
    mimeType === 'text/markdown' ||
    normalized.endsWith('.md') ||
    normalized.endsWith('.markdown')
  ) {
    return 'markdown';
  }
  if (mimeType?.startsWith('text/') || normalized.endsWith('.txt') || normalized.endsWith('.log')) {
    return 'text';
  }
  return 'file';
}
