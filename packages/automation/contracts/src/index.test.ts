import { describe, expect, it } from 'vitest';
import {
  parseAutomationActionApproval,
  parseAutomationProfile,
  parseAutomationSessionRequest,
  parseAutomationTarget,
  sameAutomationTarget,
} from './index';

describe('Automation contracts', () => {
  it('compares canonical targets independently of object property insertion order', () => {
    const canonical = parseAutomationTarget({
      kind: 'browser',
      targetKey: 'target-1',
      browserProfileId: 'profile-1',
      browserSessionId: 'browser-session-1',
      tabId: 'tab-1',
      origin: 'https://example.test',
      allowedDomains: ['example.test', 'assets.example.test'],
      label: 'Example',
    });
    if (canonical.kind !== 'browser') throw new Error('Expected a Browser Automation target.');
    const reordered = {
      label: canonical.label,
      allowedDomains: canonical.allowedDomains,
      origin: canonical.origin,
      tabId: canonical.tabId,
      browserSessionId: canonical.browserSessionId,
      browserProfileId: canonical.browserProfileId,
      targetKey: canonical.targetKey,
      kind: canonical.kind,
    };

    expect(sameAutomationTarget(canonical, reordered)).toBe(true);
    expect(sameAutomationTarget(canonical, { ...reordered, tabId: 'tab-2' })).toBe(false);
  });

  it('parses one canonical reviewed profile without internal generation fields', () => {
    expect(
      parseAutomationProfile({
        id: 'browser.observe',
        provider: {
          extensionId: 'browser-use@openneko',
          providerId: 'browser-use',
          kind: 'browser',
          deliverySource: { kind: 'bundled-adapter' },
        },
        operations: [
          {
            name: 'browser_screenshot',
            requiredInputProperties: [],
            modes: ['observe'],
            trait: {
              effect: 'observe',
              readOnly: true,
              destructive: false,
              sensitive: true,
              requiresApproval: false,
            },
          },
        ],
        requiredPermissions: {},
      }),
    ).toMatchObject({ id: 'browser.observe' });
  });

  it('keeps a user-managed local runtime as an opaque exact identity without Host paths', () => {
    const profile = {
      id: 'browser.observe.local',
      provider: {
        extensionId: 'browser-use@openneko',
        providerId: 'browser-use',
        kind: 'browser',
        deliverySource: {
          kind: 'user-managed-local-runtime',
          runtimeId: 'local-runtime:browser-1',
        },
      },
      operations: [],
      requiredPermissions: {},
    };

    expect(parseAutomationProfile(profile)).toMatchObject({
      provider: {
        deliverySource: {
          kind: 'user-managed-local-runtime',
          runtimeId: 'local-runtime:browser-1',
        },
      },
    });
    expect(() =>
      parseAutomationProfile({
        ...profile,
        provider: {
          ...profile.provider,
          deliverySource: {
            ...profile.provider.deliverySource,
            path: '/usr/local/bin/browser-use',
          },
        },
      }),
    ).toThrow('unsupported or missing fields');
  });

  it('rejects internal version fields and contradictory action traits', () => {
    const base = {
      id: 'browser.observe',
      provider: {
        extensionId: 'browser-use@openneko',
        providerId: 'browser-use',
        kind: 'browser',
        deliverySource: { kind: 'bundled-adapter' },
      },
      operations: [],
      requiredPermissions: {},
    };
    const forbiddenProfileField = ['schema', 'Version'].join('');
    expect(() => parseAutomationProfile({ ...base, [forbiddenProfileField]: 1 })).toThrow(
      'unsupported or missing fields',
    );
    expect(() =>
      parseAutomationProfile({
        ...base,
        operations: [
          {
            name: 'click',
            requiredInputProperties: [],
            modes: ['interact'],
            trait: {
              effect: 'input',
              readOnly: false,
              destructive: false,
              sensitive: false,
              requiresApproval: false,
            },
          },
        ],
      }),
    ).toThrow('traits are contradictory');
  });

  it('preserves a structurally valid stale grant for owning-service rejection and rejects extra fields', () => {
    const request = sessionRequest();
    expect(parseAutomationSessionRequest(request)).toMatchObject({ sessionId: 'session-1' });
    expect(() =>
      parseAutomationSessionRequest({
        ...request,
        grant: {
          ...request.grant,
          target: { ...request.grant.target, targetKey: 'target-other' },
        },
      }),
    ).not.toThrow();
    const forbiddenApprovalField = ['genera', 'tion'].join('');
    expect(() =>
      parseAutomationActionApproval({
        approvalId: 'approval-1',
        actionId: 'action-1',
        sessionId: 'session-1',
        operation: 'click',
        targetKey: 'target-1',
        approved: true,
        [forbiddenApprovalField]: 1,
      }),
    ).toThrow('unsupported or missing fields');
  });
});

function sessionRequest() {
  return {
    sessionId: 'session-1',
    profileId: 'browser.observe',
    target: {
      kind: 'browser',
      targetKey: 'target-1',
      browserProfileId: 'browser-profile-1',
      browserSessionId: 'browser-session-1',
      tabId: 'tab-1',
      origin: 'https://example.com',
      allowedDomains: ['example.com'],
      label: 'Example',
    },
    mode: 'observe',
    timeoutMs: 30_000,
    stepBudget: 4,
    owner: {
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
    grant: {
      grantId: 'grant-1',
      sessionId: 'session-1',
      extensionId: 'browser-use@openneko',
      profileId: 'browser.observe',
      provider: {
        extensionId: 'browser-use@openneko',
        providerId: 'browser-use',
        kind: 'browser',
        deliverySource: { kind: 'bundled-adapter' },
      },
      target: {
        kind: 'browser',
        targetKey: 'target-1',
        browserProfileId: 'browser-profile-1',
        browserSessionId: 'browser-session-1',
        tabId: 'tab-1',
        origin: 'https://example.com',
        allowedDomains: ['example.com'],
        label: 'Example',
      },
      mode: 'observe',
      timeoutMs: 30_000,
      stepBudget: 4,
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
  } as const;
}
