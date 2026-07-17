/**
 * CanvasOutlineProvider - TreeDataProvider for canvas outline
 *
 * Displays a semantically grouped tree of canvas nodes in the Explorer sidebar:
 *   Scenes (with child Shots nested inside)
 *   Shots (standalone, not belonging to any scene)
 *   Galleries
 *   Media
 *   Annotations
 *   Connections
 *
 * Updates automatically when canvas data changes via postMessage.
 */
import * as vscode from 'vscode';
import { BaseOutlineProvider } from '@neko/shared/vscode/extension';

// =============================================================================
// Types (lightweight copies to avoid importing webview types)
// =============================================================================

interface CanvasNodeInfo {
  id: string;
  type: string;
  label: string;
  detail?: string;
  locked?: boolean;
  /** For container nodes: ordered child node ids contained in this node */
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

// =============================================================================
// Outline groups
// =============================================================================

type OutlineCategory =
  'scenes' | 'shots' | 'galleries' | 'media' | 'annotations' | 'other' | 'connections';

const CATEGORY_META: Record<OutlineCategory, { label: string; icon: string }> = {
  scenes: { label: '场景', icon: 'symbol-class' },
  shots: { label: '镜头', icon: 'device-camera-video' },
  galleries: { label: '画廊', icon: 'file-media' },
  media: { label: '媒体', icon: 'file-media' },
  annotations: { label: '标注', icon: 'edit' },
  other: { label: '其他', icon: 'symbol-misc' },
  connections: { label: '连接', icon: 'git-merge' },
};

// =============================================================================
// Tree Items
// =============================================================================

type OutlineElement =
  | { kind: 'category'; category: OutlineCategory; count: number; documentUri: string }
  | { kind: 'node'; node: CanvasNodeInfo; documentUri: string }
  | { kind: 'scene-child'; node: CanvasNodeInfo; parentSceneId: string; documentUri: string }
  | { kind: 'connection'; connection: CanvasConnectionInfo; documentUri: string };

// =============================================================================
// Icons
// =============================================================================

const NODE_ICONS: Record<string, vscode.ThemeIcon> = {
  media: new vscode.ThemeIcon('file-media'),
  storyboard: new vscode.ThemeIcon('note'),
  annotation: new vscode.ThemeIcon('edit'),
  text: new vscode.ThemeIcon('edit'),
  group: new vscode.ThemeIcon('symbol-folder'),
  shot: new vscode.ThemeIcon('device-camera-video'),
  scene: new vscode.ThemeIcon('symbol-class'),
  gallery: new vscode.ThemeIcon('file-media'),
  script: new vscode.ThemeIcon('file-code'),
  document: new vscode.ThemeIcon('file-text'),
  model: new vscode.ThemeIcon('package'),
  artboard: new vscode.ThemeIcon('browser'),
  'canvas-embed': new vscode.ThemeIcon('window'),
};

// =============================================================================
// Provider
// =============================================================================

export class CanvasOutlineProvider extends BaseOutlineProvider<OutlineElement, CanvasOutlineData> {
  /** Node IDs that belong to a scene (computed on data update) */
  private containedSceneChildIds = new Set<string>();
  /** Quick lookup: nodeId → CanvasNodeInfo */
  private nodeMap = new Map<string, CanvasNodeInfo>();

  // Recompute grouping data when outline data is updated
  protected override onDataUpdated(_data: CanvasOutlineData | null): void {
    this.containedSceneChildIds.clear();
    this.nodeMap.clear();
    const data = this.data;
    if (!data) return;
    for (const n of data.nodes) {
      this.nodeMap.set(n.id, n);
    }
    for (const n of data.nodes) {
      if (n.type === 'scene' && n.childIds) {
        for (const childId of n.childIds) {
          this.containedSceneChildIds.add(childId);
        }
      }
    }
  }

