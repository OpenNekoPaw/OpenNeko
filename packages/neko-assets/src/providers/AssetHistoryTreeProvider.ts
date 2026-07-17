/**
 * Asset History Tree View Provider
 *
 * TreeDataProvider for the Activity Bar "History" view.
 * Shows recent asset changes based on Git history.
 */

import * as vscode from 'vscode';
import type { AssetLibrary } from '@neko/asset';
import type { ThumbnailService } from '../services/ThumbnailService';
import { createThumbnailTooltip } from '../utils/thumbnailTooltip';

// =============================================================================
// Tree Items
// =============================================================================

class RecentEntityItem extends vscode.TreeItem {
  constructor(
    name: string,
    category: string,
    lastUsedAt: number | undefined,
    filePath?: string,
    thumbnailPath?: string | null,
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = category;
    this.contextValue = 'recentEntity';

    // Use thumbnail as icon when available, otherwise history icon
    if (thumbnailPath) {
      this.iconPath = vscode.Uri.file(thumbnailPath);
    } else {
      this.iconPath = new vscode.ThemeIcon('history');
    }

    const lastUsedText = lastUsedAt ? `Last used: ${new Date(lastUsedAt).toLocaleString()}` : '';
    this.tooltip = createThumbnailTooltip(thumbnailPath, [name, lastUsedText]);

    if (filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
    }
  }
}

// =============================================================================
// Provider
// =============================================================================

export class AssetHistoryTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly library: AssetLibrary,
    private readonly thumbnailService: ThumbnailService,
  ) {
    this.disposables.push(thumbnailService.onDidGenerateThumbnail(() => this.debouncedRefresh()));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private debouncedRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 500);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.disposables.forEach((d) => d.dispose());
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    const recent = await this.library.getRecent(20);
    if (recent.length === 0) {
      return [new vscode.TreeItem('No recent assets')];
    }

    // Preheat thumbnails for recent entities
    const filePaths = recent
      .flatMap((e) => e.variants.flatMap((v) => v.files.map((f) => f.path)))
      .filter(Boolean);
    if (filePaths.length > 0) {
      this.thumbnailService.preheat(filePaths);
    }

    return recent.map((entity) => {
      const defaultVariant =
        entity.variants.find((v) => v.id === entity.defaultVariantId) ?? entity.variants[0];
      const primaryFile = defaultVariant?.files[0];
      return new RecentEntityItem(
        entity.name,
        entity.category,
        entity.lastUsedAt,
        primaryFile?.path,
        defaultVariant?.thumbnailPath,
      );
    });
  }
}
