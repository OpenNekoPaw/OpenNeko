import type {
  ArtboardPreset,
  CameraAngle,
  CameraMovement,
  CanvasConnection,
  CanvasData,
  CanvasNode,
  CanvasNodeType,
  GalleryPreset,
  PortDefinition,
  RegisteredCanvasNodeType,
  ShotCharacter,
  ShotGenerationStatus,
  ShotScale,
} from '../types/canvas';
import {
  DEFAULT_CANVAS_DATA,
  GALLERY_NODE_PORTS,
  MEDIA_NODE_PORTS,
  MODEL_WORKFLOW_PORTS,
  REGISTERED_CANVAS_NODE_TYPES,
  SCENE_NODE_PORTS,
  SHOT_NODE_PORTS,
  STORYBOARD_NODE_PORTS,
  getDefaultPorts,
  isCanvasMaterialGenerationContext,
  isCanvasNodeType,
} from '../types/canvas';
import type {
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentMutationMode,
  CanvasAgentTargetRef,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasCreateConnectionRequest,
  CanvasCreateConnectionResult,
  CanvasNodeCreateSpec,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
} from '../types/canvas-agent-operations';
import type { CanvasAuthoringDiagnostic } from '../types/canvas-authoring-contracts';
import type {
  CanvasHeadlessAuthoringCreatedConnectionRef,
  CanvasHeadlessAuthoringCreatedNodeRef,
  CanvasHeadlessAuthoringOperation,
  CanvasHeadlessAuthoringOperationBatch,
  CanvasHeadlessAuthoringPlan,
} from '../types/canvas-headless-authoring';
import { CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION } from '../types/canvas-headless-authoring';
import type {
  CanvasSerializableRecord,
  CanvasSerializableValue,
} from '../types/canvas-serializable';
import type { FieldBinding } from '../types/canvas-layered';
import type { JsonPointerPath } from '../types/canvas-layered';
import {
  getBuiltInCanvasNodePresetMetadata,
  getDefaultCanvasNodePresetName,
} from '../types/canvas-presets';
import type {
  ApplyCanvasStoryboardOptions,
  CanvasStoryboardPayload,
  CanvasStoryboardShotPlan,
  CreatedCanvasStoryboard,
} from '../types/storyboard-planner';
import { migrateLegacyCanvasStoryboardShot } from '../types/canvas-semantic-storyboard';
import { isDocumentArchiveResourceRef } from '../types/document-reading';
import { isResourceRef } from '../types/resource-cache';
import { isCanvasStoryboardPromptState } from '../types/canvas-semantic-storyboard';
import {
  isJsonPointerPath,
  readJsonPointer,
  writeFieldBinding,
  writeJsonPointer,
} from './fieldBinding';
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

const DEFAULT_START_X = 100;
const DEFAULT_START_Y = 100;
const SCENE_WIDTH = 900;
const SCENE_GAP = 80;
const SHOT_WIDTH = 220;
const SHOT_GAP = 24;
const STORYBOARD_SEQUENCE_CONNECTION_LABEL = 'next';
const DEFAULT_AGENT_INSERT_POSITION = { x: 0, y: 0 };

const DEFAULT_NODE_SIZES: Readonly<Record<CanvasNodeType, { width: number; height: number }>> = {
  media: { width: 280, height: 200 },
  storyboard: { width: 240, height: 160 },
  annotation: { width: 200, height: 100 },
  group: { width: 320, height: 220 },
  text: { width: 260, height: 120 },
  artboard: { width: 640, height: 360 },
  table: { width: 660, height: 400 },
  shot: { width: 220, height: 200 },
  scene: { width: 640, height: 400 },
  gallery: { width: 290, height: 360 },
  script: { width: 280, height: 220 },
  document: { width: 220, height: 280 },
  model: { width: 240, height: 160 },
  'canvas-embed': { width: 260, height: 180 },
  project: { width: 260, height: 180 },
  'narrative-start': { width: 200, height: 100 },
  choice: { width: 220, height: 120 },
  merge: { width: 180, height: 96 },
  'narrative-scene': { width: 260, height: 150 },
  'narrative-note': { width: 220, height: 120 },
  'narrative-ending': { width: 220, height: 110 },
  state: { width: 220, height: 120 },
  trigger: { width: 220, height: 120 },
  action: { width: 220, height: 120 },
  condition: { width: 220, height: 120 },
  composite: { width: 320, height: 180 },
  entity: { width: 240, height: 140 },
  'representation-slot': { width: 240, height: 140 },
  occurrence: { width: 240, height: 140 },
  'generated-asset': { width: 260, height: 160 },
  memory: { width: 260, height: 140 },
  conversation: { width: 260, height: 140 },
  fact: { width: 260, height: 120 },
};

const REGISTERED_NODE_TYPES = new Set<string>(REGISTERED_CANVAS_NODE_TYPES);

