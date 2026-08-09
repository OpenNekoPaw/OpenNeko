import { describe, expect, it, vi } from 'vitest';
import type { AutomationProfile, AutomationTarget } from '@neko/automation-contracts';
import {
  createAutomationApplicationService,
  createAutomationSessionGrantAuthority,
  type AutomationProviderPort,
} from './index';

const SCREENSHOT_DIGEST = `sha256:${'a'.repeat(64)}`;
const CLICK_DIGEST = `sha256:${'b'.repeat(64)}`;
const CHANGED_DIGEST = `sha256:${'c'.repeat(64)}`;
const target: AutomationTarget = {
  kind: 'browser',
  targetKey: 'target-1',
  browserProfileId: 'browser-profile-1',
  browserSessionId: 'browser-session-1',
  tabId: 'tab-1',
  origin: 'https://example.com',
  allowedDomains: ['example.com'],
  label: 'Example',
};

describe('AutomationApplicationService', () => {
  it('issues exact user grants and consumes them once without losing the original on mismatch', async () => {
    const authority = createAutomationSessionGrantAuthority();
    const grant = sessionRequest('session-authorized').grant;
    authority.issue(grant);

    await expect(authority.consume({ ...grant, stepBudget: grant.stepBudget + 1 })).resolves.toBe(
      false,
    );
    await expect(authority.consume(grant)).resolves.toBe(true);
    await expect(authority.consume(grant)).resolves.toBe(false);
  });

  it('exposes only exact reviewed operations and isolates changed or unknown upstream Tools', async () => {
    const fixture = await createFixture();

    expect(
      fixture.service.listAvailableOperations('browser.default').map((item) => item.name),
    ).toEqual(['browser_screenshot', 'browser_click']);
    expect(fixture.service.listQualificationDiagnostics()).toEqual([
      {
        profileId: 'browser.default',
        operation: 'browser_get_html',
        code: 'operation-schema-changed',
      },
    ]);
    expect(fixture.service.listAvailableOperations('browser.default')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'browser_exec' })]),
    );
    expect(() => fixture.service.listAvailableOperations('browser.missing')).toThrow(
      "Automation profile 'browser.missing' is unavailable.",
    );
  });

  it('accepts missing MCP hints but rejects explicit contradictions', async () => {
    const withoutHints = await createFixture({ omitScreenshotAnnotations: true });
    expect(
      withoutHints.service.listAvailableOperations('browser.default').map((item) => item.name),
    ).toContain('browser_screenshot');

    const contradicted = await createFixture({ screenshotReadOnlyHint: false });
    expect(
      contradicted.service.listAvailableOperations('browser.default').map((item) => item.name),
    ).not.toContain('browser_screenshot');
    expect(contradicted.service.listQualificationDiagnostics()).toContainEqual({
      profileId: 'browser.default',
      operation: 'browser_screenshot',
      code: 'operation-annotations-contradictory',
    });
  });

  it('keeps install enablement, OS permission and session grant as independent gates', async () => {
    const disabled = await createFixture({ extensionEnabled: false });
    await expect(
      disabled.service.openSession(sessionRequest('session-disabled')),
    ).rejects.toMatchObject({
      code: 'session-grant-invalid',
    });
    expect(disabled.provider.openSession).not.toHaveBeenCalled();

    const permissionDenied = await createFixture({ permission: 'denied' });
    await expect(
      permissionDenied.service.openSession(sessionRequest('session-denied', 'interact')),
    ).rejects.toMatchObject({ code: 'permission-required' });
    expect(permissionDenied.provider.openSession).not.toHaveBeenCalled();

    const unauthorized = await createFixture({ sessionGrantAccepted: false });
    await expect(
      unauthorized.service.openSession(sessionRequest('session-unauthorized')),
    ).rejects.toMatchObject({
      code: 'session-grant-invalid',
    });
    expect(unauthorized.provider.openSession).not.toHaveBeenCalled();

    const wrongGrant = sessionRequest('session-wrong');
    await expect(
      permissionDenied.service.openSession({
        ...wrongGrant,
        mode: 'observe',
        grant: {
          ...wrongGrant.grant,
          target: { ...wrongGrant.grant.target, targetKey: 'other-target' },
        },
      }),
    ).rejects.toMatchObject({ code: 'session-grant-invalid' });
  });

  it('consumes a user-issued session grant once even when the upstream process fails to launch', async () => {
    const fixture = await createFixture();
    fixture.provider.openSession.mockRejectedValueOnce(new Error('launch failed'));
    const request = sessionRequest('session-launch-failure');

    await expect(fixture.service.openSession(request)).rejects.toMatchObject({
      code: 'provider-failed',
    });
    expect(fixture.sessionGrants.consume).toHaveBeenCalledWith(request.grant);
    await expect(fixture.service.openSession(request)).rejects.toMatchObject({
      code: 'session-grant-replayed',
    });
    expect(fixture.provider.openSession).toHaveBeenCalledTimes(1);
  });

  it('projects screenshot bytes through a transient receipt without returning raw data', async () => {
    const fixture = await createFixture();
    await fixture.service.openSession(sessionRequest('session-observe'));

    const result = await fixture.service.executeAction({
      actionId: 'action-observe',
      sessionId: 'session-observe',
      operation: 'browser_screenshot',
      arguments: {},
    });

    expect(result.evidence).toEqual([
      {
        kind: 'transient-image',
        receiptId: 'receipt-1',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('137,80,78,71');
    expect(fixture.transientObservations.publish).toHaveBeenCalledWith(
      expect.objectContaining({ data: new Uint8Array([137, 80, 78, 71]) }),
    );
    expect(fixture.provider.revalidateTarget).toHaveBeenCalledOnce();
  });

  it('pauses a session when a required OS permission is revoked before an action', async () => {
    const fixture = await createFixture({ permission: 'granted' });
    await fixture.service.openSession(sessionRequest('session-revoked', 'interact'));
    fixture.hostPermissions.query.mockResolvedValueOnce('denied');
    const action = {
      actionId: 'action-revoked',
      sessionId: 'session-revoked',
      operation: 'browser_click',
      arguments: {},
    };

    const approval = {
      approvalId: 'approval-revoked',
      actionId: action.actionId,
      sessionId: action.sessionId,
      operation: action.operation,
      targetKey: target.targetKey,
      approved: true,
    };
    await expect(fixture.service.executeAction(action, approval)).rejects.toMatchObject({
      code: 'permission-required',
    });

    expect(fixture.service.readSession('session-revoked')).toMatchObject({ status: 'paused' });
    expect(fixture.provider.revalidateTarget).not.toHaveBeenCalled();
    expect(fixture.provider.execute).not.toHaveBeenCalled();
    await fixture.service.resumeSession('session-revoked', target);
    await expect(fixture.service.executeAction(action, approval)).rejects.toMatchObject({
      code: 'approval-replayed',
    });
  });

  it('revalidates mutations twice and consumes an exact approval once', async () => {
    const fixture = await createFixture();
    await fixture.service.openSession(sessionRequest('session-interact', 'interact'));
    const action = {
      actionId: 'action-click',
      sessionId: 'session-interact',
      operation: 'browser_click',
      arguments: { element: 'button-1' },
    };

    await expect(fixture.service.prepareAction(action)).resolves.toMatchObject({
      target,
      effect: 'input',
      remainingSteps: 3,
    });
    const approval = {
      approvalId: 'approval-1',
      actionId: action.actionId,
      sessionId: action.sessionId,
      operation: action.operation,
      targetKey: target.targetKey,
      approved: true,
    };
    await expect(fixture.service.executeAction(action, approval)).resolves.toMatchObject({
      evidence: [
        {
          kind: 'mutation',
          operation: 'browser_click',
          targetKey: 'target-1',
          verified: true,
        },
      ],
    });
    expect(fixture.provider.revalidateTarget).toHaveBeenCalledTimes(2);
    expect(fixture.provider.execute).toHaveBeenCalledTimes(1);
    await expect(fixture.service.executeAction(action, approval)).rejects.toMatchObject({
      code: 'approval-replayed',
    });
    expect(fixture.provider.execute).toHaveBeenCalledTimes(1);
  });

  it('pauses only the mismatched target session and leaves a sibling session usable', async () => {
    const fixture = await createFixture();
    await fixture.service.openSession(sessionRequest('session-first', 'interact'));
    await fixture.service.openSession(sessionRequest('session-sibling'));
    fixture.provider.revalidateTarget.mockResolvedValueOnce({ ...target, tabId: 'tab-other' });
    const action = {
      actionId: 'action-mismatch',
      sessionId: 'session-first',
      operation: 'browser_click',
      arguments: {},
    };
    const approval = {
      approvalId: 'approval-mismatch',
      actionId: action.actionId,
      sessionId: action.sessionId,
      operation: action.operation,
      targetKey: target.targetKey,
      approved: true,
    };

    await expect(fixture.service.executeAction(action, approval)).rejects.toMatchObject({
      code: 'target-mismatch',
    });
    expect(fixture.service.readSession('session-first')).toMatchObject({ status: 'paused' });
    expect(fixture.service.readSession('session-sibling')).toMatchObject({ status: 'active' });
  });

  it('projects exact extension-owned sessions for lifecycle mutation gates', async () => {
    const fixture = await createFixture();
    await fixture.service.openSession(sessionRequest('session-owned'));

    expect(fixture.service.listOwnedSessions('browser-use@openneko')).toEqual([
      expect.objectContaining({
        sessionId: 'session-owned',
        profileId: 'browser.default',
        status: 'active',
      }),
    ]);
    expect(fixture.service.listOwnedSessions('computer-use@openneko')).toEqual([]);
    await fixture.service.stopSession('session-owned');
    expect(fixture.service.listOwnedSessions('browser-use@openneko')).toEqual([]);
    expect(() => fixture.service.listOwnedSessions('../browser-use')).toThrow(
      'extension identity is invalid',
    );
  });
});

async function createFixture(
  options: {
    readonly extensionEnabled?: boolean;
    readonly permission?: 'granted' | 'denied' | 'not-determined' | 'unsupported';
    readonly omitScreenshotAnnotations?: boolean;
    readonly screenshotReadOnlyHint?: boolean;
    readonly sessionGrantAccepted?: boolean;
  } = {},
) {
  const provider: AutomationProviderPort & {
    readonly inspect: ReturnType<typeof vi.fn>;
    readonly openSession: ReturnType<typeof vi.fn>;
    readonly revalidateTarget: ReturnType<typeof vi.fn>;
    readonly execute: ReturnType<typeof vi.fn>;
    readonly closeSession: ReturnType<typeof vi.fn>;
  } = {
    identity: profile.provider,
    inspect: vi.fn(async () => ({
      provider: profile.provider,
      operations: [
        {
          name: 'browser_screenshot',
          inputSchemaDigest: SCREENSHOT_DIGEST,
          ...(options.omitScreenshotAnnotations
            ? { annotations: {} }
            : {
                annotations: {
                  readOnlyHint: options.screenshotReadOnlyHint ?? true,
                  destructiveHint: false,
                },
              }),
        },
        {
          name: 'browser_click',
          inputSchemaDigest: CLICK_DIGEST,
          annotations: { readOnlyHint: false, destructiveHint: false },
        },
        {
          name: 'browser_get_html',
          inputSchemaDigest: SCREENSHOT_DIGEST,
          annotations: { readOnlyHint: true },
        },
        {
          name: 'browser_exec',
          inputSchemaDigest: SCREENSHOT_DIGEST,
          annotations: { readOnlyHint: false },
        },
      ],
    })),
    openSession: vi.fn(async () => ({ providerSessionId: 'provider-session-1' })),
    revalidateTarget: vi.fn(async () => target),
    execute: vi.fn(async ({ operation }: { readonly operation: string }) =>
      operation === 'browser_screenshot'
        ? {
            observation: {
              data: new Uint8Array([137, 80, 78, 71]),
              mimeType: 'image/png',
              width: 800,
              height: 600,
            },
          }
        : { mutationVerified: true },
    ),
    closeSession: vi.fn(async () => undefined),
  };
  const transientObservations = {
    publish: vi.fn(async () => ({ receiptId: 'receipt-1' })),
  };
  const sessionGrants = {
    consume: vi.fn(async () => options.sessionGrantAccepted ?? true),
  };
  const hostPermissions = {
    query: vi.fn(async () => options.permission ?? 'granted'),
  };
  const service = await createAutomationApplicationService({
    profiles: [profile],
    providers: [provider],
    extensionRuntime: {
      isEnabled: vi.fn(async () => options.extensionEnabled ?? true),
    },
    sessionGrants,
    hostPermissions,
    transientObservations,
  });
  return { service, provider, sessionGrants, hostPermissions, transientObservations };
}

const profile: AutomationProfile = {
  id: 'browser.default',
  provider: {
    extensionId: 'browser-use@openneko',
    providerId: 'browser-use',
    kind: 'browser',
    upstreamRelease: '0.13.7',
  },
  operations: [
    {
      name: 'browser_screenshot',
      inputSchemaDigest: SCREENSHOT_DIGEST,
      modes: ['observe', 'browse-read', 'interact'],
      trait: {
        effect: 'observe',
        readOnly: true,
        destructive: false,
        sensitive: true,
        requiresApproval: false,
      },
    },
    {
      name: 'browser_click',
      inputSchemaDigest: CLICK_DIGEST,
      modes: ['interact'],
      trait: {
        effect: 'input',
        readOnly: false,
        destructive: false,
        sensitive: false,
        requiresApproval: true,
      },
    },
    {
      name: 'browser_get_html',
      inputSchemaDigest: CHANGED_DIGEST,
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
  requiredPermissions: { interact: ['accessibility'] },
};

function sessionRequest(sessionId: string, mode: 'observe' | 'interact' = 'observe') {
  return {
    sessionId,
    profileId: profile.id,
    target,
    mode,
    timeoutMs: 30_000,
    stepBudget: 3,
    owner: {
      conversationId: `conversation-${sessionId}`,
      runId: `run-${sessionId}`,
      toolCallId: `tool-${sessionId}`,
    },
    grant: {
      grantId: `grant-${sessionId}`,
      sessionId,
      extensionId: profile.provider.extensionId,
      profileId: profile.id,
      provider: profile.provider,
      target,
      mode,
      timeoutMs: 30_000,
      stepBudget: 3,
      conversationId: `conversation-${sessionId}`,
      runId: `run-${sessionId}`,
      toolCallId: `tool-${sessionId}`,
    },
  };
}
