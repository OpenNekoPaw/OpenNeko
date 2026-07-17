/**
 * Asset File Decoration Provider
 *
 * Enhances the VS Code Explorer tree with asset metadata:
 * - Badge: media duration (e.g., "1:30") or resolution (e.g., "4K")
 * - Tooltip: full metadata (codec, resolution, fps, audio info)
 *
 * Metadata comes from the AssetLibrary — files must be imported/registered
 * to show decorations. Uses on-demand probing (no background scanning).
 */

import * as vscode from 'vscode';
import type { AssetLibrary } from '@neko/asset';
import type { AssetEntity, AssetFile, AssetFileStatus, MediaFileMetadata } from '@neko/shared';
import { isMediaFile } from '@neko/shared';
import { formatDuration, formatResolution, buildMetadataTooltip } from '../utils/formatters';

// =============================================================================
// Provider
// =============================================================================

export class AssetFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  /** Cache: file path → asset file data (to avoid repeated lookups) */
  private fileCache = new Map<string, AssetFile | null>();

  constructor(private readonly library: AssetLibrary) {}

  /**
   * Provide file decoration for a given URI.
   *
   * Only decorates files that:
   * 1. Are known media types (video/audio/image)
   * 2. Have been imported into the AssetLibrary (have metadata)
   */
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    // Only process file:// URIs
    if (uri.scheme !== 'file') return undefined;

    // Only process media files
    if (!isMediaFile(uri.fsPath)) return undefined;

    // Look up cached file data
    const cached = this.fileCache.get(uri.fsPath);
    if (cached === null) return undefined; // Known to have no data
    if (cached) {
      return this.createDecorationForFile(cached);
    }

    // Trigger async lookup (don't block)
    this.lookupFile(uri.fsPath);
    return undefined;
  }

  /**
   * Refresh decorations for specific files or all files.
   */
  refresh(uris?: vscode.Uri[]): void {
    if (uris) {
      for (const uri of uris) {
        this.fileCache.delete(uri.fsPath);
      }
      this._onDidChangeFileDecorations.fire(uris);
    } else {
      this.fileCache.clear();
      this._onDidChangeFileDecorations.fire(undefined);
    }
  }

  // =========================================================================
  // Private
  // =========================================================================

  private createDecorationForFile(file: AssetFile): vscode.FileDecoration {
    // Status-based decorations take priority
    if (file.status === 'offline') {
      return {
        badge: '⚡',
        tooltip: 'Asset offline — path not accessible',
        color: new vscode.ThemeColor('list.warningForeground'),
      };
    }
    if (file.status === 'missing') {
      return {
        badge: '✕',
        tooltip: 'Asset missing — file not found',
        color: new vscode.ThemeColor('list.errorForeground'),
      };
    }

    // Normal metadata-based decoration
    return this.createDecoration(file.metadata);
  }

  private createDecoration(metadata: MediaFileMetadata): vscode.FileDecoration {
    // Determine badge content
    let badge: string | undefined;

    if (metadata.duration) {
      badge = formatDuration(metadata.duration);
    } else if (metadata.width && metadata.height) {
      badge = formatResolution(metadata.width, metadata.height);
    }

    // Badge is limited to 2 characters in VS Code FileDecoration
    // For longer strings, we truncate to fit
    if (badge && badge.length > 2) {
      // Use abbreviated format: "1m" for 1 minute, "4K" etc.
      if (metadata.duration) {
        const minutes = Math.round(metadata.duration / 60);
        if (minutes > 0) {
          badge = `${minutes}m`;
        } else {
          badge = `${Math.round(metadata.duration)}s`;
        }
      }
      // Resolution labels like "4K" already fit in 2 chars
      if (badge && badge.length > 2) {
        badge = badge.slice(0, 2);
      }
    }

    return {
      badge,
      tooltip: buildMetadataTooltip(metadata),
    };
  }

  private async lookupFile(fsPath: string): Promise<void> {
    try {
      const file = await this.findFileByPath(fsPath);
      this.fileCache.set(fsPath, file);

      if (file) {
        // Trigger re-render for this file
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(fsPath));
      }
    } catch {
      this.fileCache.set(fsPath, null);
    }
  }

  /**
   * Find metadata for a file path by searching through all entities.
   * Also returns file status for decoration.
   */
  private async findFileByPath(fsPath: string): Promise<AssetFile | null> {
    try {
      const entities: AssetEntity[] = await this.library.getAllEntities();

      for (const entity of entities) {
        for (const variant of entity.variants) {
          for (const file of variant.files) {
            if (this.pathMatches(file.path, fsPath)) {
              return file;
            }
          }
        }
      }
    } catch {
      // Library not initialized or other error
    }

    return null;
  }

  /**
   * Find metadata for a file path by searching through all entities.
   */
  private async findMetadataByPath(fsPath: string): Promise<MediaFileMetadata | null> {
    const file = await this.findFileByPath(fsPath);
    return file?.metadata ?? null;
  }

  /**
   * Check if an asset file path matches the given filesystem path.
   * Handles both relative and absolute paths.
   */
  private pathMatches(assetPath: string, fsPath: string): boolean {
    // Normalize both paths
    const normalizedAsset = assetPath.replace(/\\/g, '/');
    const normalizedFs = fsPath.replace(/\\/g, '/');

    // Direct match
    if (normalizedAsset === normalizedFs) return true;

    // Asset path might be relative — check if fsPath ends with it
    if (normalizedFs.endsWith(normalizedAsset)) return true;

    return false;
  }
}
