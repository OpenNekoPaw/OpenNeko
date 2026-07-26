import { describe, expect, it, vi } from 'vitest';
import type { CanvasPlaybackPlan, NekoCanvasAPI, Tool } from '@neko/shared';
import {
  CANVAS_CONNECTION_TYPES,
  CANVAS_NODE_TYPES,
  TOOL_NAMES_CANVAS,
  validateCanvasAuthoringCatalog,
} from '@neko/shared';
import { createNekoCanvasCapabilityProvider } from '../agentCapabilityProvider';

function createPlaybackPlan(): CanvasPlaybackPlan {
  return {
    adapterId: 'generic',
    requestedAdapterId: 'auto',
    behaviorMode: 'linear',
    advancePolicy: 'media-ended',
    entryUnitIds: ['markdown-1'],
    units: [
      {
        id: 'markdown-1',
        sourceNodeId: 'markdown-1',
        kind: 'node',
        renderMode: 'select-node',
        label: 'Draft',
      },
    ],
    transitions: [],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Canvas',
        entryUnitId: 'markdown-1',
        unitIds: ['markdown-1'],
        sourceKind: 'entry',
      },
    ],
    diagnostics: [],
    metadata: { source: 'test' },
  };
}

function createApi(): NekoCanvasAPI {
  const plan = createPlaybackPlan();
  return {
    importAsset: vi.fn(),
    authoring: {},
    boards: { project: vi.fn() },
    canvas: { create: vi.fn(), addShape: vi.fn() },
    markdown: { invoke: vi.fn() },
    playback: {
      getPlan: vi.fn(async () => plan),
      getRoutes: vi.fn(async () => plan.routeCandidates),
      revealWorkspace: vi.fn(async () => true),
      createCutDraftFromRoute: vi.fn(),
      sendRouteToCut: vi.fn(),
      reorderUnits: vi.fn(),
    },
    nodes: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      update: vi.fn(),
      create: vi.fn(async () => 'node-1'),
      derive: vi.fn(),
      createConnection: vi.fn(async (request) => ({
        connectionId: 'connection-1',
        connection: {
          id: 'connection-1',
          sourceId: request.sourceId,
          targetId: request.targetId,
          type: request.type ?? 'reference',
          sourceEndpoint: request.sourceEndpoint ?? {
            nodeId: request.sourceId,
            scope: 'node',
          },
          targetEndpoint: request.targetEndpoint ?? {
            nodeId: request.targetId,
            scope: 'node',
          },
        },
      })),
      createComposite: vi.fn(),
      updateBlock: vi.fn(),
      extractStructuredContent: vi.fn(),
      getActiveContext: vi.fn(async () => ({
        selectedNodeIds: [],
        selectedNodes: [],
        connections: [],
      })),
      applyAgentContent: vi.fn(),
      onSelectionChange: vi.fn(),
    },
    events: { onDidChangeCanvas: vi.fn() },
  } as unknown as NekoCanvasAPI;
}

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

