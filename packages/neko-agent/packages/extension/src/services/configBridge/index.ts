/**
 * ConfigBridge - Unified config message routing service
 *
 * Host effect service for config projection and user config file interaction.
 */

import * as vscode from 'vscode';
import { type Platform } from '@neko/platform';
import { runConfigBridgeQueryRuntime, type ConfigBridgeQueryRequest } from '@neko/agent/runtime';

import type { PostMessageFn, WebviewConfigState } from './types';
import { ConfigFileHandler } from './configFileHandler';

export type { PostMessageFn } from './types';

export class ConfigBridge implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeWebviews: Set<PostMessageFn> = new Set();

  // Domain handlers
  private readonly configFile: ConfigFileHandler;
  constructor(
    private readonly platform: Platform,
    _context?: vscode.ExtensionContext,
  ) {
    // Initialize domain handlers
    this.configFile = new ConfigFileHandler();
    // Register disposable sub-handlers
    this.disposables.push(this.configFile);

    // Initialize all handlers
    void this.configFile.init();
  }

  registerWebview(postMessage: PostMessageFn): vscode.Disposable {
    this.activeWebviews.add(postMessage);

    return {
      dispose: () => {
        this.activeWebviews.delete(postMessage);
      },
    };
  }

  sendConfigState(postMessage: PostMessageFn): Promise<void> {
    return this.postConfigBridgeQuery({ type: 'getConfig' }, postMessage);
  }

  openUserConfigFile(): Promise<void> {
    return this.configFile.handleOpenUserConfigFile();
  }

  // ---- Private helpers ----

  private buildConfigState(): WebviewConfigState {
    return this.platform.config.getAssistantConfigState();
  }

  private async postConfigBridgeQuery(
    request: ConfigBridgeQueryRequest,
    postMessage: PostMessageFn,
  ): Promise<void> {
    const result = await runConfigBridgeQueryRuntime(request, {
      getConfigState: () => this.buildConfigState(),
    });
    if (result.message) {
      postMessage(result.message);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.activeWebviews.clear();
  }
}
