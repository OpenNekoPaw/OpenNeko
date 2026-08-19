import { describe, expect, it } from 'vitest';
import {
  parseDesktopAutomationTargetSelectionChangedEvent,
  parseDesktopAutomationTargetSelectionRequest,
  parseDesktopAutomationTargetSelectionResult,
} from './automation-target-selection-contract';

describe('Desktop Automation target selection contract', () => {
  it('parses list and exact selection requests', () => {
    expect(parseDesktopAutomationTargetSelectionRequest(request())).toEqual(request());
    expect(
      parseDesktopAutomationTargetSelectionRequest({
        ...request(),
        route: 'selection.resolve',
        decision: {
          authorizationId: 'authorization-1',
          decision: 'select',
          targetKey: 'target-1',
        },
      }),
    ).toMatchObject({ route: 'selection.resolve' });
  });

  it('rejects stale results and changed events carrying target data', () => {
    expect(() =>
      parseDesktopAutomationTargetSelectionResult(
        { requestId: 'request-other', route: 'pending.list', pending: [] },
        request(),
      ),
    ).toThrow('identity is stale');
    expect(parseDesktopAutomationTargetSelectionChangedEvent({ kind: 'changed' })).toEqual({
      kind: 'changed',
    });
    expect(() =>
      parseDesktopAutomationTargetSelectionChangedEvent({
        kind: 'changed',
        authorizationId: 'authorization-1',
      }),
    ).toThrow('unsupported or missing fields');
  });
});

function request() {
  return {
    requestId: 'request-1',
    connection: {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'view-1',
      connectionId: 'connection-1',
    },
    conversationId: 'conversation-1',
    route: 'pending.list' as const,
  };
}
