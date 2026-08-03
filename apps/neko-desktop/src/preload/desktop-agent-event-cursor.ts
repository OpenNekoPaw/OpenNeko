import type {
  AgentHostToWebviewMessage,
  AgentWebviewToHostMessage,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';

export interface DesktopAgentEventCursor {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly sequence: number;
}

export function projectDesktopAgentSendFailure(
  message: AgentWebviewToHostMessage,
  failure: string,
): AgentHostToWebviewMessage {
  if ('conversationId' in message && typeof message.conversationId === 'string') {
    return {
      type: 'error',
      conversationId: message.conversationId,
      message: failure,
    };
  }
  return {
    type: 'globalError',
    message: failure,
  };
}

export function advanceDesktopAgentBootstrapCursor(
  current: DesktopAgentEventCursor | undefined,
  connection: DesktopAgentConnectionIdentity,
): DesktopAgentEventCursor {
  if (current && isSameDesktopAgentEventConnection(current.connection, connection)) {
    return current;
  }
  return {
    connection,
    sequence: 0,
  };
}

export function isSameDesktopAgentEventConnection(
  left: DesktopAgentConnectionIdentity,
  right: DesktopAgentConnectionIdentity,
): boolean {
  return (
    left.applicationInstanceId === right.applicationInstanceId &&
    left.windowId === right.windowId &&
    sameAgentConnectionOwner(left, right) &&
    left.workspaceId === right.workspaceId &&
    left.viewId === right.viewId &&
    left.viewEpoch === right.viewEpoch &&
    left.rendererEpoch === right.rendererEpoch &&
    left.connectionId === right.connectionId
  );
}

function sameAgentConnectionOwner(
  left: DesktopAgentConnectionIdentity,
  right: DesktopAgentConnectionIdentity,
): boolean {
  return 'assistantSpaceId' in left
    ? 'assistantSpaceId' in right && left.assistantSpaceId === right.assistantSpaceId
    : 'projectId' in right && left.projectId === right.projectId;
}
