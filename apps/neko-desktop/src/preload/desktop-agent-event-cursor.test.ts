import { describe, expect, it } from 'vitest';
import type { DesktopAgentConnectionIdentity } from '../shared/agent-contract';
import {
  advanceDesktopAgentBootstrapCursor,
  projectDesktopAgentSendFailure,
} from './desktop-agent-event-cursor';

describe('Desktop Agent preload event cursor', () => {
  it('preserves the sequence baseline when bootstrap reuses the exact connection', () => {
    const connection = createConnection('connection-1', 1, 1);
    const current = {
      connection,
      sequence: 31,
    };

    expect(advanceDesktopAgentBootstrapCursor(current, connection)).toEqual(current);
  });

  it('resets the sequence baseline for a replacement connection', () => {
    const current = {
      connection: createConnection('connection-1', 1, 1),
      sequence: 31,
    };
    const replacement = createConnection('connection-2', 2, 2);

    expect(advanceDesktopAgentBootstrapCursor(current, replacement)).toEqual({
      connection: replacement,
      sequence: 0,
    });
  });

  it('projects a rejected conversation send into a conversation-visible terminal error', () => {
    expect(
      projectDesktopAgentSendFailure(
        {
          type: 'sendMessage',
          conversationId: 'conversation-1',
          message: 'hello',
          sessionMode: 'agent',
        },
        'Desktop send rejected.',
      ),
    ).toEqual({
      type: 'error',
      conversationId: 'conversation-1',
      message: 'Desktop send rejected.',
    });
    expect(
      projectDesktopAgentSendFailure({ type: 'getConversations' }, 'Catalog request rejected.'),
    ).toEqual({
      type: 'globalError',
      message: 'Catalog request rejected.',
    });
  });
});

function createConnection(
  connectionId: string,
  viewEpoch: number,
  rendererEpoch: number,
): DesktopAgentConnectionIdentity {
  return {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId,
    viewEpoch,
    rendererEpoch,
  };
}
