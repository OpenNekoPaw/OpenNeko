/**
 * Settings Handler - Handles settings-related webview messages
 *
 * Responsible for:
 * - Sending current settings to webview
 * - Updating settings from webview changes
 */

import * as vscode from 'vscode';
import {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type Platform,
} from '@neko/platform';
import { buildAssistantSettingsUpdatedMessage } from '@neko/platform/config/assistant-config';
import {
  createAgentCapabilityActivationIntent,
  createAgentCapabilityActivationProgressEvent,
} from '@neko/shared';
import { buildAgentCapabilityActivationProgressMessage } from '@neko-agent/types';
import { getLogger } from '../../base';
import type { SettingsManager } from '../settingsManager';

/**
 * Dependencies for SettingsHandler
 */
export interface SettingsHandlerDeps {
  platform?: Platform;
  conversationSettings?: SettingsManager;
}

const logger = getLogger('SettingsHandler');

/**
 * Handler for settings-related webview messages
 */
export class SettingsHandler {
  constructor(private deps: SettingsHandlerDeps) {}

  updateDeps(partial: Partial<SettingsHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Send all settings data to webview
   */
  async sendSettings(
    webview: vscode.Webview,
    options: { readonly conversationId: string; readonly reloadConfig?: boolean },
  ): Promise<void> {
    if (!this.deps.platform) return;
    try {
      if (options.reloadConfig === true) {
        this.deps.platform.config.reloadConfig();
      }

      const conversationSettings = this.requireConversationSettings();
      const message = buildAssistantSettingsRuntimeDataMessage({
        getSettingsData: () => this.deps.platform?.config.getAssistantSettingsData(),
      });
      if (message) {
        const snapshot = conversationSettings.snapshotForConversation(options.conversationId);
        void webview.postMessage({
          ...message,
          ...snapshot,
          conversationId: options.conversationId,
          systemPrompt: snapshot.customSystemPrompt,
        });
      }
    } catch (error) {
      logger.warn('Failed to send Agent settings data:', error);
      void webview.postMessage(
        buildAssistantSettingsUpdatedMessage({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load Agent settings',
        }),
      );
    }
  }

  /**
   * Handle settings update from webview
   */
  async handleUpdateSettings(
    webview: vscode.Webview,
    settings: Record<string, unknown>,
    options: { readonly conversationId: string },
  ): Promise<void> {
    const conversationSettings = this.deps.conversationSettings;
    if (!conversationSettings) {
      webview.postMessage(
        buildAssistantSettingsUpdatedMessage({
          success: false,
          error: 'Conversation settings runtime is not initialized',
        }),
      );
      return;
    }
    const executionMode = readExecutionMode(settings['executionMode']);
    const activationIntent = executionMode
      ? createAgentCapabilityActivationIntent({
          conversationId: options.conversationId,
          source: 'user-explicit',
          target: 'execution-mode',
          action: 'set',
          name: executionMode,
          requestedBy: 'user',
          reason: `Execution mode selector set ${executionMode}`,
          createdAt: Date.now(),
        })
      : null;
    const emit = (
      step: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['step'],
      status: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['status'],
      extra: Partial<Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]> = {},
    ) => {
      if (!activationIntent) return;
      const event = createAgentCapabilityActivationProgressEvent({
        intent: activationIntent,
        step,
        status,
        at: Date.now(),
        ...(extra.diagnostics !== undefined ? { diagnostics: extra.diagnostics } : {}),
        ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
      });
      void webview.postMessage(
        buildAgentCapabilityActivationProgressMessage({
          conversationId: options.conversationId,
          events: [event],
        }),
      );
    };
    if (activationIntent) {
      emit('requested', 'succeeded');
      emit('validated', 'succeeded');
    }
    const message = await runAssistantSettingsUpdateRuntime(settings, {
      updateSettingsFromWebview: async (updates) => {
        await conversationSettings.updateConversation(options.conversationId, updates);
      },
    });
    if (activationIntent) {
      if (message.success) {
        emit('projected', 'succeeded', { metadata: { mode: executionMode } });
        emit('active', 'succeeded', { metadata: { mode: executionMode } });
      } else {
        emit('failed', 'failed', {
          diagnostics: [
            {
              severity: 'error',
              code: 'execution-mode-update-failed',
              message: message.error ?? 'Execution mode update failed',
            },
          ],
        });
      }
    }
    webview.postMessage(message);
  }

  private requireConversationSettings(): SettingsManager {
    const settings = this.deps.conversationSettings;
    if (!settings) {
      throw new Error('Conversation settings runtime is not initialized');
    }
    return settings;
  }
}

function readExecutionMode(value: unknown): 'plan' | 'ask' | 'auto' | null {
  return value === 'plan' || value === 'ask' || value === 'auto' ? value : null;
}
