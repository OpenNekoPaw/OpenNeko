import { describe, expect, it, vi } from 'vitest';
import type { AutomationTarget } from '@neko/automation-contracts';
import { BROWSER_USE_OBSERVE_PROFILE } from './browser-use';
import { CUA_DRIVER_OBSERVE_PROFILE } from './computer-use';
import {
  createAutomationSessionAuthorizationService,
  type AutomationTargetDiscoveryPort,
  type AutomationTargetSelectionPort,
} from './session-authorization';
import { createAutomationSessionGrantAuthority } from './index';

describe('Automation session authorization', () => {
  it('binds an explicit Host selection to an exact revalidated target and one-time grant', async () => {
    const targets = createTargets();
    const grants = createAutomationSessionGrantAuthority();
    const issue = vi.spyOn(grants, 'issue');
    const selection = vi.fn(async (input) => ({
      authorizationId: input.authorizationId,
      targetKey: target.targetKey,
    }));
    const service = createService({ targets, grants, selection });

    const authorized = await service.authorizeSession(request());

    expect(authorized.target).toEqual(target);
    expect(authorized.grant).toMatchObject({
      grantId: 'grant-1',
      sessionId: 'session-1',
      extensionId: 'computer-use@openneko',
      profileId: CUA_DRIVER_OBSERVE_PROFILE.id,
      target,
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    });
    expect(selection).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationId: 'authorization-1',
        mode: 'observe',
        owner: {
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
        },
        candidates: [
          {
            kind: 'computer',
            targetKey: target.targetKey,
            label: target.label,
            region: target.region,
          },
        ],
      }),
      undefined,
    );
    expect(JSON.stringify(selection.mock.calls[0]?.[0])).not.toMatch(
      /applicationId|processId|windowId/u,
    );
    expect(targets.revalidate).toHaveBeenCalledWith({ target });
    expect(issue).toHaveBeenCalledOnce();
    await expect(grants.consume(authorized.grant)).resolves.toBe(true);
    await expect(grants.consume(authorized.grant)).resolves.toBe(false);
  });

  it('treats cancellation as denial without revalidation or grant issuance', async () => {
    const targets = createTargets();
    const grants = createAutomationSessionGrantAuthority();
    const issue = vi.spyOn(grants, 'issue');
    const service = createService({
      targets,
      grants,
      selection: vi.fn(async () => undefined),
    });

    await expect(service.authorizeSession(request())).rejects.toThrow(
      'target selection was cancelled by the user',
    );
    expect(targets.revalidate).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('projects browser candidates without exposing profile, session or tab handles', async () => {
    const browserTarget = {
      kind: 'browser' as const,
      targetKey: 'opaque-browser-target',
      browserProfileId: 'private-profile',
      browserSessionId: 'private-session',
      tabId: 'private-tab',
      origin: 'https://example.test',
      allowedDomains: ['example.test'],
      label: 'Example',
    };
    const targets = {
      listCandidates: vi.fn(async () => [browserTarget]),
      revalidate: vi.fn(async () => browserTarget),
    } satisfies AutomationTargetDiscoveryPort;
    const selection = vi.fn(async (input) => ({
      authorizationId: input.authorizationId,
      targetKey: browserTarget.targetKey,
    }));
    const service = createAutomationSessionAuthorizationService({
      registrations: [{ profile: BROWSER_USE_OBSERVE_PROFILE, targets }],
      grants: createAutomationSessionGrantAuthority(),
      selection: { select: selection },
      createAuthorizationId: () => 'authorization-browser',
      createGrantId: () => 'grant-browser',
    });

    const authorized = await service.authorizeSession({
      ...request(),
      profile: BROWSER_USE_OBSERVE_PROFILE,
    });

    expect(authorized.target).toEqual(browserTarget);
    expect(selection.mock.calls[0]?.[0].candidates).toEqual([
      {
        kind: 'browser',
        targetKey: browserTarget.targetKey,
        label: browserTarget.label,
        origin: browserTarget.origin,
        allowedDomains: browserTarget.allowedDomains,
      },
    ]);
    expect(JSON.stringify(selection.mock.calls[0]?.[0])).not.toMatch(
      /browserProfileId|browserSessionId|tabId/u,
    );
  });

  it('rejects stale target facts after selection without transferring the grant', async () => {
    const targets = createTargets({
      revalidated: { ...target, region: { ...target.region, width: 801 } },
    });
    const grants = createAutomationSessionGrantAuthority();
    const issue = vi.spyOn(grants, 'issue');
    const service = createService({
      targets,
      grants,
      selection: vi.fn(async (input) => ({
        authorizationId: input.authorizationId,
        targetKey: target.targetKey,
      })),
    });

    await expect(service.authorizeSession(request())).rejects.toThrow(
      'target changed after user selection',
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'stale authorization identity',
      selection: { authorizationId: 'authorization-stale', targetKey: target.targetKey },
      message: 'selection identity is stale',
    },
    {
      label: 'unknown target identity',
      selection: { authorizationId: 'authorization-1', targetKey: 'target-unknown' },
      message: 'did not choose an eligible target',
    },
  ])('rejects $label before target revalidation', async ({ selection, message }) => {
    const targets = createTargets();
    const grants = createAutomationSessionGrantAuthority();
    const service = createService({
      targets,
      grants,
      selection: vi.fn(async () => selection),
    });

    await expect(service.authorizeSession(request())).rejects.toThrow(message);
    expect(targets.revalidate).not.toHaveBeenCalled();
  });

  it('rejects duplicated opaque target keys instead of selecting an arbitrary candidate', async () => {
    const targets = createTargets({ candidates: [target, { ...target }] });
    const grants = createAutomationSessionGrantAuthority();
    const selection = vi.fn<AutomationTargetSelectionPort['select']>();
    const service = createService({ targets, grants, selection });

    await expect(service.authorizeSession(request())).rejects.toThrow(
      `Automation target '${target.targetKey}' is duplicated.`,
    );
    expect(selection).not.toHaveBeenCalled();
  });

  it('rejects a changed profile before reading Host target metadata', async () => {
    const targets = createTargets();
    const service = createService({
      targets,
      grants: createAutomationSessionGrantAuthority(),
      selection: vi.fn<AutomationTargetSelectionPort['select']>(),
    });

    await expect(
      service.authorizeSession({
        ...request(),
        profile: {
          ...CUA_DRIVER_OBSERVE_PROFILE,
          provider: { ...CUA_DRIVER_OBSERVE_PROFILE.provider, upstreamRelease: 'changed' },
        },
      }),
    ).rejects.toThrow('authorization profile is unavailable or changed');
    expect(targets.listCandidates).not.toHaveBeenCalled();
  });
});

