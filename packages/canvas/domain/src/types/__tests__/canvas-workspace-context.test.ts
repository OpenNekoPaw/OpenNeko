import { describe, expect, it } from 'vitest';
import {
  createDefaultCanvasWorkspaceTarget,
  createCanvasWorkspaceContextCatalog,
  createCanvasWorkspaceTarget,
  parseCanvasWorkspaceContextCatalog,
  parseCanvasWorkspaceTurnContext,
  parseCanvasWorkspaceTurnTarget,
} from '../canvas-workspace-context';

describe('Canvas workspace context contract', () => {
  it('creates and parses default and ordinary Canvas targets with one shape', () => {
    expect(createDefaultCanvasWorkspaceTarget('workspace-1')).toEqual({
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });
    expect(
      parseCanvasWorkspaceTurnTarget({
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/workspace.nkc',
      }),
    ).toEqual(createDefaultCanvasWorkspaceTarget('workspace-1'));
    expect(
      parseCanvasWorkspaceTurnTarget({
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/canvas-1.nkc',
      }),
    ).toEqual(createCanvasWorkspaceTarget('workspace-1', 'neko/boards/canvas-1.nkc'));
  });

  it('rejects unknown targets and extra fields', () => {
    expect(() =>
      parseCanvasWorkspaceTurnTarget({ workspaceId: 'workspace-1', canvasId: 'recent-canvas' }),
    ).toThrow('normalized Workspace-relative .nkc path');
    expect(() =>
      parseCanvasWorkspaceTurnTarget({
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/workspace.nkc',
        fallback: true,
      }),
    ).toThrow("unsupported field 'fallback'");
  });

  it('builds a catalog with the default Canvas option without file access', () => {
    const catalog = createCanvasWorkspaceContextCatalog({
      workspaceId: 'workspace-1',
      options: [
        {
          target: createDefaultCanvasWorkspaceTarget('workspace-1'),
          label: 'Workspace Board',
        },
        {
          target: createCanvasWorkspaceTarget('workspace-1', 'neko/boards/canvas-1.nkc'),
          label: 'Canvas 1',
          index: {
            canvasId: 'neko/boards/canvas-1.nkc',
            name: 'Canvas 1',
            scopeKind: 'scene',
            relatedBoardCount: 0,
          },
        },
      ],
    });

    expect(catalog.defaultTarget).toEqual(createDefaultCanvasWorkspaceTarget('workspace-1'));
    expect(catalog.options[0]).not.toHaveProperty('index');
    expect(parseCanvasWorkspaceContextCatalog(catalog)).toEqual(catalog);
  });

  it('does not allow a disabled or file-backed default Canvas option', () => {
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createDefaultCanvasWorkspaceTarget('workspace-1'),
            label: 'Workspace Board',
            disabled: true,
          },
        ],
      }),
    ).toThrow('default Canvas option cannot be disabled');
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createDefaultCanvasWorkspaceTarget('workspace-1'),
            label: 'Workspace Board',
            index: { name: 'Workspace Board', scopeKind: 'unknown', relatedBoardCount: 0 },
          },
        ],
      }),
    ).toThrow('default Canvas option must not carry a file-backed index entry');
  });

  it('rejects a catalog option from another Workspace', () => {
    expect(() =>
      createCanvasWorkspaceContextCatalog({
        workspaceId: 'workspace-1',
        options: [
          {
            target: createDefaultCanvasWorkspaceTarget('workspace-1'),
            label: 'Workspace Board',
          },
          {
            target: createCanvasWorkspaceTarget('workspace-2', 'neko/boards/canvas-2.nkc'),
            label: 'Foreign Canvas',
          },
        ],
      }),
    ).toThrow('catalog options must match its Workspace');
  });

  it('parses turn context with only a light summary', () => {
    const context = parseCanvasWorkspaceTurnContext({
      target: { workspaceId: 'workspace-1', canvasId: 'neko/boards/canvas-1.nkc' },
      summary: { canvasId: 'neko/boards/canvas-1.nkc', name: 'Canvas 1' },
    });
    expect(context).toEqual({
      target: { workspaceId: 'workspace-1', canvasId: 'neko/boards/canvas-1.nkc' },
      summary: { canvasId: 'neko/boards/canvas-1.nkc', name: 'Canvas 1' },
    });
    expect(Object.isFrozen(context)).toBe(true);
  });
});
