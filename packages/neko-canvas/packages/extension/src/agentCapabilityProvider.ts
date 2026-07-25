import type {
  AgentArtifactFacetsContribution,
  AgentCapabilityContext,
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityProvider,
  CanvasAuthoringCatalog,
  CanvasAuthoringCatalogSection,
  CanvasConnection,
  CanvasConnectionEndpoint,
  CanvasNodeType,
  JsonPointerPath,
  NekoCanvasAPI,
  PromptFragment,
  Tool,
  ToolParameters,
} from '@neko/shared';
import {
  CANVAS_AUTHORING_CATALOG_SECTIONS,
  CANVAS_AUTHORING_CATALOG_VERSION,
  CANVAS_CONNECTION_TYPES,
  CANVAS_NODE_TYPES,
  TOOL_NAMES_CANVAS,
  isCanvasAuthoringCatalogSection,
  isCanvasConnectionType,
  isCanvasNodeType,
} from '@neko/shared';
const NODE_TYPE_LABELS: Readonly<Record<CanvasNodeType, { en: string; zhCN: string }>> = {
  markdown: { en: 'Markdown', zhCN: 'Markdown' },
  media: { en: 'Media', zhCN: '媒体' },
  group: { en: 'Group', zhCN: '分组' },
  job: { en: 'JobCard', zhCN: 'JobCard' },
  file: { en: 'File', zhCN: '文件' },
  'canvas-embed': { en: 'Subcanvas', zhCN: '子画布' },
};

const AGENT_AUTHORABLE_NODE_TYPES = [
  'markdown',
  'media',
  'group',
  'file',
  'canvas-embed',
] as const satisfies readonly CanvasNodeType[];

const CANONICAL_NODE_PRESETS = [
  { id: 'content.markdown', nodeType: 'markdown' },
  { id: 'content.image', nodeType: 'media' },
  { id: 'content.audio', nodeType: 'media' },
  { id: 'content.video', nodeType: 'media' },
  { id: 'content.group', nodeType: 'group' },
  { id: 'references.file', nodeType: 'file' },
  { id: 'references.canvas', nodeType: 'canvas-embed' },
] as const;

const CANONICAL_MARKDOWN_LIFECYCLE_DESCRIPTORS = [
  {
    capabilityId: 'canvas.ingestMarkdown',
    providerId: 'neko-canvas',
    displayName: 'Ingest Markdown to Canvas',
    description: 'Create or update canonical Canvas Markdown content.',
    phases: ['apply'],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts: ['Markdown', 'GfmTable'],
    produces: ['canvas-node-ref'],
    risk: 'medium',
    requiresApproval: true,
    safetyKind: 'confirmation-gated',
  },
  {
    capabilityId: 'canvas.createMarkdownNote',
    providerId: 'neko-canvas',
    displayName: 'Create Markdown Note',
    description: 'Create one canonical Canvas Markdown node.',
    phases: ['apply'],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts: ['Markdown'],
    produces: ['canvas-node-ref'],
    risk: 'medium',
    requiresApproval: true,
    safetyKind: 'confirmation-gated',
  },
] as const satisfies readonly AgentCapabilityLifecycleDescriptor[];

export interface NekoCanvasCapabilityProvider extends AgentCapabilityProvider {}

export function createNekoCanvasCapabilityProvider(
  api: NekoCanvasAPI,
): NekoCanvasCapabilityProvider {
  return new NekoCanvasCapabilityProviderImpl(api);
}

class NekoCanvasCapabilityProviderImpl implements NekoCanvasCapabilityProvider {
  readonly id = 'neko-canvas';
  readonly version = '1.0.0';
  readonly protocolVersion = '1.0' as const;
  readonly trustLevel = 'core' as const;
  readonly hostRequirements = ['vscode'] as const;
  constructor(private readonly api: NekoCanvasAPI) {}

