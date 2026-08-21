import {
  validateCanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceArtifactRole,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../types/canvas-workspace-board';
import type {
  CanvasConnection,
  CanvasData,
  CanvasNode,
  CanvasSerializableRecord,
  GroupCanvasNode,
} from '../types/canvas';
import type { CanvasHeadlessAuthoringOperation } from '../types/canvas-headless-authoring';
import { contentLocatorKey, isContentLocator } from '@neko/content';
import { hashStableValue } from '@neko/shared';
import {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
} from './canvasHeadlessAuthoring';
import {
  CANVAS_AUDIO_NODE_DEFAULT_SIZE,
  CANVAS_IMAGE_PROJECTION_DEFAULT_WIDTH,
  CANVAS_IMAGE_PROJECTION_MIN_HEIGHT,
  resolveCanvasNodeDefaultSize,
} from '../canvas-node-sizing';

/** Existing Board inbox identity retained for rendering; new projections never create it. */
export const CANVAS_WORKSPACE_INBOX_NODE_ID = 'workspace-inbox' as const;

const CONTENT_ORIGIN = { x: 40, y: 40 } as const;
const CONTENT_HORIZONTAL_GAP = 48;
const CONTENT_VERTICAL_GAP = 24;
const CONTENT_LANE_WIDTH = 288;
const CONTENT_GRID_COLUMNS = 3;
const GROUP_PADDING = 24;
const GROUP_HEADER = 56;
const GROUP_GAP = 20;

export interface CanvasWorkspaceBoardProjectionPlan {
  readonly status: 'projected' | 'noop';
  readonly canvasData: CanvasData;
  readonly nodeIds: readonly string[];
  readonly connectionIds: readonly string[];
}

interface ResolvedProjectionArtifact {
  readonly node: CanvasNode;
}

interface GeneratedBatchGroupPlan {
  readonly id: string;
  readonly contentIdentities: ReadonlySet<string>;
  readonly childIds: readonly string[];
  readonly childOffsets: ReadonlyMap<string, CanvasNode['position']>;
  readonly size: CanvasNode['size'];
  readonly columns: number;
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
  const topLevelLayoutNodes = canvasData.nodes.filter((node) => node.parentId === undefined);
  const resolvedByArtifactId = new Map<string, ResolvedProjectionArtifact>();
  const resolvedByContentIdentity = new Map<string, ResolvedProjectionArtifact>();
  const operations: CanvasHeadlessAuthoringOperation[] = [];
  const generatedBatchGroup = planGeneratedBatchGroup(
    request.process.deliveryId,
    artifacts,
    existingContentNodes,
  );
  let generatedBatchGroupNode: GroupCanvasNode | undefined;
  let generatedBatchChildPositions: ReadonlyMap<string, CanvasNode['position']> | undefined;

  for (const artifact of artifacts) {
    const contentIdentity = createArtifactContentIdentity(artifact);
    const alreadyResolved = resolvedByContentIdentity.get(contentIdentity);
    if (alreadyResolved) {
      resolvedByArtifactId.set(artifact.provenance.artifactId, alreadyResolved);
      continue;
    }

    const exactExisting = existingContentNodes.get(contentIdentity)?.[0];
    const existing = exactExisting;
    if (existing) {
      const refreshed = refreshExistingResourceProvenance(existing, artifact);
      if (refreshed !== existing) {
        operations.push({ kind: 'node.replace', node: refreshed });
      }
      const resolved = { node: refreshed } as const;
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
    const belongsToGeneratedBatchGroup =
      generatedBatchGroup?.contentIdentities.has(contentIdentity) === true;
    if (belongsToGeneratedBatchGroup && !generatedBatchGroupNode) {
      const groupedSourceNodes = uniqueNodes(
        artifacts
          .filter((candidate) =>
            generatedBatchGroup.contentIdentities.has(createArtifactContentIdentity(candidate)),
          )
          .flatMap((candidate) =>
            (candidate.provenance.sourceArtifactIds ?? []).flatMap((sourceArtifactId) => {
              const source = resolvedByArtifactId.get(sourceArtifactId);
              return source ? [source.node] : [];
            }),
          ),
      );
      const groupPosition = findAvailableContentPosition(
        createPreferredPosition('output', groupedSourceNodes, roleLanes),
        generatedBatchGroup.size,
        topLevelLayoutNodes,
      );
      generatedBatchGroupNode = createGeneratedBatchGroupNode(
        request,
        generatedBatchGroup,
        groupPosition,
        nextZIndex(layoutNodes),
      );
      generatedBatchChildPositions = new Map(
        [...generatedBatchGroup.childOffsets].map(([nodeId, offset]) => [
          nodeId,
          {
            x: groupPosition.x + offset.x,
            y: groupPosition.y + offset.y,
          },
        ]),
      );
      const occupiedGroup = occupiedNodeIds.get(generatedBatchGroupNode.id);
      if (occupiedGroup) {
        throw new Error(
          `projection-conflict: Canvas node ${generatedBatchGroupNode.id} is occupied by unrelated creative content.`,
        );
      }
      occupiedNodeIds.set(generatedBatchGroupNode.id, generatedBatchGroupNode);
      layoutNodes.push(generatedBatchGroupNode);
      topLevelLayoutNodes.push(generatedBatchGroupNode);
      operations.push({ kind: 'node.create', node: generatedBatchGroupNode });
    }
    const size = artifactNodeSize(artifact);
    const position = belongsToGeneratedBatchGroup
      ? generatedBatchChildPositions?.get(id)
      : findAvailableContentPosition(
          createPreferredPosition(artifact.provenance.role, sourceNodes, roleLanes),
          size,
          topLevelLayoutNodes,
        );
    if (!position) {
      throw new Error(`Workspace Board batch layout is missing a position for ${id}.`);
    }
    const node = createArtifactNode(
      artifact,
      id,
      position,
      nextZIndex(layoutNodes),
      belongsToGeneratedBatchGroup ? generatedBatchGroupNode?.id : undefined,
    );
    const resolved = { node } as const;
    resolvedByContentIdentity.set(contentIdentity, resolved);
    resolvedByArtifactId.set(artifact.provenance.artifactId, resolved);
    occupiedNodeIds.set(node.id, node);
    layoutNodes.push(node);
    if (!node.parentId) topLevelLayoutNodes.push(node);
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

function refreshExistingResourceProvenance(
  node: CanvasNode,
  artifact: CanvasWorkspaceProjectionArtifact,
): CanvasNode {
  if (artifact.kind === 'markdown' || (node.type !== 'media' && node.type !== 'file')) return node;
  const existing = node.data.provenance;
  if (existing?.['contentFingerprint'] === artifact.provenance.contentFingerprint) return node;
  return {
    ...node,
    data: {
      ...node.data,
      provenance: existing
        ? { ...existing, contentFingerprint: artifact.provenance.contentFingerprint }
        : createSerializableProvenance(artifact),
    },
  } as CanvasNode;
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
  return artifact.kind === 'markdown'
    ? createPortableArtifactContentIdentity(
        artifact.provenance.artifactId,
        artifact.provenance.contentFingerprint,
      )
    : hashStableValue({
        kind: 'content-locator',
        locator: contentLocatorKey(artifact.contentLocator),
      });
}

function readNodeContentIdentity(node: CanvasNode): string | undefined {
  const contentLocator = 'contentLocator' in node.data ? node.data.contentLocator : undefined;
  if (isContentLocator(contentLocator)) {
    return hashStableValue({
      kind: 'content-locator',
      locator: contentLocatorKey(contentLocator),
    });
  }
  const provenance = 'provenance' in node.data ? node.data.provenance : undefined;
  if (!isSerializableRecord(provenance)) return undefined;
  const artifactId = provenance['artifactId'];
  const contentFingerprint = provenance['contentFingerprint'];
  return typeof artifactId === 'string' && typeof contentFingerprint === 'string'
    ? createPortableArtifactContentIdentity(artifactId, contentFingerprint)
    : undefined;
}

function createPortableArtifactContentIdentity(
  artifactId: string,
  contentFingerprint: string,
): string {
  return hashStableValue({ kind: 'artifact', artifactId, contentFingerprint });
}

function createContentNodeId(contentIdentity: string): string {
  return `workspace-content-${contentIdentity.slice(0, 24)}`;
}

function planGeneratedBatchGroup(
  deliveryId: string,
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
  existingContentNodes: ReadonlyMap<string, readonly CanvasNode[]>,
): GeneratedBatchGroupPlan | undefined {
  const groupedArtifacts: CanvasWorkspaceProjectionArtifact[] = [];
  const contentIdentities = new Set<string>();
  for (const artifact of artifacts) {
    if (!isGeneratedOutputMediaArtifact(artifact)) continue;
    const contentIdentity = createArtifactContentIdentity(artifact);
    if (contentIdentities.has(contentIdentity) || existingContentNodes.has(contentIdentity))
      continue;
    contentIdentities.add(contentIdentity);
    groupedArtifacts.push(artifact);
  }
  if (groupedArtifacts.length < 2) return undefined;

  const columns = Math.ceil(Math.sqrt(groupedArtifacts.length));
  const rows = Math.ceil(groupedArtifacts.length / columns);
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowHeights = Array.from({ length: rows }, () => 0);
  const nodes = groupedArtifacts.map((artifact, index) => {
    const size = artifactNodeSize(artifact);
    const column = index % columns;
    const row = Math.floor(index / columns);
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
    const contentIdentity = createArtifactContentIdentity(artifact);
    return { id: createContentNodeId(contentIdentity), column, row };
  });
  const columnOffsets = cumulativeOffsets(columnWidths, GROUP_PADDING, GROUP_GAP);
  const rowOffsets = cumulativeOffsets(rowHeights, GROUP_HEADER, GROUP_GAP);
  return {
    id: `workspace-batch-${hashStableValue({
      kind: 'generated-batch',
      deliveryId,
    }).slice(0, 24)}`,
    contentIdentities,
    childIds: nodes.map((node) => node.id),
    childOffsets: new Map(
      nodes.map((node) => [
        node.id,
        {
          x: columnOffsets[node.column]!,
          y: rowOffsets[node.row]!,
        },
      ]),
    ),
    size: {
      width:
        GROUP_PADDING * 2 +
        columnWidths.reduce((total, width) => total + width, 0) +
        GROUP_GAP * (columns - 1),
      height:
        GROUP_HEADER +
        GROUP_PADDING +
        rowHeights.reduce((total, height) => total + height, 0) +
        GROUP_GAP * (rows - 1),
    },
    columns,
  };
}

function isGeneratedOutputMediaArtifact(artifact: CanvasWorkspaceProjectionArtifact): boolean {
  return (
    artifact.kind !== 'markdown' &&
    artifact.provenance.role === 'output' &&
    (artifact.kind === 'image' || artifact.kind === 'audio' || artifact.kind === 'video') &&
    artifact.generation !== undefined
  );
}

function cumulativeOffsets(
  values: readonly number[],
  start: number,
  gap: number,
): readonly number[] {
  const offsets: number[] = [];
  let offset = start;
  for (const value of values) {
    offsets.push(offset);
    offset += value + gap;
  }
  return offsets;
}

function createGeneratedBatchGroupNode(
  request: CanvasWorkspaceProjectionRequest,
  plan: GeneratedBatchGroupPlan,
  position: CanvasNode['position'],
  zIndex: number,
): GroupCanvasNode {
  return {
    id: plan.id,
    type: 'group',
    position,
    size: plan.size,
    zIndex,
    container: {
      policy: 'group',
      childIds: [...plan.childIds],
      layout: {
        mode: 'grid',
        columns: plan.columns,
        spacing: GROUP_GAP,
      },
      deleteBehavior: 'release-children',
    },
    data: {
      provenance: {
        kind: 'generated-batch',
        deliveryId: request.process.deliveryId,
        sourceHost: request.process.sourceHost,
        ...(request.process.taskId ? { taskId: request.process.taskId } : {}),
        ...(request.process.runId ? { runId: request.process.runId } : {}),
        createdAt: request.process.createdAt,
      },
    },
  };
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
    let nextY = y;
    for (let column = 0; column < CONTENT_GRID_COLUMNS; column += 1) {
      const position = {
        x: preferred.x + column * CONTENT_LANE_WIDTH,
        y,
      };
      const intersecting = existingNodes.filter((node) =>
        rectanglesOverlap({ position, size }, node),
      );
      if (intersecting.length === 0) return position;
      nextY = Math.max(
        nextY,
        ...intersecting.map((node) => node.position.y + node.size.height + CONTENT_VERTICAL_GAP),
      );
    }
    y = nextY > y ? nextY : y + size.height + CONTENT_VERTICAL_GAP;
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
  parentId?: string,
): CanvasNode {
  const base = { id, position, zIndex, ...(parentId ? { parentId } : {}) };
  const provenance = createSerializableProvenance(artifact);

  if (artifact.kind === 'markdown') {
    return {
      ...base,
      type: 'markdown',
      size: artifactNodeSize(artifact),
      data: {
        title: artifact.title,
        content: artifact.markdown,
        provenance,
      },
    };
  }

  if (artifact.kind === 'image' || artifact.kind === 'audio' || artifact.kind === 'video') {
    return {
      ...base,
      type: 'media',
      size: artifactNodeSize(artifact),
      data: {
        assetPath: '',
        mediaType: artifact.kind,
        title: artifact.title,
        contentLocator: artifact.contentLocator,
        ...(artifact.generation ? { generation: artifact.generation } : {}),
        provenance,
      },
    };
  }

  return {
    ...base,
    type: 'file',
    size: artifactNodeSize(artifact),
    data: {
      path: '',
      title: artifact.title,
      ...(artifact.mimeType ? { mediaType: artifact.mimeType } : {}),
      contentLocator: artifact.contentLocator,
      provenance,
    },
  };
}

function artifactNodeSize(artifact: CanvasWorkspaceProjectionArtifact): CanvasNode['size'] {
  const imageAspectRatio = artifactImageAspectRatio(artifact);
  if (imageAspectRatio !== undefined) {
    const defaultWidth = CANVAS_IMAGE_PROJECTION_DEFAULT_WIDTH;
    const minimumHeight = CANVAS_IMAGE_PROJECTION_MIN_HEIGHT;
    const heightAtDefaultWidth = defaultWidth / imageAspectRatio;
    return heightAtDefaultWidth >= minimumHeight
      ? { width: defaultWidth, height: heightAtDefaultWidth }
      : { width: minimumHeight * imageAspectRatio, height: minimumHeight };
  }
  switch (artifact.kind) {
    case 'markdown':
      return resolveCanvasNodeDefaultSize('markdown');
    case 'file-reference':
    case 'file':
    case 'storyboard':
      return resolveCanvasNodeDefaultSize('file');
    case 'audio':
      return { ...CANVAS_AUDIO_NODE_DEFAULT_SIZE };
    case 'image':
    case 'video':
      return resolveCanvasNodeDefaultSize('media');
  }
}

function artifactImageAspectRatio(artifact: CanvasWorkspaceProjectionArtifact): number | undefined {
  if (artifact.kind !== 'image') return undefined;
  const summary = artifact.generation?.summary;
  const dimensions = artifact.intrinsicDimensions ?? summary;
  if (
    typeof dimensions?.width === 'number' &&
    Number.isFinite(dimensions.width) &&
    dimensions.width > 0 &&
    typeof dimensions.height === 'number' &&
    Number.isFinite(dimensions.height) &&
    dimensions.height > 0
  ) {
    return dimensions.width / dimensions.height;
  }
  const match = summary?.aspectRatio?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : undefined;
}

function createSerializableProvenance(
  artifact: CanvasWorkspaceProjectionArtifact,
): CanvasSerializableRecord {
  const provenance = artifact.provenance;
  return {
    deliveryId: provenance.deliveryId,
    artifactId: provenance.artifactId,
    contentFingerprint: provenance.contentFingerprint,
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

function uniqueNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function roleRank(role: CanvasWorkspaceArtifactRole): number {
  if (role === 'source') return 0;
  if (role === 'analysis') return 1;
  return 2;
}

function nextZIndex(nodes: readonly CanvasNode[]): number {
  return nodes.reduce((maximum, node) => Math.max(maximum, node.zIndex), 0) + 10;
}
