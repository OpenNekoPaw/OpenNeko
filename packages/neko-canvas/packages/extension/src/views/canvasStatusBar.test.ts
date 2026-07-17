import { describe, expect, it, vi } from 'vitest';
import { CanvasStatusBar } from './canvasStatusBar';

type MockStatusBarItem = {
  id: string;
  text: string;
  tooltip?: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  statusItems: new Map<string, MockStatusBarItem>(),
}));

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: vi.fn((id: string) => {
      const item = {
        id,
        text: '',
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      };
      mocks.statusItems.set(id, item);
      return item;
    }),
  },
}));

describe('CanvasStatusBar', () => {
  it('keeps status projection within three native items', () => {
    new CanvasStatusBar();

    expect([...mocks.statusItems.keys()]).toEqual([
      'neko.canvas.structure',
      'neko.canvas.zoom',
      'neko.canvas.context',
    ]);
  });

  it('merges selection, subsystem, and projection status in the context item', () => {
    const statusBar = new CanvasStatusBar();
    statusBar.show();
    statusBar.update({
      nodeCount: 3,
      connectionCount: 2,
      zoom: 1.25,
      selectedCount: 1,
      subsystemSummary: 'storyboard',
      projectionSummary: 'Projected: source-changed',
    });

    expect(mocks.statusItems.get('neko.canvas.structure')?.text).toBe(
      '$(symbol-class) 3 nodes · $(git-merge) 2',
    );
    expect(mocks.statusItems.get('neko.canvas.zoom')?.text).toBe('$(zoom-in) 125%');
    expect(mocks.statusItems.get('neko.canvas.context')?.text).toBe(
      '$(symbol-namespace) 1 selected · storyboard · Projected: source-changed',
    );
    expect(mocks.statusItems.get('neko.canvas.context')?.tooltip).toBe(
      '1 selected · storyboard · Projected: source-changed',
    );
    expect(mocks.statusItems.get('neko.canvas.context')?.show).toHaveBeenCalled();
  });

  it('keeps long merged context readable while preserving full details in tooltip', () => {
    const statusBar = new CanvasStatusBar();
    statusBar.show();
    statusBar.update({
      nodeCount: 3,
      connectionCount: 2,
      zoom: 1,
      selectedCount: 3,
      subsystemSummary: 'Storyboard subsystem with multi-layer compositing and constraints',
      projectionSummary: 'Equirectangular projection waiting for source synchronization',
    });

    const context = mocks.statusItems.get('neko.canvas.context');
    expect(context?.text.length).toBeLessThanOrEqual(92);
    expect(context?.text).toBe(
      '$(symbol-namespace) 3 selected · Storyboard subsystem with multi-layer compositing and...',
    );
    expect(context?.tooltip).toBe(
      '3 selected · Storyboard subsystem with multi-layer compositing and constraints · Equirectangular projection waiting for source synchronization',
    );
  });
});