describe('canonical Canvas Agent capability provider', () => {
  it('publishes only canonical authoring vocabulary', async () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const catalogTool = findTool(
      provider.getTools({ extensionContext: {} }),
      TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES,
    );
    const result = await catalogTool.execute({});
    if (!result.success || !result.data) throw new Error('catalog query failed');

    expect(validateCanvasAuthoringCatalog(result.data).valid).toBe(true);
    expect(result.data).toMatchObject({
      nodeTypes: CANVAS_NODE_TYPES.map((type) => expect.objectContaining({ type })),
      connections: CANVAS_CONNECTION_TYPES.map((type) => expect.objectContaining({ type })),
      containers: [expect.objectContaining({ id: 'group', layoutModes: ['manual'] })],
    });
    expect(result.data).not.toMatchObject({
      presets: expect.arrayContaining([expect.objectContaining({ nodeType: 'job' })]),
    });
    expect(result.data).not.toHaveProperty('fieldProfiles');
    expect(result.data).not.toHaveProperty('semanticPrompts');
  });

  it('registers canonical tools and no retired domain tools', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const names = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
        TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE,
        TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
        TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT,
        TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        'canvas.createStoryboardFromMarkdown',
        'canvas.validateMarkdownStoryboard',
        'canvas_narrative_traverse',
        'canvas_get_storyboard_execution_summary',
        'export_storyboard',
        'import_script_to_canvas',
      ]),
    );
  });

  it('registers only canonical approval-gated Markdown lifecycle capabilities', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const facets = provider.getArtifactFacets?.({ extensionContext: {} });
    if (!facets) throw new Error('Canvas artifact facets are unavailable');
    const lifecycleCapabilities = facets.lifecycleCapabilities;

    expect(lifecycleCapabilities).toEqual([
      expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        phases: ['apply'],
        requiresApproval: true,
      }),
      expect.objectContaining({
        capabilityId: 'canvas.createMarkdownNote',
        phases: ['apply'],
        requiresApproval: true,
      }),
    ]);
    expect(JSON.stringify(lifecycleCapabilities)).not.toContain('Storyboard');
    expect(JSON.stringify(lifecycleCapabilities)).not.toContain('Scene');
    expect(JSON.stringify(lifecycleCapabilities)).not.toContain('Shot');
  });

  it('creates an authorable canonical node', async () => {
    const api = createApi();
    const createTool = findTool(
      createNekoCanvasCapabilityProvider(api).getTools({ extensionContext: {} }),
      TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
    );

    await expect(
      createTool.execute({ type: 'markdown', x: 10, y: 20, data: { content: '# Draft' } }),
    ).resolves.toMatchObject({ success: true, data: 'node-1' });
    expect(api.nodes.create).toHaveBeenCalledWith(
      'markdown',
      { x: 10, y: 20 },
      { content: '# Draft' },
    );
  });

  it('rejects Job and legacy node types before calling the Canvas API', async () => {
    const api = createApi();
    const createTool = findTool(
      createNekoCanvasCapabilityProvider(api).getTools({ extensionContext: {} }),
      TOOL_NAMES_CANVAS.CANVAS_CREATE_NODE,
    );

    for (const type of ['job', 'scene', 'shot']) {
      await expect(createTool.execute({ type, data: {} })).resolves.toMatchObject({
        success: false,
        error: expect.stringMatching(
          type === 'job' ? /owner projections/ : /Unsupported Canvas node type/,
        ),
      });
    }
    expect(api.nodes.create).not.toHaveBeenCalled();
  });

  it('rejects Job through derive and composite authoring paths', async () => {
    const api = createApi();
    const tools = createNekoCanvasCapabilityProvider(api).getTools({ extensionContext: {} });
    const deriveTool = findTool(tools, TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE);
    const compositeTool = findTool(tools, TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE);

    await expect(
      deriveTool.execute({ sourceNodeId: 'markdown-1', targetType: 'job' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('owner projections'),
    });
    await expect(
      compositeTool.execute({ children: [{ type: 'job', data: {} }] }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('owner projections'),
    });
    expect(api.nodes.derive).not.toHaveBeenCalled();
    expect(api.nodes.createComposite).not.toHaveBeenCalled();
  });

  it('creates only canonical connection types', async () => {
    const api = createApi();
    const connectionTool = findTool(
      createNekoCanvasCapabilityProvider(api).getTools({ extensionContext: {} }),
      TOOL_NAMES_CANVAS.CANVAS_CREATE_CONNECTION,
    );

    await expect(
      connectionTool.execute({
        sourceId: 'markdown-1',
        targetId: 'job-1',
        type: 'derived-from',
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      connectionTool.execute({
        sourceId: 'markdown-1',
        targetId: 'job-1',
        type: 'choice',
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Unsupported Canvas connection type'),
    });
    expect(api.nodes.createConnection).toHaveBeenCalledTimes(1);
  });

  it('describes the canonical model in localized prompt fragments', () => {
    const provider = createNekoCanvasCapabilityProvider(createApi());
    const fragment = provider.getPromptFragments?.({ extensionContext: {} })[0];

    expect(fragment?.content).toContain('markdown, media, group, job, file, and canvas-embed');
    expect(fragment?.content).toContain('must not create or derive them');
    expect(fragment?.content).toContain('are not Canvas node types');
    expect(fragment?.locales?.zh?.content).toContain('Canvas 只有六类节点');
  });
});
