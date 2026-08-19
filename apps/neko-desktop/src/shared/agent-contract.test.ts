import { describe, expect, it } from 'vitest';
import {
  createDesktopAgentBootstrapRequest,
  createDesktopAgentDetachRequest,
  createDesktopAgentMessageRequest,
  DesktopAgentContractError,
  parseDesktopAgentBootstrapProjection,
  parseDesktopAgentDetachRequest,
  parseDesktopAgentDetachResult,
  parseDesktopAgentEvent,
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

  it('binds a Workspace session bootstrap to its exact conversation', () => {
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

  it('round-trips an exact connection detach request and result', () => {
    const request = createDesktopAgentDetachRequest('detach-1', connection());

    expect(parseDesktopAgentDetachRequest(request)).toEqual(request);
    expect(
      parseDesktopAgentDetachResult({ requestId: 'detach-1', status: 'detached' }, 'detach-1'),
    ).toEqual({ requestId: 'detach-1', status: 'detached' });
    expect(() =>
      parseDesktopAgentDetachResult({ requestId: 'detach-1', status: 'accepted' }, 'detach-1'),
    ).toThrowError(DesktopAgentContractError);
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

  it('parses an exact persisted-Conversation unavailable bootstrap diagnostic', () => {
    expect(
      parseDesktopAgentBootstrapProjection(
        {
          requestId: 'request-1',
          status: 'unavailable',
          diagnostic: {
            code: 'desktop-agent-conversation-unavailable',
            severity: 'error',
            conversationId: 'conversation-1',
            fieldNames: ['lifecycle'],
            message: 'Stored Conversation data is unavailable.',
          },
        },
        'request-1',
      ),
    ).toEqual({
      requestId: 'request-1',
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-agent-conversation-unavailable',
        severity: 'error',
        conversationId: 'conversation-1',
        fieldNames: ['lifecycle'],
        message: 'Stored Conversation data is unavailable.',
      },
    });
    expect(() =>
      parseDesktopAgentBootstrapProjection({
        requestId: 'request-1',
        status: 'unavailable',
        diagnostic: {
          code: 'desktop-agent-conversation-unavailable',
          severity: 'error',
          conversationId: 'conversation-1',
          fieldNames: ['lifecycle'],
          message: 'Stored Conversation data is unavailable.',
          fallbackRecord: {},
        },
      }),
    ).toThrowError(DesktopAgentContractError);
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

  it('parses an exact authoritative submission receipt', () => {
    expect(
      parseDesktopAgentMessageResult(
        {
          requestId: 'submission-1',
          status: 'accepted',
          submission: {
            submissionId: 'submission-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            queueItemId: 'queue-item-1',
            message: 'hello',
            createdAt: 1_700_000_000_000,
            state: 'active',
          },
        },
        'submission-1',
      ),
    ).toEqual({
      requestId: 'submission-1',
      status: 'accepted',
      submission: {
        submissionId: 'submission-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        queueItemId: 'queue-item-1',
        message: 'hello',
        createdAt: 1_700_000_000_000,
        state: 'active',
      },
    });
  });

  it('rejects an event with an unknown Host message type', () => {
    expect(() =>
      parseDesktopAgentEvent({
        connection: connection(),
        sequence: 1,
        message: { type: 'forgedHostMessage' },
      }),
    ).toThrowError(DesktopAgentContractError);
  });

  it('parses the connection terminal marker on the ordered Agent event stream', () => {
    expect(
      parseDesktopAgentEvent({
        connection: connection(),
        sequence: 3,
        status: 'detached',
      }),
    ).toEqual({ connection: connection(), sequence: 3, status: 'detached' });
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