const TARGETABLE_FIELD_PATHS_BY_TYPE: Partial<Record<CanvasNodeType, readonly JsonPointerPath[]>> =
  {
    annotation: ['/content'],
    text: ['/content'],
    shot: [
      '/storyboardPrompt',
      '/visualDescription',
      '/characterAction',
      '/dialogue',
      '/voiceOver',
      '/soundCue',
      '/visualStyle',
    ],
    scene: ['/sceneTitle', '/location', '/timeOfDay'],
    storyboard: ['/title', '/description'],
    artboard: ['/name', '/description'],
    table: ['/label'],
    script: ['/title'],
    document: ['/title'],
    model: ['/modelName'],
    'canvas-embed': ['/canvasTitle'],
    project: ['/title'],
  };

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
  const used = existingIds instanceof Set ? existingIds : new Set(existingIds);
  return createUniqueStableId(prefix, String(base), used);
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
  const generateId =
    context.generateId ??
    createCanvasHeadlessAuthoringIdFactory({
      existingIds: context.canvasData.nodes.map((node) => node.id),
    });
  const node = createNodeFromSpec({
    spec: request,
    id: generateId(),
    zIndex: nextZIndex(context.canvasData.nodes),
  });
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
  assertNodeExists(context.canvasData.nodes, request.sourceId, 'sourceId');
  assertNodeExists(context.canvasData.nodes, request.targetId, 'targetId');
  const generateId =
    context.generateId ??
    createCanvasHeadlessAuthoringIdFactory({
      prefix: 'canvas-connection',
      existingIds: context.canvasData.connections.map((connection) => connection.id),
    });
  const connection: CanvasConnection = {
    id: generateId(),
    sourceId: request.sourceId,
    targetId: request.targetId,
    ...(request.type ? { type: request.type } : {}),
    ...(request.label ? { label: request.label } : {}),
    ...(request.priority !== undefined ? { priority: request.priority } : {}),
    ...(request.extension ? { extension: request.extension } : {}),
    sourceEndpoint: request.sourceEndpoint ?? { nodeId: request.sourceId, scope: 'node' },
    targetEndpoint: request.targetEndpoint ?? { nodeId: request.targetId, scope: 'node' },
  };
  assertNoRuntimeResourceIdentity(connection, 'connection');
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
  if (request.containerId) {
    const existingContainer = context.canvasData.nodes.find(
      (node) => node.id === request.containerId,
    );
    if (existingContainer) {
      if (request.containerType && existingContainer.type !== request.containerType) {
        throw new Error(
          `Canvas composite replay container "${request.containerId}" has type "${existingContainer.type}", expected "${request.containerType}"`,
        );
      }
      const requestedChildIds = request.children.map((child) => child.id);
      const existingChildren = requestedChildIds.flatMap((id) => {
        if (!id) return [];
        const node = context.canvasData.nodes.find((candidate) => candidate.id === id);
        return node ? [node] : [];
      });
      if (
        requestedChildIds.some((id) => !id) ||
        existingChildren.length !== request.children.length ||
        existingChildren.some(
          (node, index) =>
            node.parentId !== existingContainer.id || node.type !== request.children[index]?.type,
        )
      ) {
        throw new Error(
          `Canvas composite replay conflicts with existing container "${request.containerId}"`,
        );
      }
      return {
        batch: createBatch([]),
        canvasData: context.canvasData,
        result: {
          containerId: existingContainer.id,
          childIds: requestedChildIds.filter((id): id is string => Boolean(id)),
          nodes: [existingContainer, ...existingChildren],
        },
      };
    }
  }
  const generateId =
    context.generateId ??
    createCanvasHeadlessAuthoringIdFactory({
      existingIds: [
        ...context.canvasData.nodes.map((node) => node.id),
        ...context.canvasData.connections.map((connection) => connection.id),
      ],
    });
  const containerPresetName = resolveContainerPresetName(request);
  const containerPreset = getBuiltInCanvasNodePresetMetadata(containerPresetName);
  if (!containerPreset?.containerPolicy) {
    throw new Error(`Unsupported container preset "${containerPresetName}"`);
  }
  if (request.containerType && containerPreset.nodeType !== request.containerType) {
    throw new Error(
      `Container preset "${containerPresetName}" creates "${containerPreset.nodeType}", not "${request.containerType}"`,
    );
  }

  const container = createNodeFromSpec({
    spec: {
      type: containerPreset.nodeType,
      preset: containerPresetName,
      position: request.position,
      data: request.data,
    },
    id: request.containerId ?? generateId(),
    zIndex: nextZIndex(context.canvasData.nodes),
  });
  const childNodes = request.children.map((child, index) =>
    createNodeFromSpec({
      spec: {
        ...child,
        position: child.position ?? defaultChildPosition(container, index, resolveChildType(child)),
      },
      id: child.id ?? generateId(),
      zIndex: nextZIndex(context.canvasData.nodes) + (index + 1) * 10,
    }),
  );
  const nodes = attachChildrenToContainer(container, childNodes);
  const connections = createCompositeConnections(request, nodes.childIds, generateId);
  const operations: CanvasHeadlessAuthoringOperation[] = [
    { kind: 'node.create', node: nodes.container },
    ...nodes.children.map((node) => ({ kind: 'node.create', node }) as const),
    ...connections.map((connection) => ({ kind: 'connection.create', connection }) as const),
  ];
  const createdNodes = [nodes.container, ...nodes.children].map(createdNodeRef);
  const createdConnections = connections.map(createdConnectionRef);
  assertNoRuntimeResourceIdentity(
    { nodes: [nodes.container, ...nodes.children], connections },
    'composite',
  );
  const batch = createBatch(operations, createdNodes, createdConnections);

  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: {
      containerId: nodes.container.id,
      childIds: nodes.childIds,
      ...(connections.length > 0
        ? { connectionIds: connections.map((connection) => connection.id) }
        : {}),
      nodes: [nodes.container, ...nodes.children],
    },
  };
}

export function planCanvasBlockUpdate(
  context: CanvasHeadlessAuthoringPlannerContext,
  request: CanvasUpdateBlockRequest,
): CanvasHeadlessAuthoringPlan<CanvasUpdateBlockResult> {
  const node = context.canvasData.nodes.find((candidate) => candidate.id === request.nodeId);
  if (!node) {
    throw new Error(`Node "${request.nodeId}" not found`);
  }
  const binding = resolveUpdateBinding(request);
  const written = writeFieldBinding(node.data, binding, request.value);
  const nextNode = written.changed
    ? ({
        ...node,
        data: written.data as Record<string, unknown>,
      } as CanvasNode)
    : node;
  assertNoRuntimeResourceIdentity(nextNode, `nodes.${node.id}`);
  const batch = createBatch([{ kind: 'node.replace', node: nextNode }]);
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: {
      nodeId: node.id,
      changed: written.changed,
      data: nextNode.data as Record<string, unknown>,
    },
  };
}

export function planCanvasAgentContentApplication(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasAgentContentPayload,
): CanvasHeadlessAuthoringPlan<CanvasAgentApplyContentResult> {
  validateAgentContentPayload(payload);
  const target = normalizeAgentContentTarget(payload.target);
  const mode = resolveAgentContentMutationMode(target);

  if (target?.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}" for headless authoring`);
  }

  if (mode === 'replace' || mode === 'apply' || (mode === 'append' && target?.nodeId)) {
    return planAgentContentNodeUpdate(context, payload, target, mode);
  }

  return planAgentContentNodeInsert(context, payload, target, mode);
}

function planAgentContentNodeUpdate(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasHeadlessAuthoringPlan<CanvasAgentApplyContentResult> {
  if (!target?.nodeId) {
    throw new Error(`${mode} mode requires an explicit Canvas node target`);
  }

  const node = context.canvasData.nodes.find((candidate) => candidate.id === target.nodeId);
  if (!node) {
    throw new Error(`Target node "${target.nodeId}" not found`);
  }

  const fieldPath = target.fieldPath ?? defaultAgentContentFieldPath(node, payload);
  if (!fieldPath) {
    throw new Error(`No writable field available for ${payload.kind} content on ${node.type}`);
  }
  assertAgentContentTargetableField(node, fieldPath);

  const nextValue =
    mode === 'append'
      ? appendAgentContentValue(node, fieldPath, payload)
      : coerceAgentContentValue(payload, fieldPath);
  validateHeadlessStoryboardPromptWriteback(node, fieldPath, nextValue);
  const written = writeJsonPointer(node.data, fieldPath, nextValue);
  const nextNode = {
    ...node,
    data: written.data as Record<string, unknown>,
  } as CanvasNode;
  assertNoRuntimeResourceIdentity(nextNode, `nodes.${node.id}`);

  const batch = createBatch([{ kind: 'node.replace', node: nextNode }]);
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: {
      changed: written.changed,
      mode,
      nodeId: node.id,
      target: { ...target, fieldPath },
    },
  };
}

