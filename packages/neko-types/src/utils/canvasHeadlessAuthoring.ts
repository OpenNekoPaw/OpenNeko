import type {
  CanonicalCanvasNodeType,
  CanvasConnection,
  CanvasData,
  CanvasJobArtifactRef,
  CanvasJobStatus,
  CanvasNode,
  CanvasSerializableRecord,
  CanvasSerializableValue,
} from '../types/canvas';
import {
  DEFAULT_CANVAS_DATA,
  isCanvasConnectionType,
  isCanvasMaterialGenerationContext,
  isCanvasNodeType,
} from '../types/canvas';
import type {
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentMutationMode,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasNodeCreateSpec,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
} from '../types/canvas-agent-operations';
import type {
  CanvasHeadlessAuthoringCreatedConnectionRef,
  CanvasHeadlessAuthoringCreatedNodeRef,
  CanvasHeadlessAuthoringOperation,
  CanvasHeadlessAuthoringOperationBatch,
  CanvasHeadlessAuthoringPlan,
} from '../types/canvas-headless-authoring';
import { CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION } from '../types/canvas-headless-authoring';
import type { JsonPointerPath } from '../types/canvas-layered';
import { isDocumentArchiveResourceRef } from '../types/document-reading';
import { isResourceRef } from '../types/resource-cache';
import { isJsonPointerPath, writeJsonPointer } from './fieldBinding';
import { assertNoRuntimeResourceIdentity } from './canvasDurableResourceIdentity';

export {
  assertNoRuntimeResourceIdentity,
  createCanvasAuthoringDiagnostic,
  validateCanvasDurableResourceIdentity,
  type CanvasDurableResourceIdentityValidationOptions,
} from './canvasDurableResourceIdentity';

export interface CanvasHeadlessAuthoringPlannerContext {
  readonly canvasData: CanvasData;
  readonly generateId?: () => string;
}

export interface CanvasHeadlessAuthoringIdFactoryOptions {
  readonly prefix?: string;
  readonly existingIds?: readonly string[];
}

const DEFAULT_INSERT_POSITION = { x: 100, y: 100 };
const DEFAULT_NODE_SIZES = {
  markdown: { width: 280, height: 180 },
  media: { width: 280, height: 200 },
  group: { width: 320, height: 220 },
  job: { width: 300, height: 180 },
  file: { width: 260, height: 180 },
  'canvas-embed': { width: 260, height: 180 },
} satisfies Readonly<Record<CanonicalCanvasNodeType, { width: number; height: number }>>;

const TARGETABLE_FIELD_PATHS = {
  markdown: ['/content', '/title'],
  media: ['/title', '/assetPath'],
  group: ['/label', '/color'],
  job: ['/title', '/objective'],
  file: ['/title', '/path'],
  'canvas-embed': ['/canvasTitle', '/canvasPath'],
} as const satisfies Readonly<Record<CanonicalCanvasNodeType, readonly JsonPointerPath[]>>;

export function createCanvasHeadlessAuthoringIdFactory(
  options: CanvasHeadlessAuthoringIdFactoryOptions = {},
): () => string {
  const prefix = sanitizeIdSegment(options.prefix ?? 'canvas-node');
  const used = new Set(options.existingIds ?? []);
  let next = 1;
  return () => createUniqueStableId(prefix, String(next++), used);
}

export function createCanvasAuthoringStableId(
  prefix: string,
  base: string | number,
  existingIds: ReadonlySet<string> | readonly string[] = [],
): string {
  return createUniqueStableId(
    sanitizeIdSegment(prefix),
    String(base),
    existingIds instanceof Set ? new Set(existingIds) : new Set(existingIds),
  );
}

export function createEmptyCanvasData(name = DEFAULT_CANVAS_DATA.name): CanvasData {
  return {
    ...DEFAULT_CANVAS_DATA,
    name,
    viewport: DEFAULT_CANVAS_DATA.viewport
      ? {
          pan: { ...DEFAULT_CANVAS_DATA.viewport.pan },
          zoom: DEFAULT_CANVAS_DATA.viewport.zoom,
        }
      : undefined,
    nodes: [],
    connections: [],
  };
}

