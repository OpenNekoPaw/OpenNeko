import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMock = vi.hoisted(() => {
  class ThemeIcon {
    constructor(readonly id: string) {}
  }

  class TreeItem {
    iconPath?: ThemeIcon;
    contextValue?: string;
    description?: string;
    tooltip?: string;
    command?: {
      command: string;
      title: string;
      arguments?: unknown[];
    };

    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }

  class EventEmitter<T> {
    readonly event = vi.fn();
    fire = vi.fn<(value: T) => void>();
    dispose = vi.fn();
  }

  return { ThemeIcon, TreeItem, EventEmitter };
});

vi.mock('vscode', () => ({
  ThemeIcon: vscodeMock.ThemeIcon,
  TreeItem: vscodeMock.TreeItem,
  EventEmitter: vscodeMock.EventEmitter,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
}));

import { CanvasOutlineProvider, type CanvasOutlineData } from './canvasOutlineProvider';

const outlineData: CanvasOutlineData = {
  documentUri: 'file:///workspace/board.nkc',
  name: 'Board',
  nodes: [
    {
      id: 'group-1',
      type: 'group',
      label: 'Act 1',
      detail: '2 items',
      childIds: ['media-1', 'missing'],
    },
    {
      id: 'media-1',
      type: 'media',
      label: 'Shot 1',
      detail: 'video',
      locked: true,
    },
    {
      id: 'job-1',
      type: 'job',
      label: 'Render',
      detail: 'running',
    },
    {
      id: 'file-1',
      type: 'file',
      label: 'Notes',
      detail: 'text',
    },
  ],
  connections: [
    {
      id: 'connection-1',
      sourceLabel: 'Act 1',
      targetLabel: 'Render',
      label: 'next',
    },
    {
      id: 'connection-2',
      sourceLabel: 'Render',
      targetLabel: 'Notes',
    },
  ],
};

describe('CanvasOutlineProvider', () => {
  let provider: CanvasOutlineProvider;

  beforeEach(() => {
    provider = new CanvasOutlineProvider();
    provider.updateData(outlineData);
  });

  it('groups top-level nodes by domain category', () => {
    const categories = provider.getChildren();

    expect(categories).toEqual([
      {
        kind: 'category',
        category: 'content',
        count: 2,
        documentUri: outlineData.documentUri,
      },
      {
        kind: 'category',
        category: 'ai-jobs',
        count: 1,
        documentUri: outlineData.documentUri,
      },
      {
        kind: 'category',
        category: 'references',
        count: 1,
        documentUri: outlineData.documentUri,
      },
      {
        kind: 'category',
        category: 'connections',
        count: 2,
        documentUri: outlineData.documentUri,
      },
    ]);
    expect(provider.getTreeItem(categories[0]!)).toMatchObject({
      label: '内容 (2)',
      collapsibleState: 2,
      contextValue: 'content',
      iconPath: { id: 'files' },
    });
  });

  it('keeps group children out of root categories and resolves group descendants', () => {
    const content = provider.getChildren()[0]!;
    const topLevelContent = provider.getChildren(content);

    expect(topLevelContent.map((element) => element.kind === 'node' && element.node.id)).toEqual([
      'group-1',
    ]);
    expect(provider.getChildren(topLevelContent[0]!)).toEqual([
      {
        kind: 'node',
        node: outlineData.nodes[1],
        documentUri: outlineData.documentUri,
      },
    ]);
  });

  it('projects node selection commands and locked metadata', () => {
    const content = provider.getChildren()[0]!;
    const group = provider.getChildren(content)[0]!;
    const media = provider.getChildren(group)[0]!;

    expect(provider.getTreeItem(media)).toMatchObject({
      label: 'Shot 1',
      collapsibleState: 0,
      description: 'video',
      tooltip: 'media: Shot 1 (locked)',
      contextValue: 'canvasNode',
      command: {
        command: 'neko.canvas.selectNodeFromOutline',
        arguments: ['media-1', outlineData.documentUri],
      },
      iconPath: { id: 'file-media' },
    });
  });

  it('projects labeled and unlabeled connections', () => {
    const connections = provider
      .getChildren()
      .find((element) => element.kind === 'category' && element.category === 'connections')!;
    const [labeled, unlabeled] = provider.getChildren(connections);

    expect(provider.getTreeItem(labeled!)).toMatchObject({
      label: 'Act 1 -> Render (next)',
      contextValue: 'canvasConnection',
      command: {
        command: 'neko.canvas.selectConnectionFromOutline',
        arguments: ['connection-1', outlineData.documentUri],
      },
    });
    expect(provider.getTreeItem(unlabeled!)).toMatchObject({
      label: 'Render -> Notes',
    });
    expect(provider.getChildren(labeled!)).toEqual([]);
  });

  it('returns no children after outline data is cleared', () => {
    provider.updateData(null);
    expect(provider.getChildren()).toEqual([]);
  });
});
