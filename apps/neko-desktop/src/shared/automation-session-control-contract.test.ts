import { describe, expect, it } from 'vitest';
import {
  parseDesktopAutomationSessionControlChangedEvent,
  parseDesktopAutomationSessionControlRequest,
  parseDesktopAutomationSessionControlResult,
} from './automation-session-control-contract';

const connection = {
  applicationInstanceId: 'app-1',
  windowId: 'window-1',
  workbenchInstanceId: 'workbench-1',
  agentSurfaceId: 'surface-1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  viewId: 'view-1',
  connectionId: 'connection-1',
} as const;

describe('Desktop Automation session control contract', () => {
  it('parses exact Conversation-bound list and control requests', () => {
    expect(
      parseDesktopAutomationSessionControlRequest({
        requestId: 'request-1',
        connection,
        conversationId: 'conversation-1',
        route: 'controls.list',
      }),
    ).toMatchObject({ route: 'controls.list', conversationId: 'conversation-1' });
    expect(
      parseDesktopAutomationSessionControlRequest({
        requestId: 'request-2',
        connection,
        conversationId: 'conversation-1',
        route: 'session.control',
        command: {
          sessionId: 'session-1',
          owner: {
            conversationId: 'conversation-1',
            runId: 'run-1',
            toolCallId: 'tool-call-1',
          },
          action: 'take-over',
        },
      }),
    ).toMatchObject({ route: 'session.control', command: { action: 'take-over' } });
  });

  it('rejects stale results and non-generic events', () => {
    const request = parseDesktopAutomationSessionControlRequest({
      requestId: 'request-1',
      connection,
      conversationId: 'conversation-1',
      route: 'controls.list',
    });
    expect(() =>
      parseDesktopAutomationSessionControlResult(
        { requestId: 'request-other', route: 'controls.list', controls: [] },
        request,
      ),
    ).toThrow('identity is stale');
    expect(parseDesktopAutomationSessionControlChangedEvent({ kind: 'changed' })).toEqual({
      kind: 'changed',
    });
    expect(() =>
      parseDesktopAutomationSessionControlChangedEvent({ kind: 'changed', sessionId: 'secret' }),
    ).toThrow('unsupported or missing fields');
  });
});