export function planCanvasNodeCreation(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasNodeCreateSpec,
): CanvasHeadlessAuthoringPlan<{ nodeId: string; node: CanvasNode }> {
  const type = requireCanonicalNodeType(request.type);
  const provenanceMessageId = readProvenanceMessageId(request.data);
  if (provenanceMessageId) {
    const existing = context.canvasData.nodes.find(
      (node) => readProvenanceMessageId(node.data) === provenanceMessageId,
    );
    if (existing) {
      return {
        batch: createBatch([]),
        canvasData: context.canvasData,
        result: { nodeId: existing.id, node: existing },
      };
    }
  }

  const generateId = resolveIdFactory(context);
  const node = createNodeFromSpec(
    type,
    request,
    generateId(),
    nextZIndex(context.canvasData.nodes),
  );
  assertNoRuntimeResourceIdentity(node, 'node');
  const batch = createBatch([{ kind: 'node.create', node }], [createdNodeRef(node)]);
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: { nodeId: node.id, node },
  };
}

export function planCanvasConnectionCreation(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasCreateConnectionRequest,
): CanvasHeadlessAuthoringPlan<CanvasCreateConnectionResult> {
  requireNode(context.canvasData, request.sourceId);
  requireNode(context.canvasData, request.targetId);
  const type = request.type ?? 'reference';
  if (!isCanvasConnectionType(type)) {
    throw new Error(`Unsupported Canvas connection type "${String(type)}"`);
  }
  const generateId = resolveIdFactory(context);
  const connection: CanvasConnection = {
    id: generateId(),
    sourceId: request.sourceId,
    targetId: request.targetId,
    type,
    ...(request.label ? { label: request.label } : {}),
    sourceEndpoint: request.sourceEndpoint ?? {
      nodeId: request.sourceId,
      scope: 'node',
    },
    targetEndpoint: request.targetEndpoint ?? {
      nodeId: request.targetId,
      scope: 'node',
    },
  };
  validateConnectionEndpoints(connection);
  const batch = createBatch(
    [{ kind: 'connection.create', connection }],
    [],
    [createdConnectionRef(connection)],
  );
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: { connectionId: connection.id, connection },
  };
}

