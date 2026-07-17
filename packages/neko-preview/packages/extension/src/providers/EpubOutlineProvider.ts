/**
 * EpubOutlineProvider — TreeDataProvider for the Explorer sidebar.
 *
 * Shows the EPUB table of contents as a collapsible tree. Unlike
 * DocumentSymbolProvider, this works with Custom Editors which do not
 * produce a TextDocument for the built-in Outline panel.
 *
 * Lifecycle:
 *   1. EPUB custom editor becomes active → call update(entries)
 *   2. Another editor gains focus       → call clear()
 */

import * as vscode from 'vscode';
import type { TocEntry } from '../epub/EpubParser';

// =============================================================================
// Tree Node
// =============================================================================

export interface TocNode {
  entry: TocEntry;
  children: TocNode[];
}

// =============================================================================
// Provider
// =============================================================================

export class EpubOutlineProvider implements vscode.TreeDataProvider<TocNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TocNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private roots: TocNode[] = [];
  private activeHref: string | null = null;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Replace the outline with a new set of TOC entries. */
  update(entries: TocEntry[]): void {
    this.roots = buildHierarchy(entries);
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Mark the current chapter href and return the matching node if found. */
  setActiveHref(href: string | null): TocNode | undefined {
    if (this.activeHref !== href) {
      this.activeHref = href;
      this._onDidChangeTreeData.fire(undefined);
    }
    return href ? findNodeByHref(this.roots, href) : undefined;
  }

  /** Clear the outline (e.g. when no EPUB editor is active). */
  clear(): void {
    this.activeHref = null;
    this.roots = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider implementation
  // ---------------------------------------------------------------------------

  getTreeItem(element: TocNode): vscode.TreeItem {
    const hasChildren = element.children.length > 0;
    const isActive = this.activeHref ? matchesHref(element.entry.href, this.activeHref) : false;
    const item = new vscode.TreeItem(
      element.entry.label || 'Untitled',
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    item.description = element.entry.href;
    item.tooltip = isActive ? `${element.entry.label} (Current chapter)` : element.entry.label;
    item.iconPath = new vscode.ThemeIcon(
      isActive ? 'circle-filled' : hasChildren ? 'book' : 'bookmark',
    );
    item.command = {
      command: 'neko.epub.goToChapter',
      title: 'Go to Chapter',
      arguments: [element.entry.href],
    };

    return item;
  }

  getChildren(element?: TocNode): TocNode[] {
    if (!element) return this.roots;
    return element.children;
  }

  getParent(_element: TocNode): TocNode | undefined {
    // Flat search — acceptable for typical TOC sizes (< 500 entries)
    return findParent(this.roots, _element);
  }

  // ---------------------------------------------------------------------------
  // Disposable
  // ---------------------------------------------------------------------------

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a parent-child hierarchy from a flat list of TocEntry objects
 * using the `depth` field.
 *
 * depth=0 → root, depth=1 → child of previous depth-0, etc.
 */
function buildHierarchy(entries: TocEntry[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const entry of entries) {
    const node: TocNode = { entry, children: [] };

    // Pop stack until we find a parent at shallower depth
    while (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (!parent || parent.entry.depth < entry.depth) {
        break;
      }
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
      }
    }

    stack.push(node);
  }

  return roots;
}

/** Walk the tree to find the parent of a given node (for reveal support). */
function findParent(roots: TocNode[], target: TocNode): TocNode | undefined {
  for (const root of roots) {
    const result = findParentInSubtree(root, target);
    if (result) return result;
  }
  return undefined;
}

function findParentInSubtree(node: TocNode, target: TocNode): TocNode | undefined {
  for (const child of node.children) {
    if (child === target) return node;
    const result = findParentInSubtree(child, target);
    if (result) return result;
  }
  return undefined;
}

function findNodeByHref(nodes: TocNode[], href: string): TocNode | undefined {
  for (const node of nodes) {
    if (matchesHref(node.entry.href, href)) return node;
    const nested = findNodeByHref(node.children, href);
    if (nested) return nested;
  }
  return undefined;
}

function matchesHref(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}
