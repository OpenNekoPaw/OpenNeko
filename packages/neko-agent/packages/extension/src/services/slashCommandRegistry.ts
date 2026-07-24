/**
 * SlashCommandRegistry
 *
 * Allows other VSCode extensions (neko-canvas, neko-cut, etc.) to register
 * custom slash commands into the neko-agent chat panel.
 *
 * Usage from an extension:
 *   vscode.commands.executeCommand('neko.agent.registerSlashCommands', 'neko.neko-canvas', [
 *     { id: 'batch', name: '/batch', description: 'Batch generate images for selected shots', icon: '🖼️' },
 *     { id: 'export', name: '/export', description: 'Export storyboard to PDF/ZIP', icon: '📦' },
 *   ]);
 *
 * The registry pushes the updated merged list to the webview automatically.
 */

import * as vscode from 'vscode';
import {
  createRuntimePluginSlashCommandRegistry,
  type PluginSlashCommandDef,
  type RegisteredPluginSlashCommand,
  type RuntimePluginSlashCommandRegistry,
} from '@neko/agent/runtime';

export type { PluginSlashCommandDef, RegisteredPluginSlashCommand };

/**
 * Registry that aggregates plugin slash commands from all registered extensions.
 * Implements vscode.Disposable for clean teardown.
 */
class SlashCommandRegistry implements vscode.Disposable {
  private readonly _runtime: RuntimePluginSlashCommandRegistry =
    createRuntimePluginSlashCommandRegistry();
  private readonly _onChange = new vscode.EventEmitter<void>();

  /** Fired whenever the registered command set changes */
  readonly onDidChange = this._onChange.event;

  /**
   * Register (or replace) commands from a specific extension.
   * @param extensionId - The extension's unique ID
   * @param commands    - Commands to expose in the chat panel
   */
  register(extensionId: string, commands: PluginSlashCommandDef[]): void {
    this._runtime.register(extensionId, commands);
    this._onChange.fire();
  }

  /**
   * Unregister all commands from a specific extension.
   */
  unregister(extensionId: string): void {
    if (this._runtime.unregister(extensionId)) {
      this._onChange.fire();
    }
  }

  /**
   * Get all registered plugin commands as a flat list (sorted by extensionId for stability).
   */
  getAll(): RegisteredPluginSlashCommand[] {
    return this._runtime.getAll();
  }

  dispose(): void {
    this._runtime.clear();
    this._onChange.dispose();
  }
}

/** Singleton instance shared across the extension activation */
let _registry: SlashCommandRegistry | undefined;

export function getSlashCommandRegistry(): SlashCommandRegistry {
  if (!_registry) {
    _registry = new SlashCommandRegistry();
  }
  return _registry;
}