export function planCanvasCompositeCreation(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasCreateCompositeRequest,
): CanvasHeadlessAuthoringPlan<CanvasCreateCompositeResult> {
  if (request.containerType !== undefined && request.containerType !== 'group') {
    throw new Error(`Unsupported Canvas container type "${request.containerType}"`);
  }
  const generateId = resolveIdFactory(context);
  const containerId = request.containerId ?? generateId();
  if (context.canvasData.nodes.some((node) => node.id === containerId)) {
    throw new Error(`Canvas node "${containerId}" already exists`);
  }

  const container = createNodeFromSpec(
    'group',
    { type: 'group', position: request.position, data: request.data },
    containerId,
    nextZIndex(context.canvasData.nodes),
  );
  if (container.type !== 'group') {
    throw new Error('Canvas composite container must be a Group');
  }

  const children = request.children.map((child, index) => {
    const id = child.id ?? generateId();
    const type = requireCanonicalNodeType(child.type);
    const node = createNodeFromSpec(
      type,
      {
        ...child,
        position: child.position ?? {
          x: container.position.x + 24 + (index % 2) * 300,
          y: container.position.y + 64 + Math.floor(index / 2) * 220,
        },
      },
      id,
      container.zIndex + index + 1,
    );
    return { ...node, parentId: container.id };
  });
  assertUniqueNodeIds([...context.canvasData.nodes, container, ...children]);

  const linkedContainer: CanvasNode = {
    ...container,
    container: {
      ...container.container,
      policy: 'group',
      childIds: children.map((child) => child.id),
    },
  };
  const childConnections = (request.connections ?? []).map((spec) => {
    const source = children[spec.sourceChildIndex];
    const target = children[spec.targetChildIndex];
    if (!source || !target) {
      throw new Error('Canvas composite connection child index is out of range');
    }
    const type = spec.type ?? 'reference';
    if (!isCanvasConnectionType(type)) {
      throw new Error(`Unsupported Canvas connection type "${String(type)}"`);
    }
    const connection: CanvasConnection = {
      id: spec.id ?? generateId(),
      sourceId: source.id,
      targetId: target.id,
      type,
      ...(spec.label ? { label: spec.label } : {}),
      sourceEndpoint: {
        nodeId: source.id,
        scope: spec.sourceEndpoint?.scope ?? 'node',
        ...spec.sourceEndpoint,
      },
      targetEndpoint: {
        nodeId: target.id,
        scope: spec.targetEndpoint?.scope ?? 'node',
        ...spec.targetEndpoint,
      },
    };
    validateConnectionEndpoints(connection);
    return connection;
  });

  const operations: CanvasHeadlessAuthoringOperation[] = [
    { kind: 'node.create', node: linkedContainer },
    ...children.map((node): CanvasHeadlessAuthoringOperation => ({ kind: 'node.create', node })),
    ...childConnections.map((connection): CanvasHeadlessAuthoringOperation => ({
      kind: 'connection.create',
      connection,
    })),
  ];
  const batch = createBatch(
    operations,
    [linkedContainer, ...children].map(createdNodeRef),
    childConnections.map(createdConnectionRef),
  );
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, operations),
    result: {
      containerId,
      childIds: children.map((child) => child.id),
      ...(childConnections.length
        ? { connectionIds: childConnections.map((connection) => connection.id) }
        : {}),
      nodes: [linkedContainer, ...children],
    },
  };
}

export function planCanvasBlockUpdate(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasUpdateBlockRequest,
): CanvasHeadlessAuthoringPlan<CanvasUpdateBlockResult> {
  if (request.blockId) {
    throw new Error(`Canvas block "${request.blockId}" has no writable binding in headless mode`);
  }
  if (request.binding) {
    throw new Error('Canvas headless block updates do not accept editor field bindings');
  }
  if (!request.path || !isJsonPointerPath(request.path)) {
    throw new Error('Canvas node update requires a valid JSON Pointer path');
  }
  const node = requireNode(context.canvasData, request.nodeId);
  const allowedPaths = TARGETABLE_FIELD_PATHS[node.type];
  if (!allowedPaths.some((path) => path === request.path)) {
    throw new Error(`Field "${request.path}" is not targetable on ${node.type} node "${node.id}"`);
  }
  const written = writeJsonPointer(node.data, request.path, request.value);
  const nextNode = written.changed ? replaceNodeData(node, written.data) : node;
  const operations: CanvasHeadlessAuthoringOperation[] = written.changed
    ? [{ kind: 'node.replace', node: nextNode }]
    : [];
  return {
    batch: createBatch(operations),
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, operations),
    result: {
      nodeId: node.id,
      changed: written.changed,
      data: toSerializableRecord(nextNode.data, 'node.data'),
    },
  };
}

