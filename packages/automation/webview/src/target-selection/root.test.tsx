// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AutomationTargetSelectionRuntime } from '@neko/automation-contracts/target-selection';
import { AutomationTargetSelectionRoot } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

describe('AutomationTargetSelectionRoot', () => {
  it('subscribes before listing and selects only the clicked redacted candidate', async () => {
    const calls: string[] = [];
    const resolve = vi.fn(async () => undefined);
    const runtime = createRuntime({
      listPending: vi.fn(async () => {
        calls.push('list');
        return [projection()];
      }),
      resolve,
      subscribe: vi.fn(() => {
        calls.push('subscribe');
        return () => undefined;
      }),
    });

    render(<AutomationTargetSelectionRoot runtime={runtime} />);

    expect(await screen.findByRole('button', { name: /Editor/u })).toBeTruthy();
    expect(calls.slice(0, 2)).toEqual(['subscribe', 'list']);
    expect(screen.getByText(/10.*20.*800.*600/u)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/applicationId|processId|windowId/u);
    fireEvent.click(screen.getByRole('button', { name: /Editor/u }));
    await waitFor(() =>
      expect(resolve).toHaveBeenCalledExactlyOnceWith({
        authorizationId: 'authorization-1',
        decision: 'select',
        targetKey: 'target-1',
      }),
    );
    expect(screen.queryByLabelText('automation.targetSelection.title')).toBeNull();
  });

  it('renders nothing when idle and keeps a failed decision visible for retry or cancel', async () => {
    const resolve = vi.fn(async () => {
      throw new Error('Target changed before authorization.');
    });
    const runtime = createRuntime({ resolve });
    const view = render(<AutomationTargetSelectionRoot runtime={runtime} />);
    expect(view.container.textContent).toBe('');

    vi.mocked(runtime.listPending).mockResolvedValueOnce([projection()]);
    view.unmount();
    render(<AutomationTargetSelectionRoot runtime={runtime} />);
    fireEvent.click(await screen.findByRole('button', { name: /Editor/u }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Target changed before authorization.',
    );
    expect(screen.getByRole('button', { name: 'automation.targetSelection.cancel' })).toBeTruthy();
  });

  it('cancels the exact pending authorization', async () => {
    const resolve = vi.fn(async () => undefined);
    const runtime = createRuntime({
      listPending: vi.fn(async () => [projection()]),
      resolve,
    });
    render(<AutomationTargetSelectionRoot runtime={runtime} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'automation.targetSelection.cancel' }),
    );

    await waitFor(() =>
      expect(resolve).toHaveBeenCalledExactlyOnceWith({
        authorizationId: 'authorization-1',
        decision: 'cancel',
      }),
    );
  });
});

function createRuntime(
  override: Partial<AutomationTargetSelectionRuntime> = {},
): AutomationTargetSelectionRuntime {
  return {
    identity: { workspaceId: 'workspace-1', conversationId: 'conversation-1' },
    listPending: vi.fn(async () => []),
    resolve: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
    ...override,
  };
}

function projection() {
  return {
    authorizationId: 'authorization-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use@openneko',
      providerId: 'cua-driver',
      kind: 'computer' as const,
      upstreamRelease: '0.19.2',
      deliverySource: { kind: 'github-release' as const },
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
