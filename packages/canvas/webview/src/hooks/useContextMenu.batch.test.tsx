// @vitest-environment jsdom

import type { CanvasData, MarkdownCanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { useCanvasStore } from '../stores/canvasStore';
import { enableDefaultCanvasTestStoreScope } from '../stores/canvasStoreScope';
import { useHistoryStore } from '../stores/historyStore';
import { useContextMenu } from './useContextMenu';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  enableDefaultCanvasTestStoreScope();
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  useCanvasStore.setState({ canvasData: null, selection: { nodeIds: [], connectionIds: [] } });
  useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
});

describe('useContextMenu batch commands', () => {
  it('preserves a selected target and applies front and lock to the complete selection', async () => {
    const first = markdownNode('first', 1);
    const second = markdownNode('second', 4);
    const sibling = markdownNode('sibling', 8);
    const nodes = [first, second, sibling];
    useCanvasStore.getState().setCanvasData(canvas(nodes));
    useCanvasStore.getState().selectNodes(['first', 'second']);
    ({ root, container } = createTestRoot());

    await act(async () => {
      root?.render(<ContextMenuHarness nodes={nodes} selectedNodeIds={['first', 'second']} />);
    });
    await act(async () => {
      nodeElement('first').dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 50,
        }),
      );
    });

    expect(useCanvasStore.getState().selection.nodeIds).toEqual(['first', 'second']);
    await clickMenuAction(t('menu.bringToFront'));
    let currentNodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(currentNodes.find((node) => node.id === 'first')?.zIndex).toBe(9);
    expect(currentNodes.find((node) => node.id === 'second')?.zIndex).toBe(10);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    await clickMenuAction(t('menu.lock'));
    currentNodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(
      currentNodes
        .filter((node) => node.id === 'first' || node.id === 'second')
        .every((node) => node.locked === true),
    ).toBe(true);
    expect(currentNodes.find((node) => node.id === 'sibling')?.locked).not.toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);
  });
});

function ContextMenuHarness({
  nodes,
  selectedNodeIds,
}: {
  readonly nodes: MarkdownCanvasNode[];
  readonly selectedNodeIds: string[];
}) {
  const menu = useContextMenu({
    selectedNodeIds,
    nodes,
    screenToCanvas: (x, y) => ({ x, y }),
    addActionAt: vi.fn(),
    handleFitContent: vi.fn(),
    handleResetViewport: vi.fn(),
    handlePaste: vi.fn(),
    handlePasteInPlace: vi.fn(),
    handleGroup: vi.fn(),
    handleUngroup: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  });
  return (
    <div onContextMenu={menu.handleContextMenu}>
      {nodes.map((node) => (
        <div key={node.id} data-node-id={node.id} />
      ))}
      {menu.contextMenu?.items.map((item, index) =>
        'separator' in item ? null : (
          <button
            key={`${item.label}:${index}`}
            data-menu-action={item.label}
            onClick={item.onClick}
          />
        ),
      )}
    </div>
  );
}

async function clickMenuAction(label: string): Promise<void> {
  const button = [
    ...(container?.querySelectorAll<HTMLButtonElement>('[data-menu-action]') ?? []),
  ].find((candidate) => candidate.dataset.menuAction === label);
  if (!button) throw new Error(`Canvas context action not found: ${label}`);
  await act(async () => button.click());
}

function nodeElement(nodeId: string): HTMLElement {
  const node = container?.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!node) throw new Error(`Canvas context node not found: ${nodeId}`);
  return node;
}

function markdownNode(id: string, zIndex: number): MarkdownCanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x: zIndex * 100, y: 20 },
    size: { width: 200, height: 120 },
    zIndex,
    data: { content: id },
  };
}

function canvas(nodes: MarkdownCanvasNode[]): CanvasData {
  return {
    name: 'Batch Context Menu',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections: [],
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
