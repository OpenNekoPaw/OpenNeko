/**
 * ConfigFileHandler - user-owned config file opening
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  buildUserConfigTemplate as buildPlatformUserConfigTemplate,
  getUserConfigPath,
} from '@neko/platform';
import { getLogger } from '../../base';

const logger = getLogger('ConfigFileHandler');

export class ConfigFileHandler implements vscode.Disposable {
  constructor() {}

  /**
   * Initialize config file handler.
   */
  async init(): Promise<void> {
    logger.debug('Config file watching is disabled; snapshots load on Agent session/tab open.');
  }

  /**
   * Open ~/.neko/config.toml in the VS Code editor.
   * Platform owns the default config shape; Extension only opens the file.
   */
  async handleOpenUserConfigFile(): Promise<void> {
    const configPath = getUserConfigPath();
    if (!fs.existsSync(configPath)) {
      const doc = await vscode.workspace.openTextDocument({
        language: 'toml',
        content: buildUserConfigTemplate(),
      });
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.window.showInformationMessage(
        `Neko config file does not exist yet. Save this template as ${configPath} when ready.`,
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  dispose(): void {}
}

export function buildUserConfigTemplate(): string {
  return buildPlatformUserConfigTemplate();
}
