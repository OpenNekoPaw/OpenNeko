import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  validateCanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceArtifactRole,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
} from '../types/canvas-workspace-board';
import type {
  CanvasData,
  CanvasNode,
  CanvasSerializableRecord,
  GroupCanvasNode,
} from '../types/canvas';
import { hashStableValue } from '../types/resource-cache';
import {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
} from './canvasHeadlessAuthoring';

export const CANVAS_WORKSPACE_INBOX_NODE_ID = 'workspace-inbox' as const;

export interface CanvasWorkspaceBoardProjectionPlan {
  readonly status: 'projected' | 'noop';
  readonly canvasData: CanvasData;
  readonly nodeIds: readonly string[];
}

export function planCanvasWorkspaceBoardProjection(
  canvasData: CanvasData,
  request: CanvasWorkspaceProjectionRequest,
): CanvasWorkspaceBoardProjectionPlan {
  const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('; '));
  }

  const groupId = createProcessingGroupNodeId(request.process.deliveryId);
  const existingGroup = canvasData.nodes.find((node) => node.id === groupId);
  if (existingGroup) {
    if (existingGroup.type === 'group' && matchesDeliveryBatch(existingGroup, request)) {
      return {
        status: 'noop',
        canvasData,
        nodeIds: [
          CANVAS_WORKSPACE_INBOX_NODE_ID,
          existingGroup.id,
          ...(existingGroup.container?.childIds ?? []),
        ],
      };
    }
    throw new Error(
      `projection-conflict: Canvas node ${groupId} already represents another delivery.`,
    );
  }

  const existingInbox = canvasData.nodes.find((node) => node.id === CANVAS_WORKSPACE_INBOX_NODE_ID);
  if (
    existingInbox &&
    (existingInbox.type !== 'group' || existingInbox.container?.policy !== 'group')
  ) {
    throw new Error(
      'projection-conflict: Workspace Inbox identity is occupied by a non-Group node.',
    );
  }

  const sortedArtifacts = request.artifacts
    .map((artifact, index) => ({ artifact, index }))
    .sort((left, right) => {
      const roleDifference =
        roleRank(left.artifact.provenance.role) - roleRank(right.artifact.provenance.role);
      return roleDifference === 0 ? left.index - right.index : roleDifference;
    })
    .map(({ artifact }) => artifact);
  const inbox = existingInbox ?? createInboxNode(canvasData);
  const group = createProcessingGroup(
    request,
    groupId,
    inbox,
    sortedArtifacts,
    canvasData.nodes.length,
  );
  const artifacts = sortedArtifacts.map((artifact, index) =>
    createArtifactNode(artifact, group, index, canvasData.nodes.length + index + 1),
  );
  const occupied = new Set(canvasData.nodes.map((node) => node.id));
  for (const artifact of artifacts) {
    if (occupied.has(artifact.id)) {
      throw new Error(
        `projection-conflict: Canvas node ${artifact.id} already represents another artifact.`,
      );
    }
  }
  const nextGroup: GroupCanvasNode = {
    ...group,
    container: {
      ...group.container!,
      childIds: artifacts.map((artifact) => artifact.id),
    },
  };
  const nextInbox: GroupCanvasNode = {
    ...inbox,
    container: {
      ...inbox.container!,
      childIds: [...(inbox.container?.childIds ?? []), nextGroup.id],
    },
  };
  const operations = existingInbox
    ? [
        { kind: 'node.replace' as const, node: nextInbox },
        { kind: 'node.create' as const, node: nextGroup },
        ...artifacts.map((node) => ({ kind: 'node.create' as const, node })),
      ]
    : [
        { kind: 'node.create' as const, node: nextInbox },
        { kind: 'node.create' as const, node: nextGroup },
        ...artifacts.map((node) => ({ kind: 'node.create' as const, node })),
      ];
  const nextCanvasData = applyCanvasHeadlessAuthoringOperations(canvasData, operations);
  assertNoRuntimeResourceIdentity(nextCanvasData, 'workspaceBoard');
  return {
    status: 'projected',
    canvasData: nextCanvasData,
    nodeIds: [nextInbox.id, nextGroup.id, ...artifacts.map((artifact) => artifact.id)],
  };
}

function createInboxNode(canvasData: CanvasData): GroupCanvasNode {
  return {
    id: CANVAS_WORKSPACE_INBOX_NODE_ID,
    type: 'group',
    position: { x: 40, y: 40 },
    size: { width: 1040, height: 760 },
    zIndex: nextZIndex(canvasData.nodes),
    preset: 'group.basic',
    container: { policy: 'group', childIds: [], deleteBehavior: 'release-children' },
    data: { label: 'Inbox', color: '#64748b' },
  };
}

