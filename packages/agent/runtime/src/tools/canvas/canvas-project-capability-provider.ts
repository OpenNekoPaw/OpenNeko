import {
  isCanvasConnectionType,
  isCanvasNodeType,
  isJsonPointerPath,
  type CanvasCreateConnectionRequest,
  type CanvasNodeCreateSpec,
  type CanvasProjectAuthoringService,
} from '@neko/canvas-domain';
import {
  TOOL_NAMES_CANVAS,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PromptFragment,
  type Tool,
  type ToolExecuteOptions,
  type ToolParameterProperty,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import { isContentFingerprint, type ContentFingerprint } from '@neko/content';

const FINGERPRINT_PARAMETER: ToolParameterProperty = {
  type: 'object',
  properties: {
    strategy: { type: 'string', enum: ['sha256', 'mtime-size', 'provider'] },
    value: { type: 'string' },
  },
  required: ['strategy', 'value'],
  additionalProperties: false,
};

export function createCanvasProjectCapabilityProvider(
  service: CanvasProjectAuthoringService,
): AgentCapabilityProvider {
  return new CanvasProjectCapabilityProvider(service);
}

class CanvasProjectCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-canvas-project-authoring';
  readonly hostRequirements = [{ host: 'desktop' as const }];
  readonly requirements = { contentAccess: true, writableProject: true } as const;

  constructor(private readonly service: CanvasProjectAuthoringService) {}

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-canvas:structured-project-authoring',
        priority: 72,
        toolNames: [
          TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
          TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
          TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
          TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
          TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
          TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
        ],
        content:
          'Canvas .nkc documents use the Canvas query and authoring operations. Query the exact Workspace-relative document before mutation and pass its exact fingerprint. Never use generic file or shell operations for .nkc.',
        locales: {
          zh: {
            content:
              'Canvas .nkc 文档只使用 Canvas 查询与创作操作。修改前查询精确的 Workspace 相对文档，并传回其 fingerprint；不得对 .nkc 使用通用文件或 shell 操作。',
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      this.listNodesTool(),
      this.getNodeTool(),
      this.createNodeTool(),
      this.updateBlockTool(),
      this.listConnectionsTool(),
      this.getConnectionTool(),
      this.createConnectionTool(),
    ];
  }

  private listNodesTool(): Tool {
    return queryTool(
      TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
      'Query nodes from one exact Workspace-relative Canvas .nkc document and return its current fingerprint.',
      documentQueryParameters({
        type: {
          type: 'string',
          enum: ['markdown', 'media', 'group', 'job', 'file', 'canvas-embed'],
        },
      }),
      async (args, options) => {
        const snapshot = await this.service.query({
          documentPath: requireString(args['document_path'], 'document_path'),
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        const type = args['type'];
        if (type !== undefined && !isCanvasNodeType(type))
          throw new Error('Canvas node type is invalid.');
        return {
          documentPath: snapshot.documentPath,
          fingerprint: snapshot.fingerprint,
          name: snapshot.canvas.name,
          nodes: type
            ? snapshot.canvas.nodes.filter((node) => node.type === type)
            : snapshot.canvas.nodes,
        };
      },
    );
  }

  private getNodeTool(): Tool {
    return queryTool(
      TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
      'Query one Canvas node by stable node identity from an exact .nkc document.',
      documentQueryParameters({ node_id: { type: 'string' } }, ['node_id']),
      async (args, options) => {
        const snapshot = await this.service.query({
          documentPath: requireString(args['document_path'], 'document_path'),
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        const nodeId = requireString(args['node_id'], 'node_id');
        const node = snapshot.canvas.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) throw new Error(`Canvas node "${nodeId}" does not exist.`);
        return { documentPath: snapshot.documentPath, fingerprint: snapshot.fingerprint, node };
      },
    );
  }

  private createNodeTool(): Tool {
    return mutationTool(
      TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
      'Create one canonical node in an exact Canvas .nkc document using its current fingerprint.',
      documentMutationParameters(
        {
          type: { type: 'string', enum: ['markdown', 'media', 'group', 'file', 'canvas-embed'] },
          position: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y'],
            additionalProperties: false,
          },
          data: { type: 'object' },
        },
        ['type'],
      ),
      async (args, options) => {
        const type = args['type'];
        if (!isCanvasNodeType(type) || type === 'job')
          throw new Error('Canvas node type is not authorable.');
        const node: CanvasNodeCreateSpec = {
          type,
          ...(args['position'] === undefined ? {} : { position: readPoint(args['position']) }),
          ...(args['data'] === undefined ? {} : { data: requireRecord(args['data'], 'data') }),
        };
        const result = await this.service.createNode({
          documentPath: requireString(args['document_path'], 'document_path'),
          expectedFingerprint: requireFingerprint(args['expected_fingerprint']),
          node,
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        return {
          documentPath: result.documentPath,
          fingerprint: result.fingerprint,
          node: result.node,
        };
      },
    );
  }

  private updateBlockTool(): Tool {
    return mutationTool(
      TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
      'Update one allowed field on an exact Canvas node using a JSON Pointer and current fingerprint.',
      documentMutationParameters(
        { node_id: { type: 'string' }, path: { type: 'string' }, value: { type: 'string' } },
        ['node_id', 'path', 'value'],
      ),
      async (args, options) => {
        const path = requireString(args['path'], 'path');
        if (!isJsonPointerPath(path)) throw new Error('Canvas path must be a JSON Pointer.');
        const result = await this.service.updateBlock({
          documentPath: requireString(args['document_path'], 'document_path'),
          expectedFingerprint: requireFingerprint(args['expected_fingerprint']),
          request: {
            nodeId: requireString(args['node_id'], 'node_id'),
            path,
            value: args['value'],
          },
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        return {
          documentPath: result.documentPath,
          fingerprint: result.fingerprint,
          node: result.node,
        };
      },
    );
  }

  private listConnectionsTool(): Tool {
    return queryTool(
      TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
      'Query connections from one exact Canvas .nkc document and return its current fingerprint.',
      documentQueryParameters({}),
      async (args, options) => {
        const snapshot = await this.service.query({
          documentPath: requireString(args['document_path'], 'document_path'),
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        return {
          documentPath: snapshot.documentPath,
          fingerprint: snapshot.fingerprint,
          connections: snapshot.canvas.connections,
        };
      },
    );
  }

  private getConnectionTool(): Tool {
    return queryTool(
      TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
      'Query one Canvas connection by stable identity from an exact .nkc document.',
      documentQueryParameters({ connection_id: { type: 'string' } }, ['connection_id']),
      async (args, options) => {
        const snapshot = await this.service.query({
          documentPath: requireString(args['document_path'], 'document_path'),
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        const connectionId = requireString(args['connection_id'], 'connection_id');
        const connection = snapshot.canvas.connections.find(
          (candidate) => candidate.id === connectionId,
        );
        if (!connection) throw new Error(`Canvas connection "${connectionId}" does not exist.`);
        return {
          documentPath: snapshot.documentPath,
          fingerprint: snapshot.fingerprint,
          connection,
        };
      },
    );
  }

  private createConnectionTool(): Tool {
    return mutationTool(
      TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
      'Create one connection between exact Canvas node identities using the current project fingerprint.',
      documentMutationParameters(
        {
          source_id: { type: 'string' },
          target_id: { type: 'string' },
          type: { type: 'string', enum: ['sequence', 'reference', 'derived-from'] },
          label: { type: 'string' },
        },
        ['source_id', 'target_id'],
      ),
      async (args, options) => {
        const type = args['type'];
        if (type !== undefined && !isCanvasConnectionType(type)) {
          throw new Error('Canvas connection type is invalid.');
        }
        const connection: CanvasCreateConnectionRequest = {
          sourceId: requireString(args['source_id'], 'source_id'),
          targetId: requireString(args['target_id'], 'target_id'),
          ...(type ? { type } : {}),
          ...(args['label'] === undefined ? {} : { label: requireString(args['label'], 'label') }),
        };
        const result = await this.service.createConnection({
          documentPath: requireString(args['document_path'], 'document_path'),
          expectedFingerprint: requireFingerprint(args['expected_fingerprint']),
          connection,
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        return {
          documentPath: result.documentPath,
          fingerprint: result.fingerprint,
          connection: result.connection,
        };
      },
    );
  }
}

function queryTool(
  name: string,
  description: string,
  parameters: ToolParameters,
  execute: (args: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<unknown>,
): Tool {
  return {
    name,
    description,
    category: 'project',
    isReadOnly: true,
    isConcurrencySafe: true,
    safetyKind: 'read-only-query',
    parameters,
    execute: (args, options) => executeTool(name, args, options, execute),
  };
}

function mutationTool(
  name: string,
  description: string,
  parameters: ToolParameters,
  execute: (args: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<unknown>,
): Tool {
  return {
    name,
    description,
    category: 'project',
    requiresConfirmation: true,
    safetyKind: 'confirmation-gated',
    requirements: { writableProject: true, authoringTargetKind: 'content-document' },
    queryBeforeMutate: {
      preferredQueryTools: [TOOL_NAMES_CANVAS.CANVAS_LIST_NODES],
      reason: 'Resolve the exact Canvas target and current fingerprint before mutation.',
    },
    parameters,
    execute: (args, options) => executeTool(name, args, options, execute),
  };
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: ToolExecuteOptions | undefined,
  execute: (args: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<unknown>,
): Promise<ToolResult> {
  try {
    return { success: true, data: await execute(args, options) };
  } catch (error) {
    return {
      success: false,
      error: `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function documentQueryParameters(
  properties: ToolParameters['properties'],
  required: readonly string[] = [],
): ToolParameters {
  return {
    type: 'object',
    properties: {
      document_path: { type: 'string', description: 'Normalized Workspace-relative .nkc path.' },
      ...properties,
    },
    required: ['document_path', ...required],
    additionalProperties: false,
  };
}

function documentMutationParameters(
  properties: ToolParameters['properties'],
  required: readonly string[] = [],
): ToolParameters {
  return {
    type: 'object',
    properties: {
      document_path: { type: 'string', description: 'Normalized Workspace-relative .nkc path.' },
      expected_fingerprint: FINGERPRINT_PARAMETER,
      ...properties,
    },
    required: ['document_path', 'expected_fingerprint', ...required],
    additionalProperties: false,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${name} is required.`);
  return value;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return { ...value };
}

function requireFingerprint(value: unknown): ContentFingerprint {
  if (!isContentFingerprint(value)) throw new Error('expected_fingerprint is invalid.');
  return value;
}

function readPoint(value: unknown): { readonly x: number; readonly y: number } {
  const record = requireRecord(value, 'position');
  const x = record['x'];
  const y = record['y'];
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  ) {
    throw new Error('position requires finite x and y values.');
  }
  return { x, y };
}
