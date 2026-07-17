import type {
  CanvasBlock,
  CanvasAgentActiveContextRequest,
  CanvasAgentActiveContextResult,
  CanvasAgentApplyContentResult,
  CanvasAgentContentPayload,
  CanvasAgentContainerSummary,
  CanvasAgentMutationMode,
  CanvasAgentNodeSummary,
  CanvasAgentSubsystemMetadataSummary,
  CanvasAgentTargetRef,
  CanvasConnection,
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasDeriveNodeRequest,
  CanvasDeriveNodeResult,
  CanvasExtractStructuredContentRequest,
  CanvasExtractStructuredContentResult,
  CanvasNode,
  CanvasStructuredNodeSummary,
  CanvasUpdateBlockRequest,
  CanvasUpdateBlockResult,
  CanvasUpsertNarrativeProductionBindingRequest,
  CanvasUpsertNarrativeProductionBindingResult,
  FieldBinding,
  JsonPointerPath,
  CanvasNarrativeAgentAnalysis,
  CanvasBoardSummary,
  CanvasCreativeScope,
  CanvasRelatedBoardRef,
  NarrativeProductionBinding,
  CanvasSerializableRecord,
  CanvasSerializableValue,
  CanvasStoryboardPromptBlockKind,
  CanvasStoryboardPromptState,
} from '@neko/shared';
import {
  analyzeCanvasNarrativeForAgent,
  getBuiltInCanvasNodePresetMetadata,
  getContainerChildIds,
  getContainerPolicyName,
  getDefaultCanvasNodePresetName,
  getNodeParentId,
  isCanvasNodeType,
  isJsonPointerPath,
  type CanvasNodeType,
  readFieldBinding,
  readJsonPointer,
  summarizeCanvasSubsystems,
  writeJsonPointer,
  writeFieldBinding,
  validateNarrativeProductionBinding,
  validateCanvasStoryboardPromptState,
} from '@neko/shared';
import { addContainerChild, createContainerComposite } from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from './canvasPresetRegistry';
import { buildCanvasNode } from './nodeFactory';
import {
  canContainerAcceptChild,
  createBuiltInContainerPolicyRegistry,
  getContainerPolicy,
} from './containerPolicies';

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
    narrative?: CanvasAgentSubsystemMetadataSummary['narrative'];
    behavior?: CanvasAgentSubsystemMetadataSummary['behavior'];
    entityGraph?: CanvasAgentSubsystemMetadataSummary['entityGraph'];
    memoryGraph?: CanvasAgentSubsystemMetadataSummary['memoryGraph'];
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

export function upsertCanvasNarrativeProductionBinding(
  context: Pick<CanvasAgentOperationContext, 'nodes' | 'connections'>,
  request: CanvasUpsertNarrativeProductionBindingRequest,
): CanvasAgentMutationResult<CanvasUpsertNarrativeProductionBindingResult> {
  const node = context.nodes.find((item) => item.id === request.nodeId);
  if (!node || node.type !== 'narrative-scene') {
    return {
      result: {
        nodeId: request.nodeId,
        changed: false,
        diagnostics: [
          {
            code: 'missing-target-narrative-node',
            severity: 'error',
            message: `Narrative scene node ${request.nodeId} was not found.`,
            nodeId: request.nodeId,
            bindingId: request.binding.bindingId,
          },
        ],
      },
      nodes: context.nodes,
      connections: context.connections,
    };
  }

  const diagnostics = validateNarrativeProductionBinding(request.binding);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      result: {
        nodeId: request.nodeId,
        changed: false,
        diagnostics,
      },
      nodes: context.nodes,
      connections: context.connections,
    };
  }

  const existingRefs: NarrativeProductionBinding[] = Array.isArray(node.data.productionRefs)
    ? (node.data.productionRefs as readonly unknown[]).filter(isProductionBindingLike)
    : [];
  const nextRefs = [
    ...existingRefs.filter((binding) => binding.bindingId !== request.binding.bindingId),
    request.binding,
  ];
  const updatedNode: CanvasNode = {
    ...node,
    data: {
      ...node.data,
      productionRefs: toCanvasSerializableValue(nextRefs) ?? [],
    },
  };
  const nodes = context.nodes.map((item) => (item.id === node.id ? updatedNode : item));
  return {
    result: {
      nodeId: request.nodeId,
      changed: true,
      productionRefs: nextRefs,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    },
    nodes,
    connections: context.connections,
  };
}

function isProductionBindingLike(value: unknown): value is NarrativeProductionBinding {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { bindingId?: unknown }).bindingId === 'string',
  );
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

const DERIVE_GAP = 60;
const CONTAINER_POLICIES = createBuiltInContainerPolicyRegistry();
const DEFAULT_AGENT_INSERT_POSITION = { x: 0, y: 0 };
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

