import { describe, expect, it } from 'vitest';
import {
  projectWorkspaceCanvasTurnTarget,
  shouldResetWorkspaceCanvasSelection,
} from './ChatWorkspace';
import type { AgentComposerCanvasPresentation } from './ComposerWorkspaceContext';

describe('shouldResetWorkspaceCanvasSelection', () => {
  it('preserves selection on initial mount for the same workspace identity', () => {
    expect(shouldResetWorkspaceCanvasSelection(undefined, 'workspace-1')).toBe(false);
    expect(shouldResetWorkspaceCanvasSelection('workspace-1', 'workspace-1')).toBe(false);
  });

  it('resets only when a real workspace identity change occurs', () => {
    expect(shouldResetWorkspaceCanvasSelection('workspace-1', 'workspace-2')).toBe(true);
    expect(shouldResetWorkspaceCanvasSelection('workspace-1', undefined)).toBe(false);
  });
});

describe('projectWorkspaceCanvasTurnTarget', () => {
  const board = {
    kind: 'workspace-board' as const,
    workspaceId: 'workspace-1',
  };

  it('projects the logical Board as an explicit canonical target', () => {
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'workspace-board',
      loading: false,
      options: [{ id: 'workspace-board', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    expect(projectWorkspaceCanvasTurnTarget(canvas)).toEqual({
      workspaceId: 'workspace-1',
      target: board,
    });
  });

  it('projects the selected exact Canvas target with summary', () => {
    const exact = {
      kind: 'exact-canvas' as const,
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/a.nkc',
    };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'exact-a',
      loading: false,
      options: [
        { id: 'workspace-board', label: 'Workspace Board', target: board },
        {
          id: 'exact-a',
          label: 'A',
          target: exact,
          summary: { canvasId: exact.canvasId, name: 'A' },
        },
      ],
      onSelect: async () => undefined,
    };
    expect(projectWorkspaceCanvasTurnTarget(canvas)).toEqual({
      workspaceId: 'workspace-1',
      target: exact,
      summary: { canvasId: exact.canvasId, name: 'A' },
    });
  });

  it('keeps Board sendable during loading or catalog-level diagnostic', () => {
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'workspace-board',
      loading: true,
      options: [{ id: 'workspace-board', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    expect(projectWorkspaceCanvasTurnTarget(canvas)).toEqual({
      workspaceId: 'workspace-1',
      target: board,
    });
    expect(
      projectWorkspaceCanvasTurnTarget({ ...canvas, loading: false, diagnostic: 'catalog failed' }),
    ).toEqual({
      workspaceId: 'workspace-1',
      target: board,
    });
  });

  it('blocks unknown selectedId instead of falling back to Board', () => {
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'missing',
      loading: false,
      options: [{ id: 'workspace-board', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    expect(() => projectWorkspaceCanvasTurnTarget(canvas)).toThrow('unavailable');
  });

  it('blocks missing summary or catalog diagnostics without falling back to Board', () => {
    const exact = {
      kind: 'exact-canvas' as const,
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/a.nkc',
    };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'exact-a',
      loading: false,
      options: [{ id: 'exact-a', label: 'A', target: exact }],
      onSelect: async () => undefined,
    };
    expect(() => projectWorkspaceCanvasTurnTarget(canvas)).toThrow('light summary');
    expect(() =>
      projectWorkspaceCanvasTurnTarget({
        ...canvas,
        diagnostic: 'bad catalog',
      }),
    ).toThrow('bad catalog');
  });
});