function planAgentContentNodeInsert(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasHeadlessAuthoringPlan<CanvasAgentApplyContentResult> {
  const provenanceMessageId = payload.provenance?.messageId;
  if (provenanceMessageId) {
    const existing = context.canvasData.nodes.find(
      (candidate) => readProvenanceMessageId(candidate.data) === provenanceMessageId,
    );
    if (existing) {
      return {
        batch: createBatch([]),
        canvasData: context.canvasData,
        result: {
          changed: false,
          mode,
          nodeId: existing.id,
          target,
        },
      };
    }
  }
  const generateId =
    context.generateId ??
    createCanvasHeadlessAuthoringIdFactory({
      existingIds: context.canvasData.nodes.map((node) => node.id),
    });
  const node = createNodeFromSpec({
    spec: {
      type: 'text',
      position: target?.insertionPoint ?? DEFAULT_AGENT_INSERT_POSITION,
      data: {
        content: renderAgentContent(payload),
        format: payload.format === 'markdown' ? 'markdown' : 'plain',
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.provenance ? { provenance: payload.provenance } : {}),
      },
    },
    id: generateId(),
    zIndex: nextZIndex(context.canvasData.nodes),
  });

  if (!target?.containerId) {
    const batch = createBatch([{ kind: 'node.create', node }], [createdNodeRef(node)]);
    return {
      batch,
      canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
      result: {
        changed: true,
        mode,
        nodeId: node.id,
        createdNodeIds: [node.id],
        target,
      },
    };
  }

  const container = context.canvasData.nodes.find(
    (candidate) => candidate.id === target.containerId,
  );
  if (!container) {
    throw new Error(`Target container "${target.containerId}" not found`);
  }
  assertContainerAcceptsChildren(container, [node]);
  const childIds = [...(container.container?.childIds ?? []), node.id];
  const nextContainer = {
    ...container,
    container: {
      policy: getContainerPolicy(container),
      ...(container.container ?? {}),
      childIds,
    },
  } as CanvasNode;
  const childNode = { ...node, parentId: container.id } as CanvasNode;
  assertNoRuntimeResourceIdentity({ container: nextContainer, node: childNode }, 'agentContent');
  const batch = createBatch(
    [
      { kind: 'node.replace', node: nextContainer },
      { kind: 'node.create', node: childNode },
    ],
    [createdNodeRef(childNode)],
  );
  return {
    batch,
    canvasData: applyCanvasHeadlessAuthoringOperations(context.canvasData, batch.operations),
    result: {
      changed: true,
      mode,
      nodeId: childNode.id,
      containerId: container.id,
      createdNodeIds: [childNode.id],
      target,
    },
  };
}

export function planCanvasStoryboardSceneShotCreation(
  context: CanvasHeadlessAuthoringPlannerContext,
  payload: CanvasStoryboardPayload,
  options: ApplyCanvasStoryboardOptions = {},
): CanvasHeadlessAuthoringPlan<CreatedCanvasStoryboard> {
  const startX = options.startX ?? DEFAULT_START_X;
  const startY = options.startY ?? DEFAULT_START_Y;
  const existingIds = new Set([
    ...context.canvasData.nodes.map((node) => node.id),
    ...context.canvasData.connections.map((connection) => connection.id),
  ]);
  let canvasData = context.canvasData;
  const operations: CanvasHeadlessAuthoringOperation[] = [];
  const createdNodes: CanvasHeadlessAuthoringCreatedNodeRef[] = [];
  const createdConnections: CanvasHeadlessAuthoringCreatedConnectionRef[] = [];
  const createdScenes: Array<{ sourceSceneId: string; sceneNodeId: string; shotIds: string[] }> =
    [];
  let previousSceneNodeId: string | undefined;
  let nextSceneConnectionPriority = 0;

  if (payload.creativeScope || payload.relatedBoards) {
    const updates: Partial<
      Pick<CanvasData, 'name' | 'viewport' | 'creativeScope' | 'relatedBoards'>
    > = {};
    if (payload.creativeScope) {
      updates.creativeScope = payload.creativeScope;
    }
    if (payload.relatedBoards) {
      updates.relatedBoards = [...payload.relatedBoards];
    }
    const updateOperation: CanvasHeadlessAuthoringOperation = { kind: 'canvas.update', updates };
    operations.push(updateOperation);
    canvasData = applyCanvasHeadlessAuthoringOperations(canvasData, [updateOperation]);
  }

  for (let sceneIndex = 0; sceneIndex < payload.scenes.length; sceneIndex++) {
    const scene = payload.scenes[sceneIndex];
    if (!scene) continue;
    const sceneX = startX + sceneIndex * (SCENE_WIDTH + SCENE_GAP);
    const sceneNodeId = createUniqueStableId('scene', scene.sceneId || sceneIndex + 1, existingIds);
    const composite = planCanvasCompositeCreation(
      {
        canvasData,
        generateId: createStoryboardIdGenerator(existingIds, sceneNodeId, scene),
      },
      {
        containerPreset: 'scene.basic',
        containerType: 'scene',
        position: { x: sceneX, y: startY },
        data: {
          sceneId: scene.sceneId,
          sourceScriptUri: payload.sourceScriptUri,
          sceneTitle: scene.sceneTitle,
          sceneNumber: scene.sceneNumber,
          location: scene.location,
          timeOfDay: scene.timeOfDay ?? undefined,
          storyboardPrompt: scene.storyboardPrompt,
          sourceStoryboardRevisionId: payload.sourceStoryboardRevisionId,
          storyboardProjectionMode: payload.projectionMode,
        },
        children: scene.shotPlans.map((shot, shotIndex) => ({
          type: 'shot',
          preset: 'shot.basic',
          position: {
            x: sceneX + 24 + shotIndex * (SHOT_WIDTH + SHOT_GAP),
            y: startY + 64,
          },
          data: createCanvasStoryboardShotNodeData(shot, options, payload),
        })),
        connections: createStoryboardShotSequenceConnections(scene.shotPlans.length),
        autoLayout: false,
      },
    );

    operations.push(...composite.batch.operations);
    createdNodes.push(...(composite.batch.createdNodes ?? []));
    createdConnections.push(...(composite.batch.createdConnections ?? []));
    canvasData = composite.canvasData;
    createdScenes.push({
      sourceSceneId: scene.sceneId,
      sceneNodeId: composite.result.containerId,
      shotIds: [...composite.result.childIds],
    });

    if (previousSceneNodeId) {
      const connection = createSceneSequenceConnection(
        previousSceneNodeId,
        composite.result.containerId,
        nextSceneConnectionPriority,
      );
      const connectionPlan = planCanvasConnectionCreation(
        {
          canvasData,
          generateId: () =>
            createUniqueStableId(
              'connection',
              `${previousSceneNodeId}-to-${composite.result.containerId}`,
              existingIds,
            ),
        },
        connection,
      );
      operations.push(...connectionPlan.batch.operations);
      createdConnections.push(...(connectionPlan.batch.createdConnections ?? []));
      canvasData = connectionPlan.canvasData;
      nextSceneConnectionPriority += 1;
    }
    previousSceneNodeId = composite.result.containerId;
  }

  const batch = createBatch(operations, createdNodes, createdConnections);
  assertNoRuntimeResourceIdentity(canvasData, 'canvasData');

  return {
    batch,
    canvasData,
    result: {
      mode: payload.mode,
      scenesCreated: createdScenes.length,
      totalShots: createdScenes.reduce((total, scene) => total + scene.shotIds.length, 0),
      scenes: createdScenes,
    },
  };
}

export function applyCanvasHeadlessAuthoringOperations(
  data: CanvasData,
  operations: readonly CanvasHeadlessAuthoringOperation[],
): CanvasData {
  let nextData = cloneCanvasData(data);
  for (const operation of operations) {
    switch (operation.kind) {
      case 'canvas.update':
        nextData = { ...nextData, ...operation.updates };
        break;
      case 'node.create':
        if (nextData.nodes.some((node) => node.id === operation.node.id)) {
          throw new Error(`Duplicate Canvas node id "${operation.node.id}"`);
        }
        nextData = { ...nextData, nodes: [...nextData.nodes, operation.node] };
        break;
      case 'node.replace':
        if (!nextData.nodes.some((node) => node.id === operation.node.id)) {
          throw new Error(`Canvas node "${operation.node.id}" not found`);
        }
        nextData = {
          ...nextData,
          nodes: nextData.nodes.map((node) =>
            node.id === operation.node.id ? operation.node : node,
          ),
        };
        break;
      case 'connection.create':
        if (nextData.connections.some((connection) => connection.id === operation.connection.id)) {
          throw new Error(`Duplicate Canvas connection id "${operation.connection.id}"`);
        }
        assertNodeExists(nextData.nodes, operation.connection.sourceId, 'sourceId');
        assertNodeExists(nextData.nodes, operation.connection.targetId, 'targetId');
        nextData = {
          ...nextData,
          connections: [...nextData.connections, operation.connection],
        };
        break;
      default:
        assertNever(operation);
    }
  }
  assertNoRuntimeResourceIdentity(nextData, 'canvasData');
  return nextData;
}