export function createCanvasAgentActiveContext(
  input: CanvasAgentActiveContextInput,
): CanvasAgentActiveContextResult {
  const includeSelection = input.request?.includeSelection !== false;
  const selectedNodeIds = includeSelection
    ? input.selectedNodeIds.filter((nodeId) => input.nodes.some((node) => node.id === nodeId))
    : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => input.nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => Boolean(node))
    .map((node) => summarizeCanvasAgentNode(node, input.request?.includeNodeDetails === true));
  const subsystemSummary = summarizeCanvasSubsystems({ nodes: input.nodes });
  const selectedNodeTypes = uniqueStrings(selectedNodes.map((node) => node.type));
  const narrativeAnalysis = analyzeCanvasNarrativeForAgent({
    nodes: input.nodes,
    connections: input.connections ?? [],
    variableNames: input.canvasData?.narrative?.variables.map((variable) => variable.name) ?? [],
    entryNodeId: input.canvasData?.narrative?.entryNodeId,
  });

  const result: CanvasAgentActiveContextResult = {
    nodeTypeSummary: subsystemSummary.nodeTypeSummary,
    activeSubsystems: subsystemSummary.activeSubsystems,
    selectedNodeIds,
    selectedNodeTypes,
    selectedNodes,
    connections: input.connections ? [...input.connections] : undefined,
    ...(narrativeAnalysis.diagnostics.length > 0
      ? { narrativeDiagnostics: narrativeAnalysis.diagnostics }
      : {}),
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    ...(input.insertionPoint ? { insertionPoint: input.insertionPoint } : {}),
    ...(input.viewport ? { viewport: input.viewport } : {}),
  };
  if (input.request?.includeBoardNavigation !== false) {
    const boardSummary = summarizeCanvasAgentBoard(input, subsystemSummary.nodeTypeSummary);
    if (boardSummary) {
      result.boardSummary = boardSummary;
      if (boardSummary.scope) {
        result.creativeScope = boardSummary.scope;
      }
      if (boardSummary.relatedBoards) {
        result.relatedBoards = boardSummary.relatedBoards;
      }
    }
  }

  if (input.request?.includeFocusedContainer !== false) {
    const focusedContainer = findFocusedContainer(input.nodes, selectedNodeIds);
    if (focusedContainer) {
      result.focusedContainer = summarizeCanvasAgentContainer(focusedContainer);
    }
  }

  const subsystemMetadata = summarizeSubsystemMetadata(input.canvasData);
  if (
    input.request?.includeSubsystemMetadata === true &&
    Object.keys(subsystemMetadata).length > 0
  ) {
    result.subsystemMetadata = subsystemMetadata;
  }

  return result;
}

function summarizeCanvasAgentBoard(
  input: CanvasAgentActiveContextInput,
  nodeTypeSummary: Readonly<Record<string, number>>,
): CanvasBoardSummary | undefined {
  if (!input.canvasData?.creativeScope && !input.canvasData?.relatedBoards) return undefined;
  return {
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    name: input.canvasData.name ?? 'Untitled Canvas',
    ...(input.canvasData.creativeScope ? { scope: input.canvasData.creativeScope } : {}),
    ...(input.canvasData.relatedBoards ? { relatedBoards: input.canvasData.relatedBoards } : {}),
    nodeTypeSummary,
  };
}

export function applyCanvasAgentContent(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  validatePayloadContent(payload);
  const target = normalizeCanvasAgentTarget(payload.target);
  const mode = resolveMutationMode(target);

  if (mode === 'replace' || mode === 'apply' || (mode === 'append' && target?.nodeId)) {
    return applyContentToNodeTarget(context, payload, target, mode);
  }

  if (target?.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }

  return insertContentNode(context, payload, target, mode);
}

