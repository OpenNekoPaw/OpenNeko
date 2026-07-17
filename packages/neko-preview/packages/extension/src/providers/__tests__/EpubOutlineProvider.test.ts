import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class MockEventEmitter<T> {
    private listeners: Array<(value: T | undefined) => void> = [];

    event = (listener: (value: T | undefined) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };

    fire = (value: T | undefined) => {
      for (const listener of this.listeners) {
        listener(value);
      }
    };

    dispose = vi.fn();
  }

  class ThemeIcon {
    constructor(readonly id: string) {}
  }

  class TreeItem {
    description?: string;
    tooltip?: string;
    iconPath?: unknown;
    command?: unknown;

    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }

  return {
    EventEmitter: MockEventEmitter,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
    },
  };
});

import { EpubOutlineProvider } from '../EpubOutlineProvider';

describe('EpubOutlineProvider', () => {
  it('builds a hierarchy from TOC depth', () => {
    const provider = new EpubOutlineProvider();
    provider.update([
      { label: 'Chapter 1', href: 'Text/ch1.xhtml', depth: 0 },
      { label: 'Section 1.1', href: 'Text/ch1.xhtml#s1', depth: 1 },
      { label: 'Chapter 2', href: 'Text/ch2.xhtml', depth: 0 },
    ]);

    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots[0]?.entry.label).toBe('Chapter 1');
    expect(provider.getChildren(roots[0])).toHaveLength(1);
    expect(provider.getChildren(roots[0])[0]?.entry.label).toBe('Section 1.1');
  });

  it('matches and marks the active href', () => {
    const provider = new EpubOutlineProvider();
    provider.update([
      { label: 'Chapter 1', href: 'Text/ch1.xhtml', depth: 0 },
      { label: 'Chapter 2', href: 'Text/ch2.xhtml#part', depth: 0 },
    ]);

    const activeNode = provider.setActiveHref('Text/ch2.xhtml');

    expect(activeNode?.entry.label).toBe('Chapter 2');

    const item = provider.getTreeItem(activeNode!);
    expect((item.iconPath as { id: string }).id).toBe('circle-filled');
    expect(item.tooltip).toContain('Current chapter');
  });

  it('does not emit tree refresh when the active href is unchanged', () => {
    const provider = new EpubOutlineProvider();
    const onDidChange = vi.fn();
    provider.onDidChangeTreeData(onDidChange);
    provider.update([{ label: 'Chapter 1', href: 'Text/ch1.xhtml', depth: 0 }]);

    onDidChange.mockClear();

    provider.setActiveHref('Text/ch1.xhtml');
    provider.setActiveHref('Text/ch1.xhtml');

    expect(onDidChange).toHaveBeenCalledTimes(1);
  });
});
