import { describe, expect, it } from 'vitest';
import {
  parseAutomationTargetSelectionDecision,
  parseAutomationTargetSelectionProjection,
  parseAutomationTargetSelectionProjections,
  parseAutomationTargetSelectionResult,
} from './target-selection';

describe('Automation target selection contracts', () => {
  it('parses one redacted exact target selection projection', () => {
    expect(parseAutomationTargetSelectionProjection(projection())).toEqual(projection());
    expect(JSON.stringify(parseAutomationTargetSelectionProjection(projection()))).not.toMatch(
      /applicationId|processId|windowId|browserProfileId|browserSessionId|tabId/u,
    );
  });

  it('rejects duplicate candidates, provider mismatch and unsupported routing fields', () => {
    const input = projection();
    expect(() =>
      parseAutomationTargetSelectionProjection({
        ...input,
        candidates: [...input.candidates, input.candidates[0]],
      }),
    ).toThrow('duplicate identities');
    expect(() =>
      parseAutomationTargetSelectionProjection({
        ...input,
        provider: { ...input.provider, kind: 'browser' },
      }),
    ).toThrow('candidate kind is inconsistent');
    expect(() =>
      parseAutomationTargetSelectionProjection({ ...input, activeWindow: true }),
    ).toThrow('unsupported or missing fields');
  });

  it('parses exact select and cancel decisions while rejecting stale shapes', () => {
    expect(
      parseAutomationTargetSelectionDecision({
        authorizationId: 'authorization-1',
        decision: 'select',
        targetKey: 'target-1',
      }),
    ).toEqual({
      authorizationId: 'authorization-1',
      decision: 'select',
      targetKey: 'target-1',
    });
    expect(
      parseAutomationTargetSelectionDecision({
        authorizationId: 'authorization-1',
        decision: 'cancel',
      }),
    ).toEqual({ authorizationId: 'authorization-1', decision: 'cancel' });
    expect(() =>
      parseAutomationTargetSelectionDecision({
        authorizationId: 'authorization-1',
        decision: 'cancel',
        targetKey: 'target-1',
      }),
    ).toThrow('unsupported or missing fields');
    expect(
      parseAutomationTargetSelectionResult({
        authorizationId: 'authorization-1',
        targetKey: 'target-1',
      }),
    ).toEqual({ authorizationId: 'authorization-1', targetKey: 'target-1' });
  });

  it('rejects duplicate pending authorization identities', () => {
    const input = projection();
    expect(() => parseAutomationTargetSelectionProjections([input, input])).toThrow(
      'duplicate identities',
    );
    expect(() =>
      parseAutomationTargetSelectionProjections(
        Array.from({ length: 101 }, (_, index) => ({
          ...input,
          authorizationId: `authorization-${index + 1}`,
        })),
      ),
    ).toThrow('exceed the supported limit');
  });
});

function projection() {
  return {
    authorizationId: 'authorization-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use@openneko',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      deliverySource: { kind: 'bundled-adapter' as const },
    },
    mode: 'observe' as const,
    timeoutMs: 30_000,
    stepBudget: 1,
    owner: {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
    candidates: [
      {
        kind: 'computer' as const,
        targetKey: 'target-1',
        label: 'Editor',
        region: { x: 10, y: 20, width: 800, height: 600 },
      },
    ],
  };
}