function validateAgentContentPayload(payload: CanvasAgentContentPayload): void {
  if (payload.kind === 'text' && typeof payload.text !== 'string') {
    throw new Error('Canvas Agent text payload requires text');
  }
  if (payload.kind === 'prompt' && typeof payload.prompt !== 'string') {
    throw new Error('Canvas Agent prompt payload requires prompt');
  }
  if (payload.kind === 'structured' && !Object.prototype.hasOwnProperty.call(payload, 'content')) {
    throw new Error('Canvas Agent structured payload requires content');
  }
}

function normalizeAgentContentTarget(
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
  if (target.mode === 'replace' && !target.nodeId && !target.slotId && !target.fieldPath) {
    throw new Error('replace mode requires an explicit target');
  }
  return {
    ...target,
    ...(target.fieldPath ? { fieldPath: target.fieldPath } : {}),
  };
}

function resolveAgentContentMutationMode(
  target: CanvasAgentTargetRef | undefined,
): CanvasAgentMutationMode {
  if (target?.mode) return target.mode;
  return target?.nodeId ? 'apply' : 'insert';
}

function defaultAgentContentFieldPath(
  node: CanvasNode,
  payload: CanvasAgentContentPayload,
): JsonPointerPath | undefined {
  if (payload.kind === 'prompt' && node.type === 'shot') {
    throw new Error(
      'Shot prompt authoring requires structured storyboardPrompt writeback; legacy generationPrompt is migration input only.',
    );
  }
  if (payload.kind === 'text' || payload.kind === 'structured') {
    if (node.type === 'text' || node.type === 'annotation') {
      return '/content';
    }
    if (node.type === 'shot') {
      return '/visualDescription';
    }
  }
  return TARGETABLE_FIELD_PATHS_BY_TYPE[node.type]?.[0];
}

function assertAgentContentTargetableField(node: CanvasNode, fieldPath: JsonPointerPath): void {
  if (node.type === 'shot' && (fieldPath === '/generationPrompt' || fieldPath === '/promptSlots')) {
    throw new Error(
      `Legacy field "${fieldPath}" is migration input only; write semantic storyboard prompts through /storyboardPrompt.`,
    );
  }
  const targetablePaths = new Set(TARGETABLE_FIELD_PATHS_BY_TYPE[node.type] ?? []);
  if (!targetablePaths.has(fieldPath)) {
    throw new Error(`Field "${fieldPath}" is not targetable on ${node.type} node "${node.id}"`);
  }
}

function appendAgentContentValue(
  node: CanvasNode,
  fieldPath: JsonPointerPath,
  payload: CanvasAgentContentPayload,
): unknown {
  const current = readJsonPointer(node.data, fieldPath);
  const next = coerceAgentContentValue(payload, fieldPath);
  if (typeof current.value === 'string') {
    const currentText = current.value.trimEnd();
    const nextText = String(next).trimStart();
    return currentText ? `${currentText}\n${nextText}` : nextText;
  }
  if (Array.isArray(current.value)) {
    return [...current.value, next];
  }
  return next;
}

function coerceAgentContentValue(
  payload: CanvasAgentContentPayload,
  fieldPath: JsonPointerPath,
): unknown {
  if (payload.kind === 'text') {
    return payload.text ?? '';
  }
  if (payload.kind === 'prompt') {
    return payload.prompt ?? '';
  }
  if (payload.kind === 'structured' && fieldPath === '/storyboardPrompt') {
    return payload.content;
  }
  if (payload.format === 'json' && !expectsAgentContentStringField(fieldPath)) {
    return payload.content;
  }
  return renderAgentContent(payload);
}

function validateHeadlessStoryboardPromptWriteback(
  node: CanvasNode,
  fieldPath: JsonPointerPath,
  value: unknown,
): void {
  if (node.type !== 'shot' || fieldPath !== '/storyboardPrompt') return;
  if (!isCanvasStoryboardPromptState(value)) {
    throw new Error('Invalid storyboardPrompt writeback: value is not a storyboard prompt state.');
  }
}

function renderAgentContent(payload: CanvasAgentContentPayload): string {
  if (payload.kind === 'text') return payload.text ?? '';
  if (payload.kind === 'prompt') return payload.prompt ?? '';
  if (typeof payload.content === 'string') return payload.content;
  return JSON.stringify(payload.content ?? null, null, 2);
}

function expectsAgentContentStringField(fieldPath: JsonPointerPath): boolean {
  return !fieldPath.endsWith('/characters') && !fieldPath.endsWith('/emotion');
}

