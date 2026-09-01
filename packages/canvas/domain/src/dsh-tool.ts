import { normalizeWorkspaceContentPath, validateContentLocator } from '@neko/content-domain';

import type { CanvasConnection, CanvasNode, CanvasNodeType } from './types/canvas';
import type {
  CanvasCreateConnectionRequest,
  CanvasNodeCreateSpec,
  CanvasUpdateBlockRequest,
} from './types/canvas-agent-operations';
import type {
  CanvasProjectConnectionMutationResult,
  CanvasProjectNodeMutationResult,
  CanvasProjectSnapshot,
} from './canvas-project-authoring-service';

export const CANVAS_DSH_TOOL_NAME = 'openneko_canvas' as const;
export const CANVAS_DSH_TOOL_OPERATIONS = ['query', 'apply'] as const;
export const CANVAS_DSH_MAX_PROJECTED_NODES = 32;
export const CANVAS_DSH_MAX_PROJECTED_CONNECTIONS = 64;
export const CANVAS_DSH_MAX_TEXT_CHARS = 4_000;

const CANVAS_DSH_CREATABLE_NODE_TYPES = ['markdown', 'group', 'media', 'file'] as const;
const CANVAS_DSH_UPDATE_PATHS = [
  '/content',
  '/title',
  '/label',
  '/recipe/prompt',
  '/selectedOutputId',
] as const;

export type CanvasDshToolOperation = (typeof CANVAS_DSH_TOOL_OPERATIONS)[number];
export type CanvasDshUpdatePath = (typeof CANVAS_DSH_UPDATE_PATHS)[number];

const CONTENT_LOCATOR_SCHEMA = {
  type: 'object',
  description:
    'Canonical @neko/content-domain ContentLocator. Its owning validator checks the authority-specific file identity and optional selector.',
  properties: {
    file: {
      type: 'object',
      additionalProperties: true,
      required: true,
    },
    selector: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: true,
} as const;

const CREATE_NODE_COMMAND_SCHEMA = {
  type: 'object',
  title: 'create_node command',
  properties: {
    kind: { type: 'string', const: 'create_node', required: true },
    node: {
      oneOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'markdown', required: true },
            content: { type: 'string', required: true },
            title: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'group', required: true },
            label: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'media', required: true },
            contentLocator: { ...CONTENT_LOCATOR_SCHEMA, required: true },
            mediaType: {
              type: 'string',
              enum: ['image', 'video', 'audio'],
              required: true,
            },
            title: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'file', required: true },
            contentLocator: { ...CONTENT_LOCATOR_SCHEMA, required: true },
            mediaKind: {
              type: 'string',
              enum: ['image', 'audio', 'video', 'document', 'model', 'other'],
            },
            title: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
      required: true,
    },
  },
  additionalProperties: false,
} as const;

const UPDATE_NODE_COMMAND_SCHEMA = {
  type: 'object',
  title: 'update_node command',
  properties: {
    kind: { type: 'string', const: 'update_node', required: true },
    nodeId: { type: 'string', required: true },
    path: { type: 'string', enum: [...CANVAS_DSH_UPDATE_PATHS], required: true },
    value: { type: 'string', required: true },
  },
  additionalProperties: false,
} as const;

