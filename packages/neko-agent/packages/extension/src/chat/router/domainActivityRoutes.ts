import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';

export function tryHandleDomainActivityRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'domainActivityAttach':
      void executeWithServer(deps, (server) => server.attach(message)).catch((error: unknown) =>
        report(deps, message.key, error),
      );
      return true;
    case 'domainActivityAck':
      void executeWithServer(deps, (server) => server.acknowledge(message)).catch(
        (error: unknown) => report(deps, message.key, error),
      );
      return true;
    case 'domainActivityDetach':
      void executeWithServer(deps, (server) => server.detach(message)).catch((error: unknown) =>
        report(deps, message.key, error),
      );
      return true;
    case 'domainJobCommand':
      void executeWithServer(deps, (server) => server.executeCommand(message)).catch(
        (error: unknown) => {
          void deps.webview.postMessage({
            type: 'domainJobCommandResult',
            requestId: message.requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
      return true;
    default:
      return false;
  }
}

function executeWithServer(
  deps: ChatWebviewMessageRouterDeps,
  execute: (server: NonNullable<ChatWebviewMessageRouterDeps['domainActivity']>) => Promise<void>,
): Promise<void> {
  if (!deps.domainActivity) {
    return Promise.reject(new Error('Domain Activity is unavailable in this Host.'));
  }
  return execute(deps.domainActivity);
}

function report(
  deps: ChatWebviewMessageRouterDeps,
  key: { readonly attachmentId: string },
  error: unknown,
): void {
  void deps.webview.postMessage({
    type: 'domainActivityDiagnostic',
    key,
    fatal: true,
    message: error instanceof Error ? error.message : String(error),
  });
}
