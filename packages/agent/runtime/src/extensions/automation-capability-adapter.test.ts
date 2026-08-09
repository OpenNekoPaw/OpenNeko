import { describe, expect, it, vi } from 'vitest';
import type { AutomationApplicationService } from '@neko/automation-node';
import { BROWSER_USE_OBSERVE_PROFILE } from '@neko/automation-node';
import { createAgentAutomationCapabilityTools } from './automation-capability-adapter';

describe('Agent Automation Capability adapter', () => {
  it('binds authorization and provider execution to one Tool Call owner and always closes the session', async () => {
    const service = createService();
    const ids = ['session-1', 'action-1'];
    const authorization = {
      authorizeSession: vi.fn(async (input) => ({
        target,
        grant: {
          grantId: 'grant-1',
          sessionId: input.sessionId,
          extensionId: input.profile.provider.extensionId,
          profileId: input.profile.id,
          provider: input.profile.provider,
          target,
          mode: input.mode,
          timeoutMs: input.timeoutMs,
          stepBudget: input.stepBudget,
          conversationId: input.owner.conversationId,
          runId: input.owner.runId,
          toolCallId: input.owner.toolCallId,
        },
      })),
    };
    const tools = createAgentAutomationCapabilityTools({
      profile: BROWSER_USE_OBSERVE_PROFILE,
      service,
      authorization,
      createId: () => ids.shift() ?? 'unexpected',
    });
    const screenshot = tools.find(
      (tool) => tool.name === 'automation_browser-use_browser_screenshot',
    );
    expect(screenshot).toMatchObject({
      requiresConfirmation: true,
      isReadOnly: true,
      category: 'system',
    });

    const result = await screenshot?.execute(
      {
        targetKey: target.targetKey,
        arguments: { full_page: false },
        timeoutMs: 30_000,
        stepBudget: 1,
      },
      {
        metadata: {
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
        },
      },
    );
    expect(result).toMatchObject({
      success: true,
      data: { actionId: 'action-1' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /browserProfileId|browserSessionId|tabId|processId|windowId/u,
    );
    expect(authorization.authorizeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        targetKey: target.targetKey,
        owner: {
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
        },
      }),
    );
    expect(service.openSession).toHaveBeenCalledOnce();
    expect(service.executeAction).toHaveBeenCalledWith(
      {
        actionId: 'action-1',
        sessionId: 'session-1',
        operation: 'browser_screenshot',
        arguments: { full_page: false },
      },
      undefined,
      undefined,
    );
    expect(service.stopSession).toHaveBeenCalledWith('session-1');
  });

  it('does not try another provider and closes the exact session when execution fails', async () => {
    const service = createService();
    service.executeAction.mockRejectedValueOnce(new Error('upstream failed'));
    const tools = createAgentAutomationCapabilityTools({
      profile: BROWSER_USE_OBSERVE_PROFILE,
      service,
      authorization: {
        authorizeSession: vi.fn(async (input) => ({
          target,
          grant: {
            grantId: 'grant-failure',
            sessionId: input.sessionId,
            extensionId: input.profile.provider.extensionId,
            profileId: input.profile.id,
            provider: input.profile.provider,
            target,
            mode: input.mode,
            timeoutMs: input.timeoutMs,
            stepBudget: input.stepBudget,
            conversationId: input.owner.conversationId,
            runId: input.owner.runId,
            toolCallId: input.owner.toolCallId,
          },
        })),
      },
      createId: (() => {
        const ids = ['session-failure', 'action-failure'];
        return () => ids.shift() ?? 'unexpected';
      })(),
    });
    const tool = tools[0]!;
    await expect(
      tool.execute(
        { targetKey: target.targetKey, arguments: {}, timeoutMs: 30_000, stepBudget: 1 },
        {
          metadata: {
            conversationId: 'conversation-1',
            runId: 'run-1',
            toolCallId: 'tool-call-1',
          },
        },
      ),
    ).rejects.toThrow('upstream failed');
    expect(service.stopSession).toHaveBeenCalledWith('session-failure');
    expect(service.executeAction).toHaveBeenCalledTimes(1);
  });
});

function createService() {
  return {
    listQualificationDiagnostics: vi.fn(() => []),
    listAvailableOperations: vi.fn(() => BROWSER_USE_OBSERVE_PROFILE.operations),
    listOwnedSessions: vi.fn(() => []),
    openSession: vi.fn(async (input) => ({
      sessionId: input.sessionId,
      profileId: input.profileId,
      provider: BROWSER_USE_OBSERVE_PROFILE.provider,
      target: input.target,
      mode: input.mode,
      status: 'active' as const,
      remainingSteps: input.stepBudget,
    })),
    readSession: vi.fn(() => undefined),
    prepareAction: vi.fn(async () => {
      throw new Error('not expected');
    }),
    executeAction: vi.fn(async (input) => ({
      actionId: input.actionId,
      session: {
        sessionId: input.sessionId,
        profileId: BROWSER_USE_OBSERVE_PROFILE.id,
        provider: BROWSER_USE_OBSERVE_PROFILE.provider,
        target,
        mode: 'observe' as const,
        status: 'active' as const,
        remainingSteps: 0,
      },
      evidence: [],
    })),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    stopSession: vi.fn(async (sessionId) => ({
      sessionId,
      profileId: BROWSER_USE_OBSERVE_PROFILE.id,
      provider: BROWSER_USE_OBSERVE_PROFILE.provider,
      target,
      mode: 'observe' as const,
      status: 'stopped' as const,
      remainingSteps: 0,
    })),
    takeOverSession: vi.fn(),
  } satisfies AutomationApplicationService & Record<string, ReturnType<typeof vi.fn>>;
}

const target = {
  kind: 'browser' as const,
  targetKey: 'browser-target',
  browserProfileId: 'profile-1',
  browserSessionId: 'browser-session-1',
  tabId: 'tab-1',
  origin: 'https://example.test',
  allowedDomains: ['example.test'],
  label: 'Example',
};
