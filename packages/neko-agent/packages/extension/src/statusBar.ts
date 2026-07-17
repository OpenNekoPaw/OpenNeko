/**
 * NekoAgent Status Bar
 *
 * Shows the active LLM model and — when a canvas project is open — the
 * configured image/video generation models.
 *
 * Examples:
 *   $(hubot) claude-sonnet-4-6
 *   $(hubot) claude-sonnet-4-6  ✨ flux-dev  🎬 wan2.1
 *
 * Clicking opens the AI Assistant chat panel.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  getActiveGenerationConfig,
  onDidChangeGenerationConfig,
} from './services/canvasAmbientContext';

/**
 * Creates and manages the Neko Agent status bar item.
 * Returns a disposable that cleans up the item on deactivation.
 */
export function createStatusBar(platform: Platform): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'neko.ai.chat';
  item.tooltip = platform.config.getAssistantStatusBarPresentation().tooltip;

  function refresh(): void {
    const presentation = platform.config.getAssistantStatusBarPresentation(
      getActiveGenerationConfig(),
    );
    item.color = presentation.warning
      ? new vscode.ThemeColor('statusBarItem.warningForeground')
      : undefined;
    item.tooltip = presentation.tooltip;
    item.text = presentation.text;
    item.show();
  }

  refresh();

  // Refresh when LLM configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('neko')) {
      refresh();
    }
  });

  // Refresh when canvas generation config changes
  const genConfigWatcher = onDidChangeGenerationConfig(() => {
    refresh();
  });

  return {
    dispose: () => {
      configWatcher.dispose();
      genConfigWatcher.dispose();
      item.dispose();
    },
  };
}