function createNodeFromSpec(input: {
  readonly spec: CanvasNodeCreateSpec;
  readonly id: string;
  readonly zIndex: number;
}): CanvasNode {
  const nodeType = resolveNodeType(input.spec);
  const preset = resolvePreset(input.spec.preset, nodeType);
  const position = input.spec.position ?? { x: 0, y: 0 };
  const data = input.spec.data ?? {};
  const base = {
    id: input.id,
    type: nodeType,
    position,
    size: defaultNodeSize(nodeType, data),
    zIndex: input.zIndex,
    ...(preset ? { preset } : {}),
    ports: defaultPortsForNode(nodeType, data),
  };

  switch (nodeType) {
    case 'annotation':
      return {
        ...base,
        type: 'annotation',
        data: {
          content: asString(data['content']),
          ...(isRecord(data['style']) ? { style: data['style'] } : {}),
        },
      };
    case 'media':
      return {
        ...base,
        type: 'media',
        data: {
          assetPath: asString(data['assetPath']),
          ...(isDocumentArchiveResourceRef(data['documentResourceRef'])
            ? { documentResourceRef: data['documentResourceRef'] }
            : {}),
          ...(isResourceRef(data['resourceRef']) ? { resourceRef: data['resourceRef'] } : {}),
          ...(asString(data['thumbnailPath'])
            ? { thumbnailPath: asString(data['thumbnailPath']) }
            : {}),
          mediaType: inferMediaType(data['mediaType']),
          ...(asString(data['title']) ? { title: asString(data['title']) } : {}),
          ...(isRecord(data['provenance'])
            ? { provenance: toCanvasSerializableRecord(data['provenance']) }
            : {}),
          ...(isCanvasMaterialGenerationContext(data['generationContext'])
            ? { generationContext: data['generationContext'] }
            : {}),
          ...(typeof data['duration'] === 'number' ? { duration: data['duration'] } : {}),
        },
      };
    case 'storyboard':
      return {
        ...base,
        type: 'storyboard',
        data: {
          title: asString(data['title']),
          ...(asString(data['description']) ? { description: asString(data['description']) } : {}),
          ...(typeof data['duration'] === 'number' ? { duration: data['duration'] } : {}),
          ...(asString(data['color']) ? { color: asString(data['color']) } : {}),
        },
      };
    case 'group':
      return {
        ...base,
        type: 'group',
        container: {
          policy: 'group',
          childIds: [],
          deleteBehavior: 'release-children',
        },
        data: {
          ...(asString(data['label']) ? { label: asString(data['label']) } : {}),
          ...(asString(data['color']) ? { color: asString(data['color']) } : {}),
        },
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        data: {
          content: asString(data['content']),
          format: data['format'] === 'markdown' ? 'markdown' : 'plain',
          ...(isRecord(data['style']) ? { style: data['style'] } : {}),
          ...(asString(data['title']) ? { title: asString(data['title']) } : {}),
          ...(isRecord(data['provenance'])
            ? { provenance: toCanvasSerializableRecord(data['provenance']) }
            : {}),
        },
      };
    case 'artboard':
      return {
        ...base,
        type: 'artboard',
        container: {
          policy: 'artboard',
          childIds: [],
          deleteBehavior: 'release-children',
        },
        data: {
          name: asString(data['name'], 'Artboard'),
          ...(asString(data['description']) ? { description: asString(data['description']) } : {}),
          ...(asString(data['backgroundColor'])
            ? { backgroundColor: asString(data['backgroundColor']) }
            : {}),
          showBorder: typeof data['showBorder'] === 'boolean' ? data['showBorder'] : true,
          preset: inferArtboardPreset(data['preset']),
        },
      };
    case 'table':
      return {
        ...base,
        type: 'table',
        container: {
          policy: 'table',
          childIds: [],
          deleteBehavior: 'release-children',
        },
        data: {
          ...(asString(data['label']) ? { label: asString(data['label']) } : {}),
          columns: Array.isArray(data['columns'])
            ? data['columns']
            : createDefaultTableColumns(asNumber(data['columnCount'], 3)),
          rowCount: asNumber(data['rowCount'], 3),
          columnCount: asNumber(data['columnCount'], 3),
          showHeader: typeof data['showHeader'] === 'boolean' ? data['showHeader'] : true,
          ...(isRecord(data['markdown'])
            ? { markdown: toCanvasSerializableRecord(data['markdown']) }
            : {}),
        },
      } as CanvasNode;
    case 'shot':
      return {
        ...base,
        type: 'shot',
        data: {
          ...(asString(data['shotId']) ? { shotId: asString(data['shotId']) } : {}),
          shotNumber: asNumber(data['shotNumber'], input.zIndex + 1),
          duration: asNumber(data['duration'], 3),
          visualDescription: asString(data['visualDescription']),
          characters: asObjectArray<ShotCharacter>(data['characters']),
          shotScale: inferShotScale(data['shotScale']),
          ...(inferCameraMovement(data['cameraMovement'])
            ? { cameraMovement: inferCameraMovement(data['cameraMovement']) }
            : {}),
          ...(inferCameraAngle(data['cameraAngle'])
            ? { cameraAngle: inferCameraAngle(data['cameraAngle']) }
            : {}),
          characterAction: asString(data['characterAction']),
          emotion: asStringArray(data['emotion']),
          sceneTags: asStringArray(data['sceneTags']),
          ...(asString(data['referenceNodeId'])
            ? { referenceNodeId: asString(data['referenceNodeId']) }
            : {}),
          referenceRefs: asStringArray(data['referenceRefs']),
          ...(asString(data['referenceImagePath'])
            ? { referenceImagePath: asString(data['referenceImagePath']) }
            : {}),
          ...(isDocumentArchiveResourceRef(data['referenceImageResourceRef'])
            ? { referenceImageResourceRef: data['referenceImageResourceRef'] }
            : {}),
          ...(isResourceRef(data['referenceResourceRef'])
            ? { referenceResourceRef: data['referenceResourceRef'] }
            : {}),
          generationStatus: inferGenerationStatus(data['generationStatus']),
          generationHistory: asObjectArray(data['generationHistory']),
          ...(asString(data['dialogue']) ? { dialogue: asString(data['dialogue']) } : {}),
          ...(asString(data['voiceOver']) ? { voiceOver: asString(data['voiceOver']) } : {}),
          ...(asString(data['soundCue']) ? { soundCue: asString(data['soundCue']) } : {}),
          textCues: asObjectArray(data['textCues']),
          voiceCues: asObjectArray(data['voiceCues']),
          ...(isCanvasStoryboardPromptState(data['storyboardPrompt'])
            ? { storyboardPrompt: data['storyboardPrompt'] }
            : {}),
          ...(asString(data['generationPrompt'])
            ? { generationPrompt: asString(data['generationPrompt']) }
            : {}),
          ...(asString(data['visualStyle']) ? { visualStyle: asString(data['visualStyle']) } : {}),
          vfx: asStringArray(data['vfx']),
          sourceMediaRefs: asObjectArray(data['sourceMediaRefs']),
          generatedMediaRefs: asObjectArray(data['generatedMediaRefs']),
          mediaRefs: asObjectArray(data['mediaRefs']),
          ...(isRecord(data['shotImagePrepPlan'])
            ? { shotImagePrepPlan: data['shotImagePrepPlan'] }
            : {}),
          visualOccurrences: asObjectArray(data['visualOccurrences']),
          characterCandidates: asObjectArray(data['characterCandidates']),
          continuityDiagnostics: asObjectArray(data['continuityDiagnostics']),
          ...(isRecord(data['batchExecutionPlan'])
            ? { batchExecutionPlan: data['batchExecutionPlan'] }
            : {}),
          ...(typeof data['lastImportedToTimelineAt'] === 'number'
            ? { lastImportedToTimelineAt: data['lastImportedToTimelineAt'] }
            : {}),
          ...(asString(data['lastImportedToTimelineProject'])
            ? { lastImportedToTimelineProject: asString(data['lastImportedToTimelineProject']) }
            : {}),
          ...(asString(data['workflowPlanId'])
            ? { workflowPlanId: asString(data['workflowPlanId']) }
            : {}),
          ...(asString(data['sourceStoryboardRevisionId'])
            ? { sourceStoryboardRevisionId: asString(data['sourceStoryboardRevisionId']) }
            : {}),
          ...(data['storyboardProjectionMode'] === 'read-only-projection'
            ? { storyboardProjectionMode: 'read-only-projection' as const }
            : {}),
        },
      } as CanvasNode;
    case 'scene':
      return {
        ...base,
        type: 'scene',
        container: {
          policy: 'scene',
          childIds: [],
          deleteBehavior: 'release-children',
          layout: { mode: 'sequence', spacing: SHOT_GAP },
          acceptedChildren: { nodeTypes: ['shot'] },
        },
        data: {
          ...(asString(data['sceneId']) ? { sceneId: asString(data['sceneId']) } : {}),
          ...(asString(data['sourceScriptUri'])
            ? { sourceScriptUri: asString(data['sourceScriptUri']) }
            : {}),
          sceneTitle: asString(data['sceneTitle'], 'Scene'),
          sceneNumber: asNumber(data['sceneNumber'], input.zIndex + 1),
          ...(asString(data['location']) ? { location: asString(data['location']) } : {}),
          ...(asString(data['timeOfDay']) ? { timeOfDay: asString(data['timeOfDay']) } : {}),
          ...(isCanvasStoryboardPromptState(data['storyboardPrompt'])
            ? { storyboardPrompt: data['storyboardPrompt'] }
            : {}),
          ...(asString(data['sourceStoryboardRevisionId'])
            ? { sourceStoryboardRevisionId: asString(data['sourceStoryboardRevisionId']) }
            : {}),
          ...(data['storyboardProjectionMode'] === 'read-only-projection'
            ? { storyboardProjectionMode: 'read-only-projection' as const }
            : {}),
        },
      };
    case 'gallery':
      return {
        ...base,
        type: 'gallery',
        container: {
          policy: 'gallery',
          childIds: [],
          deleteBehavior: 'delete-subtree',
          layout: { mode: 'gallery', spacing: 8 },
          acceptedChildren: { nodeTypes: ['media'] },
        },
        data: {
          preset: inferGalleryPreset(data['preset']),
          rows: asNumber(data['rows'], 3),
          cols: asNumber(data['cols'], 3),
          ...(asString(data['globalPromptPrefix'])
            ? { globalPromptPrefix: asString(data['globalPromptPrefix']) }
            : {}),
          ...(asString(data['characterId']) ? { characterId: asString(data['characterId']) } : {}),
          ...(asString(data['characterName'])
            ? { characterName: asString(data['characterName']) }
            : {}),
          ...(isRecord(data['characterProfile'])
            ? { characterProfile: data['characterProfile'] }
            : {}),
        },
      };
    case 'script':
      return {
        ...base,
        type: 'script',
        data: {
          scriptPath: asString(data['scriptPath']),
          scriptTitle: asString(data['scriptTitle']),
          scenes: asObjectArray(data['scenes']),
          ...(asString(data['linkedSceneGroupId'])
            ? { linkedSceneGroupId: asString(data['linkedSceneGroupId']) }
            : {}),
        },
      };
    case 'document':
      return {
        ...base,
        type: 'document',
        data: {
          docPath: asString(data['docPath']),
          docType: inferDocumentType(data['docType']),
          title: asString(data['title']),
          ...(asString(data['mimeType']) ? { mimeType: asString(data['mimeType']) } : {}),
          ...(isDocumentArchiveResourceRef(data['documentResourceRef'])
            ? { documentResourceRef: data['documentResourceRef'] }
            : {}),
          ...(isResourceRef(data['resourceRef']) ? { resourceRef: data['resourceRef'] } : {}),
          ...(asString(data['thumbnailData'])
            ? { thumbnailData: asString(data['thumbnailData']) }
            : {}),
          ...(isRecord(data['provenance'])
            ? { provenance: toCanvasSerializableRecord(data['provenance']) }
            : {}),
        },
      };
    case 'model':
      return {
        ...base,
        type: 'model',
        data: {
          modelPath: asString(data['modelPath']),
          modelName: asString(data['modelName']),
          modelType: inferModelType(data['modelType']),
          role: inferModelRole(data['role']),
          ...(asString(data['installedVersion'])
            ? { installedVersion: asString(data['installedVersion']) }
            : {}),
        },
      };
    case 'canvas-embed':
      return {
        ...base,
        type: 'canvas-embed',
        data: {
          canvasPath: asString(data['canvasPath']),
          canvasTitle: asString(data['canvasTitle']),
          ...(asString(data['thumbnailData'])
            ? { thumbnailData: asString(data['thumbnailData']) }
            : {}),
        },
      };
    case 'project':
      return {
        ...base,
        type: 'project',
        data: {
          projectPath: asString(data['projectPath']),
          projectTitle: asString(data['projectTitle']),
          projectType: inferProjectType(data['projectType']),
          ...(asString(data['thumbnailData'])
            ? { thumbnailData: asString(data['thumbnailData']) }
            : {}),
        },
      };
    default:
      if (isRegisteredCanvasNodeType(nodeType)) {
        return {
          ...base,
          type: nodeType,
          data: {
            ...registeredNodeDefaultData(nodeType),
            ...toCanvasSerializableRecord(data),
          },
        } as CanvasNode;
      }
      throw new Error(`Unsupported Canvas node type "${nodeType}"`);
  }
}