  getArtifactFacets(_context: AgentCapabilityContext): AgentArtifactFacetsContribution {
    return {
      renderers: [
        {
          id: 'renderer:neko-canvas:generic-artifact-preview',
          accepts: ['Markdown', 'ResourceRef', 'CanvasPlaybackPlan'],
          profiles: ['canvas-canonical-content'],
          lazy: true,
        },
      ],
      projectors: [
        {
          id: 'projector:canvas-playback-route-card',
          accepts: ['CanvasPlaybackPlan'],
          produces: ['CompositeArtifact'],
          profiles: ['canvas-playback-route'],
          lazy: true,
        },
      ],
      capabilities: [
        {
          capabilityId: 'canvas.authoring',
          packageId: 'neko-canvas',
          accepts: ['CanvasAuthoringIntent', 'Markdown', 'ResourceRef', 'Prompt'],
          produces: ['canvas-node-ref', 'canvas-connection-ref'],
          actions: [
            TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
            TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
            TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
            TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
            TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
            TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
            TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
          ],
          risk: 'medium',
          requiresApproval: true,
        },
        {
          capabilityId: 'canvas.playback',
          packageId: 'neko-canvas',
          accepts: ['CanvasDocumentRef'],
          produces: ['CanvasPlaybackPlan'],
          actions: [
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
            TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
            TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
          ],
          risk: 'low',
          requiresApproval: false,
        },
      ],
      lifecycleCapabilities: CANONICAL_MARKDOWN_LIFECYCLE_DESCRIPTORS,
    };
  }