export function planCanvasAgentContentApplication(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasAgentContentPayload,
): CanvasHeadlessAuthoringPlan<CanvasAgentApplyContentResult> {
  const target = payload.target;
  if (target?.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }
  const mode = target?.mode ?? (target?.nodeId ? 'apply' : 'insert');
  if (target?.nodeId) {
    return applyAgentContentToNode(context, payload, mode, target.nodeId);
  }
  if (mode === 'replace' || mode === 'apply') {
    throw new Error(`Canvas Agent mode "${mode}" requires an explicit nodeId`);
  }

  const provenanceMessageId = payload.provenance?.messageId;
  if (provenanceMessageId) {
    const existing = context.canvasData.nodes.find(
      (node) => readProvenanceMessageId(node.data) === provenanceMessageId,
    );
    if (existing) {
      return {
        batch: createBatch([]),
        canvasData: context.canvasData,
        result: {
          changed: false,
          mode,
          nodeId: existing.id,
          reason: 'provenance-message-already-applied',
          ...(target ? { target } : {}),
        },
      };
    }
  }

  const created = planCanvasNodeCreation(context, {
    type: 'markdown',
    position: target?.insertionPoint,
    data: {
      content: renderAgentPayload(payload),
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.provenance
        ? { provenance: toSerializableRecord(payload.provenance, 'payload.provenance') }
        : {}),
    },
  });
  let canvasData = created.canvasData;
  let batch = created.batch;
  if (target?.containerId) {
    const container = requireNode(canvasData, target.containerId);
    if (container.type !== 'group') {
      throw new Error(`Target Group "${target.containerId}" not found`);
    }
    const childIds = container.container?.childIds ?? [];
    const linkedContainer: CanvasNode = {
      ...container,
      container: {
        ...(container.container ?? {}),
        policy: 'group',
        childIds: [...childIds, created.result.nodeId],
      },
    };
    const linkedChild = {
      ...created.result.node,
      parentId: container.id,
    };
    const replaceOperations: CanvasHeadlessAuthoringOperation[] = [
      { kind: 'node.replace', node: linkedContainer },
      { kind: 'node.replace', node: linkedChild },
    ];
    canvasData = applyCanvasHeadlessAuthoringOperations(canvasData, replaceOperations);
    batch = createBatch(
      [...batch.operations, ...replaceOperations],
      batch.createdNodes,
      batch.createdConnections,
    );
  }
  return {
    batch,
    canvasData,
    result: {
      changed: true,
      mode,
      nodeId: created.result.nodeId,
      createdNodeIds: [created.result.nodeId],
      ...(target?.containerId ? { containerId: target.containerId } : {}),
      ...(target ? { target } : {}),
    },
  };
}

export function applyCanvasHeadlessAuthoringOperations(
  canvasData: CanvasData,
  operations: readonly CanvasHeadlessAuthoringOperation[],
): CanvasData {
  if (operations.length === 0) {
    return canvasData;
  }
  let next = canvasData;
  for (const operation of operations) {
    switch (operation.kind) {
      case 'canvas.update':
        next = { ...next, ...operation.updates };
        break;
      case 'node.create':
        if (next.nodes.some((node) => node.id === operation.node.id)) {
          throw new Error(`Canvas node "${operation.node.id}" already exists`);
        }
        assertNoRuntimeResourceIdentity(operation.node, `node.${operation.node.id}`);
        next = { ...next, nodes: [...next.nodes, operation.node] };
        break;
      case 'node.replace':
        if (!next.nodes.some((node) => node.id === operation.node.id)) {
          throw new Error(`Canvas node "${operation.node.id}" does not exist`);
        }
        assertNoRuntimeResourceIdentity(operation.node, `node.${operation.node.id}`);
        next = {
          ...next,
          nodes: next.nodes.map((node) => (node.id === operation.node.id ? operation.node : node)),
        };
        break;
      case 'connection.create':
        if (next.connections.some((connection) => connection.id === operation.connection.id)) {
          throw new Error(`Canvas connection "${operation.connection.id}" already exists`);
        }
        requireNode(next, operation.connection.sourceId);
        requireNode(next, operation.connection.targetId);
        validateConnectionEndpoints(operation.connection);
        next = {
          ...next,
          connections: [...next.connections, operation.connection],
        };
        break;
    }
  }
  assertUniqueNodeIds(next.nodes);
  return next;
}

