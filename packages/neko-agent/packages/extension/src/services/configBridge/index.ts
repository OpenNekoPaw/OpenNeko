/**
 * ConfigBridge - Unified config message routing service
 *
 * Thin orchestrator that delegates to domain-specific handlers:
 * - PromptSyncHandler: Prompt CRUD + file system sync
 * - ConfigFileHandler: openUserConfigFile
 */

import * as vscode from 'vscode';
import { type Platform } from '@neko/platform';
import type { AccountAiCatalogSnapshot, IAuthSession } from '@neko/shared';
import {
  buildConfigBridgeGlobalErrorMessage,
  buildConfigBridgeSsoSessionChangedMessage,
  runConfigBridgeQueryRuntime,
  runConfigBridgeSsoLoginRuntime,
  runConfigBridgeSsoLogoutRuntime,
  type ConfigBridgeQueryRequest,
} from '@neko/agent/runtime';
import { getLogger } from '../../base';
import { type WebviewToExtensionMessage } from '@neko-agent/types';

import type { PostMessageFn, WebviewConfigState } from './types';
import { broadcastToWebviews } from './broadcastHelper';
import { ConfigFileHandler } from './configFileHandler';
import { AccountAiCatalogCache, isAuthorizationFailure } from '../accountAiCatalogCache';
import { getNekoAuthAPI } from '../nekoAuthApi';

export type { PostMessageFn } from './types';

const logger = getLogger('ConfigBridge');

export const CONFIG_BRIDGE_MESSAGE_TYPES = [
  'getConfig',
  'openUserConfigFile',
  'ssoLogin',
  'ssoLogout',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

/**
 * ConfigBridge - message routing orchestrator
 */
export class ConfigBridge implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeWebviews: Set<PostMessageFn> = new Set();

  // Domain handlers
  private readonly configFile: ConfigFileHandler;
  private readonly accountAiCatalog: AccountAiCatalogCache;

  constructor(
    private readonly platform: Platform,
    _context?: vscode.ExtensionContext,
    accountAiCatalog?: AccountAiCatalogCache,
  ) {
    // Initialize domain handlers
    this.configFile = new ConfigFileHandler();
    this.accountAiCatalog =
      accountAiCatalog ??
      new AccountAiCatalogCache({
        getAuth: () => getNekoAuthAPI(),
        logger,
      });

    // Register disposable sub-handlers
    this.disposables.push(this.configFile);

    // Initialize all handlers
    void this.configFile.init();

    // Subscribe to neko-auth session changes and broadcast to all webviews.
    // Deferred async: neko-auth may not be activated yet when ConfigBridge constructs.
    void this.initAuthSubscription();
  }

  /**
   * Register a webview to receive broadcasts
   */
  private async initAuthSubscription(): Promise<void> {
    const auth = await getNekoAuthAPI();
    if (!auth) return;
    const sub = auth.onDidChangeSession((session) => {
      void this.handleAuthSessionChanged(session);
      broadcastToWebviews(this.activeWebviews, buildConfigBridgeSsoSessionChangedMessage(session));
    });
    this.disposables.push(sub);
  }

  private async handleAuthSessionChanged(session: IAuthSession | null): Promise<void> {
    try {
      await this.accountAiCatalog.handleSessionChanged(session);
    } catch (error) {
      logger.warn('Failed to refresh account AI catalog after auth session change:', error);
    }
    await this.broadcastConfigState();
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

        case 'ssoLogin': {
          await runConfigBridgeSsoLoginRuntime(
            { ...(message.force !== undefined ? { force: message.force } : {}) },
            {
              getAuth: () => getNekoAuthAPI(),
              postMessage,
            },
          );
          return true;
        }

        case 'ssoLogout': {
          await runConfigBridgeSsoLogoutRuntime({
            getAuth: () => getNekoAuthAPI(),
            postMessage,
          });
          return true;
        }

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

  private buildConfigState(accountCatalog?: AccountAiCatalogSnapshot | null): WebviewConfigState {
    return this.platform.config.getAssistantConfigState({
      accountCatalog: accountCatalog ?? null,
    });
  }

  private async postConfigBridgeQuery(
    request: ConfigBridgeQueryRequest,
    postMessage: PostMessageFn,
  ): Promise<void> {
    const accountCatalog = await this.getAccountCatalogForConfigProjection();
    const result = await runConfigBridgeQueryRuntime(request, {
      getConfigState: () => this.buildConfigState(accountCatalog),
    });
    if (result.message) {
      postMessage(result.message);
    }
  }

  private async getAccountCatalogForConfigProjection(): Promise<AccountAiCatalogSnapshot | null> {
    try {
      const result = await this.accountAiCatalog.getSnapshot();
      return result.snapshot;
    } catch (error) {
      if (isAuthorizationFailure(error)) {
        this.accountAiCatalog.invalidateForAuthFailure(error);
        logger.warn('Account AI catalog authorization failed for config projection:', error);
        return null;
      }
      throw error;
    }
  }

  private async broadcastConfigState(): Promise<void> {
    const accountCatalog = await this.getAccountCatalogForConfigProjection();
    const result = await runConfigBridgeQueryRuntime(
      { type: 'getConfig' },
      {
        getConfigState: () => this.buildConfigState(accountCatalog),
      },
    );
    if (result.message) {
      broadcastToWebviews(this.activeWebviews, result.message);
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
