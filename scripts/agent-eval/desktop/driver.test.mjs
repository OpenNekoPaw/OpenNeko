import { describe, expect, it, vi } from 'vitest';
import { createDesktopAgentDriver, driverExpression } from './driver.mjs';

describe('Desktop Agent external driver adapter', () => {
  it('uses only the renderer/preload public Agent bridge for every operation', async () => {
    const evaluate = vi.fn(async () => ({ accepted: true }));
    const driver = createDesktopAgentDriver({ evaluate });
    await driver.connect({ projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 });
    await driver.createConversation();
    await driver.submit({
      conversationId: 'conversation-1',
      prompt: 'hello',
      contextPayloads: [
        {
          type: 'cut-clip',
          id: 'cut:clip-1',
          label: 'Clip 1',
          summary: 'Explicit Cut Clip',
          data: { clipId: 'clip-1' },
        },
      ],
    });
    await driver.queue({ conversationId: 'conversation-1', prompt: 'follow up' });
    await driver.cancel({ conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' });
    await driver.confirm({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
      approved: true,
    });
    await driver.resume({ conversationId: 'conversation-1' });
    await driver.readProjection('conversation-1');
    await driver.waitForIdle('conversation-1', 30_000);
    await driver.readFacts({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    await driver.reloadRenderer();
    await driver.closeApplication();
    await driver.dispose();

    expect(evaluate).toHaveBeenCalledTimes(13);
    const expressions = evaluate.mock.calls.map(([expression]) => expression).join('\n');
    expect(expressions).toContain('window.openNekoDesktop?.agent');
    expect(expressions).toContain("type: 'sendMessage'");
    expect(expressions).toContain('contextPayloads');
    expect(expressions).toContain("type: 'newConversation'");
    expect(expressions).toContain("type: 'confirmTool'");
    expect(expressions).toContain("kind: 'wait-for-idle'");
    expect(expressions).toContain("kind: 'read-facts'");
    expect(expressions).toContain("kind: 'reload-renderer'");
    expect(expressions).toContain("kind: 'close-application'");
    expect(expressions).not.toMatch(
      /ipcRenderer|DesktopAgentWorkspaceRuntime|PiConversationRuntime|AgentSession/iu,
    );
  });

  it('keeps cancel and confirmation bound to observed conversation/turn/run identity', () => {
    const expression = driverExpression({
      kind: 'confirm',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
      approved: false,
    });
    expect(expression).toContain('assertObservedIdentity(state, command)');
    expect(expression).toContain('operation identity was not observed');
  });

  it('fails immediately when submit projects a conversation-scoped error before identity', async () => {
    let publish;
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: { projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 },
          })),
          subscribe: vi.fn((_connection, listener) => {
            publish = listener;
            return () => {};
          }),
          send: vi.fn(),
          automation: { execute: vi.fn() },
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await driver.connect({ projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 });
      await driver.submit({ conversationId: 'conversation-1', prompt: 'hello' });
      const waiting = driver.waitForIdentity('conversation-1', 0, 1000);
      await Promise.resolve();
      publish({
        type: 'error',
        conversationId: 'conversation-1',
        message: 'configured provider is unavailable',
      });
      await expect(waiting).rejects.toThrow(
        'Desktop Agent public projection failed: configured provider is unavailable',
      );
    } finally {
      await driver.dispose();
      globalThis.window = previousWindow;
    }
  });

  it('allows facts only for an identity returned by terminal idle observation', async () => {
    const identity = {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    };
    const automation = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ status: 'idle', identity })
        .mockResolvedValueOnce({ status: 'facts', facts: { identity } }),
    };
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: { projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 },
          })),
          subscribe: vi.fn(() => () => {}),
          send: vi.fn(),
          automation,
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await driver.connect({ projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 });
      await expect(driver.readFacts(identity)).rejects.toThrow(
        'facts identity was not observed at terminal idle',
      );
      await driver.waitForIdle(identity.conversationId, 1000);
      await expect(driver.readFacts(identity)).resolves.toEqual({
        status: 'facts',
        facts: { identity },
      });
    } finally {
      await driver.dispose();
      globalThis.window = previousWindow;
    }
  });

  it('waits for exact identities and pending Tool confirmation from public projection events', async () => {
    let publish;
    const sent = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: { projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 },
          })),
          subscribe: vi.fn((_connection, listener) => {
            publish = listener;
            return () => {};
          }),
          send: vi.fn((connection, message) => sent.push({ connection, message })),
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await driver.connect({ projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 });
      const submitted = await driver.submit({
        conversationId: 'conversation-1',
        prompt: 'hello',
      });
      publish({
        type: 'projectionPatch',
        patch: {
          type: 'conversationProjectionPatch',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          operations: [
            {
              operation: 'upsert',
              item: {
                kind: 'tool_call',
                conversationId: 'conversation-1',
                turnId: 'turn-1',
                runId: 'run-1',
                payload: {
                  toolCall: { id: 'tool-1', name: 'Write', pendingConfirmation: true },
                },
              },
            },
          ],
        },
      });

      await expect(
        driver.waitForIdentity('conversation-1', submitted.eventOffset, 1000),
      ).resolves.toEqual({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
      });
      await expect(
        driver.waitForPendingTool('conversation-1', 'Write', submitted.eventOffset, 1000),
      ).resolves.toEqual({
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
        toolCallId: 'tool-1',
        toolName: 'Write',
      });
      publish({
        type: 'conversationSnapshot',
        conversation: {
          id: 'conversation-1',
          messages: [{ role: 'user', content: 'Do not use ResourceRef or file:' }],
        },
      });
      await expect(driver.readProjection('conversation-1')).resolves.toMatchObject({
        events: [expect.objectContaining({ type: 'projectionPatch' })],
      });
      expect(sent).toEqual([
        {
          connection: { projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 },
          message: expect.objectContaining({
            type: 'sendMessage',
            conversationId: 'conversation-1',
          }),
        },
      ]);
    } finally {
      await driver.dispose();
      globalThis.window = previousWindow;
    }
  });

  it('fails as infrastructure-blocked when no renderer evaluator exists', () => {
    expect(() => createDesktopAgentDriver({})).toThrow('requires a CDP renderer evaluate function');
  });

  it('reloads, reconnects and restores the exact conversation with an advanced renderer lease', async () => {
    const next = connection('app-1', 2, 'connection-2');
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockResolvedValueOnce({ connection: next })
      .mockResolvedValueOnce({
        accepted: true,
        snapshot: { id: 'conversation-1', messages: [] },
      });
    const waitForRenderer = vi.fn(async () => undefined);
    const driver = createDesktopAgentDriver({ evaluate, waitForRenderer });
    const prior = connection('app-1', 1, 'connection-1');

    await expect(
      driver.reloadAndRestore({
        connection: prior,
        conversationId: 'conversation-1',
        timeoutMs: 1000,
      }),
    ).resolves.toMatchObject({
      connection: { applicationInstanceId: 'app-1', rendererEpoch: 2 },
      snapshot: { id: 'conversation-1' },
    });
    expect(waitForRenderer).toHaveBeenCalledOnce();
  });

  it('restarts the application, restores workspace/conversation identity and requires disposal facts', async () => {
    const prior = connection('app-1', 1, 'connection-1');
    const next = connection('app-2', 1, 'connection-2');
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ connection: next })
      .mockResolvedValueOnce({
        accepted: true,
        snapshot: { id: 'conversation-1', messages: [] },
      })
      .mockResolvedValueOnce({
        status: 'facts',
        facts: { disposal: { status: 'disposed' } },
      })
      .mockResolvedValueOnce({ disposed: true });
    const restartApplication = vi.fn(async () => undefined);
    const waitForRenderer = vi.fn(async () => undefined);
    const driver = createDesktopAgentDriver({ evaluate, restartApplication, waitForRenderer });

    await expect(
      driver.restartAndRestore({
        connection: prior,
        conversationId: 'conversation-1',
        timeoutMs: 1000,
      }),
    ).resolves.toMatchObject({ connection: { applicationInstanceId: 'app-2' } });
    await expect(driver.closeAndDispose()).resolves.toMatchObject({
      facts: { disposal: { status: 'disposed' } },
      local: { disposed: true },
    });
    expect(restartApplication).toHaveBeenCalledOnce();
  });
});

function connection(applicationInstanceId, rendererEpoch, connectionId) {
  return {
    applicationInstanceId,
    windowId: 'window-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    viewEpoch: 1,
    rendererEpoch,
    connectionId,
  };
}
