import { describe, expect, it, vi } from 'vitest';
import { createDesktopAutomationTargetSelectionRuntime } from './desktop-automation-target-selection-runtime';

describe('Desktop Automation target selection runtime', () => {
  it('binds list, changed notification and decision to one exact connection owner', async () => {
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        requestId: request.requestId,
        route: request.route,
        pending: [projection()],
      }))
      .mockImplementationOnce(async (request) => ({
        requestId: request.requestId,
        route: request.route,
        pending: [],
      }));
    let changed: (() => void) | undefined;
    const runtime = createDesktopAutomationTargetSelectionRuntime({
      connection,
      conversationId: 'conversation-1',
      bridge: {
        execute,
        subscribe: vi.fn((listener) => {
          changed = listener;
          return () => {
            changed = undefined;
          };
        }),
      },
      createRequestId: (() => {
        const ids = ['request-1', 'request-2'];
        return () => ids.shift()!;
      })(),
    });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    await expect(runtime.listPending()).resolves.toEqual([projection()]);
    changed?.();
    expect(listener).toHaveBeenCalledOnce();
    await runtime.resolve({
      authorizationId: 'authorization-1',
      decision: 'select',
      targetKey: 'target-1',
    });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connection,
        conversationId: 'conversation-1',
        route: 'pending.list',
      }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ route: 'selection.resolve' }),
    );
    unsubscribe();
    expect(changed).toBeUndefined();
  });

  it('rejects foreign projections and calls fail visibly after disposal', async () => {
    const runtime = createDesktopAutomationTargetSelectionRuntime({
      connection,
      conversationId: 'conversation-1',
      bridge: {
        execute: vi.fn(async (request) => ({
          requestId: request.requestId,
          route: request.route,
          pending: [
            {
              ...projection(),
              owner: { ...projection().owner, conversationId: 'conversation-other' },
            },
          ],
        })),
        subscribe: vi.fn(() => () => undefined),
      },
      createRequestId: () => 'request-1',
    });

    await expect(runtime.listPending()).rejects.toThrow('foreign owner projection');
    runtime.dispose();
    await expect(runtime.listPending()).rejects.toThrow('runtime is disposed');
    expect(() => runtime.subscribe(() => undefined)).toThrow('runtime is disposed');
  });
});

const connection = {
  applicationInstanceId: 'application-1',
  windowId: 'window-1',
  workbenchInstanceId: 'workbench-1',
  agentSurfaceId: 'surface-1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  viewId: 'view-1',
  connectionId: 'connection-1',
};

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
