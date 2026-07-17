// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';
import { setLocale } from '../../i18n';

vi.mock('@neko/ui/icons', () => ({
  DownloadIcon: ({ size = 16 }: { size?: number }) => <span data-icon="download">{size}</span>,
  LayersIcon: ({ size = 16 }: { size?: number }) => <span data-icon="layers">{size}</span>,
  PackageIcon: ({ size = 16 }: { size?: number }) => <span data-icon="package">{size}</span>,
  PlayIcon: ({ size = 16 }: { size?: number }) => <span data-icon="play">{size}</span>,
  RedoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="redo">{size}</span>,
  RightPanelIcon: ({ size = 16 }: { size?: number }) => <span data-icon="right-panel">{size}</span>,
  RightPanelOffIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
  UndoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="undo">{size}</span>,
}));

describe('CanvasToolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it('renders as the shared floating vertical toolbar surface', () => {
    act(() => {
      root.render(<CanvasToolbar onUndo={() => undefined} onRedo={() => undefined} />);
    });

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelector('.canvas-floating-toolbar')?.getAttribute('aria-label')).toBe(
      'Canvas tools',
    );
    expect(host.querySelectorAll('.neko-toolbar-btn').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-canvas-toolbar-action="select-tool"]')).not.toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="toggle-pan-mode"]')).not.toBeNull();
    expect(
      host.querySelector('[data-canvas-toolbar-action="open-add-node-popover"]'),
    ).toBeNull();
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

  it('controls the right node tree panel from the floating toolbar', () => {
    const onToggleNodeLibrary = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={true}
          onToggleNodeLibrary={onToggleNodeLibrary}
        />,
      );
    });

    const toggleButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-right-node-tree"]',
    );
    expect(toggleButton?.getAttribute('aria-label')).toBe('Hide right node tree');
    expect(toggleButton?.getAttribute('aria-controls')).toBe('canvas-right-node-tree-panel');
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('true');
    expect(toggleButton?.getAttribute('aria-pressed')).toBe('true');
    expect(toggleButton?.getAttribute('data-canvas-toolbar-kind')).toBe('visibility-toggle');
    expect(toggleButton?.getAttribute('data-canvas-toolbar-target')).toBe('right-panel');

    act(() => {
      toggleButton?.click();
    });
    expect(onToggleNodeLibrary).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={false}
          onToggleNodeLibrary={onToggleNodeLibrary}
        />,
      );
    });

    const collapsedButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-right-node-tree"]',
    );
    expect(collapsedButton?.getAttribute('aria-label')).toBe('Show right node tree');
    expect(collapsedButton?.getAttribute('aria-expanded')).toBe('false');
    expect(collapsedButton?.getAttribute('aria-pressed')).toBe('false');
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

  it('controls playback workspace surfaces without exposing the main canvas pane', () => {
    const onToggleWorkspaceSurface = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          workspaceSurfaceState={{ stage: false, route: true }}
          onToggleWorkspaceSurface={onToggleWorkspaceSurface}
        />,
      );
    });

    const canvasButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-canvas-pane"]',
    );
    const stageButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-stage-pane"]',
    );
    const routeButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-route-pane"]',
    );

    expect(canvasButton).toBeNull();
    expect(stageButton?.getAttribute('aria-controls')).toBe('canvas-playback-stage-pane');
    expect(stageButton?.getAttribute('aria-expanded')).toBe('false');
    expect(stageButton?.getAttribute('aria-pressed')).toBe('false');
    expect(stageButton?.getAttribute('aria-label')).toBe('Show playback stage');
    expect(routeButton?.getAttribute('aria-controls')).toBe('canvas-playback-route-pane');
    expect(routeButton?.getAttribute('aria-expanded')).toBe('true');
    expect(routeButton?.getAttribute('aria-pressed')).toBe('true');
    expect(routeButton?.getAttribute('aria-label')).toBe('Hide route matrix');
    expect(
      host.querySelector('[data-canvas-toolbar-action="reveal-playback-workspace"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-canvas-toolbar-action="hide-playback-workspace"]'),
    ).toBeNull();

    act(() => {
      stageButton?.click();
      routeButton?.click();
    });

    expect(onToggleWorkspaceSurface.mock.calls).toEqual([['stage'], ['route']]);
  });

  it('keeps surface buttons available before playback panes are visible', () => {
    const onToggleWorkspaceSurface = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          workspaceSurfaceState={{ stage: false, route: false }}
          onToggleWorkspaceSurface={onToggleWorkspaceSurface}
        />,
      );
    });

    const stageButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-stage-pane"]',
    );
    const routeButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-playback-route-pane"]',
    );

    expect(stageButton).not.toBeNull();
    expect(routeButton).not.toBeNull();

    act(() => {
      stageButton?.click();
      routeButton?.click();
    });

    expect(onToggleWorkspaceSurface.mock.calls).toEqual([['stage'], ['route']]);
  });

  it('places frequent canvas actions in functional groups without a settings action', () => {
    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isSelectMode={false}
          onSelectTool={() => undefined}
          isNodeLibraryVisible={true}
          onToggleNodeLibrary={() => undefined}
          workspaceSurfaceState={{ stage: false, route: false }}
          onToggleWorkspaceSurface={() => undefined}
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
      'toggle-right-node-tree',
      'undo',
      'redo',
      'toggle-playback-stage-pane',
      'toggle-playback-route-pane',
      'open-export',
      'open-package',
    ]);

    expect(
      host.querySelector('[data-canvas-toolbar-action="toggle-canvas-settings"]'),
    ).toBeNull();
    expect(host.querySelector('[data-canvas-toolbar-action="toggle-hud-controls"]')).toBeNull();
  });

  it('does not expose the removed canvas settings entry', () => {
    act(() => {
      root.render(<CanvasToolbar onUndo={() => undefined} onRedo={() => undefined} />);
    });

    expect(
      host.querySelector('[data-canvas-toolbar-action="toggle-canvas-settings"]'),
    ).toBeNull();
    expect(host.querySelector('[aria-controls="canvas-settings-panel"]')).toBeNull();
    expect(host.querySelector('[data-icon="settings"]')).toBeNull();
  });
});