  getPromptFragments(_context: AgentCapabilityContext): PromptFragment[] {
    return [
      {
        id: 'neko-canvas:canonical-authoring',
        priority: 72,
        content: [
          '## Canvas Authoring',
          '',
          '- Canvas has six node types: markdown, media, group, job, file, and canvas-embed.',
          '- Use media.data.mediaType to distinguish image, audio, and video.',
          '- Group is the only container. Use sequence, reference, or derived-from connections.',
          '- JobCard nodes are read-only projections published by the owning Job service; generic Canvas authoring tools must not create or derive them.',
          '- Query the active context before mutating a selected node or Group.',
          '- Storyboard, Scene, Shot, Narrative, Entity, Memory, and Character are not Canvas node types.',
        ].join('\n'),
        locales: {
          zh: {
            content: [
              '## Canvas 创作',
              '',
              '- Canvas 只有六类节点：markdown、media、group、job、file、canvas-embed。',
              '- 图片、音频和视频统一使用 media，并通过 data.mediaType 区分。',
              '- Group 是唯一容器；连接仅使用 sequence、reference、derived-from。',
              '- JobCard 是 owning Job service 发布的只读投影；通用 Canvas 创作工具不得创建或派生 JobCard。',
              '- 修改选中节点或 Group 前先查询当前画布上下文。',
              '- Storyboard、Scene、Shot、Narrative、Entity、Memory 和 Character 都不是 Canvas 节点类型。',
            ].join('\n'),
          },
        },
      },
    ];
  }

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      this.createCatalogTool(),
      ...this.createPlaybackTools(),
      ...this.createNodeTools(),
      ...this.createConnectionTools(),
    ];
  }

  private createCatalogTool(): Tool {
    return {
      name: TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
      description:
        'Read the canonical Canvas authoring catalog for node types, catalog entries, Group containment, connections, and operations.',
      localization: {
        zh: { description: '读取 canonical Canvas 创作能力目录。' },
      },
      category: 'project',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      traits: readOnlyTraits(),
      parameters: {
        type: 'object',
        properties: {
          version: { type: 'number', enum: [CANVAS_AUTHORING_CATALOG_VERSION] },
          sections: {
            type: 'array',
            items: { type: 'string', enum: [...CANVAS_AUTHORING_CATALOG_SECTIONS] },
          },
        },
      },
      execute: async (args) => {
        try {
          return { success: true, data: createCanonicalCatalog(args) };
        } catch (error) {
          return failedToolResult('describe Canvas authoring capabilities', error);
        }
      },
    };
  }

  private createPlaybackTools(): Tool[] {
    return [
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
        'Read the generic Markdown and Media playback plan for a Canvas.',
        {
          type: 'object',
          properties: { sourceCanvasUri: { type: 'string' } },
        },
        async (args) => this.api.playback.getPlan(readOptionalString(args.sourceCanvasUri)),
      ),
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
        'Read generic Canvas playback routes.',
        {
          type: 'object',
          properties: { sourceCanvasUri: { type: 'string' } },
        },
        async (args) => this.api.playback.getRoutes(readOptionalString(args.sourceCanvasUri)),
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
        'Reveal the generic Canvas playback workspace.',
        {
          type: 'object',
          properties: {
            sourceCanvasUri: { type: 'string' },
            routeId: { type: 'string' },
          },
        },
        async (args) =>
          this.api.playback.revealWorkspace({
            sourceCanvasUri: readOptionalString(args.sourceCanvasUri),
            routeId: readOptionalString(args.routeId),
          }),
        ['sourceCanvasUri'],
      ),
    ];
  }

  private createNodeTools(): Tool[] {
    return [
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
        'List nodes on the active Canvas, optionally filtered by canonical node type.',
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...CANVAS_NODE_TYPES] },
          },
        },
        async (args) => this.api.nodes.list(readOptionalNodeType(args.type)),
      ),
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
        'Read a Canvas node by stable node id.',
        {
          type: 'object',
          properties: { nodeId: { type: 'string' } },
          required: ['nodeId'],
        },
        async (args) => this.api.nodes.get(readRequiredString(args.nodeId, 'nodeId')),
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE,
        'Update data fields on a canonical Canvas node.',
        {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            data: { type: 'object' },
          },
          required: ['nodeId', 'data'],
        },
        async (args) =>
          this.api.nodes.update(
            readRequiredString(args.nodeId, 'nodeId'),
            readRecord(args.data, 'node data'),
          ),
        ['nodeId'],
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
        'Create one authorable Canvas node. JobCard is owner-projected and cannot be created here.',
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...AGENT_AUTHORABLE_NODE_TYPES] },
            x: { type: 'number' },
            y: { type: 'number' },
            data: { type: 'object' },
          },
          required: ['type', 'data'],
        },
        async (args) =>
          this.api.nodes.create(
            readRequiredAuthorableNodeType(args.type),
            { x: readOptionalNumber(args.x) ?? 0, y: readOptionalNumber(args.y) ?? 0 },
            readRecord(args.data, 'node data'),
          ),
        ['type'],
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE,
        'Create an authorable successor node and optionally connect it with derived-from.',
        {
          type: 'object',
          properties: {
            sourceNodeId: { type: 'string' },
            targetType: { type: 'string', enum: [...AGENT_AUTHORABLE_NODE_TYPES] },
            data: { type: 'object' },
            connect: { type: 'boolean' },
          },
          required: ['sourceNodeId'],
        },
        async (args) =>
          this.api.nodes.derive({
            sourceNodeId: readRequiredString(args.sourceNodeId, 'sourceNodeId'),
            targetType: readOptionalAuthorableNodeType(args.targetType),
            data: readOptionalRecord(args.data),
            connect: readOptionalBoolean(args.connect),
          }),
        ['sourceNodeId'],
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
        'Create a Group and its canonical child nodes as one mutation.',
        {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            data: { type: 'object' },
            children: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: [...AGENT_AUTHORABLE_NODE_TYPES] },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  data: { type: 'object' },
                },
                required: ['type'],
              },
            },
            autoLayout: { type: 'boolean' },
          },
          required: ['children'],
        },
        async (args) =>
          this.api.nodes.createComposite({
            containerType: 'group',
            position: { x: readOptionalNumber(args.x) ?? 0, y: readOptionalNumber(args.y) ?? 0 },
            data: readOptionalRecord(args.data),
            children: readArray(args.children, 'children').map((value, index) => {
              const child = readRecord(value, `child ${index}`);
              return {
                type: readRequiredAuthorableNodeType(child.type),
                position: {
                  x: readOptionalNumber(child.x) ?? 0,
                  y: readOptionalNumber(child.y) ?? 0,
                },
                data: readOptionalRecord(child.data),
              };
            }),
            autoLayout: readOptionalBoolean(args.autoLayout),
          }),
        ['children'],
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
        'Update one Canvas node data value through an explicit JSON Pointer.',
        {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            path: { type: 'string' },
            value: {},
          },
          required: ['nodeId', 'path', 'value'],
        },
        async (args) =>
          this.api.nodes.updateBlock({
            nodeId: readRequiredString(args.nodeId, 'nodeId'),
            path: readJsonPointer(args.path),
            value: args.value,
          }),
        ['nodeId'],
      ),
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
        'Extract canonical Canvas content as JSON, Markdown, or prompt text.',
        {
          type: 'object',
          properties: {
            nodeIds: { type: 'array', items: { type: 'string' } },
            format: { type: 'string', enum: ['json', 'markdown', 'prompt'] },
            includeChildren: { type: 'boolean' },
          },
          required: ['format'],
        },
        async (args) =>
          this.api.nodes.extractStructuredContent({
            nodeIds: readOptionalStringArray(args.nodeIds),
            format: readStructuredContentFormat(args.format),
            includeChildren: readOptionalBoolean(args.includeChildren),
          }),
      ),
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
        'Read the active Canvas selection, insertion point, viewport, Group, and connections.',
        {
          type: 'object',
          properties: {
            includeSelection: { type: 'boolean' },
            includeFocusedContainer: { type: 'boolean' },
            includeNodeDetails: { type: 'boolean' },
          },
        },
        async (args) =>
          this.api.nodes.getActiveContext({
            includeSelection: readOptionalBoolean(args.includeSelection),
            includeFocusedContainer: readOptionalBoolean(args.includeFocusedContainer),
            includeNodeDetails: readOptionalBoolean(args.includeNodeDetails),
          }),
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
        'Apply or append Markdown content to a canonical Markdown node.',
        {
          type: 'object',
          properties: {
            text: { type: 'string' },
            title: { type: 'string' },
            nodeId: { type: 'string' },
            containerId: { type: 'string' },
            mode: { type: 'string', enum: ['insert', 'append', 'replace', 'create-child'] },
          },
          required: ['text'],
        },
        async (args) =>
          this.api.nodes.applyAgentContent({
            kind: 'text',
            format: 'markdown',
            text: readRequiredString(args.text, 'text'),
            title: readOptionalString(args.title),
            target: {
              nodeId: readOptionalString(args.nodeId),
              containerId: readOptionalString(args.containerId),
              mode: readAgentMutationMode(args.mode),
            },
            provenance: { source: 'agent' },
          }),
        ['nodeId', 'containerId'],
      ),
    ];
  }

  private createConnectionTools(): Tool[] {
    return [
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
        'List sequence, reference, and derived-from connections.',
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...CANVAS_CONNECTION_TYPES] },
            sourceId: { type: 'string' },
            targetId: { type: 'string' },
          },
        },
        async (args) => {
          const type = readOptionalConnectionType(args.type);
          const sourceId = readOptionalString(args.sourceId);
          const targetId = readOptionalString(args.targetId);
          const activeContext = await this.api.nodes.getActiveContext({
            includeNodeDetails: false,
          });
          return (activeContext.connections ?? []).filter((connection) => {
            if (type && connection.type !== type) return false;
            if (sourceId && connection.sourceId !== sourceId) return false;
            if (targetId && connection.targetId !== targetId) return false;
            return true;
          });
        },
      ),
      readTool(
        TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
        'Read one Canvas connection by stable id.',
        {
          type: 'object',
          properties: { connectionId: { type: 'string' } },
          required: ['connectionId'],
        },
        async (args) => {
          const connectionId = readRequiredString(args.connectionId, 'connectionId');
          const activeContext = await this.api.nodes.getActiveContext({
            includeNodeDetails: false,
          });
          const connection = activeContext.connections?.find((item) => item.id === connectionId);
          if (!connection) {
            throw new Error(`Canvas connection "${connectionId}" was not found`);
          }
          return connection;
        },
      ),
      mutationTool(
        TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
        'Create a sequence, reference, or derived-from connection.',
        {
          type: 'object',
          properties: {
            sourceId: { type: 'string' },
            targetId: { type: 'string' },
            type: { type: 'string', enum: [...CANVAS_CONNECTION_TYPES] },
            label: { type: 'string' },
            sourcePortId: { type: 'string' },
            targetPortId: { type: 'string' },
          },
          required: ['sourceId', 'targetId', 'type'],
        },
        async (args) => {
          const sourceId = readRequiredString(args.sourceId, 'sourceId');
          const targetId = readRequiredString(args.targetId, 'targetId');
          return this.api.nodes.createConnection({
            sourceId,
            targetId,
            type: readRequiredConnectionType(args.type),
            label: readOptionalString(args.label),
            sourceEndpoint: createEndpoint(sourceId, readOptionalString(args.sourcePortId)),
            targetEndpoint: createEndpoint(targetId, readOptionalString(args.targetPortId)),
          });
        },
        ['sourceId', 'targetId'],
      ),
    ];
  }
}

