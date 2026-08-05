// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CanvasNode } from '@neko/canvas-domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasNodeChildCatalog,
  openCanvasNodeInspector,
  reconcileCanvasNodeChildren,
} from '../../node-lifecycle';

const disposed = vi.hoisted(() => vi.fn());

vi.mock('./PropertyPanel', async () => {
  const ReactRuntime = await import('react');
  return {
    PropertyPanel: ({ selectedNodes }: { readonly selectedNodes: readonly CanvasNode[] }) => {
      const node = selectedNodes[0];
      if (!node) throw new Error('Inspector fixture requires one node.');
      ReactRuntime.useEffect(() => () => disposed(node.id), [node.id]);
      return <input data-node-inspector={node.id} defaultValue={node.id} />;
    },
  };
});

import { CanvasNodeInspectorDeck } from './CanvasNodeInspectorDeck';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasNodeInspectorDeck', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    disposed.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('retains node-local UI state while switching and disposes only a deleted node', () => {
    const nodes = [createNode('node:1'), createNode('node:2')];
    let catalog = createCanvasNodeChildCatalog('canvas:board');
    catalog = openCanvasNodeInspector(catalog, 'node:1');
    renderDeck(catalog, nodes);

    const first = container.querySelector<HTMLInputElement>('[data-node-inspector="node:1"]');
    if (!first) throw new Error('First node inspector is required.');
    first.value = 'unfinished node edit';

    catalog = openCanvasNodeInspector(catalog, 'node:2');
    renderDeck(catalog, nodes);

    expect(first.value).toBe('unfinished node edit');
    expect(first.closest('[data-neko-retained-surface]')?.hasAttribute('hidden')).toBe(true);
    expect(disposed).not.toHaveBeenCalled();

    catalog = reconcileCanvasNodeChildren(catalog, new Set(['node:2']));
    renderDeck(catalog, [nodes[1]!]);

    expect(disposed).toHaveBeenCalledTimes(1);
    expect(disposed).toHaveBeenCalledWith('node:1');
    expect(container.querySelector('[data-node-inspector="node:2"]')).not.toBeNull();
  });

  function renderDeck(
    catalog: ReturnType<typeof createCanvasNodeChildCatalog>,
    nodes: readonly CanvasNode[],
  ): void {
    act(() => {
      root.render(
        <CanvasNodeInspectorDeck
          catalog={catalog}
          nodes={nodes}
          onDeleteNode={vi.fn()}
          onToggleLock={vi.fn()}
          onUpdateNode={vi.fn()}
          onUpdateNodeData={vi.fn()}
          onUpdatePorts={vi.fn()}
        />,
      );
    });
  }
});

function createNode(id: string): CanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 180 },
    zIndex: 1,
    data: { content: '' },
  };
}
