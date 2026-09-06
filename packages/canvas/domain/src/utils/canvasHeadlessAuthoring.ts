import type {
  CanonicalCanvasNodeType,
  CanvasConnection,
  CanvasData,
  CanvasJobArtifactRef,
  CanvasJobStatus,
  CanvasNode,
  GroupCanvasNode,
  CanvasSerializableRecord,
  CanvasSerializableValue,
} from '../types/canvas';
import { DEFAULT_CANVAS_DATA, isCanvasConnectionType, isCanvasNodeType } from '../types/canvas';
import type {
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentMutationMode,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasGroupNodesRequest,
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
import type { JsonPointerPath } from '../types/canvas-layered';
import {
  isCanvasEntityRepresentationEvidence,
  isCanvasGenerationEvidence,
  isCanvasMaterialMediaKind,
} from '../types/canvas-material-contracts';
import { isCanvasGenerationNodeData } from '../types/canvas-generation-node';
import { isJobRef } from '@neko/shared/job-lifecycle';
import { validateContentLocator } from '@neko/content-domain';
import { isJsonPointerPath, writeJsonPointer } from './fieldBinding';
import { assertNoRuntimeResourceIdentity } from './canvasDurableResourceIdentity';
import {
  CANVAS_AUDIO_NODE_DEFAULT_SIZE,
  resolveCanvasFileNodeDefaultSize,
  resolveCanvasGenerationNodeDefaultSize,
  resolveCanvasNodeDefaultSize,
} from '../canvas-node-sizing';

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

export interface CanvasNodeCreationPlanInput extends CanvasNodeCreateSpec {
  readonly size?: { readonly width: number; readonly height: number };
}

export interface CanvasHeadlessAuthoringIdFactoryOptions {
  readonly prefix?: string;
  readonly existingIds?: readonly string[];
}

const DEFAULT_INSERT_POSITION = { x: 100, y: 100 };
const TARGETABLE_FIELD_PATHS = {
  markdown: ['/content', '/title'],
  media: ['/title', '/assetPath'],
  group: ['/label', '/color'],
  job: ['/title', '/objective'],
  file: ['/title', '/path'],
  'canvas-embed': ['/canvasTitle', '/canvasPath'],
  generation: ['/recipe/prompt', '/selectedOutputId'],
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
  request: CanvasNodeCreationPlanInput,
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

export function planCanvasNodeGrouping(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasGroupNodesRequest,
): {
  readonly group: GroupCanvasNode;
  readonly operations: readonly CanvasHeadlessAuthoringOperation[];
} {
  if (request.nodeIds.length === 0 || new Set(request.nodeIds).size !== request.nodeIds.length) {
    throw new Error('Canvas grouping requires distinct, explicit node identities.');
  }
  const existing =
    request.groupId === undefined ? undefined : requireNode(context.canvasData, request.groupId);
  if (existing && (existing.type !== 'group' || existing.parentId !== undefined)) {
    throw new Error('Canvas grouping target must be a top-level group.');
  }
  const members = request.nodeIds.map((id) => requireNode(context.canvasData, id));
  for (const node of members) {
    if (node.type === 'group' || (node.parentId !== undefined && node.parentId !== existing?.id)) {
      throw new Error(
        `Canvas node ${node.id} cannot be moved from another group or nested by grouping.`,
      );
    }
  }
  const candidate =
    existing ??
    planCanvasNodeCreation(context, { type: 'group', data: { label: request.label ?? '生成素材' } })
      .result.node;
  if (candidate.type !== 'group' || !candidate.container)
    throw new Error('Canvas grouping requires a group container.');
  const childIds = [...new Set([...candidate.container.childIds, ...request.nodeIds])];
  const children = childIds.map((id) => requireNode(context.canvasData, id));
  const x = Math.min(...children.map((node) => node.position.x)) - 24;
  const y = Math.min(...children.map((node) => node.position.y)) - 64;
  const right = Math.max(...children.map((node) => node.position.x + node.size.width)) + 24;
  const bottom = Math.max(...children.map((node) => node.position.y + node.size.height)) + 24;
  const group: GroupCanvasNode = {
    ...candidate,
    position: { x, y },
    size: { width: right - x, height: bottom - y },
    zIndex: Math.min(...children.map((node) => node.zIndex)) - 1,
    data: { ...candidate.data, ...(request.label === undefined ? {} : { label: request.label }) },
    container: { ...candidate.container, childIds },
  };
  return {
    group,
    operations: [
      { kind: existing ? 'node.replace' : 'node.create', node: group },
      ...members.map((node): CanvasHeadlessAuthoringOperation => ({
        kind: 'node.replace',
        node: { ...node, parentId: group.id },
      })),
    ],
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
  spec: CanvasNodeCreationPlanInput,
  id: string,
  zIndex: number,
): CanvasNode {
  const input = spec.data ?? {};
  const base = {
    id,
    position: spec.position ?? DEFAULT_INSERT_POSITION,
    size: readOptionalNodeSize(spec.size) ?? resolveCanvasNodeDefaultSize(type),
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
      const contentLocator = validateContentLocator(input['contentLocator']);
      if (!contentLocator.ok) {
        throw new Error('Canvas Media creation requires a canonical ContentLocator');
      }
      return {
        ...base,
        type,
        size: input['mediaType'] === 'audio' ? { ...CANVAS_AUDIO_NODE_DEFAULT_SIZE } : base.size,
        data: {
          assetPath,
          ...readOptionalStringField(input, 'thumbnailPath'),
          ...readOptionalStringField(input, 'title'),
          ...readMediaType(input),
          ...readOptionalPositiveNumberField(input, 'duration'),
          ...readResourceFields(input),
          ...readGenerationEvidence(input),
          ...readEntityRepresentationEvidence(input),
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
    case 'job': {
      assertOnlyFields(
        input,
        ['jobRef', 'title', 'objective', 'status', 'inputRefs', 'outputRefs', 'diagnostic'],
        'Canvas Job',
      );
      return {
        ...base,
        type,
        data: {
          jobRef: readRequiredJobRef(input['jobRef']),
          title: readRequiredString(input, 'title', 'Canvas Job'),
          ...readOptionalStringField(input, 'objective'),
          status: readRequiredJobStatus(input['status']),
          inputRefs: readJobArtifactRefs(input['inputRefs']),
          outputRefs: readJobArtifactRefs(input['outputRefs']),
          ...readOptionalStringField(input, 'diagnostic'),
        },
      };
    }
    case 'file': {
      const path = readString(input, 'path');
      const contentLocator = validateContentLocator(input['contentLocator']);
      if (!contentLocator.ok) {
        throw new Error('Canvas File creation requires a canonical ContentLocator');
      }
      return {
        ...base,
        type,
        size:
          spec.size === undefined
            ? resolveCanvasFileNodeDefaultSize({
                path: path || readString(input, 'title'),
                ...readOptionalStringField(input, 'mediaType'),
              })
            : base.size,
        data: {
          path,
          title: readString(input, 'title') || path.split('/').pop() || 'File',
          ...(isCanvasMaterialMediaKind(input['mediaKind'])
            ? { mediaKind: input['mediaKind'] }
            : {}),
          ...readOptionalStringField(input, 'mediaType'),
          ...readResourceFields(input),
          ...readGenerationEvidence(input),
          ...readEntityRepresentationEvidence(input),
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
          ...readContentLocator(input),
        },
      };
    }
    case 'generation':
      if (!isCanvasGenerationNodeData(input)) {
        throw new Error('Canvas Generation creation requires canonical node data');
      }
      return {
        ...base,
        type,
        size: resolveCanvasGenerationNodeDefaultSize(input.recipe.kind),
        data: input,
      };
  }
}

function readOptionalNodeSize(
  size: CanvasNodeCreationPlanInput['size'],
): { width: number; height: number } | undefined {
  if (size === undefined) return undefined;
  if (
    !Number.isFinite(size.width) ||
    size.width <= 0 ||
    !Number.isFinite(size.height) ||
    size.height <= 0
  ) {
    throw new Error('Canvas node size must contain finite positive width and height');
  }
  return { width: size.width, height: size.height };
}

function readRequiredJobRef(value: unknown): import('@neko/shared/job-lifecycle').JobRef {
  if (!isJobRef(value)) {
    throw new Error('Canvas Job jobRef must contain a non-empty owner kind and Job identity');
  }
  return value;
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
    case 'generation': {
      const rebuilt = createNodeFromSpec('generation', { data }, node.id, node.zIndex);
      if (rebuilt.type !== 'generation') throw new Error('Generation node rebuild failed');
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

function assertOnlyFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  owner: string,
): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(record).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new Error(`${owner} contains unknown field "${unknown[0]}"`);
  }
}

function readMediaType(record: Record<string, unknown>): {
  mediaType?: 'image' | 'audio' | 'video';
} {
  const value = record['mediaType'];
  return value === 'image' || value === 'audio' || value === 'video' ? { mediaType: value } : {};
}

function readResourceFields(record: Record<string, unknown>) {
  const contentLocator = validateContentLocator(record['contentLocator']);
  return contentLocator.ok ? { contentLocator: contentLocator.locator } : {};
}

function readContentLocator(record: Record<string, unknown>) {
  const contentLocator = validateContentLocator(record['contentLocator']);
  return contentLocator.ok ? { contentLocator: contentLocator.locator } : {};
}

function readGenerationEvidence(record: Record<string, unknown>) {
  return isCanvasGenerationEvidence(record['generation'])
    ? { generation: record['generation'] }
    : {};
}

function readEntityRepresentationEvidence(record: Record<string, unknown>) {
  return isCanvasEntityRepresentationEvidence(record['entityRepresentation'])
    ? { entityRepresentation: record['entityRepresentation'] }
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
    const contentLocator = validateContentLocator(item['contentLocator']);
    if (item['kind'] === 'content' && contentLocator.ok) {
      refs.push({ kind: 'content', contentLocator: contentLocator.locator });
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
