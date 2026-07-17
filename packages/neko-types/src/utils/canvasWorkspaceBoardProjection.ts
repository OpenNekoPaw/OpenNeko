import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  validateCanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionRequest,
} from '../types/canvas-workspace-board';
import type { CanvasData, CanvasNode } from '../types/canvas';
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

  const artifactNodeId = createArtifactNodeId(request.provenance.projectionId);
  const existingArtifact = canvasData.nodes.find((node) => node.id === artifactNodeId);
  if (existingArtifact) {
    const provenance = readProjectionProvenance(existingArtifact);
    if (
      provenance?.projectionId === request.provenance.projectionId &&
      provenance.revision === request.provenance.revision &&
      provenance.artifactId === request.provenance.artifactId
    ) {
      return { status: 'noop', canvasData, nodeIds: [existingArtifact.id] };
    }
    throw new Error(
      `projection-conflict: Canvas node ${artifactNodeId} already represents another artifact revision.`,
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

  const inbox = existingInbox ?? createInboxNode(canvasData);
  const artifact = createArtifactNode(request, artifactNodeId, inbox, canvasData.nodes.length);
  const nextInbox: CanvasNode = {
    ...inbox,
    container: {
      ...inbox.container!,
      childIds: [...(inbox.container?.childIds ?? []), artifact.id],
    },
  };
  const operations = existingInbox
    ? [
        { kind: 'node.replace' as const, node: nextInbox },
        { kind: 'node.create' as const, node: artifact },
      ]
    : [
        { kind: 'node.create' as const, node: nextInbox },
        { kind: 'node.create' as const, node: artifact },
      ];
  const nextCanvasData = applyCanvasHeadlessAuthoringOperations(canvasData, operations);
  assertNoRuntimeResourceIdentity(nextCanvasData, 'workspaceBoard');
  return {
    status: 'projected',
    canvasData: nextCanvasData,
    nodeIds: [nextInbox.id, artifact.id],
  };
}

function createInboxNode(canvasData: CanvasData): CanvasNode {
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

function createArtifactNode(
  request: CanvasWorkspaceProjectionRequest,
  nodeId: string,
  inbox: CanvasNode,
  nodeCount: number,
): CanvasNode {
  const childIndex = inbox.container?.childIds.length ?? 0;
  const position = {
    x: inbox.position.x + 32 + (childIndex % 3) * 320,
    y: inbox.position.y + 72 + Math.floor(childIndex / 3) * 240,
  };
  const base = {
    id: nodeId,
    position,
    zIndex: Math.max(inbox.zIndex + 10, nodeCount * 10 + 10),
    parentId: inbox.id,
  };
  const provenance = { ...request.provenance };

  if (request.artifact.kind === 'markdown') {
    return {
      ...base,
      type: 'text',
      size: { width: 280, height: 180 },
      preset: 'text.basic',
      data: {
        title: request.artifact.title,
        content: request.artifact.markdown,
        format: 'markdown',
        provenance,
      },
    };
  }

  if (
    request.artifact.kind === 'image' ||
    request.artifact.kind === 'audio' ||
    request.artifact.kind === 'video'
  ) {
    return {
      ...base,
      type: 'media',
      size: { width: 280, height: 200 },
      preset: 'media.basic',
      data: {
        assetPath: '',
        mediaType: request.artifact.kind,
        title: request.artifact.title,
        ...(request.artifact.resourceRef ? { resourceRef: request.artifact.resourceRef } : {}),
        ...(request.artifact.documentResourceRef
          ? { documentResourceRef: request.artifact.documentResourceRef }
          : {}),
        provenance,
      },
    };
  }

  return {
    ...base,
    type: 'document',
    size: { width: 220, height: 280 },
    preset: 'document.basic',
    data: {
      docPath: '',
      docType: inferDocumentType(request.artifact.title, request.artifact.mimeType),
      title: request.artifact.title,
      ...(request.artifact.mimeType ? { mimeType: request.artifact.mimeType } : {}),
      ...(request.artifact.resourceRef ? { resourceRef: request.artifact.resourceRef } : {}),
      ...(request.artifact.documentResourceRef
        ? { documentResourceRef: request.artifact.documentResourceRef }
        : {}),
      provenance,
    },
  };
}

function readProjectionProvenance(
  node: CanvasNode,
):
  | { readonly projectionId?: unknown; readonly artifactId?: unknown; readonly revision?: unknown }
  | undefined {
  if (node.type !== 'text' && node.type !== 'media' && node.type !== 'document') return undefined;
  return node.data.provenance;
}

function createArtifactNodeId(projectionId: string): string {
  return `workspace-artifact-${hashStableValue({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    projectionId,
  }).slice(0, 24)}`;
}

function nextZIndex(nodes: readonly CanvasNode[]): number {
  return nodes.reduce((maximum, node) => Math.max(maximum, node.zIndex), 0) + 10;
}

function inferDocumentType(
  title: string,
  mimeType: string | undefined,
): 'pdf' | 'docx' | 'epub' | 'cbz' | 'file' {
  const normalized = title.toLowerCase();
  if (mimeType === 'application/pdf' || normalized.endsWith('.pdf')) return 'pdf';
  if (normalized.endsWith('.docx')) return 'docx';
  if (normalized.endsWith('.epub')) return 'epub';
  if (normalized.endsWith('.cbz')) return 'cbz';
  return 'file';
}
