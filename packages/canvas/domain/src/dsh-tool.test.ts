import { describe, expect, it } from 'vitest';

import {
  CANVAS_DSH_TOOL_NAME,
  CANVAS_DSH_TOOL_PARAMETERS,
  decodeCanvasDshToolInput,
  projectCanvasCreateNodeResult,
  projectCanvasQuerySnapshot,
} from './dsh-tool';
import type {
  CanvasProjectNodeMutationResult,
  CanvasProjectSnapshot,
} from './canvas-project-authoring-service';

describe('Canvas DSH tool contract', () => {
  it('owns the exact model-facing query and create-node parameter schema', () => {
    expect(CANVAS_DSH_TOOL_PARAMETERS.input.oneOf).toHaveLength(2);
    expect(JSON.stringify(CANVAS_DSH_TOOL_PARAMETERS)).not.toMatch(/fingerprint/iu);
    expect(JSON.stringify(CANVAS_DSH_TOOL_PARAMETERS)).not.toContain('include');
    expect(CANVAS_DSH_TOOL_PARAMETERS.input.oneOf[0]).toMatchObject({
      title: 'query input',
      additionalProperties: false,
      properties: { documentPath: { required: true } },
    });
  });

  it('exposes exactly query and create-node with normalized nkc paths', () => {
    expect(CANVAS_DSH_TOOL_NAME).toBe('openneko_canvas');
    expect(decodeCanvasDshToolInput('query', { documentPath: 'boards/story.nkc' })).toEqual({
      operation: 'query',
      input: { documentPath: 'boards/story.nkc' },
    });
    expect(
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        node: { type: 'markdown', position: { x: 1, y: 2 }, data: { title: 'New' } },
      }),
    ).toEqual({
      operation: 'create-node',
      input: {
        documentPath: 'boards/story.nkc',
        node: { type: 'markdown', position: { x: 1, y: 2 }, data: { title: 'New' } },
      },
    });
    expect(() => decodeCanvasDshToolInput('update', {})).toThrow(
      /must be one of query, create-node/,
    );
  });

  it('rejects absolute, hidden, non-nkc, retired fingerprint, and invalid node inputs', () => {
    expect(() => decodeCanvasDshToolInput('query', { documentPath: '/abs/board.nkc' })).toThrow(
      /normalized Workspace-relative \.nkc path/,
    );
    expect(() => decodeCanvasDshToolInput('query', { documentPath: '.hidden/board.nkc' })).toThrow(
      /normalized Workspace-relative \.nkc path/,
    );
    expect(() => decodeCanvasDshToolInput('query', { documentPath: 'boards/board.json' })).toThrow(
      /normalized Workspace-relative \.nkc path/,
    );
    expect(() =>
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: '' },
        node: {},
      }),
    ).toThrow(/expectedFingerprint is not supported/);
    expect(() =>
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        node: { position: { x: Number.NaN, y: 0 } },
      }),
    ).toThrow(/finite number/);
    expect(() =>
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        node: { data: { invalid: new Date(0) } },
      }),
    ).toThrow(/plain JSON object/);
    expect(() =>
      decodeCanvasDshToolInput('query', {
        documentPath: 'boards/story.nkc',
        retiredPath: 'board.nkc',
      }),
    ).toThrow(/retiredPath is not supported/);
  });

  it('projects bounded query and mutation facts without full document bytes', () => {
    const snapshot: CanvasProjectSnapshot = {
      documentPath: 'boards/story.nkc',
      fingerprint: { strategy: 'sha256', value: 'fingerprint' },
      canvas: {
        name: 'Story',
        nodes: [
          {
            id: 'node-1',
            type: 'markdown',
            position: { x: 0, y: 0 },
            size: { width: 100, height: 50 },
            zIndex: 1,
            data: { content: 'text' },
          },
        ],
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
    const mutation: CanvasProjectNodeMutationResult = {
      ...snapshot,
      node: {
        id: 'node-2',
        type: 'markdown',
        position: { x: 10, y: 20 },
        size: { width: 100, height: 50 },
        zIndex: 2,
        parentId: 'node-1',
        data: { content: 'text' },
      },
    };

    expect(projectCanvasQuerySnapshot(snapshot)).toEqual({
      documentPath: 'boards/story.nkc',
      nodeCount: 1,
      connectionCount: 1,
    });
    expect(projectCanvasCreateNodeResult(mutation)).toEqual({
      documentPath: 'boards/story.nkc',
      nodeId: 'node-2',
      nodeType: 'markdown',
      nodePosition: { x: 10, y: 20 },
      parentId: 'node-1',
    });
    expect(projectCanvasQuerySnapshot(snapshot)).not.toHaveProperty('canvas');
    expect(projectCanvasQuerySnapshot(snapshot)).not.toHaveProperty('fingerprint');
    expect(projectCanvasCreateNodeResult(mutation)).not.toHaveProperty('node.data');
    expect(projectCanvasCreateNodeResult(mutation)).not.toHaveProperty('fingerprint');
  });
});
