import { describe, expect, it } from 'vitest';
import {
  assertDesktopAgentAutomationLaunch,
  createDesktopAgentAutomationRequest,
  DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT,
  parseDesktopAgentAutomationResult,
  parseDesktopAgentAutomationRequest,
} from './agent-automation-contract';

describe('Desktop Agent fixture automation contract', () => {
  it('uses one dedicated renderer argument after Main qualifies the isolated fixture', () => {
    expect(DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT).toBe('--openneko-agent-automation');
  });

  it('accepts only fixed identity-bound operations', () => {
    expect(parseDesktopAgentAutomationRequest(request({ kind: 'reload-renderer' }))).toMatchObject({
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
    expect(
      parseDesktopAgentAutomationRequest(
        request({
          kind: 'wait-for-idle',
          conversationId: 'conversation-1',
          timeoutMs: 1000,
          afterIdentity: { turnId: 'turn-1', runId: 'run-1' },
        }),
      ),
    ).toMatchObject({
      operation: {
        kind: 'wait-for-idle',
        afterIdentity: { turnId: 'turn-1', runId: 'run-1' },
      },
    });
  });

  it.each(['channel', 'command', 'path', 'credential', 'owner'])(
    'rejects arbitrary %s controls',
    (field) => {
      const value = request({ kind: 'reload-renderer' });
      value.operation[field] = 'forbidden';
      expect(() => parseDesktopAgentAutomationRequest(value)).toThrow('unknown');
    },
  );

  it('rejects stale/missing exact identities and unsupported operations', () => {
    const unknownField = request({
      kind: 'cancel',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    unknownField.connection.rendererSessionId = 1;
    expect(() => parseDesktopAgentAutomationRequest(unknownField)).toThrow(
      'unknown=rendererSessionId',
    );
    const missing = request({ kind: 'reload-renderer' });
    delete missing.connection.connectionId;
    expect(() => parseDesktopAgentAutomationRequest(missing)).toThrow('missing=connectionId');
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
      parseDesktopAgentAutomationResult({ requestId: 'stale', status: 'accepted' }, 'request-1'),
    ).toThrow('request identity does not match');
  });
});

function request(operation: Record<string, unknown>): MutableRequest {
  return {
    requestId: 'request-1',
    connection: {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      connectionId: 'connection-1',
    },
    operation,
  };
}

interface MutableRequest {
  requestId: string;
  connection: Record<string, unknown>;
  operation: Record<string, unknown>;
}
