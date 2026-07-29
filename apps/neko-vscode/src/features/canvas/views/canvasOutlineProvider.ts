import * as vscode from 'vscode';
import { BaseOutlineProvider } from '@neko/shared/vscode/extension';

interface CanvasNodeInfo {
  id: string;
  type: string;
  label: string;
  detail?: string;
  locked?: boolean;
  childIds?: string[];
}

interface CanvasConnectionInfo {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  label?: string;
}

export interface CanvasOutlineData {
  documentUri: string;
  name: string;
  nodes: CanvasNodeInfo[];
  connections: CanvasConnectionInfo[];
}

type OutlineCategory = 'content' | 'ai-jobs' | 'references' | 'connections';

const CATEGORY_META: Record<OutlineCategory, { label: string; icon: string }> = {
  content: { label: '内容', icon: 'files' },
  'ai-jobs': { label: 'AI 作业', icon: 'sparkle' },
  references: { label: '引用', icon: 'references' },
  connections: { label: '连接', icon: 'git-merge' },
};

type OutlineElement =
  | { kind: 'category'; category: OutlineCategory; count: number; documentUri: string }
  | { kind: 'node'; node: CanvasNodeInfo; documentUri: string }
  | { kind: 'connection'; connection: CanvasConnectionInfo; documentUri: string };

const NODE_ICONS: Record<string, vscode.ThemeIcon> = {
  markdown: new vscode.ThemeIcon('markdown'),
  media: new vscode.ThemeIcon('file-media'),
  group: new vscode.ThemeIcon('symbol-folder'),
  job: new vscode.ThemeIcon('sparkle'),
  file: new vscode.ThemeIcon('file'),
  'canvas-embed': new vscode.ThemeIcon('window'),
};

const CONTENT_TYPES = new Set(['markdown', 'media', 'group']);
const REFERENCE_TYPES = new Set(['file', 'canvas-embed']);

export class CanvasOutlineProvider extends BaseOutlineProvider<OutlineElement, CanvasOutlineData> {
  private nodeMap = new Map<string, CanvasNodeInfo>();

  protected override onDataUpdated(_data: CanvasOutlineData | null): void {
    this.nodeMap.clear();
    for (const node of this.data?.nodes ?? []) {
      this.nodeMap.set(node.id, node);
    }
  }

  getTreeItem(element: OutlineElement): vscode.TreeItem {
    if (element.kind === 'category') {
      const meta = CATEGORY_META[element.category];
      const item = new vscode.TreeItem(
        `${meta.label} (${element.count})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon(meta.icon);
      item.contextValue = element.category;
      return item;
    }

    if (element.kind === 'connection') {
      const { connection } = element;
      const label = connection.label
        ? `${connection.sourceLabel} -> ${connection.targetLabel} (${connection.label})`
        : `${connection.sourceLabel} -> ${connection.targetLabel}`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('arrow-right');
      item.contextValue = 'canvasConnection';
      item.command = {
        command: 'neko.canvas.selectConnectionFromOutline',
        title: 'Select Connection',
        arguments: [connection.id, element.documentUri],
      };
      return item;
    }

    const hasChildren = element.node.type === 'group' && (element.node.childIds?.length ?? 0) > 0;
    const item = new vscode.TreeItem(
      element.node.label,
      hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = NODE_ICONS[element.node.type] ?? new vscode.ThemeIcon('circle-outline');
    item.description = element.node.detail;
    item.tooltip = `${element.node.type}: ${element.node.label}${element.node.locked ? ' (locked)' : ''}`;
    item.contextValue = 'canvasNode';
    item.command = {
      command: 'neko.canvas.selectNodeFromOutline',
      title: 'Select Node',
      arguments: [element.node.id, element.documentUri],
    };
    return item;
  }

  getChildren(element?: OutlineElement): OutlineElement[] {
    if (!this.data) return [];
    const { documentUri, nodes, connections } = this.data;

    if (!element) {
      return [
        category(
          'content',
          nodes.filter((node) => CONTENT_TYPES.has(node.type)).length,
          documentUri,
        ),
        category('ai-jobs', nodes.filter((node) => node.type === 'job').length, documentUri),
        category(
          'references',
          nodes.filter((node) => REFERENCE_TYPES.has(node.type)).length,
          documentUri,
        ),
        category('connections', connections.length, documentUri),
      ].filter((item) => item.count > 0);
    }

    if (element.kind === 'category') {
      if (element.category === 'connections') {
        return connections.map((connection) => ({ kind: 'connection', connection, documentUri }));
      }
      return nodes
        .filter((node) => {
          if (element.category === 'content') return CONTENT_TYPES.has(node.type);
          if (element.category === 'ai-jobs') return node.type === 'job';
          return REFERENCE_TYPES.has(node.type);
        })
        .filter((node) => !nodeIsGroupChild(node.id, nodes))
        .map((node) => ({ kind: 'node', node, documentUri }));
    }

    if (element.kind === 'node' && element.node.type === 'group') {
      return (element.node.childIds ?? [])
        .map((childId) => this.nodeMap.get(childId))
        .filter((node): node is CanvasNodeInfo => node !== undefined)
        .map((node) => ({ kind: 'node', node, documentUri }));
    }

    return [];
  }
}

function category(
  categoryValue: OutlineCategory,
  count: number,
  documentUri: string,
): Extract<OutlineElement, { kind: 'category' }> {
  return { kind: 'category', category: categoryValue, count, documentUri };
}

function nodeIsGroupChild(nodeId: string, nodes: readonly CanvasNodeInfo[]): boolean {
  return nodes.some((node) => node.type === 'group' && node.childIds?.includes(nodeId));
}
