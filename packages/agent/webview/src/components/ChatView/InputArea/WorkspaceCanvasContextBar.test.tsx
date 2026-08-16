import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/I18nContext';
import { WorkspaceCanvasContextBar } from './WorkspaceCanvasContextBar';
import type { AgentComposerCanvasPresentation } from '../../ComposerWorkspaceContext';

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
  it('does not claim Board when the selected Canvas id is unknown', () => {
    const board = { kind: 'workspace-board' as const, workspaceId: 'workspace-1' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'neko/boards/missing.nkc',
      loading: false,
      options: [{ id: 'workspace-board', label: 'Workspace Board', target: board }],
      onSelect: async () => undefined,
    };
    renderBar(canvas);
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('neko/boards/missing.nkc');
    expect(select.title).toBe('chat.input.workspaceCanvas.unavailable');
    expect(select.selectedOptions[0]?.value).toBe('neko/boards/missing.nkc');
  });

  it('can render only the Workspace label without Canvas index', () => {
    const board = { kind: 'workspace-board' as const, workspaceId: 'workspace-1' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'workspace-board',
      loading: false,
      options: [{ id: 'workspace-board', label: 'Workspace Board', target: board }],
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
    expect(bar?.classList.contains('agent-composer-context-bar')).toBe(true);
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByText('Workspace Board')).toBeNull();
  });

  it('renders only Workspace label and selected Canvas index', () => {
    const board = { kind: 'workspace-board' as const, workspaceId: 'workspace-1' };
    const canvas: AgentComposerCanvasPresentation = {
      workspaceId: 'workspace-1',
      defaultTarget: board,
      selectedId: 'workspace-board',
      loading: false,
      options: [
        { id: 'workspace-board', label: 'Workspace Board', target: board },
        {
          id: 'neko/boards/a.nkc',
          label: 'Story Canvas',
          target: {
            kind: 'exact-canvas' as const,
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
    const select = document.querySelector('select');
    expect(select?.closest('.agent-workspace-canvas-select-control')).toBeTruthy();
    expect(select?.value).toBe('workspace-board');
    expect(select?.options).toHaveLength(2);
    expect(screen.queryByText('read')).toBeNull();
    expect(screen.queryByText('write')).toBeNull();
    expect(screen.queryByText('range')).toBeNull();
  });
});