function resolveNodeType(spec: CanvasNodeCreateSpec): CanvasNodeType {
  if (spec.type !== undefined) {
    if (!isCanvasNodeType(spec.type)) {
      throw new Error(`Unsupported Canvas node type "${spec.type}"`);
    }
    if (spec.preset) {
      const preset = getBuiltInCanvasNodePresetMetadata(spec.preset);
      if (!preset) {
        throw new Error(`Unsupported preset "${spec.preset}"`);
      }
      if (preset.nodeType !== spec.type) {
        throw new Error(`Preset "${spec.preset}" creates "${preset.nodeType}", not "${spec.type}"`);
      }
    }
    return spec.type;
  }
  if (spec.preset) {
    const preset = getBuiltInCanvasNodePresetMetadata(spec.preset);
    if (!preset) {
      throw new Error(`Unsupported preset "${spec.preset}"`);
    }
    return preset.nodeType;
  }
  throw new Error('Canvas node type or preset is required');
}

function resolvePreset(preset: string | undefined, nodeType: CanvasNodeType): string | undefined {
  const resolved = preset ?? getDefaultCanvasNodePresetName(nodeType);
  if (!resolved) {
    return undefined;
  }
  const metadata = getBuiltInCanvasNodePresetMetadata(resolved);
  if (!metadata) {
    throw new Error(`Unsupported preset "${resolved}"`);
  }
  if (metadata.nodeType !== nodeType) {
    throw new Error(`Preset "${resolved}" creates "${metadata.nodeType}", not "${nodeType}"`);
  }
  return resolved;
}

function resolveContainerPresetName(request: CanvasCreateCompositeRequest): string {
  const preset =
    request.containerPreset ??
    (request.containerType
      ? getDefaultCanvasNodePresetName(request.containerType)
      : 'group.container');
  if (!preset) {
    throw new Error('Container type or preset is required');
  }
  return preset;
}

function resolveChildType(child: CanvasNodeCreateSpec): CanvasNodeType {
  return resolveNodeType(child);
}

function attachChildrenToContainer(
  container: CanvasNode,
  children: readonly CanvasNode[],
): { container: CanvasNode; children: CanvasNode[]; childIds: string[] } {
  const childIds = children.map((child) => child.id);
  assertContainerAcceptsChildren(container, children);
  const nextContainer: CanvasNode = {
    ...container,
    container: {
      policy: getContainerPolicy(container),
      ...(container.container ?? {}),
      childIds,
    },
  } as CanvasNode;
  return {
    container: nextContainer,
    children: children.map((child) => ({ ...child, parentId: container.id }) as CanvasNode),
    childIds,
  };
}

function assertContainerAcceptsChildren(
  container: CanvasNode,
  children: readonly CanvasNode[],
): void {
  const policy = getContainerPolicy(container);
  for (const child of children) {
    if (
      (policy === 'scene' && child.type !== 'shot') ||
      (policy === 'gallery' && child.type !== 'media')
    ) {
      throw new Error(`Container policy "${policy}" rejects child node type "${child.type}"`);
    }
    if ((policy === 'scene' || policy === 'gallery') && child.container) {
      throw new Error(`Container policy "${policy}" rejects nested container child "${child.id}"`);
    }
  }
}

function getContainerPolicy(node: CanvasNode): string {
  if (node.container?.policy) {
    return node.container.policy;
  }
  if (node.type === 'scene') return 'scene';
  if (node.type === 'gallery') return 'gallery';
  if (node.type === 'artboard') return 'artboard';
  if (node.type === 'table') return 'table';
  return 'group';
}