function applyAgentContentToNode(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasAgentContentPayload,
  mode: CanvasAgentMutationMode,
  nodeId: string,
): CanvasHeadlessAuthoringPlan<CanvasAgentApplyContentResult> {
  const node = requireNode(context.canvasData, nodeId);
  if (node.type !== 'markdown') {
    throw new Error(`Canvas Agent content can only target Markdown nodes, received "${node.type}"`);
  }
  const path = payload.target?.fieldPath ?? '/content';
  if (path !== '/content' && path !== '/title') {
    throw new Error(`Field "${path}" is not targetable on markdown node "${node.id}"`);
  }
  const incoming = renderAgentPayload(payload);
  const current = path === '/title' ? (node.data.title ?? '') : node.data.content;
  const value = mode === 'append' && current ? `${current}\n${incoming}` : incoming;
  const written = writeJsonPointer(node.data, path, value);
  const nextNode = written.changed ? replaceNodeData(node, written.data) : node;
  const operations: CanvasHeadlessAuthoringOperation[] = written.changed
    ? [{ kind: 'node.replace', node: nextNode }]
    : [];
  return {
    batch: createBatch(operations),
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, operations),
    result: {
      changed: written.changed,
      mode,
      nodeId,
      ...(payload.target ? { target: payload.target } : {}),
    },
  };
}

function createNodeFromSpec(
  type: CanonicalCanvasNodeType,
  spec: CanvasNodeCreateSpec,
  id: string,
  zIndex: number,
): CanvasNode {
  const input = spec.data ?? {};
  const base = {
    id,
    position: spec.position ?? DEFAULT_INSERT_POSITION,
    size: DEFAULT_NODE_SIZES[type],
    zIndex,
  };
  switch (type) {
    case 'markdown':
      return {
        ...base,
        type,
        data: {
          content: readString(input, 'content'),
          ...readOptionalStringField(input, 'title'),
          ...readProvenance(input),
        },
      };
    case 'media': {
      const assetPath = readString(input, 'assetPath');
      if (
        !assetPath &&
        !isResourceRef(input['resourceRef']) &&
        !isDocumentArchiveResourceRef(input['documentResourceRef'])
      ) {
        throw new Error('Canvas Media creation requires a durable source');
      }
      return {
        ...base,
        type,
        data: {
          assetPath,
          ...readOptionalStringField(input, 'thumbnailPath'),
          ...readOptionalStringField(input, 'title'),
          ...readMediaType(input),
          ...readOptionalPositiveNumberField(input, 'duration'),
          ...readResourceFields(input),
          ...readGenerationContext(input),
          ...readProvenance(input),
        },
      };
    }
    case 'group':
      return {
        ...base,
        type,
        container: {
          policy: 'group',
          childIds: [],
          layout: { mode: 'manual' },
          deleteBehavior: 'release-children',
        },
        data: {
          ...readOptionalStringField(input, 'label'),
          ...readOptionalStringField(input, 'color'),
          ...readProvenance(input),
        },
      };
    case 'job':
      return {
        ...base,
        type,
        data: {
          jobId: readRequiredString(input, 'jobId', 'Canvas Job'),
          revision: readRequiredNonNegativeInteger(input, 'revision', 'Canvas Job'),
          title: readRequiredString(input, 'title', 'Canvas Job'),
          ...readOptionalStringField(input, 'objective'),
          status: readRequiredJobStatus(input['status']),
          inputRefs: readJobArtifactRefs(input['inputRefs']),
          outputRefs: readJobArtifactRefs(input['outputRefs']),
          ...readOptionalStringField(input, 'diagnostic'),
        },
      };
    case 'file': {
      const path = readString(input, 'path');
      if (
        !path &&
        !isResourceRef(input['resourceRef']) &&
        !isDocumentArchiveResourceRef(input['documentResourceRef'])
      ) {
        throw new Error('Canvas File creation requires a durable source');
      }
      return {
        ...base,
        type,
        data: {
          path,
          title: readString(input, 'title') || path.split('/').pop() || 'File',
          ...readOptionalStringField(input, 'mediaType'),
          ...readResourceFields(input),
          ...readProvenance(input),
        },
      };
    }
    case 'canvas-embed': {
      const canvasPath = readRequiredString(input, 'canvasPath', 'CanvasEmbed');
      return {
        ...base,
        type,
        data: {
          canvasPath,
          canvasTitle:
            readString(input, 'canvasTitle') || canvasPath.split('/').pop() || canvasPath,
          ...readOptionalStringField(input, 'thumbnailData'),
        },
      };
    }
  }
}