const CREATE_CONNECTION_COMMAND_SCHEMA = {
  type: 'object',
  title: 'create_connection command',
  properties: {
    kind: { type: 'string', const: 'create_connection', required: true },
    sourceId: { type: 'string', required: true },
    targetId: { type: 'string', required: true },
    type: {
      type: 'string',
      enum: ['sequence', 'reference', 'derived-from'],
      required: true,
    },
    label: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const CANVAS_DSH_TOOL_PARAMETERS = {
  operation: {
    type: 'string',
    enum: [...CANVAS_DSH_TOOL_OPERATIONS],
    description: 'Use query for bounded Canvas context and apply for one semantic mutation.',
    required: true,
  },
  input: {
    oneOf: [
      {
        type: 'object',
        title: 'query input',
        properties: {
          documentPath: {
            type: 'string',
            description: 'Normalized Workspace-relative .nkc path.',
            required: true,
          },
          nodeIds: {
            type: 'array',
            description: 'Optional exact nodes whose bounded one-hop subgraph should be returned.',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'apply input',
        properties: {
          documentPath: {
            type: 'string',
            description: 'Normalized Workspace-relative .nkc path.',
            required: true,
          },
          command: {
            oneOf: [
              CREATE_NODE_COMMAND_SCHEMA,
              UPDATE_NODE_COMMAND_SCHEMA,
              CREATE_CONNECTION_COMMAND_SCHEMA,
            ],
            required: true,
          },
        },
        additionalProperties: false,
      },
    ],
    required: true,
  },
} as const;

export type CanvasDshToolJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanvasDshToolJsonValue[]
  | { readonly [key: string]: CanvasDshToolJsonValue };

export interface CanvasDshToolQueryInput {
  readonly documentPath: string;
  readonly nodeIds?: readonly string[];
}

export type CanvasDshCreateNodeSpec =
  | {
      readonly type: 'markdown';
      readonly content: string;
      readonly title?: string;
    }
  | {
      readonly type: 'group';
      readonly label?: string;
    }
  | {
      readonly type: 'media';
      readonly contentLocator: CanvasDshToolJsonValue;
      readonly mediaType: 'image' | 'video' | 'audio';
      readonly title?: string;
    }
  | {
      readonly type: 'file';
      readonly contentLocator: CanvasDshToolJsonValue;
      readonly mediaKind?: 'image' | 'audio' | 'video' | 'document' | 'model' | 'other';
      readonly title?: string;
    };

export type CanvasDshApplyCommand =
  | { readonly kind: 'create_node'; readonly node: CanvasDshCreateNodeSpec }
  | {
      readonly kind: 'update_node';
      readonly nodeId: string;
      readonly path: CanvasDshUpdatePath;
      readonly value: string;
    }
  | {
      readonly kind: 'create_connection';
      readonly sourceId: string;
      readonly targetId: string;
      readonly type: CanvasConnection['type'];
      readonly label?: string;
    };

export interface CanvasDshToolApplyInput {
  readonly documentPath: string;
  readonly command: CanvasDshApplyCommand;
}

export type CanvasDshToolInput =
  | { readonly operation: 'query'; readonly input: CanvasDshToolQueryInput }
  | { readonly operation: 'apply'; readonly input: CanvasDshToolApplyInput };

export interface CanvasDshNodeFacts {
  readonly [key: string]: CanvasDshToolJsonValue;
  readonly nodeId: string;
  readonly nodeType: CanvasNode['type'];
  readonly parentId: string | null;
  readonly title: string | null;
  readonly data: Readonly<Record<string, CanvasDshToolJsonValue>>;
  readonly targetableFields: readonly CanvasDshUpdatePath[];
}

export interface CanvasDshConnectionFacts {
  readonly [key: string]: CanvasDshToolJsonValue;
  readonly connectionId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: CanvasConnection['type'];
  readonly label: string | null;
}

export interface CanvasDshToolQueryFacts {
  readonly [key: string]: CanvasDshToolJsonValue;
  readonly documentPath: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly connectionCount: number;
  readonly nodes: readonly CanvasDshNodeFacts[];
  readonly connections: readonly CanvasDshConnectionFacts[];
  readonly missingNodeIds: readonly string[];
  readonly nodesTruncated: boolean;
  readonly connectionsTruncated: boolean;
}

export type CanvasDshToolApplyFacts =
  | {
      readonly documentPath: string;
      readonly command: 'create_node' | 'update_node';
      readonly nodeId: string;
      readonly nodeType: CanvasNode['type'];
    }
  | {
      readonly documentPath: string;
      readonly command: 'create_connection';
      readonly connectionId: string;
      readonly sourceId: string;
      readonly targetId: string;
      readonly type: CanvasConnection['type'];
    };

export function decodeCanvasDshToolInput(operation: unknown, input: unknown): CanvasDshToolInput {
  if (operation === 'query') return { operation, input: decodeQueryInput(input) };
  if (operation === 'apply') return { operation, input: decodeApplyInput(input) };
  throw new Error(
    `Canvas DSH tool operation must be one of ${CANVAS_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export function projectCanvasQuerySnapshot(
  snapshot: CanvasProjectSnapshot,
  input: CanvasDshToolQueryInput,
): CanvasDshToolQueryFacts {
  const requestedIds = new Set(input.nodeIds ?? []);
  const missingNodeIds = [...requestedIds].filter(
    (nodeId) => !snapshot.canvas.nodes.some((node) => node.id === nodeId),
  );
  const includedIds = new Set(requestedIds);
  if (requestedIds.size > 0) {
    for (const connection of snapshot.canvas.connections) {
      if (requestedIds.has(connection.sourceId) || requestedIds.has(connection.targetId)) {
        includedIds.add(connection.sourceId);
        includedIds.add(connection.targetId);
      }
    }
  }
  const candidateNodes =
    requestedIds.size === 0
      ? snapshot.canvas.nodes
      : snapshot.canvas.nodes.filter((node) => includedIds.has(node.id));
  const nodes = candidateNodes.slice(0, CANVAS_DSH_MAX_PROJECTED_NODES);
  const projectedNodeIds = new Set(nodes.map((node) => node.id));
  const candidateConnections = snapshot.canvas.connections.filter((connection) =>
    requestedIds.size === 0
      ? projectedNodeIds.has(connection.sourceId) && projectedNodeIds.has(connection.targetId)
      : requestedIds.has(connection.sourceId) || requestedIds.has(connection.targetId),
  );
  return {
    documentPath: snapshot.documentPath,
    name: snapshot.canvas.name,
    nodeCount: snapshot.canvas.nodes.length,
    connectionCount: snapshot.canvas.connections.length,
    nodes: nodes.map(projectNode),
    connections: candidateConnections
      .slice(0, CANVAS_DSH_MAX_PROJECTED_CONNECTIONS)
      .map(projectConnection),
    missingNodeIds,
    nodesTruncated: candidateNodes.length > CANVAS_DSH_MAX_PROJECTED_NODES,
    connectionsTruncated: candidateConnections.length > CANVAS_DSH_MAX_PROJECTED_CONNECTIONS,
  };
}

export function projectCanvasNodeMutationResult(
  command: 'create_node' | 'update_node',
  result: CanvasProjectNodeMutationResult,
): CanvasDshToolApplyFacts {
  return {
    documentPath: result.documentPath,
    command,
    nodeId: result.node.id,
    nodeType: result.node.type,
  };
}

export function projectCanvasConnectionMutationResult(
  result: CanvasProjectConnectionMutationResult,
): CanvasDshToolApplyFacts {
  return {
    documentPath: result.documentPath,
    command: 'create_connection',
    connectionId: result.connection.id,
    sourceId: result.connection.sourceId,
    targetId: result.connection.targetId,
    type: result.connection.type,
  };
}

export function canvasDshCreateNodeSpec(
  command: Extract<CanvasDshApplyCommand, { kind: 'create_node' }>,
): CanvasNodeCreateSpec {
  const { type, ...data } = command.node;
  return { type, data: data as Record<string, unknown> };
}

export function canvasDshUpdateNodeRequest(
  command: Extract<CanvasDshApplyCommand, { kind: 'update_node' }>,
): CanvasUpdateBlockRequest {
  return { nodeId: command.nodeId, path: command.path, value: command.value };
}

export function canvasDshCreateConnectionRequest(
  command: Extract<CanvasDshApplyCommand, { kind: 'create_connection' }>,
): CanvasCreateConnectionRequest {
  return {
    sourceId: command.sourceId,
    targetId: command.targetId,
    type: command.type,
    ...(command.label ? { label: command.label } : {}),
  };
}

function decodeQueryInput(input: unknown): CanvasDshToolQueryInput {
  const record = requireRecord(input, 'input');
  requireOnlyKeys(record, ['documentPath', 'nodeIds'], 'input');
  const nodeIds =
    record.nodeIds === undefined ? undefined : requireNodeIds(record.nodeIds, 'input.nodeIds');
  return {
    documentPath: requireDocumentPath(record.documentPath, 'input.documentPath'),
    ...(nodeIds ? { nodeIds } : {}),
  };
}

function decodeApplyInput(input: unknown): CanvasDshToolApplyInput {
  const record = requireRecord(input, 'input');
  requireOnlyKeys(record, ['documentPath', 'command'], 'input');
  return {
    documentPath: requireDocumentPath(record.documentPath, 'input.documentPath'),
    command: requireCommand(record.command, 'input.command'),
  };
}

function requireCommand(input: unknown, field: string): CanvasDshApplyCommand {
  const command = requireRecord(input, field);
  const kind = command.kind;
  if (kind === 'create_node') {
    requireOnlyKeys(command, ['kind', 'node'], field);
    return { kind, node: requireCreatableNode(command.node, `${field}.node`) };
  }
  if (kind === 'update_node') {
    requireOnlyKeys(command, ['kind', 'nodeId', 'path', 'value'], field);
    return {
      kind,
      nodeId: requireIdentity(command.nodeId, `${field}.nodeId`),
      path: requireUpdatePath(command.path, `${field}.path`),
      value: requireString(command.value, `${field}.value`),
    };
  }
  if (kind === 'create_connection') {
    requireOnlyKeys(command, ['kind', 'sourceId', 'targetId', 'type', 'label'], field);
    return {
      kind,
      sourceId: requireIdentity(command.sourceId, `${field}.sourceId`),
      targetId: requireIdentity(command.targetId, `${field}.targetId`),
      type: requireConnectionType(command.type, `${field}.type`),
      ...(command.label === undefined
        ? {}
        : { label: requireIdentity(command.label, `${field}.label`) }),
    };
  }
  throw new Error(`${field}.kind must be create_node, update_node, or create_connection.`);
}

function requireCreatableNode(input: unknown, field: string): CanvasDshCreateNodeSpec {
  const node = requireRecord(input, field);
  if (node.type === 'markdown') {
    requireOnlyKeys(node, ['type', 'content', 'title'], field);
    return {
      type: node.type,
      content: requireString(node.content, `${field}.content`),
      ...(node.title === undefined ? {} : { title: requireIdentity(node.title, `${field}.title`) }),
    };
  }
  if (node.type === 'group') {
    requireOnlyKeys(node, ['type', 'label'], field);
    return {
      type: node.type,
      ...(node.label === undefined ? {} : { label: requireIdentity(node.label, `${field}.label`) }),
    };
  }
  if (node.type === 'media') {
    requireOnlyKeys(node, ['type', 'contentLocator', 'mediaType', 'title'], field);
    return {
      type: node.type,
      contentLocator: requireContentLocator(node.contentLocator, `${field}.contentLocator`),
      mediaType: requireMediaType(node.mediaType, `${field}.mediaType`),
      ...(node.title === undefined ? {} : { title: requireIdentity(node.title, `${field}.title`) }),
    };
  }
  if (node.type === 'file') {
    requireOnlyKeys(node, ['type', 'contentLocator', 'mediaKind', 'title'], field);
    return {
      type: node.type,
      contentLocator: requireContentLocator(node.contentLocator, `${field}.contentLocator`),
      ...(node.mediaKind === undefined
        ? {}
        : { mediaKind: requireMediaKind(node.mediaKind, `${field}.mediaKind`) }),
      ...(node.title === undefined ? {} : { title: requireIdentity(node.title, `${field}.title`) }),
    };
  }
  throw new Error(`${field}.type must be one of ${CANVAS_DSH_CREATABLE_NODE_TYPES.join(', ')}.`);
}

function projectNode(node: CanvasNode): CanvasDshNodeFacts {
  const title = projectNodeTitle(node);
  return {
    nodeId: node.id,
    nodeType: node.type,
    parentId: node.parentId ?? null,
    title: title ?? null,
    data: projectNodeData(node),
    targetableFields: targetableFields(node.type),
  };
}

function projectNodeData(node: CanvasNode): Readonly<Record<string, CanvasDshToolJsonValue>> {
  switch (node.type) {
    case 'markdown':
      return {
        content: boundedText(node.data.content),
        ...(node.data.content.length > CANVAS_DSH_MAX_TEXT_CHARS ? { contentTruncated: true } : {}),
      };
    case 'group':
      return jsonRecord({
        ...(node.data.label ? { label: node.data.label } : {}),
      });
    case 'media':
      return jsonRecord({
        ...(node.data.contentLocator ? { contentLocator: node.data.contentLocator } : {}),
        ...(node.data.mediaType ? { mediaType: node.data.mediaType } : {}),
        ...(node.data.duration === undefined ? {} : { duration: node.data.duration }),
        ...(node.data.generation ? { generation: node.data.generation } : {}),
        ...(node.data.entityRepresentation
          ? { entityRepresentation: node.data.entityRepresentation }
          : {}),
      });
    case 'file':
      return jsonRecord({
        ...(node.data.contentLocator ? { contentLocator: node.data.contentLocator } : {}),
        ...(node.data.mediaKind ? { mediaKind: node.data.mediaKind } : {}),
        ...(node.data.mediaType ? { mediaType: node.data.mediaType } : {}),
        ...(node.data.generation ? { generation: node.data.generation } : {}),
        ...(node.data.entityRepresentation
          ? { entityRepresentation: node.data.entityRepresentation }
          : {}),
      });
    case 'job':
      return jsonRecord({
        jobRef: node.data.jobRef,
        status: node.data.status,
        inputRefs: node.data.inputRefs,
        outputRefs: node.data.outputRefs,
        ...(node.data.objective ? { objective: boundedText(node.data.objective) } : {}),
        ...(node.data.diagnostic ? { diagnostic: boundedText(node.data.diagnostic) } : {}),
      });
    case 'canvas-embed':
      return jsonRecord({
        canvasPath: node.data.canvasPath,
        ...(node.data.contentLocator ? { contentLocator: node.data.contentLocator } : {}),
      });
    case 'generation': {
      const outputs = node.data.outputs.slice(0, CANVAS_DSH_MAX_PROJECTED_NODES);
      return jsonRecord({
        recipe: node.data.recipe,
        ...(node.data.latestRun ? { latestRun: node.data.latestRun } : {}),
        outputs,
        outputCount: node.data.outputs.length,
        outputsTruncated: outputs.length < node.data.outputs.length,
        ...(node.data.selectedOutputId ? { selectedOutputId: node.data.selectedOutputId } : {}),
      });
    }
  }
}

function projectNodeTitle(node: CanvasNode): string | undefined {
  switch (node.type) {
    case 'markdown':
    case 'media':
    case 'file':
      return node.data.title;
    case 'group':
      return node.data.label;
    case 'job':
      return node.data.title;
    case 'canvas-embed':
      return node.data.canvasTitle;
    case 'generation':
      return `${node.data.recipe.kind} generation`;
  }
}

function targetableFields(type: CanvasNodeType): readonly CanvasDshUpdatePath[] {
  switch (type) {
    case 'markdown':
      return ['/content', '/title'];
    case 'group':
      return ['/label'];
    case 'media':
    case 'file':
      return ['/title'];
    case 'generation':
      return ['/recipe/prompt', '/selectedOutputId'];
    default:
      return [];
  }
}

function projectConnection(connection: CanvasConnection): CanvasDshConnectionFacts {
  return {
    connectionId: connection.id,
    sourceId: connection.sourceId,
    targetId: connection.targetId,
    type: connection.type,
    label: connection.label ?? null,
  };
}

function boundedText(value: string): string {
  return value.slice(0, CANVAS_DSH_MAX_TEXT_CHARS);
}

function jsonRecord(input: unknown): Readonly<Record<string, CanvasDshToolJsonValue>> {
  return requireJsonObject(input, 'projection');
}

function requireDocumentPath(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`${field} must be a string.`);
  const normalized = normalizeWorkspaceContentPath(input);
  if (normalized !== input || !normalized.toLowerCase().endsWith('.nkc')) {
    throw new Error(`${field} must be a normalized Workspace-relative .nkc path.`);
  }
  return input;
}

function requireNodeIds(input: unknown, field: string): readonly string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`${field} must be a non-empty array.`);
  }
  if (input.length > CANVAS_DSH_MAX_PROJECTED_NODES) {
    throw new Error(`${field} supports at most ${CANVAS_DSH_MAX_PROJECTED_NODES} identities.`);
  }
  const ids = input.map((value, index) => requireIdentity(value, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error(`${field} must not contain duplicates.`);
  return ids;
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(input, key),
    )
  ) {
    throw new Error(`${field} must be a plain JSON object.`);
  }
  return input as Record<string, unknown>;
}

function requireOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const unknownKey = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknownKey !== undefined) throw new Error(`${field}.${unknownKey} is not supported.`);
}

function requireJsonObject(
  input: unknown,
  field: string,
): Readonly<Record<string, CanvasDshToolJsonValue>> {
  const record = requireRecord(input, field);
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, requireJsonValue(value, `${field}.${key}`)]),
  );
}

function requireJsonValue(input: unknown, field: string): CanvasDshToolJsonValue {
  if (
    input === null ||
    typeof input === 'string' ||
    typeof input === 'boolean' ||
    (typeof input === 'number' && Number.isFinite(input) && !Object.is(input, -0))
  ) {
    return input;
  }
  if (Array.isArray(input)) {
    if (
      Object.getPrototypeOf(input) !== Array.prototype ||
      Reflect.ownKeys(input).length !== input.length + 1 ||
      input.some((_value, index) => !Object.hasOwn(input, index))
    ) {
      throw new Error(`${field} must be a dense plain JSON array.`);
    }
    return input.map((value, index) => requireJsonValue(value, `${field}[${index}]`));
  }
  return requireJsonObject(input, field);
}

function requireContentLocator(input: unknown, field: string): CanvasDshToolJsonValue {
  const validation = validateContentLocator(input);
  if (!validation.ok) throw new Error(`${field} must be a canonical ContentLocator.`);
  return requireJsonValue(validation.locator, field);
}

function requireIdentity(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return input;
}

function requireString(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`${field} must be a string.`);
  return input;
}

function requireUpdatePath(input: unknown, field: string): CanvasDshUpdatePath {
  if (
    typeof input !== 'string' ||
    !(CANVAS_DSH_UPDATE_PATHS as readonly string[]).includes(input)
  ) {
    throw new Error(`${field} must be a supported Canvas targetable field.`);
  }
  return input as CanvasDshUpdatePath;
}

function requireConnectionType(input: unknown, field: string): CanvasConnection['type'] {
  if (input !== 'sequence' && input !== 'reference' && input !== 'derived-from') {
    throw new Error(`${field} must be sequence, reference, or derived-from.`);
  }
  return input;
}

function requireMediaType(input: unknown, field: string): 'image' | 'video' | 'audio' {
  if (input !== 'image' && input !== 'video' && input !== 'audio') {
    throw new Error(`${field} must be image, video, or audio.`);
  }
  return input;
}

function requireMediaKind(
  input: unknown,
  field: string,
): 'image' | 'audio' | 'video' | 'document' | 'model' | 'other' {
  if (
    input !== 'image' &&
    input !== 'audio' &&
    input !== 'video' &&
    input !== 'document' &&
    input !== 'model' &&
    input !== 'other'
  ) {
    throw new Error(`${field} must be a supported Canvas material kind.`);
  }
  return input;
}
