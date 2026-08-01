import { describe, expect, it } from 'vitest';
import {
  assertDesktopAgentAutomationLaunch,
  createDesktopAgentAutomationRequest,
  parseDesktopAgentAutomationResult,
  parseDesktopAgentAutomationRequest,
} from './agent-automation-contract';

describe('Desktop Agent fixture automation contract', () => {
  it('accepts only fixed identity-bound operations', () => {
    expect(parseDesktopAgentAutomationRequest(request({ kind: 'reload-renderer' }))).toMatchObject({
      schemaVersion: 1,
      requestId: 'request-1',
      operation: { kind: 'reload-renderer' },
    });
    expect(
      parseDesktopAgentAutomationRequest(
        request({
          kind: 'confirm',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
          approved: true,
        }),
      ),
    ).toMatchObject({ operation: { kind: 'confirm', approved: true } });
  });

  it.each(['channel', 'command', 'path', 'credential', 'owner'])(
    'poisons arbitrary %s controls',
    (field) => {
      const value = request({ kind: 'reload-renderer' });
      value.operation[field] = 'forbidden';
      expect(() => parseDesktopAgentAutomationRequest(value)).toThrow('unknown');
    },
  );

  it('rejects stale/missing exact identities and unsupported operations', () => {
    const missing = request({
      kind: 'cancel',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    delete missing.connection.rendererEpoch;
    expect(() => parseDesktopAgentAutomationRequest(missing)).toThrow('missing=rendererEpoch');
    expect(() => parseDesktopAgentAutomationRequest(request({ kind: 'execute-runtime' }))).toThrow(
      'operation kind is unsupported',
    );
  });

  it('is unavailable outside an explicit isolated fixture launch', () => {
    expect(() =>
      assertDesktopAgentAutomationLaunch({ fixtureLaunch: false, isolatedUserData: true }),
    ).toThrow('explicit fixture launch');
    expect(() =>
      assertDesktopAgentAutomationLaunch({ fixtureLaunch: true, isolatedUserData: false }),
    ).toThrow('isolated userData');
    expect(() =>
      assertDesktopAgentAutomationLaunch({ fixtureLaunch: true, isolatedUserData: true }),
    ).not.toThrow();
  });

  it('binds result parsing to the exact request and fixed lifecycle result shapes', () => {
    const parsed = createDesktopAgentAutomationRequest(
      'request-1',
      parseDesktopAgentAutomationRequest(request({ kind: 'reload-renderer' })).connection,
      { kind: 'reload-renderer' },
    );
    expect(parsed.operation).toEqual({ kind: 'reload-renderer' });
    expect(
      parseDesktopAgentAutomationResult(
        {
          schemaVersion: 1,
          requestId: 'request-1',
          status: 'idle',
          identity: {
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            runId: 'run-1',
          },
        },
        'request-1',
      ),
    ).toMatchObject({ status: 'idle', identity: { runId: 'run-1' } });
    expect(() =>
      parseDesktopAgentAutomationResult(
        { schemaVersion: 1, requestId: 'stale', status: 'accepted' },
        'request-1',
      ),
    ).toThrow('request identity does not match');
  });
});

function request(operation: Record<string, unknown>): MutableRequest {
  return {
    schemaVersion: 1,
    requestId: 'request-1',
    connection: {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      viewEpoch: 1,
      rendererEpoch: 1,
      connectionId: 'connection-1',
    },
    operation,
  };
}

interface MutableRequest {
  schemaVersion: number;
  requestId: string;
  connection: Record<string, unknown>;
  operation: Record<string, unknown>;
}
