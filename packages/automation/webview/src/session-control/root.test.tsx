// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AutomationSessionControlRuntime } from '@neko/automation-contracts/session-control';
import { AutomationSessionControlProvider, AutomationSessionControlTimelineItem } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AutomationSessionControlTimelineItem', () => {
  it('subscribes once and issues Take over only from the exact Tool Call item', async () => {
    const calls: string[] = [];
    const control = vi.fn(async () => undefined);
    const list = vi
      .fn()
      .mockImplementationOnce(async () => {
        calls.push('list');
        return [projection()];
      })
      .mockResolvedValueOnce([]);
    const runtime = createRuntime({
      list,
      control,
      subscribe: vi.fn(() => {
        calls.push('subscribe');
        return () => undefined;
      }),
    });

    render(
      <AutomationSessionControlProvider runtime={runtime}>
        <div data-testid="unrelated-tool">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-1"
            isRunning
            toolCallId="tool-call-sibling"
            toolName="automation_cua-driver_screenshot"
          />
        </div>
        <div data-testid="owner-tool">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-1"
            isRunning
            toolCallId="tool-call-1"
            toolName="automation_cua-driver_screenshot"
          />
        </div>
        <div data-testid="foreign-conversation-tool">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-2"
            isRunning
            toolCallId="tool-call-1"
            toolName="automation_cua-driver_screenshot"
          />
        </div>
      </AutomationSessionControlProvider>,
    );

    const takeover = await screen.findByRole('button', {
      name: 'automation.sessionControl.action.take-over',
    });
    expect(calls.slice(0, 2)).toEqual(['subscribe', 'list']);
    expect(screen.getByTestId('owner-tool').contains(takeover)).toBe(true);
    expect(screen.getByTestId('unrelated-tool').children).toHaveLength(0);
    expect(screen.getByTestId('foreign-conversation-tool').children).toHaveLength(0);
    expect(document.body.textContent).toContain('Editor');
    expect(document.body.textContent).not.toMatch(/processId|windowId|tabId|endpointId/u);

    fireEvent.click(takeover);
    await waitFor(() =>
      expect(control).toHaveBeenCalledExactlyOnceWith({
        sessionId: 'session-1',
        owner: projection().owner,
        action: 'take-over',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('automation.sessionControl.title')).toBeNull(),
    );
  });

  it('keeps a failed control visible on its exact Tool Call with a diagnostic', async () => {
    const runtime = createRuntime({
      list: vi.fn(async () => [projection()]),
      control: vi.fn(async () => {
        throw new Error('Provider close failed.');
      }),
    });
    render(
      <AutomationSessionControlProvider runtime={runtime}>
        <AutomationSessionControlTimelineItem
          conversationId="conversation-1"
          isRunning
          toolCallId="tool-call-1"
          toolName="automation_cua-driver_screenshot"
        />
      </AutomationSessionControlProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'automation.sessionControl.action.stop' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Provider close failed.');
    expect(screen.getByText('Editor')).toBeTruthy();
  });

  it('shows a list failure only on a running Automation Tool Call', async () => {
    const runtime = createRuntime({
      list: vi.fn(async () => {
        throw new Error('Session controls unavailable.');
      }),
    });
    render(
      <AutomationSessionControlProvider runtime={runtime}>
        <div data-testid="running-automation">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-1"
            isRunning
            toolCallId="tool-call-1"
            toolName="automation_browser-use_screenshot"
          />
        </div>
        <div data-testid="completed-automation">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-1"
            isRunning={false}
            toolCallId="tool-call-2"
            toolName="automation_browser-use_screenshot"
          />
        </div>
        <div data-testid="ordinary-tool">
          <AutomationSessionControlTimelineItem
            conversationId="conversation-1"
            isRunning
            toolCallId="tool-call-3"
            toolName="read_file"
          />
        </div>
      </AutomationSessionControlProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Session controls unavailable.',
    );
    expect(screen.getByTestId('completed-automation').children).toHaveLength(0);
    expect(screen.getByTestId('ordinary-tool').children).toHaveLength(0);
  });
});

function createRuntime(
  override: Partial<AutomationSessionControlRuntime> = {},
): AutomationSessionControlRuntime {
  return {
    identity: { workspaceId: 'workspace-1', conversationId: 'conversation-1' },
    list: vi.fn(async () => []),
    control: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
    ...override,
  };
}

function projection() {
  return {
    sessionId: 'session-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use@openneko',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      upstreamRelease: '0.19.2',
    },
    target: { kind: 'computer' as const, targetKey: 'target-1', label: 'Editor' },
    mode: 'observe' as const,
    status: 'active' as const,
    remainingSteps: 1,
    phase: 'observation' as const,
    evidenceStatus: 'none' as const,
    owner: {
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
    },
    availableActions: ['pause', 'stop', 'take-over'] as const,
  };
}
