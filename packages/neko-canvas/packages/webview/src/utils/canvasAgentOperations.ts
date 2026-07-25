import type {
  CanonicalCanvasNodeType,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentContainerSummary,
  CanvasAgentMutationMode,
  CanvasAgentNodeSummary,
  CanvasAgentTargetRef,
  CanvasConnection,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreativeScope,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasNode,
  CanvasRelatedBoardRef,
  CanvasStructuredNodeSummary,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  JsonPointerPath,
} from '@neko/shared';
import {
  getContainerChildIds,
  getNodeParentId,
  isCanvasConnectionType,
  isCanvasNodeType,
  isJsonPointerPath,
  readJsonPointer,
  writeJsonPointer,
} from '@neko/shared';
import { addContainerChild } from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';
import { buildCanvasNode } from './nodeFactory';

export interface CanvasAgentOperationContext {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  generateId: () => string;
}

export interface CanvasAgentActiveContextInput {
  nodes: CanvasNode[];
  connections?: readonly CanvasConnection[];
  canvasData?: {
    name?: string;
    creativeScope?: CanvasCreativeScope;
    relatedBoards?: readonly CanvasRelatedBoardRef[];
  };
  selectedNodeIds: readonly string[];
  viewport?: CanvasAgentActiveContextResult['viewport'];
  insertionPoint?: CanvasAgentActiveContextResult['insertionPoint'];
  documentUri?: string;
  canvasId?: string;
  request?: CanvasAgentActiveContextRequest;
}

export interface CanvasAgentMutationResult<T> {
  result: T;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

const DERIVE_GAP = 60;
const DEFAULT_AGENT_INSERT_POSITION = { x: 0, y: 0 };
const TARGETABLE_FIELDS: Record<CanonicalCanvasNodeType, readonly JsonPointerPath[]> = {
  markdown: ['/content', '/title'],
  media: ['/title', '/assetPath'],
  group: ['/label', '/color'],
  job: ['/title', '/objective'],
  file: ['/title', '/path'],
  'canvas-embed': ['/canvasTitle', '/canvasPath'],
};

export function createCanvasAgentActiveContext(
  input: CanvasAgentActiveContextInput,
): CanvasAgentActiveContextResult {
  const includeSelection = input.request?.includeSelection !== false;
  const selectedNodeIds = includeSelection
    ? input.selectedNodeIds.filter((nodeId) => input.nodes.some((node) => node.id === nodeId))
    : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => input.nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => node !== undefined)
    .map((node) => summarizeAgentNode(node, input.request?.includeNodeDetails === true));
  const nodeTypeSummary = input.nodes.reduce<Record<string, number>>((summary, node) => {
    summary[node.type] = (summary[node.type] ?? 0) + 1;
    return summary;
  }, {});

  const result: CanvasAgentActiveContextResult = {
    selectedNodeIds,
    selectedNodeTypes: [...new Set(selectedNodes.map((node) => node.type))],
    selectedNodes,
    nodeTypeSummary,
    ...(input.connections ? { connections: [...input.connections] } : {}),
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    ...(input.insertionPoint ? { insertionPoint: input.insertionPoint } : {}),
    ...(input.viewport ? { viewport: input.viewport } : {}),
  };

  if (input.request?.includeFocusedContainer !== false) {
    const focusedGroup = findFocusedGroup(input.nodes, selectedNodeIds);
    if (focusedGroup) result.focusedContainer = summarizeGroup(focusedGroup);
  }

  if (
    input.request?.includeBoardNavigation !== false &&
    (input.canvasData?.creativeScope || input.canvasData?.relatedBoards)
  ) {
    result.boardSummary = {
      ...(input.canvasId ? { canvasId: input.canvasId } : {}),
      name: input.canvasData.name ?? 'Untitled Canvas',
      ...(input.canvasData.creativeScope ? { scope: input.canvasData.creativeScope } : {}),
      ...(input.canvasData.relatedBoards ? { relatedBoards: input.canvasData.relatedBoards } : {}),
      nodeTypeSummary,
    };
    if (input.canvasData.creativeScope) result.creativeScope = input.canvasData.creativeScope;
    if (input.canvasData.relatedBoards) result.relatedBoards = input.canvasData.relatedBoards;
  }

  return result;
}

