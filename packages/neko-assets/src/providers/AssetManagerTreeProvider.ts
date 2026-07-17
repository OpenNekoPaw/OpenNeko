/**
 * Asset Manager Tree View Provider
 *
 * TreeDataProvider for the Activity Bar "Assets" view.
 * Shows entities grouped by category, with variants as children.
 */

import * as vscode from 'vscode';
import type { AssetEntity, AssetVariant, EntityCategory } from '@neko/shared';
import type { AssetLibrary } from '@neko/asset';
import type { ThumbnailService } from '../services/ThumbnailService';
import { createThumbnailTooltip } from '../utils/thumbnailTooltip';

// =============================================================================
// Tree Item Types
// =============================================================================

export type AssetTreeItem = CategoryItem | EntityItem | VariantItem;

class CategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: EntityCategory,
    public readonly entityCount: number,
  ) {
    super(getCategoryLabel(category), vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${entityCount}`;
    this.iconPath = new vscode.ThemeIcon(getCategoryIcon(category));
    this.contextValue = 'category';
  }
}

class EntityItem extends vscode.TreeItem {
  constructor(public readonly entity: AssetEntity) {
    super(
      entity.name,
      entity.variants.length > 1
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description =
      entity.variants.length > 1 ? `${entity.variants.length} variants` : undefined;
    this.contextValue = 'entity';
    // Check if any files have accessibility issues
    const hasProblems = entity.variants.some((v) =>
      v.files.some((f) => f.status === 'offline' || f.status === 'missing'),
    );

    // Use thumbnail as icon if available, otherwise fall back to theme icon
    const defaultVariant =
      entity.variants.find((v) => v.id === entity.defaultVariantId) ?? entity.variants[0];

    const ownershipLabel = entity.ownership
      ? `Scope: ${entity.ownership.scope} (${entity.ownership.access})`
      : undefined;
    this.tooltip = createThumbnailTooltip(defaultVariant?.thumbnailPath, [
      entity.name,
      entity.description ?? '',
      entity.tags.length > 0 ? `Tags: ${entity.tags.join(', ')}` : '',
      ownershipLabel ?? '',
    ]);
    if (hasProblems) {
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
    } else if (defaultVariant?.thumbnailPath) {
      this.iconPath = vscode.Uri.file(defaultVariant.thumbnailPath);
    } else {
      this.iconPath = new vscode.ThemeIcon('file-media');
    }

    // Single variant → show primary file path
    if (entity.variants.length === 1 && entity.variants[0]?.files[0]) {
      const file = entity.variants[0].files[0];
      this.resourceUri = vscode.Uri.file(file.path);
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
    }
  }
}

class VariantItem extends vscode.TreeItem {
  constructor(
    public readonly entity: AssetEntity,
    public readonly variant: AssetVariant,
  ) {
    super(variant.name, vscode.TreeItemCollapsibleState.None);

    // Check for offline/missing files
    const offlineFiles = variant.files.filter(
      (f) => f.status === 'offline' || f.status === 'missing',
    );

    if (offlineFiles.length > 0) {
      this.description = `${offlineFiles.length} offline`;
      this.contextValue = 'variant:hasOffline';
    } else {
      this.description = variant.files.length > 0 ? `${variant.files.length} files` : 'no files';
      this.contextValue = 'variant';
    }

    // Use thumbnail as icon if available
    if (offlineFiles.length > 0) {
      this.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor('list.warningForeground'),
      );
    } else if (variant.thumbnailPath) {
      this.iconPath = vscode.Uri.file(variant.thumbnailPath);
    } else {
      this.iconPath = new vscode.ThemeIcon('versions');
    }

    this.tooltip = createThumbnailTooltip(variant.thumbnailPath, [
      variant.name,
      this.description as string,
    ]);

    if (variant.files[0]) {
      this.resourceUri = vscode.Uri.file(variant.files[0].path);
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

export class AssetManagerTreeProvider
  implements vscode.TreeDataProvider<AssetTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AssetTreeItem | undefined>();
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

  async getEntityTreeItem(entityId: string): Promise<AssetTreeItem | undefined> {
    const entity = await this.library.getEntity(entityId);
    return entity ? new EntityItem(entity) : undefined;
  }

  async getParent(element: AssetTreeItem): Promise<AssetTreeItem | undefined> {
    if (element instanceof CategoryItem) {
      return undefined;
    }
    if (element instanceof EntityItem) {
      const entities = await this.library.getByCategory(element.entity.category);
      return new CategoryItem(element.entity.category, entities.length);
    }
    if (element instanceof VariantItem) {
      return new EntityItem(element.entity);
    }
    return undefined;
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

  async getTreeItem(element: AssetTreeItem): Promise<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: AssetTreeItem): Promise<AssetTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element instanceof CategoryItem) {
      return this.getEntitiesForCategory(element.category);
    }
    if (element instanceof EntityItem && element.entity.variants.length > 1) {
      return element.entity.variants.map((v) => new VariantItem(element.entity, v));
    }
    return [];
  }

  private async getRootItems(): Promise<CategoryItem[]> {
    const entities = await this.library.getAllEntities();
    const grouped = new Map<EntityCategory, number>();

    for (const entity of entities) {
      grouped.set(entity.category, (grouped.get(entity.category) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => new CategoryItem(category, count));
  }

  private async getEntitiesForCategory(category: EntityCategory): Promise<EntityItem[]> {
    const entities = await this.library.getByCategory(category);
    const items = entities.sort((a, b) => b.updatedAt - a.updatedAt).map((e) => new EntityItem(e));

    // Preheat thumbnails for visible entities
    const filePaths = entities
      .flatMap((e) => e.variants.flatMap((v) => v.files.map((f) => f.path)))
      .filter(Boolean);
    if (filePaths.length > 0) {
      this.thumbnailService.preheat(filePaths);
    }

    return items;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getCategoryLabel(category: EntityCategory): string {
  const labels: Record<EntityCategory, string> = {
    character: 'Characters',
    creature: 'Creatures',
    object: 'Objects',
    vehicle: 'Vehicles',
    environment: 'Environments',
    effect: 'Effects',
    ui: 'UI',
    audio: 'Audio',
    document: 'Documents',
  };
  return labels[category] ?? category;
}

function getCategoryIcon(category: EntityCategory): string {
  const icons: Record<EntityCategory, string> = {
    character: 'person',
    creature: 'bug',
    object: 'package',
    vehicle: 'rocket',
    environment: 'globe',
    effect: 'sparkle',
    ui: 'layout',
    audio: 'unmute',
    document: 'file-text',
  };
  return icons[category] ?? 'file';
}
