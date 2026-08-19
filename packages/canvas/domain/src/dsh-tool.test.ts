import { describe, expect, it } from 'vitest';

import {
  CANVAS_DSH_TOOL_NAME,
  decodeCanvasDshToolInput,
  projectCanvasCreateNodeResult,
  projectCanvasQuerySnapshot,
} from './dsh-tool';
import type {
  CanvasProjectNodeMutationResult,
  CanvasProjectSnapshot,
} from './canvas-project-authoring-service';

describe('Canvas DSH tool contract', () => {
  it('exposes exactly query and create-node with normalized nkc paths', () => {
    expect(CANVAS_DSH_TOOL_NAME).toBe('openneko.canvas');
    expect(decodeCanvasDshToolInput('query', { documentPath: 'boards/story.nkc' })).toEqual({
      operation: 'query',
      input: { documentPath: 'boards/story.nkc' },
    });
    expect(
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'abc' },
        node: { type: 'markdown', position: { x: 1, y: 2 }, data: { title: 'New' } },
      }),
    ).toEqual({
      operation: 'create-node',
      input: {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'abc' },
        node: { type: 'markdown', position: { x: 1, y: 2 }, data: { title: 'New' } },
      },
    });
    expect(() => decodeCanvasDshToolInput('update', {})).toThrow(
      /must be one of query, create-node/,
    );
  });

  it('rejects absolute, hidden, non-nkc, and stale fingerprint inputs', () => {
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
    ).toThrow(/exact content fingerprint/);
    expect(() =>
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'abc' },
        node: { position: { x: Number.NaN, y: 0 } },
      }),
    ).toThrow(/finite number/);
    expect(() =>
      decodeCanvasDshToolInput('create-node', {
        documentPath: 'boards/story.nkc',
        expectedFingerprint: { strategy: 'sha256', value: 'abc' },
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
      fingerprint: { strategy: 'sha256', value: 'fingerprint' },
      nodeCount: 1,
      connectionCount: 1,
    });
    expect(projectCanvasCreateNodeResult(mutation)).toEqual({
      documentPath: 'boards/story.nkc',
      fingerprint: { strategy: 'sha256', value: 'fingerprint' },
      nodeId: 'node-2',
      nodeType: 'markdown',
      nodePosition: { x: 10, y: 20 },
      parentId: 'node-1',
    });
    expect(projectCanvasQuerySnapshot(snapshot)).not.toHaveProperty('canvas');
    expect(projectCanvasCreateNodeResult(mutation)).not.toHaveProperty('node.data');
  });
});