function replaceNodeData(node: CanvasNode, value: unknown): CanvasNode {
  const data = toSerializableRecord(value, `node.${node.id}.data`);
  switch (node.type) {
    case 'markdown': {
      const rebuilt = createNodeFromSpec('markdown', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'markdown') throw new Error('Markdown node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
    case 'media': {
      const rebuilt = createNodeFromSpec('media', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'media') throw new Error('Media node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
    case 'group': {
      const rebuilt = createNodeFromSpec('group', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'group') throw new Error('Group node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
    case 'job': {
      const rebuilt = createNodeFromSpec('job', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'job') throw new Error('Job node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
    case 'file': {
      const rebuilt = createNodeFromSpec('file', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'file') throw new Error('File node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
    case 'canvas-embed': {
      const rebuilt = createNodeFromSpec('canvas-embed', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'canvas-embed') throw new Error('CanvasEmbed node rebuild failed');
      return { ...node, data: rebuilt.data };
    }
  }
}

function renderAgentPayload(payload: CanvasAgentContentPayload): string {
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.prompt === 'string') return payload.prompt;
  if (typeof payload.content === 'string') return payload.content;
  if (payload.content !== undefined) {
    return JSON.stringify(payload.content, null, 2);
  }
  throw new Error('Canvas Agent content payload contains no renderable content');
}

function requireCanonicalNodeType(value: unknown): CanonicalCanvasNodeType {
  if (!isCanvasNodeType(value)) {
    throw new Error(`Unsupported Canvas node type "${String(value)}"`);
  }
  return value;
}

function requireNode(canvasData: CanvasData, nodeId: string): CanvasNode {
  const node = canvasData.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Canvas node "${nodeId}" not found`);
  return node;
}

function resolveIdFactory(context: CanvasHeadlessAuthoringPlannerContext): () => string {
  return (
    context.generateId ??
    createCanvasHeadlessAuthoringIdFactory({
      existingIds: [
        ...context.canvasData.nodes.map((node) => node.id),
        ...context.canvasData.connections.map((connection) => connection.id),
      ],
    })
  );
}

function validateConnectionEndpoints(connection: CanvasConnection): void {
  if (connection.sourceEndpoint.nodeId !== connection.sourceId) {
    throw new Error(`Canvas connection "${connection.id}" source endpoint does not match sourceId`);
  }
  if (connection.targetEndpoint.nodeId !== connection.targetId) {
    throw new Error(`Canvas connection "${connection.id}" target endpoint does not match targetId`);
  }
}

function assertUniqueNodeIds(nodes: readonly CanvasNode[]): void {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate Canvas node id "${node.id}"`);
    ids.add(node.id);
  }
}

function createBatch(
  operations: readonly CanvasHeadlessAuthoringOperation[],
  createdNodes: readonly CanvasHeadlessAuthoringCreatedNodeRef[] = [],
  createdConnections: readonly CanvasHeadlessAuthoringCreatedConnectionRef[] = [],
): CanvasHeadlessAuthoringOperationBatch {
  return {
    version: CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION,
    operations,
    ...(createdNodes.length ? { createdNodes } : {}),
    ...(createdConnections.length ? { createdConnections } : {}),
  };
}

function createdNodeRef(node: CanvasNode): CanvasHeadlessAuthoringCreatedNodeRef {
  return {
    nodeId: node.id,
    type: node.type,
    ...(node.parentId ? { parentId: node.parentId } : {}),
  };
}

function createdConnectionRef(
  connection: CanvasConnection,
): CanvasHeadlessAuthoringCreatedConnectionRef {
  return {
    connectionId: connection.id,
    sourceId: connection.sourceId,
    targetId: connection.targetId,
    type: connection.type,
  };
}

function nextZIndex(nodes: readonly CanvasNode[]): number {
  return nodes.reduce((maximum, node) => Math.max(maximum, node.zIndex), 0) + 1;
}

function createUniqueStableId(prefix: string, base: string, used: Set<string>): string {
  const normalizedBase = sanitizeIdSegment(base) || 'item';
  const stem = `${prefix}-${normalizedBase}`;
  let candidate = stem;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

function sanitizeIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key] : '';
}

function readRequiredString(record: Record<string, unknown>, key: string, owner: string): string {
  const value = readString(record, key);
  if (!value) {
    throw new Error(`${owner} ${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalStringField(
  record: Record<string, unknown>,
  key: string,
): Record<string, string> {
  const value = record[key];
  return typeof value === 'string' ? { [key]: value } : {};
}

function readOptionalPositiveNumberField(
  record: Record<string, unknown>,
  key: string,
): Record<string, number> {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { [key]: value } : {};
}

function readRequiredNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  owner: string,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${owner} ${key} must be a non-negative integer`);
  }
  return value;
}

function readMediaType(record: Record<string, unknown>): {
  mediaType?: 'image' | 'audio' | 'video';
} {
  const value = record['mediaType'];
  return value === 'image' || value === 'audio' || value === 'video' ? { mediaType: value } : {};
}

function readResourceFields(record: Record<string, unknown>) {
  return {
    ...(isResourceRef(record['resourceRef']) ? { resourceRef: record['resourceRef'] } : {}),
    ...(isDocumentArchiveResourceRef(record['documentResourceRef'])
      ? { documentResourceRef: record['documentResourceRef'] }
      : {}),
  };
}

function readGenerationContext(record: Record<string, unknown>) {
  return isCanvasMaterialGenerationContext(record['generationContext'])
    ? { generationContext: record['generationContext'] }
    : {};
}

function readProvenance(record: Record<string, unknown>): {
  provenance?: CanvasSerializableRecord;
} {
  const value = record['provenance'];
  return isCanvasSerializableRecord(value) ? { provenance: value } : {};
}

function readProvenanceMessageId(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  const provenance = data['provenance'];
  if (!isRecord(provenance)) return undefined;
  return typeof provenance['messageId'] === 'string' ? provenance['messageId'] : undefined;
}

function readRequiredJobStatus(value: unknown): CanvasJobStatus {
  return value === 'draft' ||
    value === 'queued' ||
    value === 'running' ||
    value === 'waiting' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : (() => {
        throw new Error(`Unsupported Canvas Job status "${String(value)}"`);
      })();
}

function readJobArtifactRefs(value: unknown): CanvasJobArtifactRef[] {
  if (!Array.isArray(value)) return [];
  const refs: CanvasJobArtifactRef[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (item['kind'] === 'canvas-node' && typeof item['nodeId'] === 'string') {
      refs.push({ kind: 'canvas-node', nodeId: item['nodeId'] });
      continue;
    }
    if (item['kind'] === 'file' && typeof item['path'] === 'string') {
      refs.push({ kind: 'file', path: item['path'] });
      continue;
    }
    if (item['kind'] === 'resource' && isResourceRef(item['resourceRef'])) {
      refs.push({ kind: 'resource', resourceRef: item['resourceRef'] });
    }
  }
  return refs;
}

function toSerializableRecord(value: unknown, label: string): CanvasSerializableRecord {
  if (!isCanvasSerializableRecord(value)) {
    throw new Error(`${label} must be a JSON-serializable object`);
  }
  return value;
}

function isCanvasSerializableRecord(value: unknown): value is CanvasSerializableRecord {
  return isRecord(value) && Object.values(value).every(isCanvasSerializableValue);
}

function isCanvasSerializableValue(value: unknown): value is CanvasSerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isCanvasSerializableValue);
  return isCanvasSerializableRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
