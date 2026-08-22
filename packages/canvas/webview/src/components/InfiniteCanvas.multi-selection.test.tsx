// @vitest-environment jsdom

import type { CanvasViewport, MarkdownCanvasNode } from '@neko/canvas-domain';
import { act, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { enableDefaultCanvasTestStoreScope } from '../stores/canvasStoreScope';
import { InfiniteCanvas } from './InfiniteCanvas';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  enableDefaultCanvasTestStoreScope();
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  document.body.replaceChildren();
});

describe('InfiniteCanvas multi-selection', () => {
  it('previews and commits one shared drag delta without collapsing the selection', async () => {
    const nodes = [markdownNode('first', 20, 30), markdownNode('second', 360, 90)];
    const onNodesMove = vi.fn();
    const onNodeSelect = vi.fn();
    ({ root, container } = createTestRoot());

    await renderCanvas(nodes, ['first', 'second'], { onNodesMove, onNodeSelect });

    const first = nodeElement('first');
    const second = nodeElement('second');
    expect(container?.querySelectorAll('[data-node-transform-handle]')).toHaveLength(0);

    await act(async () => {
      first.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 100,
          clientY: 100,
        }),
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          buttons: 1,
          clientX: 140,
          clientY: 130,
        }),
      );
    });

    expect(first.style.left).toBe('60px');
    expect(first.style.top).toBe('60px');
    expect(second.style.left).toBe('400px');
    expect(second.style.top).toBe('120px');

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
          clientX: 140,
          clientY: 130,
        }),
      );
      first.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onNodesMove).toHaveBeenCalledWith(['first', 'second'], { x: 40, y: 30 });
    expect(onNodeSelect).not.toHaveBeenCalled();
  });

  it('keeps additive background gestures from clearing selection and restores single-node handles', async () => {
    const nodes = [markdownNode('first', 20, 30), markdownNode('second', 360, 90)];
    const onCanvasClick = vi.fn();
    ({ root, container } = createTestRoot());

    await renderCanvas(nodes, ['first', 'second'], { onCanvasClick });
    const viewport = container?.querySelector<HTMLElement>('[data-canvas-viewport-root="true"]');
    expect(viewport).toBeDefined();

    await act(async () => {
      viewport?.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          shiftKey: true,
        }),
      );
    });
    expect(onCanvasClick).not.toHaveBeenCalled();

    await act(async () => {
      viewport?.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(onCanvasClick).toHaveBeenCalledTimes(1);

    await renderCanvas(nodes, ['first'], { onCanvasClick });
    expect(container?.querySelectorAll('[data-node-transform-handle]').length).toBeGreaterThan(0);
  });

  it('requests the existing node menu from a stationary right-button release target', async () => {
    const nodes = [markdownNode('first', 20, 30)];
    const menuTargets: string[] = [];
    ({ root, container } = createTestRoot());
    await renderCanvas(nodes, [], {
      onContextMenuRequest: (event) => {
        menuTargets.push(
          (event.target as HTMLElement).closest('[data-node-id]')?.getAttribute('data-node-id') ??
            'canvas',
        );
      },
    });
    const first = nodeElement('first');
    const nativeContextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      first.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 80,
          clientY: 90,
        }),
      );
      first.dispatchEvent(nativeContextMenu);
      first.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 2,
          clientX: 80,
          clientY: 90,
        }),
      );
    });

    expect(nativeContextMenu.defaultPrevented).toBe(true);
    expect(menuTargets).toEqual(['first']);
  });

  it('pans on a right-button drag without requesting the menu', async () => {
    const onViewportChange = vi.fn();
    const onContextMenuRequest = vi.fn();
    ({ root, container } = createTestRoot());
    await renderCanvas([], [], { onViewportChange, onContextMenuRequest });
    const viewport = container?.querySelector<HTMLElement>('[data-canvas-viewport-root="true"]');
    if (!viewport) throw new Error('Canvas viewport did not render');

    await act(async () => {
      viewport.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 10,
          clientY: 20,
        }),
      );
    });
    await act(async () => {
      viewport.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          buttons: 2,
          clientX: 40,
          clientY: 45,
        }),
      );
      viewport.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 45,
        }),
      );
    });

    expect(onViewportChange).toHaveBeenLastCalledWith({ pan: { x: 30, y: 25 } });
    expect(onContextMenuRequest).not.toHaveBeenCalled();
  });
});

async function renderCanvas(
  nodes: MarkdownCanvasNode[],
  selectedNodeIds: string[],
  callbacks: {
    readonly onNodesMove?: (
      nodeIds: readonly string[],
      delta: { readonly x: number; readonly y: number },
    ) => void;
    readonly onNodeSelect?: (nodeId: string, multi: boolean) => void;
    readonly onCanvasClick?: () => void;
    readonly onViewportChange?: (viewport: Partial<CanvasViewport>) => void;
    readonly onContextMenuRequest?: (event: ReactMouseEvent) => void;
  },
): Promise<void> {
  await act(async () => {
    root?.render(
      <InfiniteCanvas
        nodes={nodes}
        connections={[]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        selectedNodeIds={selectedNodeIds}
        onViewportChange={callbacks.onViewportChange ?? vi.fn()}
        onNodesMove={callbacks.onNodesMove}
        onNodeSelect={callbacks.onNodeSelect}
        onCanvasClick={callbacks.onCanvasClick}
        onContextMenuRequest={callbacks.onContextMenuRequest}
        enableCulling={false}
        isGridVisible={false}
      />,
    );
  });
}

function nodeElement(nodeId: string): HTMLElement {
  const node = container?.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!node) throw new Error(`Canvas test node not found: ${nodeId}`);
  return node;
}

function markdownNode(id: string, x: number, y: number): MarkdownCanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x, y },
    size: { width: 240, height: 160 },
    zIndex: 1,
    data: { content: id },
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  nextContainer.style.width = '900px';
  nextContainer.style.height = '600px';
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