export function applyCanvasAgentContent(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  validatePayload(payload);
  const target = normalizeTarget(payload.target);
  const mode = target?.mode ?? (target?.nodeId ? 'apply' : 'insert');

  if (target?.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }
  if (mode === 'replace' || mode === 'apply' || (mode === 'append' && target?.nodeId)) {
    return applyContentToNode(context, payload, target, mode);
  }

  const nodeId = context.generateId();
  const node = {
    ...buildCanvasNode({
      type: 'markdown',
      position: target?.insertionPoint ?? DEFAULT_AGENT_INSERT_POSITION,
      data: {
        content: renderPayload(payload),
        title: payload.title,
        provenance: payload.provenance,
      },
      zIndex: (context.nodes.length + 1) * 10,
    }),
    id: nodeId,
  } as CanvasNode;
  let nodes = [...context.nodes, node];

  if (target?.containerId) {
    const container = context.nodes.find((candidate) => candidate.id === target.containerId);
    if (!container || container.type !== 'group') {
      throw new Error(`Target Group "${target.containerId}" not found`);
    }
    const mutation = addContainerChild(nodes, target.containerId, nodeId);
    if (!mutation.changed) {
      throw new Error(mutation.error ?? `Failed to add node to Group "${target.containerId}"`);
    }
    nodes = mutation.nodes;
  }

  return {
    result: {
      changed: true,
      mode,
      nodeId,
      ...(target?.containerId ? { containerId: target.containerId } : {}),
      createdNodeIds: [nodeId],
      ...(target ? { target } : {}),
    },
    nodes,
    connections: context.connections,
  };
}

export function deriveCanvasNode(
  context: CanvasAgentOperationContext,
  request: CanvasDeriveNodeRequest,
): CanvasAgentMutationResult<CanvasDeriveNodeResult> {
  const source = context.nodes.find((node) => node.id === request.sourceNodeId);
  if (!source) throw new Error(`Source node "${request.sourceNodeId}" not found`);
  const targetType = readCanonicalNodeType(request.targetType ?? source.type);
  const nodeId = context.generateId();
  const node = {
    ...buildCanvasNode({
      type: targetType,
      position: findFreePosition({
        preferred: {
          x: source.position.x + source.size.width + DERIVE_GAP,
          y: source.position.y,
        },
        size: source.size,
        nodes: context.nodes,
      }),
      data: { ...source.data, ...(request.data ?? {}) },
      zIndex: (context.nodes.length + 1) * 10,
    }),
    id: nodeId,
  } as CanvasNode;
  let nodes = [...context.nodes, node];
  const parentId = getNodeParentId(source);
  if (parentId) {
    const mutation = addContainerChild(nodes, parentId, nodeId);
    if (mutation.changed) nodes = mutation.nodes;
  }

  let connections = context.connections;
  let connectionId: string | undefined;
  if (request.connect !== false) {
    connectionId = context.generateId();
    connections = [
      ...connections,
      {
        id: connectionId,
        sourceId: source.id,
        targetId: nodeId,
        type: 'derived-from',
        sourceEndpoint: { nodeId: source.id, scope: 'node' },
        targetEndpoint: { nodeId, scope: 'node' },
      },
    ];
  }

  return {
    result: { nodeId, ...(connectionId ? { connectionId } : {}), node },
    nodes,
    connections,
  };
}

export function createCanvasComposite(
  context: CanvasAgentOperationContext,
  request: CanvasCreateCompositeRequest,
): CanvasAgentMutationResult<CanvasCreateCompositeResult> {
  if (request.containerType && request.containerType !== 'group') {
    throw new Error(`Unsupported Canvas container type "${request.containerType}"`);
  }
  const containerId = request.containerId ?? context.generateId();
  if (context.nodes.some((node) => node.id === containerId)) {
    throw new Error(`Canvas node "${containerId}" already exists`);
  }
  const container = {
    ...buildCanvasNode({
      type: 'group',
      position:
        request.position ??
        findFreePosition({
          preferred: DEFAULT_AGENT_INSERT_POSITION,
          size: { width: 400, height: 300 },
          nodes: context.nodes,
        }),
      data: request.data ?? {},
      zIndex: (context.nodes.length + 1) * 10,
    }),
    id: containerId,
  } as CanvasNode;

  const children = request.children.map((child, index) => {
    const type = readCanonicalNodeType(child.type);
    return {
      ...buildCanvasNode({
        type,
        position: child.position ?? {
          x: container.position.x + 32 + (index % 2) * 280,
          y: container.position.y + 64 + Math.floor(index / 2) * 220,
        },
        data: child.data ?? {},
        zIndex: (context.nodes.length + index + 2) * 10,
      }),
      id: child.id ?? context.generateId(),
      parentId: containerId,
    } as CanvasNode;
  });

  let nodes = [...context.nodes, container, ...children];
  for (const child of children) {
    const mutation = addContainerChild(nodes, containerId, child.id);
    if (!mutation.changed) {
      throw new Error(mutation.error ?? `Failed to add child "${child.id}" to Group`);
    }
    nodes = mutation.nodes;
  }
  if (request.autoLayout !== false) {
    nodes = autoArrangeContainer(nodes, { containerId, mode: 'grid' });
  }

  const newConnections = (request.connections ?? []).map((connection) => {
    const source = children[connection.sourceChildIndex];
    const target = children[connection.targetChildIndex];
    if (!source || !target) {
      throw new Error('Canvas composite connection child index is out of range');
    }
    const type = connection.type ?? 'reference';
    if (!isCanvasConnectionType(type)) {
      throw new Error(`Unsupported Canvas connection type "${String(type)}"`);
    }
    return {
      id: connection.id ?? context.generateId(),
      sourceId: source.id,
      targetId: target.id,
      type,
      ...(connection.label ? { label: connection.label } : {}),
      sourceEndpoint: { nodeId: source.id, scope: 'node' as const },
      targetEndpoint: { nodeId: target.id, scope: 'node' as const },
    };
  });

  return {
    result: {
      containerId,
      childIds: children.map((child) => child.id),
      ...(newConnections.length
        ? { connectionIds: newConnections.map((connection) => connection.id) }
        : {}),
      nodes: [container, ...children],
    },
    nodes,
    connections: [...context.connections, ...newConnections],
  };
}