export function deriveCanvasNode(
  context: CanvasAgentOperationContext,
  request: CanvasDeriveNodeRequest,
): CanvasAgentMutationResult<CanvasDeriveNodeResult> {
  assertCanvasNodeType(request.targetType);
  const sourceNode = context.nodes.find((node) => node.id === request.sourceNodeId);
  if (!sourceNode) {
    throw new Error(`Source node "${request.sourceNodeId}" not found`);
  }

  const sourcePresetName = sourceNode.preset ?? getDefaultCanvasNodePresetName(sourceNode.type);
  const sourcePreset = getBuiltInCanvasNodePresetMetadata(sourcePresetName);
  const targetPresetName =
    request.targetPreset ??
    (request.targetType ? getDefaultCanvasNodePresetName(request.targetType) : sourcePresetName);
  const targetPreset = getBuiltInCanvasNodePresetMetadata(targetPresetName);
  if (!targetPreset || !targetPresetName) {
    throw new Error(`Unsupported target preset "${targetPresetName ?? 'unknown'}"`);
  }
  if (request.targetType && targetPreset.nodeType !== request.targetType) {
    throw new Error(
      `Target preset "${targetPresetName}" creates "${targetPreset.nodeType}", not "${request.targetType}"`,
    );
  }
  if (sourcePreset && !sourcePreset.deriveTargets.includes(targetPresetName)) {
    throw new Error(`Preset "${sourcePreset.name}" cannot derive "${targetPresetName}"`);
  }

  const nodeSpec = createNodeSpec({
    type: targetPreset.nodeType,
    preset: targetPresetName,
    position: findFreePosition({
      preferred: {
        x: sourceNode.position.x + sourceNode.size.width + DERIVE_GAP,
        y: sourceNode.position.y,
      },
      size: sourceNode.size,
      nodes: context.nodes,
    }),
    data: {
      ...createDeriveData(sourceNode, targetPreset.nodeType, context.nodes),
      ...(request.data ?? {}),
    },
  });
  const nodeId = context.generateId();
  const nextNode = hydrateCanvasNodePreview({
    ...nodeSpec,
    id: nodeId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);
  let nextNodes = [...context.nodes, nextNode];
  const targetContainerId = getDeriveContainerTargetId(sourceNode);
  if (targetContainerId) {
    const added = addContainerChild(nextNodes, targetContainerId, nodeId);
    if (added.changed) {
      nextNodes = added.nodes;
    }
  }

  let nextConnections = context.connections;
  let connectionId: string | undefined;
  if (request.connect !== false) {
    connectionId = context.generateId();
    nextConnections = [
      ...context.connections,
      {
        id: connectionId,
        sourceId: sourceNode.id,
        targetId: nodeId,
        type: 'default',
        sourceEndpoint: { nodeId: sourceNode.id, scope: 'node' },
        targetEndpoint: { nodeId, scope: 'node' },
      },
    ];
  }

  return {
    result: { nodeId, connectionId, node: nextNode },
    nodes: nextNodes,
    connections: nextConnections,
  };
}

function getDeriveContainerTargetId(sourceNode: CanvasNode): string | undefined {
  if (getContainerPolicyName(sourceNode)) {
    return sourceNode.id;
  }

  return getNodeParentId(sourceNode);
}

function summarizeCanvasAgentNode(
  node: CanvasNode,
  includeDetails = false,
): CanvasAgentNodeSummary {
  const childIds = getContainerChildIds(node);
  const summary: CanvasAgentNodeSummary = {
    id: node.id,
    type: node.type,
    preset: node.preset,
    title: getNodeTitle(node),
    summary: getNodeSummary(node),
    parentId: getNodeParentId(node),
    childIds: childIds.length > 0 ? childIds : undefined,
    targetableFields: getTargetableFields(node),
  };

  if (!includeDetails) {
    return summary;
  }

  return {
    ...summary,
    summary: summary.summary ?? renderNodeDataSummary(node),
  };
}

function summarizeCanvasAgentContainer(node: CanvasNode): CanvasAgentContainerSummary {
  const policyName = getContainerPolicyName(node);
  const policy = getContainerPolicy(CONTAINER_POLICIES, policyName);
  const childIds = getContainerChildIds(node);
  return {
    id: node.id,
    type: node.type,
    preset: node.preset,
    policy: policyName,
    childIds,
    ...(policy?.acceptedNodeTypes ? { acceptedChildTypes: policy.acceptedNodeTypes } : {}),
    slots: [
      {
        id: 'children',
        label: 'Children',
        childIds,
      },
    ],
  };
}

function applyContentToNodeTarget(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  if (!target?.nodeId) {
    throw new Error(`${mode} mode requires an explicit Canvas node target`);
  }
  if (target.slotId) {
    throw new Error(`Unsupported Canvas slot target "${target.slotId}"`);
  }

  const node = context.nodes.find((candidate) => candidate.id === target.nodeId);
  if (!node) {
    throw new Error(`Target node "${target.nodeId}" not found`);
  }

  const fieldPath = target.fieldPath ?? defaultFieldPathForPayload(node, payload);
  if (!fieldPath) {
    throw new Error(`No writable field available for ${payload.kind} content on ${node.type}`);
  }
  assertTargetableField(node, fieldPath);

  const nextValue =
    mode === 'append'
      ? appendCanvasAgentContentValue(node, fieldPath, payload)
      : coerceCanvasAgentContentValue(payload, fieldPath);
  validateStoryboardPromptWriteback(node, fieldPath, nextValue);
  const written = writeJsonPointer(node.data, fieldPath, nextValue);
  const nextNode = refreshCanvasNodePreview({
    ...node,
    data: written.data as Record<string, unknown>,
  } as CanvasNode);

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

function validateStoryboardPromptWriteback(
  node: CanvasNode,
  fieldPath: JsonPointerPath,
  value: unknown,
): void {
  if (node.type !== 'shot' || fieldPath !== '/storyboardPrompt') return;
  const validation = validateCanvasStoryboardPromptState(value);
  if (!validation.valid) {
    throw new Error(
      `Invalid storyboardPrompt writeback: ${validation.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  const currentState = node.data.storyboardPrompt as CanvasStoryboardPromptState | undefined;
  if (!currentState) return;
  const nextState = value as CanvasStoryboardPromptState;
  for (const blockKind of ['image', 'video', 'voice'] as const) {
    validatePromptDocumentIdentity(blockKind, currentState, nextState);
  }
}

function validatePromptDocumentIdentity(
  blockKind: CanvasStoryboardPromptBlockKind,
  currentState: CanvasStoryboardPromptState,
  nextState: CanvasStoryboardPromptState,
): void {
  const currentDocument = readStoryboardPromptDocument(currentState, blockKind);
  const nextDocument = readStoryboardPromptDocument(nextState, blockKind);
  if (!currentDocument || !nextDocument) return;
  if (
    currentDocument.documentId !== nextDocument.documentId ||
    currentDocument.version !== nextDocument.version
  ) {
    throw new Error(
      `Invalid storyboardPrompt writeback: ${blockKind} prompt document identity changed.`,
    );
  }
}

function readStoryboardPromptDocument(
  state: CanvasStoryboardPromptState,
  blockKind: CanvasStoryboardPromptBlockKind,
) {
  switch (blockKind) {
    case 'image':
      return state.promptBlocks?.imagePromptDocument;
    case 'video':
      return state.promptBlocks?.videoPromptDocument;
    case 'voice':
      return state.promptBlocks?.voicePromptDocument;
  }
}

function insertContentNode(
  context: CanvasAgentOperationContext,
  payload: CanvasAgentContentPayload,
  target: CanvasAgentTargetRef | undefined,
  mode: CanvasAgentMutationMode,
): CanvasAgentMutationResult<CanvasAgentApplyContentResult> {
  const position = target?.insertionPoint ?? DEFAULT_AGENT_INSERT_POSITION;
  const nodeId = context.generateId();
  const node = hydrateCanvasNodePreview({
    ...createNodeSpec({
      type: 'text',
      position,
      data: {
        content: renderCanvasAgentContent(payload),
        format: payload.format === 'markdown' ? 'markdown' : 'plain',
      },
    }),
    id: nodeId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);

  let nextNodes = [...context.nodes, node];
  if (target?.containerId) {
    const container = context.nodes.find((candidate) => candidate.id === target.containerId);
    if (!container) {
      throw new Error(`Target container "${target.containerId}" not found`);
    }
    const policy = getContainerPolicy(CONTAINER_POLICIES, getContainerPolicyName(container));
    if (!canContainerAcceptChild(policy, node)) {
      throw new Error(`Target container "${target.containerId}" does not accept text nodes`);
    }
    const added = addContainerChild(nextNodes, target.containerId, nodeId);
    if (!added.changed) {
      throw new Error(added.error ?? 'Failed to add content node to container');
    }
    nextNodes = added.nodes;
  }

  return {
    result: {
      changed: true,
      mode,
      nodeId,
      containerId: target?.containerId,
      createdNodeIds: [nodeId],
      target,
    },
    nodes: nextNodes,
    connections: context.connections,
  };
}

function validatePayloadContent(payload: CanvasAgentContentPayload): void {
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

function normalizeCanvasAgentTarget(
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

function resolveMutationMode(target: CanvasAgentTargetRef | undefined): CanvasAgentMutationMode {
  if (target?.mode) return target.mode;
  return target?.nodeId ? 'apply' : 'insert';
}

function defaultFieldPathForPayload(
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
  return getTargetableFields(node)[0]?.path;
}

function assertTargetableField(node: CanvasNode, fieldPath: JsonPointerPath): void {
  assertWritableStoryboardPromptPath(node, fieldPath);
  const paths = new Set(getTargetableFields(node).map((field) => field.path));
  if (!paths.has(fieldPath)) {
    throw new Error(`Field "${fieldPath}" is not targetable on ${node.type} node "${node.id}"`);
  }
}

function assertWritableStoryboardPromptPath(node: CanvasNode, fieldPath: JsonPointerPath): void {
  if (node.type !== 'shot') return;
  if (fieldPath === '/generationPrompt' || fieldPath === '/promptSlots') {
    throw new Error(
      `Legacy field "${fieldPath}" is migration input only; write semantic storyboard prompts through /storyboardPrompt.`,
    );
  }
}

function appendCanvasAgentContentValue(
  node: CanvasNode,
  fieldPath: JsonPointerPath,
  payload: CanvasAgentContentPayload,
): unknown {
  const current = readJsonPointer(node.data, fieldPath);
  const next = coerceCanvasAgentContentValue(payload, fieldPath);
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

function coerceCanvasAgentContentValue(
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
  if (payload.format === 'json' && !expectsStringField(fieldPath)) {
    return payload.content;
  }
  return renderCanvasAgentContent(payload);
}

function renderCanvasAgentContent(payload: CanvasAgentContentPayload): string {
  if (payload.kind === 'text') return payload.text ?? '';
  if (payload.kind === 'prompt') return payload.prompt ?? '';
  if (typeof payload.content === 'string') return payload.content;
  return JSON.stringify(payload.content ?? null, null, 2);
}

function expectsStringField(fieldPath: JsonPointerPath): boolean {
  return !fieldPath.endsWith('/characters') && !fieldPath.endsWith('/emotion');
}

function findFocusedContainer(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
): CanvasNode | undefined {
  for (const nodeId of selectedNodeIds) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    if (node.container) return node;
    const parentId = getNodeParentId(node);
    if (!parentId) continue;
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (parent?.container) return parent;
  }
  return nodes.find((node) => node.container);
}

function getTargetableFields(
  node: CanvasNode,
): NonNullable<CanvasAgentNodeSummary['targetableFields']> {
  const fields = new Map<
    JsonPointerPath,
    { path: JsonPointerPath; label?: string; valueType?: string }
  >();
  for (const path of TARGETABLE_FIELD_PATHS_BY_TYPE[node.type] ?? []) {
    fields.set(path, {
      path,
      label: labelFromFieldPath(path),
      valueType: path === '/storyboardPrompt' ? 'object' : 'string',
    });
  }
  for (const targetableBinding of collectTargetableBindings(node)) {
    const { binding, label, value } = targetableBinding;
    if (!fields.has(binding.path)) {
      fields.set(binding.path, {
        path: binding.path,
        ...(label ? { label } : {}),
        valueType: inferValueType(value),
      });
    }
  }
  return Array.from(fields.values());
}

function labelFromFieldPath(path: JsonPointerPath): string {
  const leaf = path.split('/').filter(Boolean).pop();
  return leaf ?? 'root';
}

function inferValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'unknown';
  return typeof value;
}

function collectTargetableBindings(
  node: CanvasNode,
): Array<{ binding: FieldBinding; label?: string; value: unknown }> {
  if (!node.content) return [];
  const bindings: Array<{ binding: FieldBinding; label?: string; value: unknown }> = [];
  const sections = [node.content];
  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;
    for (const block of section.blocks ?? []) {
      collectTargetableBlockBindings(node, block, bindings);
    }
    sections.push(...(section.sections ?? []));
  }
  return bindings;
}

function collectTargetableBlockBindings(
  node: CanvasNode,
  block: CanvasBlock,
  bindings: Array<{ binding: FieldBinding; label?: string; value: unknown }>,
): void {
  if (block.binding && block.binding.mode !== 'read') {
    bindings.push({
      binding: block.binding,
      ...(block.label ? { label: block.label } : {}),
      value: readFieldBinding(node.data, block.binding).value,
    });
  }
  if (block.collection && block.collection.source.mode !== 'read') {
    bindings.push({
      binding: block.collection.source,
      ...(block.label ? { label: block.label } : {}),
      value: readFieldBinding(node.data, block.collection.source).value,
    });
  }
  for (const child of block.children ?? []) {
    collectTargetableBlockBindings(node, child, bindings);
  }
}

function renderNodeDataSummary(node: CanvasNode): string | undefined {
  const data = sanitizeData(node.data as Record<string, unknown>);
  const serialized = JSON.stringify(data);
  return serialized.length > 500 ? `${serialized.slice(0, 500)}...` : serialized;
}

export function createCanvasComposite(
  context: CanvasAgentOperationContext,
  request: CanvasCreateCompositeRequest,
): CanvasAgentMutationResult<CanvasCreateCompositeResult> {
  assertCanvasNodeType(request.containerType);
  for (const child of request.children) {
    assertCanvasNodeType(child.type);
  }

  const containerPresetName =
    request.containerPreset ??
    (request.containerType
      ? getDefaultCanvasNodePresetName(request.containerType)
      : 'group.container');
  const containerPreset = getBuiltInCanvasNodePresetMetadata(containerPresetName);
  if (!containerPreset || !containerPreset.containerPolicy) {
    throw new Error(`Unsupported container preset "${containerPresetName ?? 'unknown'}"`);
  }

  const containerId = context.generateId();
  const containerNode = hydrateCanvasNodePreview({
    ...createNodeSpec({
      type: containerPreset.nodeType,
      preset: containerPresetName,
      position:
        request.position ??
        findFreePosition({
          preferred: { x: 0, y: 0 },
          size: { width: 320, height: 240 },
          nodes: context.nodes,
        }),
      data: request.data,
    }),
    id: containerId,
    zIndex: (context.nodes.length + 1) * 10,
  } as CanvasNode);

  const children = request.children.map((child, index) => {
    const childPresetName =
      child.preset ?? (child.type ? getDefaultCanvasNodePresetName(child.type) : undefined);
    const childPreset = getBuiltInCanvasNodePresetMetadata(childPresetName);
    if (childPresetName && !childPreset) {
      throw new Error(`Unsupported child preset "${childPresetName ?? 'unknown'}"`);
    }
    if (childPreset && child.type && childPreset.nodeType !== child.type) {
      throw new Error(
        `Child preset "${childPresetName}" creates "${childPreset.nodeType}", not "${child.type}"`,
      );
    }
    const childType = childPreset?.nodeType ?? child.type;
    if (!childType) {
      throw new Error('Child node type or preset is required');
    }

    const childId = child.id ?? context.generateId();
    const childPosition = child.position ?? defaultChildPosition(containerNode, index, childType);
    return hydrateCanvasNodePreview({
      ...createNodeSpec({
        ...child,
        type: childType,
        preset: childPresetName,
        position: childPosition,
      }),
      id: childId,
      zIndex: (context.nodes.length + index + 2) * 10,
    } as CanvasNode);
  });

  const composite = createContainerComposite(context.nodes, {
    container: containerNode,
    children,
  });
  if (!composite.changed) {
    throw new Error(composite.error ?? 'Composite creation failed');
  }
  const childIds = children.map((child) => child.id);
  const compositeConnections = createCompositeConnections(context, request, childIds);

  const layoutMode =
    containerPreset.containerPolicy === 'scene'
      ? 'sequence'
      : containerPreset.containerPolicy === 'table'
        ? 'table'
        : containerPreset.containerPolicy === 'gallery'
          ? 'gallery'
          : 'grid';
  const nextNodes =
    request.autoLayout === false
      ? composite.nodes
      : autoArrangeContainer(composite.nodes, {
          containerId,
          mode: layoutMode,
          resizeChildren: layoutMode === 'gallery',
        });

  return {
    result: {
      containerId,
      childIds,
      connectionIds:
        compositeConnections.length > 0
          ? compositeConnections.map((connection) => connection.id)
          : undefined,
      nodes: nextNodes.filter(
        (node) => node.id === containerId || children.some((child) => child.id === node.id),
      ),
    },
    nodes: nextNodes,
    connections:
      compositeConnections.length > 0
        ? [...context.connections, ...compositeConnections]
        : context.connections,
  };
}

function createCompositeConnections(
  context: CanvasAgentOperationContext,
  request: CanvasCreateCompositeRequest,
  childIds: readonly string[],
): CanvasConnection[] {
  return (request.connections ?? []).flatMap((connection) => {
    const sourceId = childIds[connection.sourceChildIndex];
    const targetId = childIds[connection.targetChildIndex];
    if (!sourceId || !targetId) {
      return [];
    }

    return [
      {
        id: connection.id ?? context.generateId(),
        sourceId,
        targetId,
        ...(connection.type ? { type: connection.type } : {}),
        ...(connection.label ? { label: connection.label } : {}),
        ...(connection.priority !== undefined ? { priority: connection.priority } : {}),
        ...(connection.extension ? { extension: connection.extension } : {}),
        sourceEndpoint: { nodeId: sourceId, scope: 'node', ...(connection.sourceEndpoint ?? {}) },
        targetEndpoint: { nodeId: targetId, scope: 'node', ...(connection.targetEndpoint ?? {}) },
      },
    ];
  });
}

export function updateCanvasBlock(
  node: CanvasNode,
  request: CanvasUpdateBlockRequest,
): CanvasUpdateBlockResult & { node: CanvasNode } {
  const binding = resolveUpdateBinding(node, request);
  assertWritableStoryboardPromptPath(node, binding.path);
  validateStoryboardPromptWriteback(node, binding.path, request.value);
  const written = writeFieldBinding(node.data, binding, request.value);
  const nextNode = written.changed
    ? refreshCanvasNodePreview({
        ...node,
        data: written.data as Record<string, unknown>,
      } as CanvasNode)
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
  const hasConnectionsOnly = Array.isArray(connectionsOrRequest) && request === undefined;
  const hasExplicitRequest = request !== undefined;
  const connections =
    hasExplicitRequest || hasConnectionsOnly
      ? (connectionsOrRequest as readonly CanvasConnection[])
      : [];
  const normalizedRequest: CanvasExtractStructuredContentRequest = hasExplicitRequest
    ? request
    : hasConnectionsOnly
      ? { format: 'json' }
      : (connectionsOrRequest as CanvasExtractStructuredContentRequest);
  const selectedIds = normalizedRequest.nodeIds?.length
    ? Array.from(new Set(normalizedRequest.nodeIds))
    : nodes.map((node) => node.id);
  const expandedIds = normalizedRequest.includeChildren
    ? includeDescendantIds(nodes, selectedIds)
    : selectedIds;
  const narrativeAnalysis = analyzeCanvasNarrativeForAgent({ nodes, connections });
  const summaries = expandedIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is CanvasNode => Boolean(node))
    .map((node) => summarizeNode(node, narrativeAnalysis));

  return {
    format: normalizedRequest.format,
    nodeIds: summaries.map((summary) => summary.id),
    nodes: summaries,
    content:
      normalizedRequest.format === 'json'
        ? summaries
        : normalizedRequest.format === 'markdown'
          ? renderMarkdown(summaries)
          : renderPrompt(summaries),
  };
}

function createNodeSpec(spec: {
  type: CanvasNode['type'];
  preset?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}): Omit<CanvasNode, 'id'> {
  assertCanvasNodeType(spec.type);
  const preset = spec.preset;
  if (preset && !getBuiltInCanvasNodePresetMetadata(preset)) {
    throw new Error(`Unsupported preset "${preset}"`);
  }
  const position = spec.position ?? { x: 0, y: 0 };
  return buildCanvasNode({
    type: spec.type,
    position,
    data: spec.data ?? {},
    zIndex: 1,
    preset,
  });
}

function assertCanvasNodeType(type: CanvasNodeType | undefined): void {
  if (type !== undefined && !isCanvasNodeType(type)) {
    throw new Error(`Unsupported Canvas node type "${type}"`);
  }
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function summarizeSubsystemMetadata(
  canvasData: CanvasAgentActiveContextInput['canvasData'] | undefined,
): CanvasAgentSubsystemMetadataSummary {
  if (!canvasData) {
    return {};
  }

  return {
    ...(canvasData.narrative
      ? {
          narrative: {
            entryNodeId: canvasData.narrative.entryNodeId,
            variables: canvasData.narrative.variables.slice(0, 50),
          },
        }
      : {}),
    ...(canvasData.behavior
      ? {
          behavior: {
            rootNodeId: canvasData.behavior.rootNodeId,
            blackboard: canvasData.behavior.blackboard.slice(0, 50),
          },
        }
      : {}),
    ...(canvasData.entityGraph
      ? {
          entityGraph: {
            entityScope: [...canvasData.entityGraph.entityScope],
            bindingSource: canvasData.entityGraph.bindingSource,
          },
        }
      : {}),
    ...(canvasData.memoryGraph
      ? {
          memoryGraph: {
            queryContext: canvasData.memoryGraph.queryContext,
            timeRange: canvasData.memoryGraph.timeRange,
          },
        }
      : {}),
  };
}

function createDeriveData(
  sourceNode: CanvasNode,
  targetType: CanvasNode['type'],
  nodes: CanvasNode[],
): Record<string, unknown> {
  const sourceData = sourceNode.data as Record<string, unknown>;
  if (targetType === 'shot') {
    const shotNumbers = nodes
      .filter((node) => node.type === 'shot')
      .map((node) => (node.data as Record<string, unknown>)['shotNumber'])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return {
      shotNumber: shotNumbers.length > 0 ? Math.max(...shotNumbers) + 1 : 1,
      shotScale: typeof sourceData['shotScale'] === 'string' ? sourceData['shotScale'] : 'MS',
      cameraMovement: sourceData['cameraMovement'],
      cameraAngle: sourceData['cameraAngle'],
      duration: typeof sourceData['duration'] === 'number' ? sourceData['duration'] : 3,
      characters: [],
      emotion: [],
      generationStatus: 'idle',
      generationHistory: [],
    };
  }

  if (targetType === 'scene') {
    return { sceneTitle: '' };
  }

  if (targetType === 'annotation') {
    return { content: '' };
  }

  if (targetType === 'text') {
    return { content: '', format: 'plain' };
  }

  if (targetType === 'media') {
    return { assetPath: '', mediaType: 'image' };
  }

  return {};
}

function defaultChildPosition(
  containerNode: CanvasNode,
  index: number,
  childType: CanvasNode['type'],
): { x: number; y: number } {
  const width = childType === 'shot' ? 220 : 180;
  return {
    x: containerNode.position.x + 24 + index * (width + 24),
    y: containerNode.position.y + 64,
  };
}

function resolveUpdateBinding(node: CanvasNode, request: CanvasUpdateBlockRequest): FieldBinding {
  if (request.binding) {
    return request.binding;
  }

  if (request.path) {
    if (!isJsonPointerPath(request.path)) {
      throw new Error(`Invalid JSON Pointer path "${request.path}"`);
    }
    return { path: request.path, mode: 'readwrite' };
  }

  const block = findBlockBinding(node, request.blockId);
  if (!block) {
    throw new Error(`Block "${request.blockId ?? 'unknown'}" has no writable binding`);
  }

  return block;
}

function findBlockBinding(node: CanvasNode, blockId: string | undefined): FieldBinding | undefined {
  if (!blockId || !node.content) {
    return undefined;
  }

  const sections = [node.content];
  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;
    for (const block of section.blocks ?? []) {
      if (block.id === blockId && block.binding) {
        return block.binding;
      }
      const nested = findBindingInBlocks(block.children ?? [], blockId);
      if (nested) {
        return nested;
      }
    }
    sections.push(...(section.sections ?? []));
  }

  return undefined;
}

function findBindingInBlocks(
  blocks: readonly CanvasBlock[] | undefined,
  blockId: string,
): FieldBinding | undefined {
  for (const block of blocks ?? []) {
    if (block.id === blockId && block.binding) {
      return block.binding;
    }
    const nested = findBindingInBlocks(block.children ?? [], blockId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function includeDescendantIds(nodes: CanvasNode[], selectedIds: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  function add(nodeId: string): void {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    result.push(nodeId);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    for (const childId of node ? getContainerChildIds(node) : []) {
      add(childId);
    }
  }

  for (const nodeId of selectedIds) {
    add(nodeId);
  }

  return result;
}

function summarizeNode(
  node: CanvasNode,
  narrativeAnalysis?: CanvasNarrativeAgentAnalysis,
): CanvasStructuredNodeSummary {
  const childIds = getContainerChildIds(node);
  const bindings = collectBindings(node);
  return {
    id: node.id,
    type: node.type,
    preset: node.preset,
    title: getNodeTitle(node),
    summary: getNodeSummary(node),
    parentId: getNodeParentId(node),
    childIds: childIds.length > 0 ? childIds : undefined,
    data: sanitizeData(node.data as Record<string, unknown>),
    bindings,
    preview: node.preview
      ? {
          title: node.preview.title,
          subtitle: node.preview.subtitle,
          role: node.preview.role,
          thumbnailVariantId: node.preview.thumbnailVariantId,
        }
      : undefined,
    narrative: narrativeAnalysis?.nodeSummaries[node.id],
  };
}

function collectBindings(node: CanvasNode): CanvasStructuredNodeSummary['bindings'] {
  if (!node.content) {
    return undefined;
  }

  const bindings: NonNullable<CanvasStructuredNodeSummary['bindings']> = [];
  const sections = [node.content];
  while (sections.length > 0) {
    const section = sections.shift();
    if (!section) continue;
    for (const block of section.blocks ?? []) {
      collectBlockBinding(node, block, bindings);
    }
    sections.push(...(section.sections ?? []));
  }
  return bindings.length > 0 ? bindings : undefined;
}

function collectBlockBinding(
  node: CanvasNode,
  block: CanvasBlock,
  bindings: NonNullable<CanvasStructuredNodeSummary['bindings']>,
): void {
  if (block.binding) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.binding.path,
      value: sanitizeRuntimeValue(readFieldBinding(node.data, block.binding).value),
    });
  }
  if (block.collection) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.collection.source.path,
      value: sanitizeRuntimeValue(readFieldBinding(node.data, block.collection.source).value),
    });
  }
  if (block.projection?.sourceBinding) {
    bindings.push({
      blockId: block.id,
      label: block.label,
      path: block.projection.sourceBinding.path,
      value: sanitizeRuntimeValue(
        readFieldBinding(node.data, block.projection.sourceBinding).value,
      ),
    });
  }
  for (const child of block.children ?? []) {
    collectBlockBinding(node, child, bindings);
  }
}

function getNodeTitle(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  const candidates = [
    data['sceneTitle'],
    data['title'],
    data['content'],
    data['label'],
    data['scriptTitle'],
    data['modelName'],
    data['canvasTitle'],
  ];
  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return value ?? `${node.type}:${node.id}`;
}

function getNodeSummary(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'shot') {
    return joinDefined([
      readString(data, 'visualDescription'),
      readString(data, 'characterAction'),
      readString(data, 'dialogue'),
    ]);
  }
  if (node.type === 'scene') {
    return joinDefined([readString(data, 'location'), readString(data, 'timeOfDay')]);
  }
  return readString(data, 'description') ?? readString(data, 'content');
}

function renderMarkdown(summaries: CanvasStructuredNodeSummary[]): string {
  return summaries
    .map((summary) => {
      const lines = [`## ${summary.title ?? summary.id}`, `- Type: ${summary.type}`];
      if (summary.preset) lines.push(`- Preset: ${summary.preset}`);
      if (summary.parentId) lines.push(`- Parent: ${summary.parentId}`);
      if (summary.childIds?.length) lines.push(`- Children: ${summary.childIds.join(', ')}`);
      if (summary.summary) lines.push('', summary.summary);
      return lines.join('\n');
    })
    .join('\n\n');
}

function renderPrompt(summaries: CanvasStructuredNodeSummary[]): string {
  return summaries
    .map((summary) => {
      const parts = [`${summary.type} ${summary.title ?? summary.id}`];
      if (summary.summary) parts.push(summary.summary);
      const generationFields = pickPromptFields(summary.data);
      if (generationFields.length > 0) {
        parts.push(generationFields.join('; '));
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

function pickPromptFields(data: Record<string, unknown>): string[] {
  const keys = [
    'visualDescription',
    'shotScale',
    'cameraMovement',
    'cameraAngle',
    'characterAction',
    'dialogue',
    'voiceOver',
    'soundCue',
    'generatedImage',
  ];
  return keys.flatMap((key) => {
    const result = readJsonPointer(data, `/${key}` as JsonPointerPath);
    return result.found && result.value !== undefined && result.value !== ''
      ? [`${key}: ${formatValue(result.value)}`]
      : [];
  });
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeRuntimeValue(data);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeRuntimeValue(value: unknown): unknown {
  if (isRuntimeUrl(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeRuntimeValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  const runtimeKeys = new Set([
    'blobUrl',
    'blobURL',
    'objectUrl',
    'objectURL',
    'engineToken',
    'currentTime',
    'hoverTime',
    'activePlayback',
  ]);

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (runtimeKeys.has(key)) {
        return [];
      }

      if (isRuntimeUrl(entryValue)) {
        return [];
      }

      const sanitizedValue = sanitizeRuntimeValue(entryValue);
      return [[key, sanitizedValue]];
    }),
  );
}

function isRuntimeUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('blob:') ||
      value.startsWith('mediastream:') ||
      value.startsWith('vscode-resource:') ||
      value.startsWith('vscode-webview-resource:') ||
      value.startsWith('object:'))
  );
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function joinDefined(values: Array<string | undefined>): string | undefined {
  const joined = values.filter((value): value is string => Boolean(value)).join('. ');
  return joined || undefined;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
