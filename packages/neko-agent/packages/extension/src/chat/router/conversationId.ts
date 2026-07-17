import type * as vscode from 'vscode';
import { resolveRequiredConversationRoute } from '@neko/agent/runtime';
import { getLogger } from '../../base';

const logger = getLogger('ChatWebviewMessageRouter');

export function resolveRequiredConversationId(
  webview: vscode.Webview,
  message: { conversationId?: unknown },
  action: string,
): string | undefined {
  const result = resolveRequiredConversationRoute({ message, action });
  if (result.status === 'resolved') {
    return result.conversationId;
  }

  logger.warn(`Rejected ${action} without conversationId`);
  webview.postMessage(result.message);
  return undefined;
}
