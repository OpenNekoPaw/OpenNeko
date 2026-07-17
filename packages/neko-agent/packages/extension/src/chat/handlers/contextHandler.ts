/**
 * Context Handler - Handles context management webview messages
 *
 * Responsible for:
 * - Getting context token counts
 * - Triggering context compression
 */

import * as vscode from 'vscode';
import { compressAgentContext, sendAgentContextTokenCount } from '@neko/agent/runtime';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationBridge } from '../conversationBridge';
import { getLogger } from '../../base';

const logger = getLogger('ContextHandler');

/**
 * Dependencies for ContextHandler
 */
export interface ContextHandlerDeps {
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
}

/**
 * Handler for context management webview messages
 */
export class ContextHandler {
  constructor(private deps: ContextHandlerDeps) {}

  updateDeps(partial: Partial<ContextHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Get context token count for a conversation
   */
  getTokenCount(webview: vscode.Webview, conversationId: string): void {
    sendAgentContextTokenCount({
      conversationId,
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      getTokenCount: (id: string) => this.deps.agentManager?.getContextTokenCount(id) ?? 0,
      onMissingConversationId: () => {
        logger.warn('Rejected getTokenCount without conversationId');
      },
    });
  }

  /**
   * Trigger context compression for a conversation
   */
  async compressContext(webview: vscode.Webview, conversationId: string): Promise<void> {
    await compressAgentContext({
      conversationId,
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      ...(this.deps.agentManager
        ? { compressContext: (id: string) => this.deps.agentManager!.compressContext(id) }
        : {}),
      onMissingConversationId: () => {
        logger.warn('Rejected compressContext without conversationId');
      },
    });
  }

}
