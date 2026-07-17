import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeView } from './index';
import type { TreeViewItem } from './tree-view-types';

describe('@neko/ui TreeView', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it('renders small trees directly with selected, expanded, visible, and locked states', () => {
    const onSelect = vi.fn();
    const onToggleExpand = vi.fn();
    const items: TreeViewItem[] = [
      {
        id: 'root',
        label: 'Root',
        expanded: true,
        children: [
          { id: 'child-a', label: 'Child A', selected: true, locked: true },
          { id: 'child-b', label: 'Child B', visible: false },
        ],
      },
    ];

    act(() => {
      root.render(
        <TreeView
          focusedId="child-a"
          items={items}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
        />,
      );
    });

    expect(host.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('Tree');
    expect(host.querySelector('[role="tree"]')?.getAttribute('data-neko-keyboard-scope')).toBe(
      'tree',
    );
    expect(
      host.querySelector('[role="tree"]')?.getAttribute('data-neko-keyboard-owned-keys'),
    ).toContain('ArrowDown');
    expect(host.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
    expect(host.querySelector('[aria-selected="true"]')?.getAttribute('data-tree-item-id')).toBe(
      'child-a',
    );
    expect(host.querySelector('[data-tree-item-id="child-a"]')?.getAttribute('data-selected')).toBe(
      'true',
    );
    expect(host.querySelector('[data-tree-item-id="child-a"]')?.getAttribute('data-focused')).toBe(
      'true',
    );
    expect(host.querySelector('[aria-label="Locked"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Hidden"]')).not.toBeNull();

    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="child-a"]')?.click();
    });
    expect(onSelect).toHaveBeenCalledWith('child-a', { multi: false, range: false });

    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Collapse item"]')?.click();
    });
    expect(onToggleExpand).toHaveBeenCalledWith('root', false);
    expect(host.querySelectorAll('[role="treeitem"]')).toHaveLength(1);
  });

  it('hydrates uncontrolled default expansion when tree items arrive after mount', () => {
    act(() => {
      root.render(<TreeView items={[]} />);
    });

    act(() => {
      root.render(
        <TreeView
          items={[
            {
              id: 'root',
              label: 'Root',
              expanded: true,
              children: [{ id: 'child', label: 'Child' }],
            },
          ]}
        />,
      );
    });

    expect(host.querySelector('[data-tree-item-id="root"]')).not.toBeNull();
    expect(host.querySelector('[data-tree-item-id="child"]')).not.toBeNull();
  });

  it('supports keyboard focus, selection, and expansion callbacks', () => {
    const onFocusItem = vi.fn();
    const onSelect = vi.fn();
    const onToggleExpand = vi.fn();

    act(() => {
      root.render(
        <TreeView
          focusedId="root"
          items={[
            {
              id: 'root',
              label: 'Root',
              children: [{ id: 'child', label: 'Child' }],
            },
          ]}
          onFocusItem={onFocusItem}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
        />,
      );
    });

    const tree = host.querySelector<HTMLElement>('[role="tree"]');
    act(() => {
      tree?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(onToggleExpand).toHaveBeenCalledWith('root', true);

    act(() => {
      tree?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onSelect).toHaveBeenCalledWith('root', { multi: false, range: false });

    act(() => {
      root.render(
        <TreeView
          expandedIds={['root']}
          focusedId="root"
          items={[
            {
              id: 'root',
              label: 'Root',
              children: [{ id: 'child', label: 'Child' }],
            },
          ]}
          onFocusItem={onFocusItem}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
        />,
      );
    });

    act(() => {
      host
        .querySelector<HTMLElement>('[role="tree"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    expect(onFocusItem).toHaveBeenCalledWith('child');
  });

  it('can delegate visibility toggles while preserving row selection', () => {
    const onSelect = vi.fn();
    const onToggleVisibility = vi.fn();

    act(() => {
      root.render(
        <TreeView
          items={[{ id: 'node', label: 'Node', visible: true }]}
          onSelect={onSelect}
          onToggleVisibility={onToggleVisibility}
          visibilityLabels={{ hide: 'Hide node', show: 'Show node' }}
        />,
      );
    });

    const visibilityButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide node"]',
    );
    act(() => {
      visibilityButton?.click();
    });

    expect(onToggleVisibility).toHaveBeenCalledWith('node', false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('can hide static visibility and lock indicators for picker-style trees', () => {
    act(() => {
      root.render(
        <TreeView
          items={[{ id: 'node', label: 'Node', locked: false, visible: true }]}
          showStaticStateIndicators={false}
        />,
      );
    });

    expect(host.querySelector('[data-tree-item-id="node"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Visible"]')).toBeNull();
    expect(host.querySelector('[aria-label="Unlocked"]')).toBeNull();
  });

  it('renders optional item descriptions and tooltips without using badges', () => {
    act(() => {
      root.render(
        <TreeView
          items={[
            {
              id: 'shot',
              label: 'shot.nkv',
              description: '2 KB',
              title: 'cuts/shot.nkv · timeline · 2 KB',
            },
          ]}
          showStaticStateIndicators={false}
        />,
      );
    });

    const row = host.querySelector<HTMLElement>('[data-tree-item-id="shot"]');
    expect(row?.getAttribute('title')).toBe('cuts/shot.nkv · timeline · 2 KB');
    expect(row?.getAttribute('aria-label')).toBe('cuts/shot.nkv · timeline · 2 KB');
    expect(host.querySelector('[data-tree-item-description="true"]')?.textContent).toBe('2 KB');
    expect(host.querySelector('[title="2 KB"]')).toBeNull();
  });

  it('renders optional item decorations in the trailing column', () => {
    act(() => {
      root.render(
        <TreeView
          items={[
            {
              id: 'asset',
              label: 'asset.png',
              decoration: 'U',
              decorationTitle: 'Untracked',
            },
          ]}
          showStaticStateIndicators={false}
        />,
      );
    });

    const decoration = host.querySelector('[data-tree-item-decoration="true"]');
    expect(decoration?.textContent).toBe('U');
    expect(decoration?.getAttribute('title')).toBe('Untracked');
  });

  it('uses an explicit height as the scroll viewport even for small trees', () => {
    act(() => {
      root.render(
        <TreeView
          height={96}
          items={Array.from({ length: 20 }, (_, index): TreeViewItem => ({
            id: `item-${index}`,
            label: `Item ${index}`,
          }))}
          virtualization={{ threshold: 200 }}
        />,
      );
    });

    const tree = host.querySelector<HTMLElement>('[role="tree"]');
    expect(tree?.style.height).toBe('96px');
    expect(tree?.style.overflow).toBe('auto');
    expect(host.querySelector('[data-virtualized="false"]')).not.toBeNull();
  });

  it('can delegate lock toggles, row actions, context menus, and drag start', () => {
    const onAction = vi.fn();
    const onContextMenu = vi.fn();
    const onDragStart = vi.fn();
    const onToggleLock = vi.fn();
    const item: TreeViewItem = {
      id: 'layer',
      label: 'Layer',
      draggable: true,
      locked: false,
      badges: [{ id: 'alpha', label: 'A', title: 'Alpha lock' }],
      actions: [{ id: 'remove', label: 'Remove layer', icon: <span aria-hidden="true">x</span> }],
    };

    act(() => {
      root.render(
        <TreeView
          items={[item]}
          lockLabels={{ lock: 'Lock layer', unlock: 'Unlock layer' }}
          onAction={onAction}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onToggleLock={onToggleLock}
        />,
      );
    });

    const row = host.querySelector<HTMLElement>('[data-tree-item-id="layer"]');
    expect(row?.getAttribute('draggable')).toBe('true');
    expect(host.textContent).toContain('A');

    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Lock layer"]')?.click();
    });
    expect(onToggleLock).toHaveBeenCalledWith('layer', true);

    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Remove layer"]')?.click();
    });
    expect(onAction).toHaveBeenCalledWith('layer', 'remove');

    act(() => {
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    });
    expect(onContextMenu).toHaveBeenCalledWith('layer', expect.any(Object));

    act(() => {
      row?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    });
    expect(onDragStart).toHaveBeenCalledWith('layer', expect.any(Object));
  });

  it('uses virtualization for 500 visible items while preserving selected state', () => {
    const items = Array.from({ length: 500 }, (_, index): TreeViewItem => ({
      id: `item-${index}`,
      label: `Item ${index}`,
    }));

    act(() => {
      root.render(
        <TreeView
          height={120}
          items={items}
          scrollTop={240}
          selectedIds={['item-15']}
          virtualization={{ itemHeight: 24, overscan: 2, threshold: 200 }}
        />,
      );
    });

    expect(host.querySelector('[data-virtualized="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeLessThan(500);
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(5);
    expect(host.textContent).toContain('Item 10');
    expect(host.querySelector('[data-tree-item-id="item-15"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('reports row focus when users click an item', () => {
    const onFocusItem = vi.fn();
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <TreeView
          items={[{ id: 'node-a', label: 'Node A' }]}
          onFocusItem={onFocusItem}
          onSelect={onSelect}
        />,
      );
    });

    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="node-a"]')?.click();
    });

    expect(onFocusItem).toHaveBeenCalledWith('node-a');
    expect(onSelect).toHaveBeenCalledWith('node-a', { multi: false, range: false });
  });
});
