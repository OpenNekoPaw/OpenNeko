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
  | { readonly kind: 'foreign' }
  | {
      readonly kind: 'sequence-mismatch';
      readonly connection: DesktopAgentConnectionIdentity;
      readonly expectedSequence: number;
      readonly receivedSequence: number;
    };

export class DesktopAgentEventCursorRegistry {
  private readonly active = new Map<
    string,
    { readonly cursor: DesktopAgentEventCursor; readonly attachmentCount: number }
  >();

  register(connection: DesktopAgentConnectionIdentity): DesktopAgentEventCursor {
    const existing = this.active.get(connection.connectionId);
    if (existing) {
      if (!isSameDesktopAgentEventConnection(existing.cursor.connection, connection)) {
        throw new Error(
          `Desktop Agent connection '${connection.connectionId}' was registered with conflicting identity.`,
        );
      }
      this.active.delete(connection.connectionId);
      this.active.set(connection.connectionId, {
        cursor: existing.cursor,
        attachmentCount: existing.attachmentCount + 1,
      });
      return existing.cursor;
    }
    const cursor = { connection, sequence: 0 };
    this.active.set(connection.connectionId, { cursor, attachmentCount: 1 });
    return cursor;
  }

  unregister(connection: DesktopAgentConnectionIdentity): void {
    const current = this.active.get(connection.connectionId);
    if (!current || !isSameDesktopAgentEventConnection(current.cursor.connection, connection)) {
      return;
    }
    this.active.delete(connection.connectionId);
  }

  release(connection: DesktopAgentConnectionIdentity): void {
    const current = this.active.get(connection.connectionId);
    if (!current || !isSameDesktopAgentEventConnection(current.cursor.connection, connection)) {
      return;
    }
    if (current.attachmentCount === 0) {
      throw new Error(
        `Desktop Agent connection '${connection.connectionId}' has no attached bootstrap lease.`,
      );
    }
    this.active.set(connection.connectionId, {
      cursor: current.cursor,
      attachmentCount: current.attachmentCount - 1,
    });
  }

  advance(
    connection: DesktopAgentConnectionIdentity,
    sequence: number,
  ): DesktopAgentEventCursorAdvanceResult {
    const current = this.active.get(connection.connectionId);
    if (current) {
      if (!isSameDesktopAgentEventConnection(current.cursor.connection, connection)) {
        return { kind: 'foreign' };
      }
      const expectedSequence = current.cursor.sequence + 1;
      if (sequence !== expectedSequence) {
        return {
          kind: 'sequence-mismatch',
          connection: current.cursor.connection,
          expectedSequence,
          receivedSequence: sequence,
        };
      }
      this.active.set(connection.connectionId, {
        cursor: {
          connection: current.cursor.connection,
          sequence,
        },
        attachmentCount: current.attachmentCount,
      });
      return { kind: 'accepted', connection: current.cursor.connection };
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
