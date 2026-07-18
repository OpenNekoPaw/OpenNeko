/**
 * ConfigBridge - Unified config message routing service
 *
 * Thin orchestrator that delegates to domain-specific handlers:
 * - PromptSyncHandler: Prompt CRUD + file system sync
 * - ConfigFileHandler: openUserConfigFile
 */

import * as vscode from 'vscode';
import { type Platform } from '@neko/platform';
import {
  buildConfigBridgeGlobalErrorMessage,
  runConfigBridgeQueryRuntime,
  type ConfigBridgeQueryRequest,
} from '@neko/agent/runtime';
import { getLogger } from '../../base';
import { type WebviewToExtensionMessage } from '@neko-agent/types';

import type { PostMessageFn, WebviewConfigState } from './types';
import { ConfigFileHandler } from './configFileHandler';

export type { PostMessageFn } from './types';

const logger = getLogger('ConfigBridge');

export const CONFIG_BRIDGE_MESSAGE_TYPES = [
  'getConfig',
  'openUserConfigFile',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

/**
 * ConfigBridge - message routing orchestrator
 */
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

  /**
   * Handle a config-related message from webview
   * @returns true if message was handled, false otherwise
   */
  async handleMessage(
    message: WebviewToExtensionMessage,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      switch (message.type) {
        case 'getConfig':
          await this.postConfigBridgeQuery({ type: 'getConfig' }, postMessage);
          return true;

        case 'openUserConfigFile':
          await this.configFile.handleOpenUserConfigFile();
          return true;

        default:
          return false;
      }
    } catch (error) {
      logger.error(`Error handling ${message.type}:`, error);
      postMessage(buildConfigBridgeGlobalErrorMessage({ action: message.type, error }));
      return true;
    }
  }

  sendConfigState(postMessage: PostMessageFn): Promise<void> {
    return this.postConfigBridgeQuery({ type: 'getConfig' }, postMessage);
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
