import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_TARGET_ID,
  createCanvasWorkspaceBoardTarget,
  createCanvasWorkspaceContextCatalog,
  createExactCanvasTarget,
  parseCanvasWorkspaceContextCatalog,
  parseCanvasWorkspaceTurnContext,
  parseCanvasWorkspaceTurnTarget,
} from '../canvas-workspace-context';

describe('Canvas workspace context contract', () => {
  it('creates and parses the logical Board and exact Canvas targets', () => {
    expect(createCanvasWorkspaceBoardTarget('workspace-1')).toEqual({
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });
    expect(
      parseCanvasWorkspaceTurnTarget({ kind: 'workspace-board', workspaceId: 'workspace-1' }),
    ).toEqual(createCanvasWorkspaceBoardTarget('workspace-1'));
    expect(
      parseCanvasWorkspaceTurnTarget({
        kind: 'exact-canvas',
        workspaceId: 'workspace-1',
        canvasId: 'canvas-1',
      }),
    ).toEqual(createExactCanvasTarget('workspace-1', 'canvas-1'));
    expect(CANVAS_WORKSPACE_BOARD_TARGET_ID).toBe('workspace-board');
  });

  it('rejects unknown targets and extra fields', () => {
    expect(() =>
      parseCanvasWorkspaceTurnTarget({ kind: 'recent-canvas', workspaceId: 'workspace-1' }),
    ).toThrow('Unknown Canvas workspace turn target');
    expect(() =>
      parseCanvasWorkspaceTurnTarget({
        kind: 'workspace-board',
        workspaceId: 'workspace-1',
        fallback: true,
      }),
    ).toThrow("unsupported field 'fallback'");
  });

  it('builds a catalog with the logical Board as default option without file access', () => {
    const catalog = createCanvasWorkspaceContextCatalog({
      workspaceId: 'workspace-1',
      options: [
        {
          target: createCanvasWorkspaceBoardTarget('workspace-1'),
          label: 'Workspace Board',
        },
        {
          target: createExactCanvasTarget('workspace-1', 'canvas-1'),
          label: 'Canvas 1',
          index: {
            canvasId: 'canvas-1',
            name: 'Canvas 1',
            scopeKind: 'scene',
            relatedBoardCount: 0,
          },
        },
      ],
    });

    expect(catalog.defaultTarget).toEqual(createCanvasWorkspaceBoardTarget('workspace-1'));
    expect(catalog.options[0]).not.toHaveProperty('index');
    expect(parseCanvasWorkspaceContextCatalog(catalog)).toEqual(catalog);
  });

  it('does not allow a disabled or file-backed Board option', () => {
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createCanvasWorkspaceBoardTarget('workspace-1'),
            label: 'Workspace Board',
            disabled: true,
          },
        ],
      }),
    ).toThrow('Board option cannot be disabled');
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createCanvasWorkspaceBoardTarget('workspace-1'),
            label: 'Workspace Board',
            index: { name: 'Workspace Board', scopeKind: 'unknown', relatedBoardCount: 0 },
          },
        ],
      }),
    ).toThrow('Board option must not carry a file-backed index entry');
  });

  it('rejects a catalog option from another Workspace', () => {
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createCanvasWorkspaceBoardTarget('workspace-1'),
            label: 'Workspace Board',
          },
          {
            target: createExactCanvasTarget('workspace-2', 'canvas-2'),
            label: 'Foreign Canvas',
          },
        ],
      }),
    ).toThrow('catalog options must match its Workspace');
  });

  it('parses turn context with only a light summary', () => {
    const context = parseCanvasWorkspaceTurnContext({
      target: { kind: 'exact-canvas', workspaceId: 'workspace-1', canvasId: 'canvas-1' },
      summary: { canvasId: 'canvas-1', name: 'Canvas 1' },
    });
    expect(context).toEqual({
      target: { kind: 'exact-canvas', workspaceId: 'workspace-1', canvasId: 'canvas-1' },
      summary: { canvasId: 'canvas-1', name: 'Canvas 1' },
    });
    expect(Object.isFrozen(context)).toBe(true);
  });
});