function createCanonicalCatalog(args: Record<string, unknown>): CanvasAuthoringCatalog {
  const version = args.version;
  if (version !== undefined && version !== CANVAS_AUTHORING_CATALOG_VERSION) {
    throw new Error(`Unsupported Canvas authoring catalog version "${String(version)}"`);
  }
  const sections = readCatalogSections(args.sections);
  const includes = (section: CanvasAuthoringCatalogSection): boolean => sections.includes(section);
  return {
    version: CANVAS_AUTHORING_CATALOG_VERSION,
    sections,
    ...(includes('nodeTypes')
      ? {
          nodeTypes: CANVAS_NODE_TYPES.map((type) => ({
            type,
            label: {
              default: NODE_TYPE_LABELS[type].en,
              zhCN: NODE_TYPE_LABELS[type].zhCN,
            },
          })),
        }
      : {}),
    ...(includes('presets')
      ? {
          presets: CANONICAL_NODE_PRESETS.map((entry) => ({
            id: entry.id,
            nodeType: entry.nodeType,
          })),
        }
      : {}),
    ...(includes('containers')
      ? {
          containers: [
            {
              id: 'group',
              acceptedChildNodeTypes: [...CANVAS_NODE_TYPES],
              layoutModes: ['manual'],
            },
          ],
        }
      : {}),
    ...(includes('connections')
      ? {
          connections: CANVAS_CONNECTION_TYPES.map((type) => ({
            type,
            sourceEndpointScopes: ['node', 'port'],
            targetEndpointScopes: ['node', 'port'],
          })),
        }
      : {}),
    ...(includes('operations')
      ? {
          operations: canonicalOperations(),
        }
      : {}),
    ...(includes('resourcePolicies')
      ? {
          resourcePolicies: [
            {
              id: 'durable-resource-ref',
              stableRefKinds: ['workspace-file', 'generated-asset', 'external-uri'],
              rejectedRuntimeKinds: ['blob', 'vscode-webview'],
            },
          ],
        }
      : {}),
    ...(includes('recipes')
      ? {
          recipes: [
            {
              id: 'markdown-with-media',
              summary: 'Create Markdown and Media nodes, then connect them by reference.',
              preferredTools: [
                TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
                TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
              ],
              requiredQueries: [TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT],
            },
            {
              id: 'group-content',
              summary: 'Create one Group with canonical child nodes.',
              preferredTools: [TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE],
              requiredQueries: [TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT],
            },
          ],
        }
      : {}),
    diagnostics: [],
  };
}

