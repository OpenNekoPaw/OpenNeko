/**
 * File Operation Handler - Handles file/URL opening and download messages
 *
 * Responsible for:
 * - Opening files in VSCode (with media routing)
 * - Opening URLs in external browser
 * - Opening prompt config, agents, settings, skill, and command files
 * - Downloading SVG files
 */

import * as vscode from 'vscode';
import * as os from 'os';
import type { Platform } from '@neko/platform';
import {
  buildConfigFilePath,
  buildSvgDownloadPlan,
  buildSvgDownloadSavedMessage,
  createOpenFilePlan,
  stripFileProtocol,
  type SaveDialogFilterPlan,
} from '@neko/platform/files';
import type { ContentLocator, DocumentLocator } from '@neko/shared';
import { getLogger, handleError } from '../../base';
import type { GeneratedAssetLookup } from '../../services/generatedAssetOpenResolver';

const logger = getLogger('FileOperationHandler');

/**
 * Dependencies for FileOperationHandler
 */
export interface FileOperationHandlerDeps {
  platform?: Platform;
  generatedAssetLookup?: GeneratedAssetLookup;
}

/**
 * Handler for file operation webview messages
 */
export class FileOperationHandler {
  constructor(private deps: FileOperationHandlerDeps) {}

  updateDeps(partial: Partial<FileOperationHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  async handleOpenFile(contentLocator: ContentLocator): Promise<void> {
    try {
      const plan = createOpenFilePlan(this._resolveContentLocatorPath(contentLocator));
      if (!plan) return;
      const uri = this._uriForOpenFilePath(plan.cleanPath);

      if (plan.viewer === 'video') {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
      } else if (plan.viewer === 'audio') {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
      } else {
        await vscode.commands.executeCommand('vscode.open', uri);
      }
    } catch (error) {
      logger.error('Failed to open file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleRevealDocumentLocator(input: {
    readonly contentLocator: ContentLocator;
    readonly locator: DocumentLocator;
  }): Promise<void> {
    try {
      const filePath = this._resolveContentLocatorPath(input.contentLocator);
      await vscode.commands.executeCommand('neko.preview.revealDocumentLocator', {
        filePath,
        locator: input.locator,
      });
    } catch (error) {
      logger.warn('Failed to reveal document locator, opening file instead:', error);
      await this.handleOpenFile(input.contentLocator);
    }
  }

  async handleOpenUrl(url: string): Promise<void> {
    if (!url) return;

    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (error) {
      logger.error('Failed to open URL:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleOpenConfigFile(): Promise<void> {
    try {
      const configPath = buildConfigFilePath(os.homedir());
      const uri = vscode.Uri.file(configPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      logger.error('Failed to open config file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleRevealFile(contentLocator: ContentLocator): Promise<void> {
    try {
      const cleanPath = stripFileProtocol(this._resolveContentLocatorPath(contentLocator));
      const uri = vscode.Uri.file(cleanPath);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } catch (error) {
      logger.error('Failed to reveal file:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  async handleDownloadSvg(svg: string, filename: string): Promise<void> {
    const plan = buildSvgDownloadPlan({ svg, filename });
    if (!plan) return;

    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(plan.defaultFileName),
        filters: this._toVscodeSaveFilters(plan.filters),
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(plan.content, 'utf-8'));
        vscode.window.showInformationMessage(buildSvgDownloadSavedMessage(uri.fsPath));
      }
    } catch (error) {
      logger.error('Failed to save SVG:', error);
      handleError(error, { showToUser: true, severity: 'error' });
    }
  }

  private _uriForOpenFilePath(cleanPath: string): vscode.Uri {
    if (cleanPath.startsWith('/')) {
      return vscode.Uri.file(cleanPath);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);
    }

    return vscode.Uri.file(cleanPath);
  }

  private _resolveContentLocatorPath(locator: ContentLocator): string {
    switch (locator.kind) {
      case 'workspace-file':
        return locator.path;
      case 'document-entry':
        return locator.source.path;
      case 'generated-output': {
        const indexedPath = this.deps.generatedAssetLookup?.get(locator.outputId)?.path;
        return indexedPath ?? locator.path;
      }
      case 'package-resource':
        throw new Error(
          `Package resource '${locator.packageId}/${locator.resourcePath}' cannot be opened as a workspace file.`,
        );
    }
  }

  private async _openFilePath(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  private _toVscodeSaveFilters(filters: readonly SaveDialogFilterPlan[]): Record<string, string[]> {
    return Object.fromEntries(filters.map((filter) => [filter.name, filter.extensions]));
  }
}
