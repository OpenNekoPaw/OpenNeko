// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';
import { setLocale } from '../../i18n';

vi.mock('@neko/ui/icons', () => ({
  toCodiconClassName: (name: string) => `codicon codicon-${name}`,
  DownloadIcon: ({ size = 16 }: { size?: number }) => <span data-icon="download">{size}</span>,
  PackageIcon: ({ size = 16 }: { size?: number }) => <span data-icon="package">{size}</span>,
  PointerIcon: ({ size = 16 }: { size?: number }) => <span data-icon="pointer">{size}</span>,
  RedoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="redo">{size}</span>,
  RightPanelIcon: ({ size = 16 }: { size?: number }) => <span data-icon="right-panel">{size}</span>,
  RightPanelOffIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
  UndoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="undo">{size}</span>,
}));

vi.mock('@neko/shared/icons', () => ({
  PlusIcon: ({ size = 16 }: { size?: number }) => <span data-icon="plus">{size}</span>,
  StorylineIcon: ({ size = 16 }: { size?: number }) => <span data-icon="storyline">{size}</span>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('CanvasToolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders as the shared floating horizontal toolbar surface', () => {
    act(() => {
      root.render(<CanvasToolbar onUndo={() => undefined} onRedo={() => undefined} />);
    });

    const toolbar = host.querySelector('.canvas-floating-toolbar');
    expect(toolbar?.classList.contains('neko-htoolbar')).toBe(true);
    expect(toolbar?.classList.contains('neko-floating-toolbar')).toBe(true);
    expect(toolbar?.getAttribute('data-orientation')).toBe('horizontal');
    expect(toolbar?.getAttribute('aria-label')).toBe('Canvas tools');
    expect(host.querySelectorAll('.neko-toolbar-btn').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-canvas-toolbar-action="select-tool"]')).not.toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="toggle-pan-mode"]')).not.toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="open-add-node-popover"]')).toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="import-file"]')).toBeNull();
  });

  it('switches between select and hand tool modes from the first toolbar group', () => {
    const onSelectTool = vi.fn();
    const onTogglePanMode = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isSelectMode={true}
          onSelectTool={onSelectTool}
          isPanMode={false}
          onTogglePanMode={onTogglePanMode}
        />,
      );
    });

    const selectButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="select-tool"]',
    );
    const handButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-pan-mode"]',
    );
    const modeGroup = host.querySelector<HTMLElement>('[data-canvas-toolbar-mode-group]');

    expect(modeGroup?.getAttribute('role')).toBe('group');
    expect(modeGroup?.classList.contains('neko-toolbar-mode-group')).toBe(true);
    expect(modeGroup?.getAttribute('aria-label')).toBe('Canvas navigation mode');
    expect(Array.from(modeGroup?.children ?? [])).toEqual([selectButton, handButton]);
    expect(selectButton?.getAttribute('aria-label')).toBe('Select Tool (V)');
    expect(selectButton?.getAttribute('aria-pressed')).toBe('true');
    expect(selectButton?.getAttribute('data-canvas-toolbar-kind')).toBe('tool-mode');
    expect(handButton?.getAttribute('aria-label')).toBe('Hand Tool (H)');
    expect(handButton?.getAttribute('aria-pressed')).toBe('false');
    expect(handButton?.getAttribute('data-canvas-toolbar-kind')).toBe('tool-mode');

    act(() => {
      selectButton?.click();
      handButton?.click();
    });
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onTogglePanMode).toHaveBeenCalledTimes(1);
  });

  it('opens the canonical add action popover from the floating toolbar', () => {
    const onSelectAddAction = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          onSelectAddAction={onSelectAddAction}
        />,
      );
    });

    const addButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="open-add-node-popover"]',
    );
    expect(addButton?.getAttribute('aria-label')).toBe('Add Node');
    expect(addButton?.getAttribute('aria-expanded')).toBe('false');
    expect(addButton?.getAttribute('data-canvas-toolbar-kind')).toBe('common-action');

    act(() => {
      addButton?.click();
    });
    expect(addButton?.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-canvas-add-action="group"]')?.click();
    });
    expect(onSelectAddAction).toHaveBeenCalledWith('group');
    expect(document.body.querySelector('[data-canvas-add-action-popover="true"]')).toBeNull();
  });

  it('opens export/package flows without adding a playback reveal button', () => {
    const onOpenExport = vi.fn();
    const onOpenPackage = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          onOpenExport={onOpenExport}
          onOpenPackage={onOpenPackage}
        />,
      );
    });

    const exportButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="open-export"]',
    );
    const packageButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="open-package"]',
    );
    expect(exportButton?.getAttribute('aria-label')).toBe('Export');
    expect(exportButton?.getAttribute('data-canvas-toolbar-kind')).toBe('common-action');
    expect(exportButton?.querySelector('[data-icon="download"]')).not.toBeNull();
    expect(packageButton?.getAttribute('aria-label')).toBe('Package');
    expect(packageButton?.getAttribute('data-canvas-toolbar-kind')).toBe('common-action');
    expect(packageButton?.querySelector('[data-icon="package"]')).not.toBeNull();

    act(() => {
      exportButton?.click();
      packageButton?.click();
    });
    expect(onOpenExport).toHaveBeenCalledTimes(1);
    expect(onOpenPackage).toHaveBeenCalledTimes(1);
  });

  it('controls the unified Storyline Overlay with its dedicated icon', () => {
    const onTogglePlaybackWorkspace = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          playbackWorkspaceVisible={false}
          onTogglePlaybackWorkspace={onTogglePlaybackWorkspace}
        />,
      );
    });

    const canvasButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-canvas-pane"]',
    );
    const stageButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-panel"]',
    );

    expect(canvasButton).toBeNull();
    expect(stageButton?.getAttribute('aria-controls')).toBe('canvas-playback-overlay');
    expect(stageButton?.getAttribute('aria-expanded')).toBe('false');
    expect(stageButton?.getAttribute('aria-pressed')).toBe('false');
    expect(stageButton?.getAttribute('aria-label')).toBe('Open story playback');
    expect(stageButton?.querySelector('[data-icon="storyline"]')?.textContent).toBe('18');
    expect(stageButton?.querySelector('[data-icon="play"]')).toBeNull();
    expect(
      host.querySelector('[data-canvas-toolbar-action="toggle-playback-route-pane"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-canvas-toolbar-action="reveal-playback-workspace"]'),
    ).toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="hide-playback-workspace"]')).toBeNull();

    act(() => {
      stageButton?.click();
    });

    expect(onTogglePlaybackWorkspace).toHaveBeenCalledTimes(1);
  });

  it('keeps the Storyline button available before the workspace is visible', () => {
    const onTogglePlaybackWorkspace = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          playbackWorkspaceVisible={false}
          onTogglePlaybackWorkspace={onTogglePlaybackWorkspace}
        />,
      );
    });

    const stageButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-panel"]',
    );

    expect(stageButton).not.toBeNull();

    act(() => {
      stageButton?.click();
    });

    expect(onTogglePlaybackWorkspace).toHaveBeenCalledTimes(1);
  });

  it('places frequent canvas actions in functional groups without a settings action', () => {
    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isSelectMode={false}
          onSelectTool={() => undefined}
          onSelectAddAction={() => undefined}
          playbackWorkspaceVisible={false}
          onTogglePlaybackWorkspace={() => undefined}
          onOpenExport={() => undefined}
          onOpenPackage={() => undefined}
          isPanMode={true}
          onTogglePanMode={() => undefined}
        />,
      );
    });

    const actions = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-canvas-toolbar-action]'),
    ).map((button) => button.getAttribute('data-canvas-toolbar-action'));

    expect(actions).toEqual([
      'select-tool',
      'toggle-pan-mode',
      'open-add-node-popover',
      'undo',
      'redo',
      'toggle-playback-panel',
      'open-export',
      'open-package',
    ]);

    expect(host.querySelector('[data-canvas-toolbar-action="toggle-canvas-settings"]')).toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="toggle-hud-controls"]')).toBeNull();
  });

  it('does not expose the removed canvas settings entry', () => {
    act(() => {
      root.render(<CanvasToolbar onUndo={() => undefined} onRedo={() => undefined} />);
    });

    expect(host.querySelector('[data-canvas-toolbar-action="toggle-canvas-settings"]')).toBeNull();
    expect(host.querySelector('[aria-controls="canvas-settings-panel"]')).toBeNull();
    expect(host.querySelector('[data-icon="settings"]')).toBeNull();
  });
});
