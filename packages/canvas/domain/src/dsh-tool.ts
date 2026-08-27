import { normalizeWorkspaceContentPath } from '@neko/content-domain';

import {
  CANVAS_NODE_TYPES,
  isCanvasNodeType,
  type CanvasNode,
  type CanvasNodeType,
} from './types/canvas';
import type {
  CanvasProjectNodeMutationResult,
  CanvasProjectSnapshot,
} from './canvas-project-authoring-service';

export const CANVAS_DSH_TOOL_NAME = 'openneko_canvas' as const;
export const CANVAS_DSH_TOOL_OPERATIONS = ['query', 'create-node'] as const;

export type CanvasDshToolOperation = (typeof CANVAS_DSH_TOOL_OPERATIONS)[number];

export const CANVAS_DSH_TOOL_PARAMETERS = {
  operation: {
    type: 'string',
    enum: [...CANVAS_DSH_TOOL_OPERATIONS],
    description: 'Use query with { documentPath }; use create-node with { documentPath, node }.',
    required: true,
  },
  input: {
    oneOf: [
      {
        type: 'object',
        title: 'query input',
        description:
          'Input for the query operation. The result already contains bounded summary facts.',
        properties: {
          documentPath: {
            type: 'string',
            description: 'Normalized Workspace-relative .nkc path.',
            required: true,
          },
        },
        additionalProperties: false,
      },
      {
        type: 'object',
        title: 'create-node input',
        description: 'Input for the create-node operation.',
        properties: {
          documentPath: {
            type: 'string',
            description: 'Normalized Workspace-relative .nkc path.',
            required: true,
          },
          node: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...CANVAS_NODE_TYPES] },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number', required: true },
                  y: { type: 'number', required: true },
                },
                additionalProperties: false,
              },
              data: {
                type: 'object',
                description: 'Node-type-specific JSON data.',
                additionalProperties: true,
              },
            },
            additionalProperties: false,
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
}

export interface CanvasDshToolCreateNodeInput {
  readonly documentPath: string;
  readonly node: {
    readonly type?: CanvasNodeType;
    readonly position?: { readonly x: number; readonly y: number };
    readonly data?: Readonly<Record<string, CanvasDshToolJsonValue>>;
  };
}

export type CanvasDshToolInput =
  | {
      readonly operation: 'query';
      readonly input: CanvasDshToolQueryInput;
    }
  | {
      readonly operation: 'create-node';
      readonly input: CanvasDshToolCreateNodeInput;
    };

export interface CanvasDshToolQueryFacts {
  readonly documentPath: string;
  readonly nodeCount: number;
  readonly connectionCount: number;
}

export interface CanvasDshToolCreateNodeFacts {
  readonly documentPath: string;
  readonly nodeId: string;
  readonly nodeType: CanvasNode['type'];
  readonly nodePosition: CanvasNode['position'];
  readonly parentId?: string;
}

export function decodeCanvasDshToolInput(operation: unknown, input: unknown): CanvasDshToolInput {
  if (operation === 'query') {
    return { operation, input: decodeQueryInput(input) };
  }
  if (operation === 'create-node') {
    return { operation, input: decodeCreateNodeInput(input) };
  }
  throw new Error(
    `Canvas DSH tool operation must be one of ${CANVAS_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export function projectCanvasQuerySnapshot(
  snapshot: CanvasProjectSnapshot,
): CanvasDshToolQueryFacts {
  return {
    documentPath: snapshot.documentPath,
    nodeCount: snapshot.canvas.nodes.length,
    connectionCount: snapshot.canvas.connections.length,
  };
}

export function projectCanvasCreateNodeResult(
  result: CanvasProjectNodeMutationResult,
): CanvasDshToolCreateNodeFacts {
  return {
    documentPath: result.documentPath,
    nodeId: result.node.id,
    nodeType: result.node.type,
    nodePosition: result.node.position,
    ...(result.node.parentId === undefined ? {} : { parentId: result.node.parentId }),
  };
}

function decodeQueryInput(input: unknown): CanvasDshToolQueryInput {
  const record = requireRecord(input, 'input');
  requireOnlyKeys(record, ['documentPath'], 'input');
  return { documentPath: requireDocumentPath(record.documentPath, 'input.documentPath') };
}

function decodeCreateNodeInput(input: unknown): CanvasDshToolCreateNodeInput {
  const record = requireRecord(input, 'input');
  requireOnlyKeys(record, ['documentPath', 'node'], 'input');
  const documentPath = requireDocumentPath(record.documentPath, 'input.documentPath');
  const node = requireNode(record.node, 'input.node');
  return { documentPath, node };
}

function requireDocumentPath(input: unknown, field: string): string {
  if (typeof input !== 'string') throw new Error(`${field} must be a string.`);
  const normalized = normalizeWorkspaceContentPath(input);
  if (normalized !== input || !normalized.toLowerCase().endsWith('.nkc')) {
    throw new Error(`${field} must be a normalized Workspace-relative .nkc path.`);
  }
  return input;
}

function requireNode(input: unknown, field: string): CanvasDshToolCreateNodeInput['node'] {
  const record = requireRecord(input, field);
  requireOnlyKeys(record, ['type', 'position', 'data'], field);
  const node: CanvasDshToolCreateNodeInput['node'] = {};
  if (record.type !== undefined) {
    if (!isCanvasNodeType(record.type)) {
      throw new Error(`${field}.type must be a supported Canvas node type.`);
    }
    return {
      ...node,
      type: record.type,
      ...(record.position === undefined
        ? {}
        : { position: requirePosition(record.position, field) }),
      ...(record.data === undefined
        ? {}
        : { data: requireJsonObject(record.data, `${field}.data`) }),
    };
  }
  if (record.position !== undefined) {
    return {
      ...node,
      position: requirePosition(record.position, field),
      ...(record.data === undefined
        ? {}
        : { data: requireJsonObject(record.data, `${field}.data`) }),
    };
  }
  if (record.data !== undefined) {
    return { ...node, data: requireJsonObject(record.data, `${field}.data`) };
  }
  return node;
}

function requirePosition(
  input: unknown,
  field: string,
): { readonly x: number; readonly y: number } {
  const position = requireRecord(input, `${field}.position`);
  requireOnlyKeys(position, ['x', 'y'], `${field}.position`);
  return {
    x: requireFiniteNumber(position.x, `${field}.position.x`),
    y: requireFiniteNumber(position.y, `${field}.position.y`),
  };
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

function requireFiniteNumber(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return input;
}
