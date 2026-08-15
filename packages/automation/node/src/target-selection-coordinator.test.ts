import { describe, expect, it, vi } from 'vitest';
import { createAutomationTargetSelectionCoordinator } from './target-selection-coordinator';

describe('Automation target selection coordinator', () => {
  it('projects only to the exact Workspace and Conversation and resolves one eligible target', async () => {
    const coordinator = createAutomationTargetSelectionCoordinator();
    const changed = vi.fn();
    coordinator.subscribe(changed);

    const selected = coordinator.select(projection());

    expect(coordinator.listPending(scope())).toEqual([projection()]);
    expect(coordinator.listPending({ ...scope(), conversationId: 'conversation-other' })).toEqual(
      [],
    );
    expect(coordinator.listPending({ ...scope(), workspaceId: 'workspace-other' })).toEqual([]);
    coordinator.resolve(scope(), {
      authorizationId: 'authorization-1',
      decision: 'select',
      targetKey: 'target-1',
    });
    await expect(selected).resolves.toEqual({
      authorizationId: 'authorization-1',
      targetKey: 'target-1',
    });
    expect(coordinator.listPending(scope())).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('keeps a pending selection intact after wrong-owner and unknown-target attempts', async () => {
    const coordinator = createAutomationTargetSelectionCoordinator();
    const selected = coordinator.select(projection());

    expect(() =>
      coordinator.resolve(
        { ...scope(), conversationId: 'conversation-other' },
        {
          authorizationId: 'authorization-1',
          decision: 'cancel',
        },
      ),
    ).toThrow('owner is stale');
    expect(() =>
      coordinator.resolve(scope(), {
        authorizationId: 'authorization-1',
        decision: 'select',
        targetKey: 'target-other',
      }),
    ).toThrow('eligible target');
    expect(coordinator.listPending(scope())).toHaveLength(1);

    coordinator.resolve(scope(), {
      authorizationId: 'authorization-1',
      decision: 'cancel',
    });
    await expect(selected).resolves.toBeUndefined();
  });

  it('removes only the aborted selection and leaves siblings available', async () => {
    const coordinator = createAutomationTargetSelectionCoordinator();
    const firstAbort = new AbortController();
    const first = coordinator.select(projection(), firstAbort.signal);
    const second = coordinator.select({
      ...projection(),
      authorizationId: 'authorization-2',
      owner: { ...projection().owner, toolCallId: 'tool-call-2' },
    });

    firstAbort.abort(new Error('Tool Call cancelled'));

    await expect(first).rejects.toThrow('Tool Call cancelled');
    expect(coordinator.listPending(scope())).toMatchObject([
      { authorizationId: 'authorization-2' },
    ]);
    coordinator.resolve(scope(), {
      authorizationId: 'authorization-2',
      decision: 'cancel',
    });
    await expect(second).resolves.toBeUndefined();
  });

  it('rejects duplicate authorization identities and disposal rejects each pending caller', async () => {
    const coordinator = createAutomationTargetSelectionCoordinator();
    const first = coordinator.select(projection());
    await expect(coordinator.select(projection())).rejects.toThrow('already pending');

    coordinator.dispose();

    await expect(first).rejects.toThrow('coordinator was disposed');
    expect(() => coordinator.subscribe(() => undefined)).toThrow('coordinator is disposed');
    await expect(coordinator.select(projection())).rejects.toThrow('coordinator is disposed');
  });
});

function scope() {
  return { workspaceId: 'workspace-1', conversationId: 'conversation-1' };
}

function projection() {
  return {
    authorizationId: 'authorization-1',
    profileId: 'computer.observe',
    provider: {
      extensionId: 'computer-use',
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