export function updateCanvasBlock(
  node: CanvasNode,
  request: CanvasUpdateBlockRequest,
): CanvasUpdateBlockResult & { node: CanvasNode } {
  if (request.blockId || request.binding) {
    throw new Error('Canvas composable block bindings are not supported');
  }
  if (!request.path || !isJsonPointerPath(request.path)) {
    throw new Error('Canvas node update requires a valid JSON Pointer path');
  }
  const allowed = new Set(TARGETABLE_FIELDS[readCanonicalNodeType(node.type)]);
  if (!allowed.has(request.path)) {
    throw new Error(`Field "${request.path}" is not targetable on ${node.type} node "${node.id}"`);
  }
  const written = writeJsonPointer(node.data, request.path, request.value);
  const nextNode = written.changed
    ? ({ ...node, data: written.data as CanvasNode['data'] } as CanvasNode)
    : node;
  return {
    nodeId: node.id,
    changed: written.changed,
    data: nextNode.data as Record<string, unknown>,
    node: nextNode,
  };
}

export function extractStructuredCanvasContent(
  nodes: CanvasNode[],
  connectionsOrRequest: readonly CanvasConnection[] | CanvasExtractStructuredContentRequest,
  request?: CanvasExtractStructuredContentRequest,
): CanvasExtractStructuredContentResult {
  const normalizedRequest =
    request ?? (connectionsOrRequest as CanvasExtractStructuredContentRequest);
  const selectedIds = normalizedRequest.nodeIds?.length
    ? [...new Set(normalizedRequest.nodeIds)]
    : nodes.map((node) => node.id);
  const expandedIds = normalizedRequest.includeChildren
    ? includeDescendants(nodes, selectedIds)
    : selectedIds;
  const summaries = expandedIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => node !== undefined)
    .map(summarizeStructuredNode);

  return {
    format: normalizedRequest.format,
    nodeIds: summaries.map((node) => node.id),
    nodes: summaries,
    content:
      normalizedRequest.format === 'json'
        ? summaries
        : summaries.map(renderStructuredSummary).filter(Boolean).join('\n\n'),
  };
}

function applyContentToNode(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  if (!target?.nodeId) throw new Error(`${mode} mode requires an explicit Canvas node target`);
  const node = context.nodes.find((candidate) => candidate.id === target.nodeId);
  if (!node) throw new Error(`Target node "${target.nodeId}" not found`);
  const type = readCanonicalNodeType(node.type);
  const fieldPath = target.fieldPath ?? TARGETABLE_FIELDS[type][0];
  if (!fieldPath || !TARGETABLE_FIELDS[type].includes(fieldPath)) {
    throw new Error(`Field "${String(fieldPath)}" is not targetable on ${node.type}`);
  }
  const nextValue =
    mode === 'append'
      ? appendValue(readJsonPointer(node.data, fieldPath).value, renderPayload(payload))
      : renderPayload(payload);
  const written = writeJsonPointer(node.data, fieldPath, nextValue);
  const nextNode = { ...node, data: written.data as CanvasNode['data'] } as CanvasNode;
  return {
    result: {
      changed: written.changed,
      mode,
      nodeId: node.id,
      target: { ...target, fieldPath },
    },
    nodes: context.nodes.map((candidate) => (candidate.id === node.id ? nextNode : candidate)),
    connections: context.connections,
  };
}

