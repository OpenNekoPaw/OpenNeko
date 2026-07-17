/**
 * Asset Health Monitor
 *
 * Extension-layer service that:
 * 1. Provides concrete FileAccessChecker using Node.js fs
 * 2. Runs validation on extension activation
 * 3. Shows notification for offline/missing assets
 * 4. Provides "Relocate File" and "Show Health Report" commands
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { AssetFileStatus } from '@neko/shared';
import { handleError } from '../utils/errorHandler';
import type { AssetLibrary, FileAccessChecker, FileHealthResult } from '@neko/asset';
import { getLogger } from '../utils/logger';

const logger = getLogger('HealthMonitor');

/**
 * Create a concrete FileAccessChecker using Node.js fs.
 *
 * Resolves path variables (e.g. "${A}/path") before checking file accessibility.
 * Distinguishes between:
 * - online: file readable
 * - missing: parent directory accessible but file not found (likely deleted)
 * - offline: parent directory not accessible (likely NAS/variable not configured)
 *
 * @param resolvePath — optional function to expand path variables before checking.
 *   Typically `(p) => library.resolvePath(p)` from AssetLibrary.
 */
export function createFileAccessChecker(
  resolvePath?: (storedPath: string) => string,
): FileAccessChecker {
  return async (filePath: string): Promise<AssetFileStatus> => {
    const resolved = resolvePath ? resolvePath(filePath) : filePath;

    // If path still contains ${VAR} after resolve, the variable is not configured
    if (resolved.includes('${')) {
      return 'offline';
    }

    try {
      await fs.access(resolved, fs.constants.R_OK);
      return 'online';
    } catch {
      // Check if parent directory is accessible
      try {
        const dir = path.dirname(resolved);
        await fs.access(dir, fs.constants.R_OK);
        return 'missing'; // Directory ok but file gone → deleted/moved
      } catch {
        return 'offline'; // Directory inaccessible → NAS/mount issue
      }
    }
  };
}

export class AssetHealthMonitor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private statusBarItem: vscode.StatusBarItem;

  constructor(private readonly library: AssetLibrary) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBarItem.command = 'neko.assets.showHealthReport';
  }

  /**
   * Register commands for health monitoring.
   */
  registerCommands(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.commands.registerCommand('neko.assets.validateAll', () => this.runInitialCheck()),
      vscode.commands.registerCommand(
        'neko.assets.relocateFile',
        (fileId?: string, variantId?: string) => this.handleRelocateFile(fileId, variantId),
      ),
      vscode.commands.registerCommand('neko.assets.showHealthReport', () =>
        this.showHealthReport(),
      ),
    );

    for (const d of this.disposables) {
      context.subscriptions.push(d);
    }
  }

  /**
   * Run initial validation (non-blocking, with progress).
   */
  async runInitialCheck(): Promise<void> {
    try {
      const results = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'Validating assets...',
        },
        async (progress) => {
          return this.library.validateAll((checked, total) => {
            progress.report({
              increment: (1 / total) * 100,
              message: `${checked}/${total}`,
            });
          });
        },
      );

      this.updateStatusBar(results);
      this.notifyProblems(results);
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  private updateStatusBar(results: FileHealthResult[]): void {
    const problems = results.filter((r) => r.status !== 'online' && r.status !== 'remapped');

    if (problems.length === 0) {
      this.statusBarItem.hide();
      return;
    }

    const offline = problems.filter((r) => r.status === 'offline').length;
    const missing = problems.filter((r) => r.status === 'missing').length;

    const parts: string[] = [];
    if (offline > 0) parts.push(`${offline} offline`);
    if (missing > 0) parts.push(`${missing} missing`);

    this.statusBarItem.text = `$(warning) Assets: ${parts.join(', ')}`;
    this.statusBarItem.tooltip = 'Click to view asset health report';
    this.statusBarItem.show();
  }

  private notifyProblems(results: FileHealthResult[]): void {
    const problems = results.filter((r) => r.status !== 'online' && r.status !== 'remapped');
    if (problems.length === 0) return;

    const offline = problems.filter((r) => r.status === 'offline').length;
    const missing = problems.filter((r) => r.status === 'missing').length;

    const parts: string[] = [];
    if (offline > 0) parts.push(`${offline} offline`);
    if (missing > 0) parts.push(`${missing} missing`);

    vscode.window
      .showWarningMessage(`Asset issues detected: ${parts.join(', ')}`, 'Show Details', 'Dismiss')
      .then((action) => {
        if (action === 'Show Details') {
          vscode.commands.executeCommand('neko.assets.showHealthReport');
        }
      });
  }

  private async handleRelocateFile(fileId?: string, variantId?: string): Promise<void> {
    if (!fileId || !variantId) {
      void handleError(new Error('No file specified for relocation.'), { showToUser: true });
      return;
    }

    const newUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      title: 'Select new location for asset file',
    });
    if (!newUri?.[0]) return;

    try {
      const result = await this.library.relocateFile(variantId, fileId, newUri[0].fsPath);
      if (result) {
        await this.library.flush();
        vscode.window.showInformationMessage(`File relocated: ${path.basename(result.path)}`);
        vscode.commands.executeCommand('neko.assets.refreshViews');
        vscode.commands.executeCommand('neko.assets.entityChanged');
      }
    } catch (error) {
      void handleError(error instanceof Error ? error : new Error(String(error)), {
        showToUser: true,
      });
    }
  }

  private async showHealthReport(): Promise<void> {
    try {
      const results = await this.library.validateAll();
      const problems = results.filter((r) => r.status !== 'online' && r.status !== 'remapped');

      if (problems.length === 0) {
        vscode.window.showInformationMessage('All assets are accessible.');
        return;
      }

      // Show QuickPick with problem files
      const items = problems.map((r) => ({
        label: `$(${r.status === 'offline' ? 'cloud-offline' : 'error'}) ${path.basename(r.path)}`,
        description: r.entityName,
        detail: `${r.status === 'offline' ? 'Path not accessible' : 'File not found'}: ${r.path}`,
        result: r,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        title: `Asset Health Report (${problems.length} issues)`,
        placeHolder: 'Select a file to relocate...',
      });

      if (selected) {
        await this.handleRelocateFile(selected.result.fileId, selected.result.variantId);
      }
    } catch (error) {
      logger.error('Health report failed:', error);
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
