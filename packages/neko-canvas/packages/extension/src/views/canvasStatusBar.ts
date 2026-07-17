/**
 * CanvasStatusBar - Manages VSCode native status bar items for canvas editor
 *
 * Shows node count, connection count, and zoom level in the VSCode status bar.
 * Items are only visible when a canvas editor is active.
 */
import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';

// =============================================================================
// Types
// =============================================================================

export interface CanvasStatusInfo {
  nodeCount: number;
  connectionCount: number;
  zoom: number;
  selectedCount: number;
  subsystemSummary?: string;
  projectionSummary?: string;
}

// =============================================================================
// IDs
// =============================================================================

const ID = {
  structure: 'neko.canvas.structure',
  zoom: 'neko.canvas.zoom',
  context: 'neko.canvas.context',
} as const;

const CONTEXT_TEXT_PREFIX = '$(symbol-namespace) ';
const CONTEXT_TEXT_MAX_LENGTH = 72;

// =============================================================================
// Manager
// =============================================================================

export class CanvasStatusBar implements vscode.Disposable {
  private readonly group: StatusBarGroup;

  constructor() {
    this.group = new StatusBarGroup([
      {
        id: ID.structure,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 100,
        name: 'Canvas Structure',
        tooltip: 'Number of nodes and connections on canvas',
      },
      {
        id: ID.zoom,
        alignment: vscode.StatusBarAlignment.Right,
        priority: 101,
        name: 'Canvas Zoom',
        tooltip: 'Canvas zoom level (click to reset)',
        command: 'neko.canvas.resetZoom',
      },
      {
        id: ID.context,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 98,
        name: 'Canvas Context',
        tooltip: 'Selected items, active subsystems, and projection status',
        visible: 'conditional',
      },
    ]);
  }

  /** Update all status bar items with current canvas info */
  update(info: CanvasStatusInfo): void {
    this.group.update(
      ID.structure,
      `$(symbol-class) ${info.nodeCount} nodes · $(git-merge) ${info.connectionCount}`,
    );
    this.group.update(ID.zoom, `$(zoom-in) ${Math.round(info.zoom * 100)}%`);

    const contextParts: string[] = [];
    if (info.selectedCount > 0) {
      contextParts.push(`${info.selectedCount} selected`);
    }
    if (info.subsystemSummary) {
      contextParts.push(info.subsystemSummary);
    }
    if (info.projectionSummary) {
      contextParts.push(info.projectionSummary);
    }

    this.group.setVisible(ID.context, contextParts.length > 0);
    if (contextParts.length > 0) {
      const contextText = contextParts.join(' · ');
      this.group.update(
        ID.context,
        `${CONTEXT_TEXT_PREFIX}${truncateStatusText(contextText)}`,
        contextText,
      );
    }
  }

  /** Show all status bar items (when canvas editor is active) */
  show(): void {
    this.group.show();
  }

  /** Hide all status bar items (when canvas editor is not active) */
  hide(): void {
    this.group.hide();
  }

  dispose(): void {
    this.group.dispose();
  }
}

function truncateStatusText(text: string): string {
  if (text.length <= CONTEXT_TEXT_MAX_LENGTH) {
    return text;
  }

  const maxContentLength = CONTEXT_TEXT_MAX_LENGTH - 3;
  const truncated = text.slice(0, maxContentLength).trimEnd();
  const separatorIndex = truncated.lastIndexOf(' · ');
  const wordIndex = truncated.lastIndexOf(' ');
  const minimumReadableLength = Math.floor(maxContentLength * 0.6);
  const cutIndex =
    separatorIndex >= minimumReadableLength
      ? separatorIndex
      : wordIndex >= minimumReadableLength
        ? wordIndex
        : maxContentLength;

  return `${truncated.slice(0, cutIndex).trimEnd()}...`;
}