function createCompositeConnections(
  request: CanvasCreateCompositeRequest,
  childIds: readonly string[],
  generateId: () => string,
): CanvasConnection[] {
  return (request.connections ?? []).map((connection) => {
    const sourceId = childIds[connection.sourceChildIndex];
    const targetId = childIds[connection.targetChildIndex];
    if (!sourceId || !targetId) {
      throw new Error(
        `Composite connection references missing child indices ${connection.sourceChildIndex} -> ${connection.targetChildIndex}`,
      );
    }
    return {
      id: connection.id ?? generateId(),
      sourceId,
      targetId,
      ...(connection.type ? { type: connection.type } : {}),
      ...(connection.label ? { label: connection.label } : {}),
      ...(connection.priority !== undefined ? { priority: connection.priority } : {}),
      ...(connection.extension ? { extension: connection.extension } : {}),
      sourceEndpoint: { nodeId: sourceId, scope: 'node', ...(connection.sourceEndpoint ?? {}) },
      targetEndpoint: { nodeId: targetId, scope: 'node', ...(connection.targetEndpoint ?? {}) },
    };
  });
}

function createCanvasStoryboardShotNodeData(
  shot: CanvasStoryboardShotPlan,
  options: ApplyCanvasStoryboardOptions,
  payload: Pick<CanvasStoryboardPayload, 'sourceStoryboardRevisionId' | 'projectionMode'>,
): Record<string, unknown> {
  const migration = migrateLegacyCanvasStoryboardShot({
    shotData: {
      shotId: shot.shotId,
      shotNumber: shot.shotNumber,
      duration: shot.duration,
      visualDescription: shot.visualDescription,
      shotScale: shot.shotScale,
      characters: [...shot.characters],
      cameraMovement: shot.cameraMovement,
      cameraAngle: shot.cameraAngle,
      characterAction: shot.characterAction,
      emotion: [...shot.emotion],
      sceneTags: [...shot.sceneTags],
      dialogue: shot.dialogue,
      voiceOver: shot.voiceOver,
      soundCue: shot.soundCue,
      textCues: shot.textCues ? [...shot.textCues] : undefined,
      voiceCues: shot.voiceCues ? [...shot.voiceCues] : undefined,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt,
      generationPrompt: shot.generationPrompt,
      visualStyle: shot.visualStyle,
      referenceImagePath: shot.referenceImagePath,
      referenceResourceRef: shot.referenceResourceRef,
      referenceImageResourceRef: shot.referenceImageResourceRef,
      vfx: shot.vfx ? [...shot.vfx] : undefined,
      sourceMediaRefs: shot.sourceMediaRefs ? [...shot.sourceMediaRefs] : undefined,
      generatedMediaRefs: shot.generatedMediaRefs ? [...shot.generatedMediaRefs] : undefined,
      mediaRefs: shot.mediaRefs ? [...shot.mediaRefs] : undefined,
      shotImagePrepPlan: shot.shotImagePrepPlan,
    },
    shotId: shot.shotId,
  });

  const storyboardPrompt = shot.storyboardPrompt ?? migration.promptState;

  return {
    shotId: shot.shotId,
    shotNumber: shot.shotNumber,
    duration: shot.duration,
    visualDescription: shot.visualDescription,
    shotScale: shot.shotScale,
    characters: [...shot.characters],
    cameraMovement: shot.cameraMovement,
    cameraAngle: shot.cameraAngle,
    characterAction: shot.characterAction,
    emotion: [...shot.emotion],
    sceneTags: [...shot.sceneTags],
    generationStatus: 'idle',
    generationHistory: [],
    dialogue: shot.dialogue,
    voiceOver: shot.voiceOver,
    soundCue: shot.soundCue,
    textCues: shot.textCues ? [...shot.textCues] : undefined,
    voiceCues: shot.voiceCues ? [...shot.voiceCues] : undefined,
    storyboardPrompt,
    visualStyle: shot.visualStyle,
    referenceImagePath: shot.referenceImagePath,
    referenceResourceRef: shot.referenceResourceRef,
    referenceImageResourceRef: shot.referenceImageResourceRef,
    vfx: shot.vfx ? [...shot.vfx] : undefined,
    sourceMediaRefs: shot.sourceMediaRefs ? [...shot.sourceMediaRefs] : undefined,
    generatedMediaRefs: shot.generatedMediaRefs ? [...shot.generatedMediaRefs] : undefined,
    mediaRefs: shot.mediaRefs ? [...shot.mediaRefs] : undefined,
    shotImagePrepPlan: shot.shotImagePrepPlan,
    ...(options.workflowPlanId !== undefined ? { workflowPlanId: options.workflowPlanId } : {}),
    ...(payload.sourceStoryboardRevisionId
      ? { sourceStoryboardRevisionId: payload.sourceStoryboardRevisionId }
      : {}),
    ...(payload.projectionMode ? { storyboardProjectionMode: payload.projectionMode } : {}),
  };
}

function createStoryboardShotSequenceConnections(shotCount: number) {
  return Array.from({ length: Math.max(0, shotCount - 1) }, (_, index) => ({
    sourceChildIndex: index,
    targetChildIndex: index + 1,
    sourceEndpoint: { scope: 'port' as const, portId: 'img-out' },
    targetEndpoint: { scope: 'node' as const },
    type: 'sequence' as const,
    label: STORYBOARD_SEQUENCE_CONNECTION_LABEL,
    priority: index,
  }));
}

function createSceneSequenceConnection(
  sourceSceneNodeId: string,
  targetSceneNodeId: string,
  priority: number,
): CanvasCreateConnectionRequest {
  return {
    sourceId: sourceSceneNodeId,
    targetId: targetSceneNodeId,
    sourceEndpoint: { nodeId: sourceSceneNodeId, scope: 'port', portId: 'out' },
    targetEndpoint: { nodeId: targetSceneNodeId, scope: 'port', portId: 'in' },
    type: 'sequence',
    label: STORYBOARD_SEQUENCE_CONNECTION_LABEL,
    priority,
  };
}

function createStoryboardIdGenerator(
  existingIds: Set<string>,
  sceneNodeId: string,
  scene: CanvasStoryboardPayload['scenes'][number],
): () => string {
  const queue = [
    sceneNodeId,
    ...scene.shotPlans.map((shot) =>
      createUniqueStableId(
        'shot',
        shot.shotId ?? `${scene.sceneId}-${shot.shotNumber}`,
        existingIds,
      ),
    ),
  ];
  return () => queue.shift() ?? createUniqueStableId('canvas-storyboard', 'generated', existingIds);
}