function canonicalOperations(): CanvasAuthoringCatalog['operations'] {
  const readOnly = [
    TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
    TOOL_NAMES_CANVAS.CANVAS_LIST_NODES,
    TOOL_NAMES_CANVAS.CANVAS_GET_NODE,
    TOOL_NAMES_CANVAS.CANVAS_LIST_CONNECTIONS,
    TOOL_NAMES_CANVAS.CANVAS_GET_CONNECTION,
    TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT,
    TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
    TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES,
  ];
  const mutation = [
    TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
    TOOL_NAMES_CANVAS.CANVAS_UPDATE_NODE,
    TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE,
    TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
    TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK,
    TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
    TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
    TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
  ];
  return [
    ...readOnly.map((toolName) => ({
      id: toolName,
      kind: 'query' as const,
      risk: 'read-only' as const,
      status: 'available' as const,
      toolName,
      requiresConfirmation: false,
    })),
    ...mutation.map((toolName) => ({
      id: toolName,
      kind: 'mutation' as const,
      risk: 'medium' as const,
      status: 'available' as const,
      toolName,
      requiresConfirmation: true,
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      ],
    })),
  ];
}

function readCatalogSections(value: unknown): CanvasAuthoringCatalogSection[] {
  if (value === undefined) {
    return [...CANVAS_AUTHORING_CATALOG_SECTIONS];
  }
  return readArray(value, 'catalog sections').map((section) => {
    if (!isCanvasAuthoringCatalogSection(section)) {
      throw new Error(`Unsupported Canvas authoring catalog section "${String(section)}"`);
    }
    return section;
  });
}

