import { describe, expect, it, vi } from 'vitest';
import { createDesktopAutomationSessionControlRuntime } from './desktop-automation-session-control-runtime';

describe('Desktop Automation session control runtime', () => {
  it('binds list, changed notification and command to one exact connection owner', async () => {
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        requestId: request.requestId,
        route: request.route,
        controls: [projection()],
      }))
      .mockImplementationOnce(async (request) => ({
        requestId: request.requestId,
        route: request.route,
        controls: [],
      }));
    let changed: (() => void) | undefined;
    const runtime = createDesktopAutomationSessionControlRuntime({
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

    await expect(runtime.list()).resolves.toEqual([projection()]);
    changed?.();
    expect(listener).toHaveBeenCalledOnce();
    await runtime.control({
      sessionId: 'session-1',
      owner: projection().owner,
      action: 'take-over',
    });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connection,
        conversationId: 'conversation-1',
        route: 'controls.list',
      }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        route: 'session.control',
        command: expect.objectContaining({ action: 'take-over' }),
      }),
    );
    unsubscribe();
    expect(changed).toBeUndefined();
  });

  it('rejects foreign projections, commands and calls after disposal', async () => {
    const runtime = createDesktopAutomationSessionControlRuntime({
      connection,
      conversationId: 'conversation-1',
      bridge: {
        execute: vi.fn(async (request) => ({
          requestId: request.requestId,
          route: request.route,
          controls: [
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

    await expect(runtime.list()).rejects.toThrow('foreign owner projection');
    await expect(
      runtime.control({
        sessionId: 'session-1',
        owner: { ...projection().owner, conversationId: 'conversation-other' },
        action: 'stop',
      }),
    ).rejects.toThrow('foreign owner');
    runtime.dispose();
    await expect(runtime.list()).rejects.toThrow('runtime is disposed');
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
