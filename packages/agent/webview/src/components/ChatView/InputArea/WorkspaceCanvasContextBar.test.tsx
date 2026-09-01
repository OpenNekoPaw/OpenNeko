import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentComposerCanvasPresentation } from '../../ComposerWorkspaceContext';
import { I18nProvider } from '../../../i18n/I18nContext';
import { WorkspaceCanvasContextBar } from './WorkspaceCanvasContextBar';

const translations: Record<string, string> = {
  'chat.input.workspaceCanvas.board': 'Workspace Board',
  'chat.input.workspaceCanvas.label': 'Workspace Canvas',
  'chat.input.workspaceCanvas.canvasIndex': 'Canvas index',
};

function renderBar(canvas?: AgentComposerCanvasPresentation) {
  const view = render(
    <I18nProvider
      service={
        {
          locale: 'en',
          t: (key: string) => translations[key] ?? key,
          onLocaleChange: () => () => undefined,
          setLocale: () => undefined,
        } as never
      }
    >
      <WorkspaceCanvasContextBar workspaceLabel="Workspace" canvas={canvas} />
    </I18nProvider>,
  );
  return { ...view, container: view.container as HTMLElement };
}

describe('WorkspaceCanvasContextBar', () => {
  it('keeps the Workspace rail full-width while only its selector fits content', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const matchingRailRule = css.match(
      /\.agent-entry-binding-bar,\s*\.agent-workspace-canvas-context-bar\s*\{([^}]*)\}/u,
    )?.[1];
    const workspaceRule = css.match(/\.agent-workspace-canvas-context-bar\s*\{([^}]*)\}/u)?.[1];
    const selectControlRule = css.match(
      /\.agent-workspace-canvas-select-control\s*\{([^}]*)\}/u,
    )?.[1];
    expect(matchingRailRule).toContain('width: calc(100% - 24px)');
    expect(matchingRailRule).toContain('border-radius: 12px');
    expect(matchingRailRule).toContain('border: 0');
    expect(matchingRailRule).toContain(
      'background: color-mix(in srgb, var(--agent-fg) 4%, var(--agent-composer-rail-bg))',
    );
    expect(matchingRailRule).toContain(
      'box-shadow: 0 8px 18px color-mix(in srgb, var(--agent-fg) 7%, transparent)',
    );
    expect(workspaceRule).not.toContain('width: fit-content');
    expect(selectControlRule).toContain('width: fit-content');
  });

  it('matches the Entry rail styling without sharing its functional class', () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-workspace-canvas-context="true"]');

    expect(bar?.className).toBe('agent-workspace-canvas-context-bar');
    expect(bar?.classList.contains('agent-entry-binding-bar')).toBe(false);
  });

  it('does not claim Board when the selected Canvas id is unknown', () => {
    const board = { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'neko/boards/missing.nkc',
      loading: false,
      options: [{ id: 'neko/boards/workspace.nkc', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    renderBar(canvas);
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('neko/boards/missing.nkc');
    expect(select.title).toBe('chat.input.workspaceCanvas.unavailable');
    expect(select.selectedOptions[0]?.value).toBe('neko/boards/missing.nkc');
  });

  it('can render only the Workspace label without Canvas index', () => {
    const board = { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'neko/boards/workspace.nkc',
      loading: false,
      options: [{ id: 'neko/boards/workspace.nkc', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    render(
      <I18nProvider
        service={
          {
            locale: 'en',
            t: (key: string) => translations[key] ?? key,
            onLocaleChange: () => () => undefined,
            setLocale: () => undefined,
          } as never
        }
      >
        <WorkspaceCanvasContextBar
          workspaceLabel="Workspace"
          canvas={canvas}
          showCanvasIndex={false}
        />
      </I18nProvider>,
    );
    const bar = document.querySelector('[data-workspace-canvas-context="true"]');
    expect(bar?.className).toBe('agent-workspace-canvas-context-bar');
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByText('Workspace Board')).toBeNull();
  });

  it('renders only Workspace label and selected Canvas index', () => {
    const board = { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'neko/boards/workspace.nkc',
      loading: false,
      options: [
        { id: 'neko/boards/workspace.nkc', label: 'Workspace Board', target: board },
        {
          id: 'neko/boards/a.nkc',
          label: 'Story Canvas',
          target: {
            workspaceId: 'workspace-1',
            canvasId: 'neko/boards/a.nkc',
          },
          summary: { canvasId: 'neko/boards/a.nkc', name: 'Story Canvas' },
        },
      ],
      onSelect: async () => undefined,
    };
    renderBar(canvas);
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(screen.getByText('Workspace Board')).toBeTruthy();
    expect(screen.queryByText('workspace.nkc')).toBeNull();
    const select = document.querySelector('select');
    expect(select?.closest('.agent-workspace-canvas-select-control')).toBeTruthy();
    expect(select?.value).toBe('neko/boards/workspace.nkc');
    expect(select?.options).toHaveLength(2);
    expect(screen.queryByText('read')).toBeNull();
    expect(screen.queryByText('write')).toBeNull();
    expect(screen.queryByText('range')).toBeNull();
  });

  it('opens the currently selected Canvas on double-click', () => {
    const board = { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' };
    const onOpen = vi.fn(async () => undefined);
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'neko/boards/story.nkc',
      loading: false,
      options: [
        { id: 'neko/boards/workspace.nkc', label: 'Workspace Board', target: board },
        {
          id: 'neko/boards/story.nkc',
          label: 'story.nkc',
          target: {
            workspaceId: 'workspace-1',
            canvasId: 'neko/boards/story.nkc',
          },
        },
      ],
      onSelect: async () => undefined,
      onOpen,
    };
    renderBar(canvas);

    fireEvent.doubleClick(screen.getByRole('combobox', { name: 'Canvas index' }));

    expect(onOpen).toHaveBeenCalledWith('neko/boards/story.nkc');
  });
});