function readTool(
  name: string,
  description: string,
  parameters: ToolParameters,
  execute: (args: Record<string, unknown>) => Promise<unknown>,
): Tool {
  return {
    name,
    description,
    category: 'project',
    parameters,
    isReadOnly: true,
    isConcurrencySafe: true,
    safetyKind: 'read-only-query',
    traits: readOnlyTraits(),
    async execute(args) {
      try {
        return { success: true, data: await execute(args) };
      } catch (error) {
        return failedToolResult(name, error);
      }
    },
  };
}

function mutationTool(
  name: string,
  description: string,
  parameters: ToolParameters,
  execute: (args: Record<string, unknown>) => Promise<unknown>,
  targetAlternatives: readonly string[],
): Tool {
  return {
    name,
    description,
    category: 'project',
    parameters,
    requiresConfirmation: true,
    safetyKind: 'confirmation-gated',
    traits: mutationTraits(),
    targetRequirements: {
      required: targetAlternatives,
      allowedFallbacks: ['explicit-user-input'],
      confirmationModes: ['apply'],
    },
    queryBeforeMutate: {
      preferredQueryTools: [
        TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
        TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT,
      ],
      reason: 'Resolve canonical Canvas targets and constraints before mutation.',
    },
    async execute(args) {
      try {
        return { success: true, data: await execute(args) };
      } catch (error) {
        return failedToolResult(name, error);
      }
    },
  };
}

function readOnlyTraits() {
  return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'none' } as const;
}

function mutationTraits() {
  return { cost: 'free', reversible: true, locality: 'local', impactLevel: 'low' } as const;
}

function failedToolResult(operation: string, error: unknown) {
  return {
    success: false,
    error: `Failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

function createEndpoint(nodeId: string, portId: string | undefined): CanvasConnectionEndpoint {
  return portId ? { nodeId, scope: 'port', portId } : { nodeId, scope: 'node' };
}

function readRequiredAuthorableNodeType(value: unknown): CanvasNodeType {
  const type = readOptionalAuthorableNodeType(value);
  if (!type) throw new Error('Canvas node type is required');
  return type;
}

function readOptionalAuthorableNodeType(value: unknown): CanvasNodeType | undefined {
  const type = readOptionalNodeType(value);
  if (type === 'job') {
    throw new Error('Canvas Job nodes are owner projections and cannot be authored directly');
  }
  return type;
}

function readOptionalNodeType(value: unknown): CanvasNodeType | undefined {
  if (value === undefined) return undefined;
  if (!isCanvasNodeType(value)) {
    throw new Error(`Unsupported Canvas node type "${String(value)}"`);
  }
  return value;
}

function readRequiredConnectionType(value: unknown): CanvasConnection['type'] {
  const type = readOptionalConnectionType(value);
  if (!type) throw new Error('Canvas connection type is required');
  return type;
}

function readOptionalConnectionType(value: unknown): CanvasConnection['type'] | undefined {
  if (value === undefined) return undefined;
  if (!isCanvasConnectionType(value)) {
    throw new Error(`Unsupported Canvas connection type "${String(value)}"`);
  }
  return value;
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Canvas ${label} is required`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('Expected a string');
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return readArray(value, 'string array').map((item) => readRequiredString(item, 'array item'));
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expected a finite number');
  }
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error('Expected a boolean');
  return value;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Canvas ${label} must be an object`);
  return value;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value === undefined ? undefined : readRecord(value, 'data');
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Canvas ${label} must be an array`);
  return value;
}

function readJsonPointer(value: unknown): JsonPointerPath {
  const path = readRequiredString(value, 'JSON Pointer path');
  if (!path.startsWith('/')) throw new Error(`Invalid Canvas JSON Pointer "${path}"`);
  return path as JsonPointerPath;
}

function readStructuredContentFormat(value: unknown): 'json' | 'markdown' | 'prompt' {
  if (value === 'json' || value === 'markdown' || value === 'prompt') return value;
  throw new Error(`Unsupported Canvas structured content format "${String(value)}"`);
}

function readAgentMutationMode(
  value: unknown,
): 'insert' | 'append' | 'replace' | 'create-child' | undefined {
  if (value === undefined) return undefined;
  if (value === 'insert' || value === 'append' || value === 'replace' || value === 'create-child') {
    return value;
  }
  throw new Error(`Unsupported Canvas Agent mutation mode "${String(value)}"`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
