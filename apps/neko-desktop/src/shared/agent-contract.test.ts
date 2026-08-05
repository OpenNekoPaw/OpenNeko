import { describe, expect, it } from 'vitest';
import {
  createDesktopAgentBootstrapRequest,
  createDesktopAgentMessageRequest,
  DesktopAgentContractError,
  parseDesktopAgentBootstrapProjection,
  parseDesktopAgentMessageEvent,
  parseDesktopAgentMessageResult,
} from './agent-contract';

describe('Desktop Agent contract', () => {
  it('creates a canonical bootstrap request', () => {
    expect(
      createDesktopAgentBootstrapRequest(
        'request-1',
        'workbench-1',
        'agent-surface-1',
        'project-1',
        'view-1',
      ),
    ).toEqual({
      requestId: 'request-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      projectId: 'project-1',
      viewId: 'view-1',
    });
  });

  it('binds a retained Workspace Surface bootstrap to its exact conversation', () => {
    expect(
      createDesktopAgentBootstrapRequest(
        'request-1',
        'workbench-1',
        'agent-surface-1',
        'project-1',
        'view-1',
        'conversation-1',
      ),
    ).toEqual({
      requestId: 'request-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      projectId: 'project-1',
      viewId: 'view-1',
      conversationId: 'conversation-1',
    });
  });

  it('rejects invalid Agent messages before they reach Main routing', () => {
    expect(() =>
      createDesktopAgentMessageRequest('request-1', connection(), {
        type: 'arbitrary-command',
        channel: 'openneko:raw',
      }),
    ).toThrowError(DesktopAgentContractError);
  });

  it('rejects a bootstrap response for another request', () => {
    expect(() =>
      parseDesktopAgentBootstrapProjection(
        {
          requestId: 'request-2',
          status: 'ready',
          connection: connection(),
        },
        'request-1',
      ),
    ).toThrowError(expect.objectContaining({ code: 'desktop-agent-request-mismatch' }));
  });

  it('parses typed route-unavailable results', () => {
    expect(
      parseDesktopAgentMessageResult(
        {
          requestId: 'request-1',
          status: 'unavailable',
          diagnostic: {
            code: 'agent-host-route-unsupported',
            severity: 'error',
            hostKind: 'electron',
            messageType: 'sendToPlugin',
            support: 'unsupported',
            owner: 'Phase 3',
            message: 'Plugin transfer is unavailable.',
          },
        },
        'request-1',
      ),
    ).toMatchObject({
      status: 'unavailable',
      diagnostic: {
        messageType: 'sendToPlugin',
        owner: 'Phase 3',
      },
    });
  });

  it('rejects an event with an unknown Host message type', () => {
    expect(() =>
      parseDesktopAgentMessageEvent({
        connection: connection(),
        sequence: 1,
        message: { type: 'forgedHostMessage' },
      }),
    ).toThrowError(DesktopAgentContractError);
  });
});

function connection() {
  return {
    applicationInstanceId: 'app-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId: 'connection-1',
  };
}
