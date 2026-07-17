/**
 * Slash Command Handler - Handles slash command invocation from webview
 *
 * Responsible for:
 * - Dispatching builtin commands (/clear, /help, /new, /status, etc.)
 * - Delegating Pi Skill catalog requests to SkillHandler
 * - Sending status information
 */

import * as vscode from 'vscode';
import { normalizeLocale } from '@neko/shared/i18n';
import {
  buildConversationHistoryClearedMessage,
  buildExtensionSlashStatusPayload,
  runExtensionSlashCommandRuntime,
  type ExtensionCommandHostEffect,
  type ExtensionSlashCommandRuntimeDeps,
  type ExtensionSlashCommandRuntimeEffects,
} from '@neko/agent';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationBridge } from '../conversationBridge';
import type { SettingsManager } from '../settingsManager';
import type { SkillHandler } from './skillHandler';
import type { TaskHandler } from './taskHandler';
import type { ContextHandler } from './contextHandler';
import type { SettingsHandler } from './settingsHandler';
import type { CharacterDialogueController } from '../characterDialogueController';
import { getLogger } from '../../base';
import {
  NPC_TEST_BENCH_AS_SLASH_COMMAND_NAME,
  NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND_NAME,
} from '@neko/shared';

function normalizeNpcSlashCommandName(command: string): string {
  return command.trim().replace(/^\/+/, '').toLowerCase();
}

function getSlashCommandLogger() {
  return getLogger('SlashCommandHandler');
}

/**
 * Dependencies for SlashCommandHandler
 */
export interface SlashCommandHandlerDeps {
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
  settings: SettingsManager;
  skillHandler: SkillHandler;
  taskHandler: TaskHandler;
  contextHandler: ContextHandler;
  settingsHandler: SettingsHandler;
  characterDialogue?: CharacterDialogueController;
  /** Callback to send conversation list to webview */
  sendConversationList: () => void;
  /** Callback to send active conversation to webview */
  sendActiveConversation: () => void;
}

/**
 * Handler for slash command webview messages
 */
export class SlashCommandHandler {
  constructor(private deps: SlashCommandHandlerDeps) {}

  updateDeps(partial: Partial<SlashCommandHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Handle slash command invocation
   * Supports both builtin commands and skill-based commands
   */
  async handleCommand(
    webview: vscode.Webview,
    command: string,
    args: string | undefined,
    conversationId: string,
  ): Promise<void> {
    const startTime = Date.now();
    const logger = getSlashCommandLogger();
    logger.debug('neko.agent.command.slash.request', {
      command,
      conversationId,
      hasArgs: args !== undefined && args.length > 0,
      argChars: args?.length ?? 0,
    });
    logger.debug('neko.agent.command.slash.request.raw', {
      command,
      conversationId,
      args,
    });

    try {
      const normalizedCommand = normalizeNpcSlashCommandName(command);
      if (normalizedCommand === 'skills') {
        await this.deps.skillHandler.sendSkillsList(webview);
        return;
      }
      if (normalizedCommand === NPC_TEST_BENCH_AS_SLASH_COMMAND_NAME) {
        await this.deps.characterDialogue?.launchFromSlash({ args, conversationId });
        logger.debug('neko.agent.command.slash.result', {
          command,
          conversationId,
          durationMs: Date.now() - startTime,
          handled: Boolean(this.deps.characterDialogue),
          source: 'character-dialogue',
        });
        return;
      }

      if (normalizedCommand === NPC_TEST_BENCH_EXIT_AS_SLASH_COMMAND_NAME) {
        await this.deps.characterDialogue?.exitActive(conversationId);
        logger.debug('neko.agent.command.slash.result', {
          command,
          conversationId,
          durationMs: Date.now() - startTime,
          handled: Boolean(this.deps.characterDialogue),
          source: 'character-dialogue',
        });
        return;
      }

      const result = await runExtensionSlashCommandRuntime(
        { command, conversationId, ...(args !== undefined ? { args } : {}) },
        this._createRuntimeDeps(webview, conversationId),
        this._createRuntimeEffects(webview),
      );
      logger.debug('neko.agent.command.slash.result', {
        command: result.command,
        conversationId,
        durationMs: Date.now() - startTime,
        handled: result.handled,
        source: result.source,
      });
    } catch (error) {
      logger.warn('neko.agent.command.slash.failed', {
        command,
        conversationId,
        durationMs: Date.now() - startTime,
        error: summarizeSlashCommandError(error),
      });
      throw error;
    }
  }

  /**
   * Send status information to webview
   */
  sendStatusInfo(webview: vscode.Webview, conversationId: string): void {
    webview.postMessage(
      buildExtensionSlashStatusPayload({
        conversationId,
        deps: this._createRuntimeDeps(webview, conversationId),
      }),
    );
  }

  private _createRuntimeDeps(
    webview: vscode.Webview,
    conversationId: string,
  ): ExtensionSlashCommandRuntimeDeps {
    const settings = this.deps.settings.snapshotForConversation(conversationId);

    return {
      locale: normalizeLocale(vscode.env.language),
      conversations: {
        list: () => this.deps.conversations.list(),
        getMessageCount: (conversationId) =>
          this.deps.conversations.getMessageCount(conversationId),
        create: () => this.deps.conversations.create(),
        clearCurrent: (conversationId) =>
          this.deps.conversations.updateMessagesForConversation(conversationId, []),
      },
      settings: {
        provider: settings.selectedProviderId,
        model: settings.selectedModelId,
        executionMode: settings.executionMode,
      },
      updateExecutionMode: (conversationId, executionMode) => {
        void this.deps.settingsHandler.handleUpdateSettings(
          webview,
          { executionMode },
          { conversationId },
        );
      },
      contextManager: {
        getTokenCount: (conversationId: string) =>
          this.deps.agentManager?.getContextTokenCount(conversationId) ?? 0,
        compress: async (conversationId: string) => {
          await this.deps.contextHandler.compressContext(webview, conversationId);
        },
      },
    };
  }

  private _createRuntimeEffects(webview: vscode.Webview): ExtensionSlashCommandRuntimeEffects {
    return {
      postMessage: async (message) => {
        await webview.postMessage(message);
      },
      executeHostEffect: (effect) => this._executeCommandHostEffect(webview, effect),
    };
  }

  private _executeCommandHostEffect(
    webview: vscode.Webview,
    effect: ExtensionCommandHostEffect,
  ): void | Promise<void> {
    switch (effect.type) {
      case 'clearAgentHistory':
        return this.deps.agentManager?.clearHistory(effect.conversationId);
      case 'postHistoryCleared':
        void webview.postMessage(buildConversationHistoryClearedMessage(effect.conversationId));
        return;
      case 'refreshConversationList':
        this.deps.sendConversationList();
        return;
      case 'refreshActiveConversation':
        this.deps.sendActiveConversation();
        return;
      case 'sendTasks':
        this.deps.taskHandler.sendTasks(webview, effect.conversationId);
        return;
    }
  }
}

function summarizeSlashCommandError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}
