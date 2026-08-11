import { describe, expect, it } from 'vitest';
import {
  parseAutomationSessionControlCommand,
  parseAutomationSessionControlProjection,
  parseAutomationSessionControlProjections,
  parseAutomationSessionControlScope,
} from './session-control';

const projection = {
  sessionId: 'session-1',
  profileId: 'computer.observe',
  provider: {
    extensionId: 'computer-use@openneko',
    providerId: 'cua-driver',
    kind: 'computer',
  },
  target: {
    kind: 'computer',
    targetKey: 'target-1',
    label: 'Fixture Window',
  },
  mode: 'observe',
  status: 'active',
  remainingSteps: 2,
  phase: 'observation',
  evidenceStatus: 'none',
  owner: {
    conversationId: 'conversation-1',
    runId: 'run-1',
    toolCallId: 'tool-call-1',
  },
  availableActions: ['pause', 'stop', 'take-over'],
} as const;

describe('Automation session control contract', () => {
  it('accepts a redacted canonical live projection', () => {
    expect(parseAutomationSessionControlProjection(projection)).toEqual(projection);
    expect(JSON.stringify(projection)).not.toMatch(
      /processId|windowId|tabId|browserProfileId|browserSessionId|endpointId/u,
    );
  });

  it('requires status-specific actions and rejects terminal projections', () => {
    expect(() =>
      parseAutomationSessionControlProjection({
        ...projection,
        availableActions: ['resume', 'stop', 'take-over'],
      }),
    ).toThrow('actions do not match');
    expect(() =>
      parseAutomationSessionControlProjection({ ...projection, status: 'taken-over' }),
    ).toThrow('status is invalid');
  });

  it('requires exact owner identity on commands and conversation scope on lists', () => {
    expect(
      parseAutomationSessionControlCommand({
        sessionId: 'session-1',
        owner: projection.owner,
        action: 'take-over',
      }),
    ).toEqual({ sessionId: 'session-1', owner: projection.owner, action: 'take-over' });
    expect(parseAutomationSessionControlScope({ conversationId: 'conversation-1' })).toEqual({
      conversationId: 'conversation-1',
    });
    expect(() =>
      parseAutomationSessionControlCommand({
        sessionId: 'session-1',
        owner: { ...projection.owner, workspaceId: 'workspace-1' },
        action: 'stop',
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('isolates duplicate and malformed projection entries', () => {
    expect(() => parseAutomationSessionControlProjections([projection, projection])).toThrow(
      'duplicate identities',
    );
    expect(() =>
      parseAutomationSessionControlProjections([
        projection,
        {
          ...projection,
          sessionId: 'session-2',
          target: { ...projection.target, kind: 'browser' },
        },
      ]),
    ).toThrow('target kind is inconsistent');
  });
});