function createProcessingGroup(
  request: CanvasWorkspaceProjectionRequest,
  id: string,
  inbox: GroupCanvasNode,
  artifacts: readonly CanvasWorkspaceProjectionArtifact[],
  nodeCount: number,
): GroupCanvasNode {
  const index = inbox.container?.childIds.length ?? 0;
  const columns = Math.min(3, Math.max(1, artifacts.length));
  const rows = Math.ceil(artifacts.length / columns);
  return {
    id,
    type: 'group',
    position: {
      x: inbox.position.x + 32,
      y: inbox.position.y + 72 + index * 280,
    },
    size: { width: 64 + columns * 300, height: 96 + rows * 220 },
    zIndex: Math.max(inbox.zIndex + 10, nodeCount * 10 + 10),
    parentId: inbox.id,
    preset: 'group.basic',
    container: { policy: 'group', childIds: [], deleteBehavior: 'release-children' },
    data: {
      label: createProcessingGroupLabel(request),
      color: '#475569',
      provenance: {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        deliveryId: request.process.deliveryId,
        sourceHost: request.process.sourceHost,
        createdAt: request.process.createdAt,
        ...(request.process.taskId ? { taskId: request.process.taskId } : {}),
        ...(request.process.runId ? { runId: request.process.runId } : {}),
        artifacts: artifacts.map((artifact) => ({
          artifactId: artifact.provenance.artifactId,
          revision: artifact.provenance.revision,
          role: artifact.provenance.role,
        })),
      },
    },
  };
}

function createProcessingGroupLabel(request: CanvasWorkspaceProjectionRequest): string {
  if (request.process.taskId) return `Agent Task ${request.process.taskId}`;
  if (request.process.runId) return `Agent Run ${request.process.runId}`;
  return 'Agent Processing';
}

function createArtifactNode(
  artifact: CanvasWorkspaceProjectionArtifact,
  group: GroupCanvasNode,
  index: number,
  nodeCount: number,
): CanvasNode {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const position = {
    x: group.position.x + 32 + column * 300,
    y: group.position.y + 64 + row * 220,
  };
  const base = {
    id: createArtifactNodeId(artifact),
    position,
    zIndex: Math.max(group.zIndex + index + 1, nodeCount * 10 + 10),
    parentId: group.id,
  };
  const provenance = createSerializableProvenance(artifact);

  if (artifact.kind === 'markdown') {
    return {
      ...base,
      type: 'text',
      size: { width: 268, height: 180 },
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
      size: { width: 268, height: 180 },
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
    size: { width: 220, height: 180 },
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

function matchesDeliveryBatch(
  group: GroupCanvasNode,
  request: CanvasWorkspaceProjectionRequest,
): boolean {
  const provenance = group.data.provenance;
  if (provenance?.['deliveryId'] !== request.process.deliveryId) return false;
  const artifacts = provenance['artifacts'];
  if (!Array.isArray(artifacts)) return false;
  const expected = request.artifacts
    .map((artifact) => ({
      artifactId: artifact.provenance.artifactId,
      revision: artifact.provenance.revision,
      role: artifact.provenance.role,
    }))
    .sort(compareArtifactIdentity);
  const actual = artifacts.flatMap((artifact) => {
    if (!isSerializableRecord(artifact)) return [];
    const artifactId = artifact['artifactId'];
    const revision = artifact['revision'];
    const role = artifact['role'];
    if (
      typeof artifactId !== 'string' ||
      typeof revision !== 'string' ||
      (role !== 'source' && role !== 'analysis' && role !== 'output')
    ) {
      return [];
    }
    return [{ artifactId, revision, role }];
  });
  return (
    actual.length === artifacts.length &&
    hashStableValue(actual.sort(compareArtifactIdentity)) === hashStableValue(expected)
  );
}

function compareArtifactIdentity(
  left: { readonly artifactId: string; readonly revision: string; readonly role: string },
  right: { readonly artifactId: string; readonly revision: string; readonly role: string },
): number {
  return `${left.role}:${left.artifactId}:${left.revision}`.localeCompare(
    `${right.role}:${right.artifactId}:${right.revision}`,
  );
}

function isSerializableRecord(value: unknown): value is CanvasSerializableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createProcessingGroupNodeId(deliveryId: string): string {
  return `workspace-process-${hashStableValue({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId,
  }).slice(0, 24)}`;
}

function createArtifactNodeId(artifact: CanvasWorkspaceProjectionArtifact): string {
  return `workspace-artifact-${hashStableValue({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: artifact.provenance.deliveryId,
    artifactId: artifact.provenance.artifactId,
    revision: artifact.provenance.revision,
  }).slice(0, 24)}`;
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