function summarizeAgentNode(node: CanvasNode, includeDetails: boolean): CanvasAgentNodeSummary {
  const type = readCanonicalNodeType(node.type);
  const childIds = getContainerChildIds(node);
  return {
    id: node.id,
    type,
    title: readNodeTitle(node),
    ...(includeDetails ? { summary: JSON.stringify(sanitizeData(node.data)) } : {}),
    ...(getNodeParentId(node) ? { parentId: getNodeParentId(node) } : {}),
    ...(childIds.length ? { childIds } : {}),
    targetableFields: TARGETABLE_FIELDS[type].map((path) => ({ path })),
  };
}

function summarizeGroup(node: CanvasNode): CanvasAgentContainerSummary {
  return {
    id: node.id,
    type: 'group',
    policy: 'group',
    childIds: getContainerChildIds(node),
    acceptedChildTypes: ['markdown', 'media', 'group', 'job', 'file', 'canvas-embed'],
    slots: [{ id: 'children', label: 'Children', childIds: getContainerChildIds(node) }],
  };
}

function summarizeStructuredNode(node: CanvasNode): CanvasStructuredNodeSummary {
  return {
    id: node.id,
    type: readCanonicalNodeType(node.type),
    title: readNodeTitle(node),
    ...(getNodeParentId(node) ? { parentId: getNodeParentId(node) } : {}),
    ...(getContainerChildIds(node).length ? { childIds: getContainerChildIds(node) } : {}),
    data: sanitizeData(node.data),
  };
}

function renderStructuredSummary(node: CanvasStructuredNodeSummary): string {
  if (node.type === 'markdown') {
    return typeof node.data.content === 'string' ? node.data.content : '';
  }
  const heading = node.title ? `## ${node.title}` : `## ${node.type}`;
  return `${heading}\n\n${JSON.stringify(node.data, null, 2)}`;
}

function includeDescendants(nodes: readonly CanvasNode[], rootIds: readonly string[]): string[] {
  const result: string[] = [];
  const queue = [...rootIds];
  const seen = new Set<string>();
  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    result.push(nodeId);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node) queue.push(...getContainerChildIds(node));
  }
  return result;
}

function findFocusedGroup(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): CanvasNode | undefined {
  for (const nodeId of selectedNodeIds) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    if (node.type === 'group') return node;
    const parentId = getNodeParentId(node);
    const parent = parentId ? nodes.find((candidate) => candidate.id === parentId) : undefined;
    if (parent?.type === 'group') return parent;
  }
  return nodes.find((node) => node.type === 'group');
}

function normalizeTarget(
  target: CanvasAgentTargetRef | undefined,
): CanvasAgentTargetRef | undefined {
  if (!target) return undefined;
  if (target.fieldPath && !isJsonPointerPath(target.fieldPath)) {
    throw new Error(`Invalid JSON Pointer field path "${target.fieldPath}"`);
  }
  if (target.fieldPath && !target.nodeId) {
    throw new Error('Canvas fieldPath targets require nodeId');
  }
  if (
    target.insertionPoint &&
    (!Number.isFinite(target.insertionPoint.x) || !Number.isFinite(target.insertionPoint.y))
  ) {
    throw new Error('Canvas insertionPoint must contain finite coordinates');
  }
  return { ...target };
}

function validatePayload(payload: CanvasAgentContentPayload): void {
  if (payload.kind === 'text' && typeof payload.text !== 'string') {
    throw new Error('Canvas Agent text payload requires text');
  }
  if (payload.kind === 'prompt' && typeof payload.prompt !== 'string') {
    throw new Error('Canvas Agent prompt payload requires prompt');
  }
  if (payload.kind === 'structured' && !Object.hasOwn(payload, 'content')) {
    throw new Error('Canvas Agent structured payload requires content');
  }
}

function renderPayload(payload: CanvasAgentContentPayload): string {
  if (payload.kind === 'text') return payload.text ?? '';
  if (payload.kind === 'prompt') return payload.prompt ?? '';
  return typeof payload.content === 'string'
    ? payload.content
    : JSON.stringify(payload.content ?? null, null, 2);
}

function appendValue(current: unknown, next: string): string {
  return typeof current === 'string' && current.length > 0 ? `${current}\n${next}` : next;
}

function readCanonicalNodeType(value: unknown): CanonicalCanvasNodeType {
  if (!isCanvasNodeType(value)) {
    throw new Error(`Unsupported Canvas node type "${String(value)}"`);
  }
  return value as CanonicalCanvasNodeType;
}

function readNodeTitle(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  for (const key of ['title', 'label', 'canvasTitle', 'objective']) {
    if (typeof data[key] === 'string' && data[key].length > 0) return data[key];
  }
  return undefined;
}

function sanitizeData(data: CanvasNode['data']): Record<string, unknown> {
  const source = data as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !key.startsWith('runtime'))
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith('runtime'))
        .map(([key, nested]) => [key, sanitizeValue(nested)]),
    );
  }
  return value;
}