function createService(input: {
  readonly targets: AutomationTargetDiscoveryPort & {
    readonly listCandidates: ReturnType<typeof vi.fn>;
    readonly revalidate: ReturnType<typeof vi.fn>;
  };
  readonly grants: ReturnType<typeof createAutomationSessionGrantAuthority>;
  readonly selection: AutomationTargetSelectionPort['select'];
}) {
  return createAutomationSessionAuthorizationService({
    registrations: [{ profile: CUA_DRIVER_OBSERVE_PROFILE, targets: input.targets }],
    grants: input.grants,
    selection: { select: input.selection },
    createAuthorizationId: () => 'authorization-1',
    createGrantId: () => 'grant-1',
  });
}

function createTargets(
  input: {
    readonly candidates?: readonly AutomationTarget[];
    readonly revalidated?: AutomationTarget;
  } = {},
) {
  return {
    listCandidates: vi.fn(async () => input.candidates ?? [target]),
    revalidate: vi.fn(async () => input.revalidated ?? target),
  } satisfies AutomationTargetDiscoveryPort & {
    readonly listCandidates: ReturnType<typeof vi.fn>;
    readonly revalidate: ReturnType<typeof vi.fn>;
  };
}

function request() {
  return {
    sessionId: 'session-1',
    profile: CUA_DRIVER_OBSERVE_PROFILE,
    mode: 'observe' as const,
    timeoutMs: 30_000,
    stepBudget: 1,
    owner: {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
  };
}

const target = {
  kind: 'computer' as const,
  targetKey: 'opaque-target-1',
  applicationId: 'com.example.Editor',
  processId: 42,
  windowId: '701',
  label: 'Editor — Project.neko',
  region: { x: 10, y: 20, width: 800, height: 600 },
};