  getTreeItem(element: OutlineElement): vscode.TreeItem {
    switch (element.kind) {
      case 'category': {
        const meta = CATEGORY_META[element.category];
        const item = new vscode.TreeItem(
          `${meta.label} (${element.count})`,
          element.count > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.iconPath = new vscode.ThemeIcon(meta.icon);
        item.contextValue = element.category;
        return item;
      }

      case 'node':
      case 'scene-child': {
        const { node } = element;
        const hasChildren = node.type === 'scene' && (node.childIds?.length ?? 0) > 0;
        const item = new vscode.TreeItem(
          node.label,
          hasChildren
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = NODE_ICONS[node.type] ?? new vscode.ThemeIcon('circle-outline');
        item.description = node.detail;
        item.tooltip = `${node.type}: ${node.label}${node.locked ? ' 🔒' : ''}`;
        item.contextValue = element.kind === 'scene-child' ? 'sceneChild' : 'canvasNode';
        item.command = {
          command: 'neko.canvas.selectNodeFromOutline',
          title: 'Select Node',
          arguments: [node.id, element.documentUri],
        };
        return item;
      }

      case 'connection': {
        const { connection } = element;
        const label = connection.label
          ? `${connection.sourceLabel} → ${connection.targetLabel} (${connection.label})`
          : `${connection.sourceLabel} → ${connection.targetLabel}`;
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
    }
  }

  getChildren(element?: OutlineElement): OutlineElement[] {
    if (!this.data) return [];

    // Root: show categories (only those with items)
    if (!element) {
      const { documentUri } = this.data;
      const nodes = this.data.nodes;
      const scenes = nodes.filter((n) => n.type === 'scene');
      const standaloneShots = nodes.filter(
        (n) => n.type === 'shot' && !this.containedSceneChildIds.has(n.id),
      );
      const galleries = nodes.filter((n) => n.type === 'gallery');
      const media = nodes.filter((n) => n.type === 'media');
      const annotations = nodes.filter((n) => n.type === 'annotation' || n.type === 'text');
      const other = nodes.filter(
        (n) => !['scene', 'shot', 'gallery', 'media', 'annotation', 'text'].includes(n.type),
      );
      const conns = this.data.connections;

      const cats: OutlineElement[] = [];
      if (scenes.length > 0)
        cats.push({ kind: 'category', category: 'scenes', count: scenes.length, documentUri });
      if (standaloneShots.length > 0)
        cats.push({
          kind: 'category',
          category: 'shots',
          count: standaloneShots.length,
          documentUri,
        });
      if (galleries.length > 0)
        cats.push({
          kind: 'category',
          category: 'galleries',
          count: galleries.length,
          documentUri,
        });
      if (media.length > 0)
        cats.push({ kind: 'category', category: 'media', count: media.length, documentUri });
      if (annotations.length > 0)
        cats.push({
          kind: 'category',
          category: 'annotations',
          count: annotations.length,
          documentUri,
        });
      if (other.length > 0)
        cats.push({ kind: 'category', category: 'other', count: other.length, documentUri });
      if (conns.length > 0)
        cats.push({
          kind: 'category',
          category: 'connections',
          count: conns.length,
          documentUri,
        });
      return cats;
    }

    // Category → children
    if (element.kind === 'category') {
      const { documentUri } = element;
      const nodes = this.data.nodes;
      switch (element.category) {
        case 'scenes':
          return nodes
            .filter((n) => n.type === 'scene')
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'shots':
          return nodes
            .filter((n) => n.type === 'shot' && !this.containedSceneChildIds.has(n.id))
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'galleries':
          return nodes
            .filter((n) => n.type === 'gallery')
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'media':
          return nodes
            .filter((n) => n.type === 'media')
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'annotations':
          return nodes
            .filter((n) => n.type === 'annotation' || n.type === 'text')
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'other':
          return nodes
            .filter(
              (n) => !['scene', 'shot', 'gallery', 'media', 'annotation', 'text'].includes(n.type),
            )
            .map((node) => ({ kind: 'node' as const, node, documentUri }));
        case 'connections':
          return this.data.connections.map((connection) => ({
            kind: 'connection' as const,
            connection,
            documentUri,
          }));
      }
    }

    // Scene node → container children
    if (
      (element.kind === 'node' || element.kind === 'scene-child') &&
      element.node.type === 'scene'
    ) {
      const childIds = element.node.childIds ?? [];
      return childIds
        .map((childId) => this.nodeMap.get(childId))
        .filter((n): n is CanvasNodeInfo => n !== undefined)
        .map((node) => ({
          kind: 'scene-child' as const,
          node,
          parentSceneId: element.node.id,
          documentUri: element.documentUri,
        }));
    }

    return [];
  }
}
