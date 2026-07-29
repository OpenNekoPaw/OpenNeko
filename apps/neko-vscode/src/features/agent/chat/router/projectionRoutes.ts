import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';

export function tryHandleProjectionRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'projectionEndpointDiscover':
      deps.announceProjectionEndpoint(message.protocolVersion, message.realmId);
      return true;

    case 'projectionAttach':
      void deps.projectionAttachments.attach(message).catch((error: unknown) => {
        deps.reportProjectionProtocolError(toError(error), message.key);
      });
      return true;

    case 'projectionSnapshotAck':
      void deps.projectionAttachments.acknowledge(message).catch((error: unknown) => {
        deps.reportProjectionProtocolError(toError(error), message.key);
      });
      return true;

    case 'projectionDetach':
      void deps.projectionAttachments.detach(message).catch((error: unknown) => {
        deps.reportProjectionProtocolError(toError(error), message.key);
      });
      return true;

    default:
      return false;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
