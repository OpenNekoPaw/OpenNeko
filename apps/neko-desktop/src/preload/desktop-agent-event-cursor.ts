import type {
  AgentHostToWebviewMessage,
  AgentWebviewToHostMessage,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';

export interface DesktopAgentEventCursor {
  readonly connection: DesktopAgentConnectionIdentity;
  readonly sequence: number;
}

export type DesktopAgentEventCursorAdvanceResult =
  | {
      readonly kind: 'accepted';
      readonly connection: DesktopAgentConnectionIdentity;
    }
  | { readonly kind: 'retired' }
  | { readonly kind: 'foreign' }
  | {
      readonly kind: 'sequence-mismatch';
      readonly connection: DesktopAgentConnectionIdentity;
      readonly expectedSequence: number;
      readonly receivedSequence: number;
    };

const MAX_RETIRED_AGENT_CONNECTIONS = 128;

export class DesktopAgentEventCursorRegistry {
  private readonly active = new Map<string, DesktopAgentEventCursor>();
  private readonly retired = new Map<string, DesktopAgentConnectionIdentity>();

  register(connection: DesktopAgentConnectionIdentity): DesktopAgentEventCursor {
    const existing = this.active.get(connection.connectionId);
    if (existing) {
      if (!isSameDesktopAgentEventConnection(existing.connection, connection)) {
        throw new Error(
          `Desktop Agent connection '${connection.connectionId}' was registered with conflicting identity.`,
        );
      }
      this.active.delete(connection.connectionId);
      this.active.set(connection.connectionId, existing);
      return existing;
    }
    if (this.retired.has(connection.connectionId)) {
      throw new Error(
        `Desktop Agent connection '${connection.connectionId}' cannot be registered after retirement.`,
      );
    }
    const cursor = { connection, sequence: 0 };
    this.active.set(connection.connectionId, cursor);
    return cursor;
  }

  retire(connection: DesktopAgentConnectionIdentity): void {
    const current = this.active.get(connection.connectionId);
    if (!current || !isSameDesktopAgentEventConnection(current.connection, connection)) return;
    this.active.delete(connection.connectionId);
    this.retired.set(connection.connectionId, current.connection);
    while (this.retired.size > MAX_RETIRED_AGENT_CONNECTIONS) {
      const oldest = this.retired.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.retired.delete(oldest);
    }
  }

  advance(
    connection: DesktopAgentConnectionIdentity,
    sequence: number,
  ): DesktopAgentEventCursorAdvanceResult {
    const current = this.active.get(connection.connectionId);
    if (current) {
      if (!isSameDesktopAgentEventConnection(current.connection, connection)) {
        return { kind: 'foreign' };
      }
      const expectedSequence = current.sequence + 1;
      if (sequence !== expectedSequence) {
        return {
          kind: 'sequence-mismatch',
          connection: current.connection,
          expectedSequence,
          receivedSequence: sequence,
        };
      }
      this.active.set(connection.connectionId, {
        connection: current.connection,
        sequence,
      });
      return { kind: 'accepted', connection: current.connection };
    }
    const retired = this.retired.get(connection.connectionId);
    if (retired && isSameDesktopAgentEventConnection(retired, connection)) {
      return { kind: 'retired' };
    }
    return { kind: 'foreign' };
  }
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
    left.workbenchInstanceId === right.workbenchInstanceId &&
    left.agentSurfaceId === right.agentSurfaceId &&
    sameAgentConnectionOwner(left, right) &&
    left.workspaceId === right.workspaceId &&
    left.viewId === right.viewId &&
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
