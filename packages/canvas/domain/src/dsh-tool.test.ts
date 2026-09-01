import { describe, expect, it } from 'vitest';

import {
  CANVAS_DSH_MAX_PROJECTED_NODES,
  CANVAS_DSH_MAX_TEXT_CHARS,
  CANVAS_DSH_TOOL_NAME,
  CANVAS_DSH_TOOL_OPERATIONS,
  CANVAS_DSH_TOOL_PARAMETERS,
  canvasDshCreateConnectionRequest,
  canvasDshCreateNodeSpec,
  canvasDshUpdateNodeRequest,
  decodeCanvasDshToolInput,
  projectCanvasConnectionMutationResult,
  projectCanvasNodeMutationResult,
  projectCanvasQuerySnapshot,
} from './dsh-tool';
import type {
  CanvasProjectConnectionMutationResult,
  CanvasProjectNodeMutationResult,
  CanvasProjectSnapshot,
} from './canvas-project-authoring-service';

describe('Canvas DSH tool contract', () => {
  it('exposes only bounded query and single-command apply inputs', () => {
    expect(CANVAS_DSH_TOOL_NAME).toBe('openneko_canvas');
    expect(CANVAS_DSH_TOOL_OPERATIONS).toEqual(['query', 'apply']);
    expect(CANVAS_DSH_TOOL_PARAMETERS.input.oneOf).toHaveLength(2);

    const schema = JSON.stringify(CANVAS_DSH_TOOL_PARAMETERS);
    expect(schema).not.toMatch(/fingerprint|expectedFingerprint|limit|include/iu);
    expect(schema).not.toMatch(/position|color|duration/u);
    expect(schema).not.toContain('create-node');
    expect(schema).not.toMatch(/"const":"(?:generation|job|canvas-embed)"/u);
    expect(CANVAS_DSH_TOOL_PARAMETERS.input.oneOf).toMatchObject([
      {
        title: 'query input',
        additionalProperties: false,
        properties: {
          documentPath: { required: true },
          nodeIds: { type: 'array' },
        },
      },
      {
        title: 'apply input',
        additionalProperties: false,
        properties: { documentPath: { required: true }, command: { required: true } },
      },
    ]);
  });

  it('uses underscore command names and converts them to canonical authoring requests', () => {
    expect(decodeCanvasDshToolInput('query', { documentPath: 'boards/story.nkc' })).toEqual({
      operation: 'query',
      input: { documentPath: 'boards/story.nkc' },
    });
    expect(
      decodeCanvasDshToolInput('query', {
        documentPath: 'boards/story.nkc',
        nodeIds: ['node-1', 'node-2'],
      }),
    ).toEqual({
      operation: 'query',
      input: { documentPath: 'boards/story.nkc', nodeIds: ['node-1', 'node-2'] },
    });

    const create = decodeCanvasDshToolInput('apply', {
      documentPath: 'boards/story.nkc',
      command: {
        kind: 'create_node',
        node: {
          type: 'markdown',
          content: '# Beat 1',
          title: 'Opening',
        },
      },
    });
    expect(create.operation).toBe('apply');
    if (create.operation !== 'apply' || create.input.command.kind !== 'create_node') {
      throw new Error('Expected create_node command.');
    }
    expect(canvasDshCreateNodeSpec(create.input.command)).toEqual({
      type: 'markdown',
      data: { content: '# Beat 1', title: 'Opening' },
    });

    const update = decodeCanvasDshToolInput('apply', {
      documentPath: 'boards/story.nkc',
      command: { kind: 'update_node', nodeId: 'node-1', path: '/content', value: 'Revised' },
    });
    if (update.operation !== 'apply' || update.input.command.kind !== 'update_node') {
      throw new Error('Expected update_node command.');
    }
    expect(canvasDshUpdateNodeRequest(update.input.command)).toEqual({
      nodeId: 'node-1',
      path: '/content',
      value: 'Revised',
    });

    const connect = decodeCanvasDshToolInput('apply', {
      documentPath: 'boards/story.nkc',
      command: {
        kind: 'create_connection',
        sourceId: 'node-1',
        targetId: 'node-2',
        type: 'sequence',
      },
    });
    if (connect.operation !== 'apply' || connect.input.command.kind !== 'create_connection') {
      throw new Error('Expected create_connection command.');
    }
    expect(canvasDshCreateConnectionRequest(connect.input.command)).toEqual({
      sourceId: 'node-1',
      targetId: 'node-2',
      type: 'sequence',
    });
  });

  it('rejects retired names, Host-owned fields, unsupported nodes, and arbitrary mutations', () => {
    expect(() => decodeCanvasDshToolInput('create-node', {})).toThrow(/query, apply/u);
    expect(() => decodeCanvasDshToolInput('query', { documentPath: '/abs/board.nkc' })).toThrow(
      /normalized Workspace-relative \.nkc path/u,
    );
    expect(() =>
      decodeCanvasDshToolInput('query', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'host-owned' },
      }),
    ).toThrow(/expectedFingerprint is not supported/u);
    expect(() =>
      decodeCanvasDshToolInput('apply', {
        documentPath: 'boards/story.nkc',
        command: { kind: 'create-node', node: {} },
      }),
    ).toThrow(/create_node, update_node, or create_connection/u);
    expect(() =>
      decodeCanvasDshToolInput('apply', {
        documentPath: 'boards/story.nkc',
        command: { kind: 'create_node', node: { type: 'generation' } },
      }),
    ).toThrow(/markdown, group, media, file/u);
    expect(() =>
      decodeCanvasDshToolInput('apply', {
        documentPath: 'boards/story.nkc',
        command: {
          kind: 'update_node',
          nodeId: 'node-1',
          path: '/position/x',
          value: '42',
        },
      }),
    ).toThrow(/supported Canvas targetable field/u);
    expect(() =>
      decodeCanvasDshToolInput('apply', {
        documentPath: 'boards/story.nkc',
        command: {
          kind: 'create_node',
          node: {
            type: 'media',
            mediaType: 'image',
            contentLocator: { file: { authority: 'workspace', path: '/absolute.png' } },
          },
        },
      }),
    ).toThrow(/canonical ContentLocator/u);
  });

  it('projects bounded semantic context without Host runtime fields', () => {
    const longText = 'x'.repeat(CANVAS_DSH_MAX_TEXT_CHARS + 20);
    const snapshot = createSnapshot([
      markdownNode('node-1', longText),
      mediaNode('node-2'),
      ...Array.from({ length: CANVAS_DSH_MAX_PROJECTED_NODES }, (_, index) =>
        markdownNode(`extra-${index}`, `Extra ${index}`),
      ),
    ]);
    const facts = projectCanvasQuerySnapshot(snapshot, { documentPath: snapshot.documentPath });

    expect(facts).toMatchObject({
      documentPath: 'boards/story.nkc',
      name: 'Story',
      nodeCount: CANVAS_DSH_MAX_PROJECTED_NODES + 2,
      connectionCount: 1,
      nodesTruncated: true,
      connectionsTruncated: false,
      missingNodeIds: [],
    });
    expect(facts.nodes).toHaveLength(CANVAS_DSH_MAX_PROJECTED_NODES);
    expect(facts.nodes[0]).toMatchObject({
      nodeId: 'node-1',
      nodeType: 'markdown',
      data: { content: 'x'.repeat(CANVAS_DSH_MAX_TEXT_CHARS), contentTruncated: true },
      targetableFields: ['/content', '/title'],
    });
    expect(facts.nodes[1]).toMatchObject({
      nodeId: 'node-2',
      nodeType: 'media',
      data: {
        contentLocator: { file: { authority: 'workspace', path: 'assets/frame.png' } },
        mediaType: 'image',
      },
      targetableFields: ['/title'],
    });
    expect(facts).not.toHaveProperty('canvas');
    expect(facts).not.toHaveProperty('fingerprint');
    expect(JSON.stringify(facts)).not.toMatch(/assetPath|position|size|zIndex/u);
  });

  it('supports exact one-hop query and minimal mutation receipts', () => {
    const snapshot = createSnapshot([
      markdownNode('node-1', 'One'),
      mediaNode('node-2'),
      markdownNode('node-3', 'Three'),
    ]);
    const facts = projectCanvasQuerySnapshot(snapshot, {
      documentPath: snapshot.documentPath,
      nodeIds: ['node-1', 'missing'],
    });
    expect(facts.nodes.map((node) => node.nodeId)).toEqual(['node-1', 'node-2']);
    expect(facts.connections.map((connection) => connection.connectionId)).toEqual(['conn-1']);
    expect(facts.missingNodeIds).toEqual(['missing']);

    const nodeMutation: CanvasProjectNodeMutationResult = {
      ...snapshot,
      node: markdownNode('node-4', 'Created'),
    };
    expect(projectCanvasNodeMutationResult('create_node', nodeMutation)).toEqual({
      documentPath: 'boards/story.nkc',
      command: 'create_node',
      nodeId: 'node-4',
      nodeType: 'markdown',
    });

    const connectionMutation: CanvasProjectConnectionMutationResult = {
      ...snapshot,
      connection: snapshot.canvas.connections[0]!,
    };
    expect(projectCanvasConnectionMutationResult(connectionMutation)).toEqual({
      documentPath: 'boards/story.nkc',
      command: 'create_connection',
      connectionId: 'conn-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      type: 'reference',
    });
  });
});

function createSnapshot(nodes: CanvasProjectSnapshot['canvas']['nodes']): CanvasProjectSnapshot {
  return {
    documentPath: 'boards/story.nkc',
    fingerprint: { strategy: 'sha256', value: 'fingerprint' },
    canvas: {
      name: 'Story',
      nodes,
      connections: [
        {
          id: 'conn-1',
          type: 'reference',
          sourceId: 'node-1',
          targetId: 'node-2',
          sourceEndpoint: { nodeId: 'node-1', scope: 'node' },
          targetEndpoint: { nodeId: 'node-2', scope: 'node' },
        },
      ],
    },
  };
}

function markdownNode(
  id: string,
  content: string,
): CanvasProjectSnapshot['canvas']['nodes'][number] {
  return {
    id,
    type: 'markdown',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    data: { content },
  };
}

function mediaNode(id: string): CanvasProjectSnapshot['canvas']['nodes'][number] {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    zIndex: 1,
    data: {
      assetPath: '/runtime/path.png',
      mediaType: 'image',
      contentLocator: { file: { authority: 'workspace', path: 'assets/frame.png' } },
    },
  };
}