function createBatch(
  operations: readonly CanvasHeadlessAuthoringOperation[],
  createdNodes: readonly CanvasHeadlessAuthoringCreatedNodeRef[] = [],
  createdConnections: readonly CanvasHeadlessAuthoringCreatedConnectionRef[] = [],
  diagnostics: readonly CanvasAuthoringDiagnostic[] = [],
): CanvasHeadlessAuthoringOperationBatch {
  return {
    version: CANVAS_HEADLESS_AUTHORING_CONTRACT_VERSION,
    operations,
    ...(createdNodes.length > 0 ? { createdNodes } : {}),
    ...(createdConnections.length > 0 ? { createdConnections } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function createdNodeRef(node: CanvasNode): CanvasHeadlessAuthoringCreatedNodeRef {
  return {
    nodeId: node.id,
    type: node.type,
    ...(node.preset ? { preset: node.preset } : {}),
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
    ...(connection.type ? { type: connection.type } : {}),
  };
}

function resolveUpdateBinding(request: CanvasUpdateBlockRequest): FieldBinding {
  if (request.binding) {
    return request.binding;
  }
  if (request.path) {
    if (!isJsonPointerPath(request.path)) {
      throw new Error(`Invalid JSON Pointer path "${request.path}"`);
    }
    return { path: request.path, mode: 'readwrite' };
  }
  throw new Error(
    `Block "${request.blockId ?? 'unknown'}" has no writable binding in headless mode`,
  );
}

function defaultNodeSize(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): { width: number; height: number } {
  if (type === 'media') {
    return { width: 280, height: inferMediaType(data['mediaType']) === 'audio' ? 80 : 200 };
  }
  if (type === 'gallery') {
    const cols = asNumber(data['cols'], 3);
    const rows = asNumber(data['rows'], 3);
    return { width: Math.max(240, cols * 90 + 20), height: rows * 100 + 60 };
  }
  return DEFAULT_NODE_SIZES[type] ?? { width: 220, height: 120 };
}

function defaultPortsForNode(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): PortDefinition[] | undefined {
  if (type === 'media') return [...MEDIA_NODE_PORTS];
  if (type === 'storyboard') return [...STORYBOARD_NODE_PORTS];
  if (type === 'shot') return [...SHOT_NODE_PORTS];
  if (type === 'scene') return [...SCENE_NODE_PORTS];
  if (type === 'gallery') return [...GALLERY_NODE_PORTS];
  if (type === 'model' && inferModelRole(data['role']) === 'workflow') {
    return [...MODEL_WORKFLOW_PORTS];
  }
  const ports = getDefaultPorts(type);
  return ports.length > 0 ? [...ports] : undefined;
}

function defaultChildPosition(
  containerNode: CanvasNode,
  index: number,
  childType: CanvasNodeType,
): { x: number; y: number } {
  const width = childType === 'shot' ? SHOT_WIDTH : 180;
  return {
    x: containerNode.position.x + 24 + index * (width + 24),
    y: containerNode.position.y + 64,
  };
}

function nextZIndex(nodes: readonly CanvasNode[]): number {
  const max = nodes.reduce((value, node) => Math.max(value, node.zIndex), 0);
  return max + 10;
}

function assertNodeExists(nodes: readonly CanvasNode[], nodeId: string, field: string): void {
  if (!nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Canvas connection ${field} "${nodeId}" does not exist`);
  }
}

function cloneCanvasData(data: CanvasData): CanvasData {
  return {
    ...data,
    viewport: data.viewport
      ? { pan: { ...data.viewport.pan }, zoom: data.viewport.zoom }
      : undefined,
    nodes: [...data.nodes],
    connections: [...data.connections],
  };
}

function createUniqueStableId(prefix: string, base: string | number, used: Set<string>): string {
  const root = `${sanitizeIdSegment(prefix)}-${sanitizeIdSegment(String(base))}`;
  let candidate = root;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${root}-${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

function sanitizeIdSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

function asString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}

function asNumber(value: unknown, defaultValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asObjectArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(isRecord) as T[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCanvasSerializableRecord(value: Record<string, unknown>): CanvasSerializableRecord {
  const record: CanvasSerializableRecord = {};
  for (const [key, field] of Object.entries(value)) {
    const serializable = toCanvasSerializableValue(field);
    if (serializable !== undefined) {
      record[key] = serializable;
    }
  }
  return record;
}

function toCanvasSerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toCanvasSerializableValue(item) ?? null);
  }
  if (isRecord(value)) {
    return toCanvasSerializableRecord(value);
  }
  return undefined;
}

function createDefaultTableColumns(columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => ({
    id: `col-${index + 1}`,
    label: `Column ${index + 1}`,
    width: 200,
  }));
}

function inferShotScale(value: unknown): ShotScale {
  if (
    value === 'ECU' ||
    value === 'CU' ||
    value === 'MCU' ||
    value === 'MS' ||
    value === 'MLS' ||
    value === 'LS' ||
    value === 'VLS' ||
    value === 'ELS' ||
    value === 'OTS' ||
    value === 'POV'
  ) {
    return value;
  }
  return 'MS';
}

function inferCameraMovement(value: unknown): CameraMovement | undefined {
  if (
    value === 'static' ||
    value === 'pan' ||
    value === 'tilt' ||
    value === 'zoom-in' ||
    value === 'zoom-out' ||
    value === 'dolly' ||
    value === 'dolly-in' ||
    value === 'dolly-out' ||
    value === 'handheld' ||
    value === 'crane'
  ) {
    return value;
  }
  return undefined;
}

function inferCameraAngle(value: unknown): CameraAngle | undefined {
  if (
    value === 'eye-level' ||
    value === 'high-angle' ||
    value === 'low-angle' ||
    value === 'bird-eye' ||
    value === 'dutch'
  ) {
    return value;
  }
  return undefined;
}

function inferGenerationStatus(value: unknown): ShotGenerationStatus {
  if (value === 'pending' || value === 'generating' || value === 'done' || value === 'error') {
    return value;
  }
  return 'idle';
}

function inferMediaType(value: unknown): 'image' | 'video' | 'audio' {
  return value === 'video' || value === 'audio' ? value : 'image';
}

function inferDocumentType(
  value: unknown,
): 'pdf' | 'docx' | 'epub' | 'cbz' | 'markdown' | 'text' | 'file' {
  if (
    value === 'pdf' ||
    value === 'docx' ||
    value === 'epub' ||
    value === 'cbz' ||
    value === 'markdown' ||
    value === 'text' ||
    value === 'file'
  ) {
    return value;
  }
  return 'file';
}

function readProvenanceMessageId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const provenance = value['provenance'];
  if (!isRecord(provenance)) return undefined;
  const messageId = provenance['messageId'];
  return typeof messageId === 'string' && messageId.length > 0 ? messageId : undefined;
}

function inferModelType(value: unknown): 'lora' | 'checkpoint' | 'controlnet' | 'vae' {
  if (value === 'lora' || value === 'checkpoint' || value === 'controlnet' || value === 'vae') {
    return value;
  }
  return 'lora';
}

function inferModelRole(value: unknown): 'reference' | 'workflow' {
  return value === 'workflow' ? 'workflow' : 'reference';
}

function inferProjectType(value: unknown): 'nkv' {
  if (value === 'nkv') return value;
  return 'nkv';
}

function inferArtboardPreset(value: unknown): ArtboardPreset {
  if (
    value === '1080p' ||
    value === '4k' ||
    value === 'instagram' ||
    value === 'story' ||
    value === 'youtube'
  ) {
    return value;
  }
  return 'custom';
}

function inferGalleryPreset(value: unknown): GalleryPreset {
  if (
    value === 'character-3view' ||
    value === 'character-4view' ||
    value === 'expression-9' ||
    value === 'turnaround-8' ||
    value === 'scene-views' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'character-3view';
}

function isRegisteredCanvasNodeType(type: CanvasNodeType): type is RegisteredCanvasNodeType {
  return REGISTERED_NODE_TYPES.has(type);
}

function registeredNodeDefaultData(type: RegisteredCanvasNodeType): CanvasSerializableRecord {
  switch (type) {
    case 'narrative-start':
      return { label: 'Start', description: '' };
    case 'choice':
      return { choices: [] };
    case 'narrative-ending':
      return { endingType: 'normal', endingLabel: 'Ending', statisticsSummary: true };
    case 'trigger':
      return { event: '' };
    case 'entity':
      return { entityType: 'character' };
    case 'representation-slot':
      return { required: false };
    case 'generated-asset':
      return { assetId: '' };
    case 'memory':
      return { content: '' };
    case 'narrative-scene':
      return { summary: '' };
    case 'narrative-note':
      return { content: '' };
    default:
      return {};
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Canvas headless authoring operation: ${JSON.stringify(value)}`);
}
