import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleTaskRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'getTasks': {
      const conversationId = resolveRequiredConversationId(webview, message, 'getTasks');
      if (!conversationId) return true;
      deps.taskHandler.sendTasks(webview, conversationId);
      return true;
    }

    case 'cancelTask': {
      deps.taskHandler.handleCancelTask(webview, message.taskScope);
      return true;
    }

    case 'retryTask': {
      deps.taskHandler.handleRetryTask(webview, message.taskScope);
      return true;
    }

    case 'viewTaskResult': {
      deps.taskHandler.handleViewTaskResult(message.taskScope, message.resultRef);
      return true;
    }

    default:
      return false;
  }
}
