import { describe, expect, it, vi } from 'vitest';
import { createDesktopAgentDriver, driverExpression } from './driver.mjs';

describe('Desktop Agent external driver adapter', () => {
  it('uses only the renderer/preload public Agent bridge for every operation', async () => {
    const evaluate = vi.fn(async () => ({ accepted: true }));
    const driver = createDesktopAgentDriver({ evaluate });
    await driver.bindDraft({ target: 'assistant', catalogRef: 'assistant-binding' });
    await driver.submitDraft({
      catalogRef: 'initial',
      input: { kind: 'message', text: 'hello' },
      expectedStatus: 'rejected',
    });
    await driver.prepareSessionAfterDraft();
    await driver.connect(owner());
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
    await driver.invokeInput({
      conversationId: 'conversation-1',
      trigger: 'command',
      name: 'compact',
      resultEvent: 'compressionResult',
      timeoutMs: 30_000,
    });
    await driver.updateConfiguration({
      conversationId: 'conversation-1',
      providerId: 'provider',
      modelId: 'model',
      expectedStatus: 'applied',
      turnState: 'idle',
      timeoutMs: 30_000,
    });
    await driver.resume({ conversationId: 'conversation-1' });
    await driver.readProjection('conversation-1');
    await driver.observeWorkflowStep({
      conversationId: 'conversation-1',
      afterEventOffset: 0,
      timeoutMs: 30_000,
    });
    await driver.waitForIdle('conversation-1', 30_000);
    await driver.readFacts({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    await driver.reloadRenderer();
    await driver.closeApplication();
    await driver.dispose();

    expect(evaluate).toHaveBeenCalledTimes(19);
    const expressions = evaluate.mock.calls.map(([expression]) => expression).join('\n');
    expect(expressions).toContain('window.openNekoDesktop?.agent');
    expect(expressions).toContain("type: 'sendMessage'");
    expect(expressions).toContain('contextPayloads');
    expect(expressions).toContain("type: 'newConversation'");
    expect(expressions).toContain("type: 'confirmTool'");
    expect(expressions).toContain("type: 'invokeAgentInput'");
    expect(expressions).toContain('window.openNekoDesktop?.agentLaunch');
    expect(expressions).toContain("type: 'updateSettings'");
    expect(expressions).toContain("type: 'getAgentInputCatalog'");
    expect(expressions).toContain("type: 'getMessageQueue'");
    expect(expressions).toContain("kind: 'wait-for-idle'");
    expect(expressions).toContain("kind: 'read-facts'");
    expect(expressions).toContain("kind: 'reload-renderer'");
    expect(expressions).toContain("kind: 'close-application'");
    expect(expressions).toContain('workbenchInstanceId');
    expect(expressions).toContain('agentSurfaceId');
    expect(expressions).toContain('execute(state.connection');
    expect(expressions).not.toMatch(
      /ipcRenderer|DesktopAgentWorkspaceRuntime|PiConversationRuntime|AgentSession|viewEpoch|rendererEpoch/iu,
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

  it('captures a rejected Draft catalog input without creating a Session', async () => {
    const previousWindow = globalThis.window;
    const draft = {
      phase: 'draft',
      draftId: 'draft-1',
      binding: { kind: 'unbound' },
      bindingReceipt: null,
    };
    const catalog = {
      connection: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        viewId: 'view-1',
        draftId: 'draft-1',
        connectionId: 'launch-1',
      },
      interaction: draft,
      models: [],
      configuration: {
        request: {
          modelCatalogEntryId: 'provider:model',
          providerId: 'provider',
          modelId: 'model',
          executionMode: 'ask',
        },
      },
      inputs: [
        {
          id: 'builtin:compact',
          name: 'compact',
          trigger: 'command',
          executable: { commandId: 'compact', handlerId: 'session.compact' },
          availability: {
            status: 'unavailable',
            diagnostic: { code: 'session-required' },
          },
        },
      ],
    };
    globalThis.window = {
      openNekoDesktop: {
        agent: {},
        shell: {
          getSnapshot: vi.fn(async () => ({
            window: {
              workbench: {
                workbenchInstanceId: 'workbench-1',
                scene: {
                  context: {
                    kind: 'agent',
                    agentViewId: 'view-1',
                    scope: { kind: 'unbound', draftId: 'draft-1' },
                  },
                  slots: {
                    interaction: {
                      kind: 'agent',
                      agentSurfaceId: 'surface-1',
                      phase: 'draft',
                    },
                  },
                },
              },
            },
          })),
        },
        agentLaunch: {
          attach: vi.fn(async () => catalog),
          submitDraft: vi.fn(async () => {
            throw new Error("Agent route 'compact' requires a committed conversation session.");
          }),
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await expect(
        driver.submitDraft({
          catalogRef: 'initial',
          input: { kind: 'command', name: 'compact' },
          expectedStatus: 'rejected',
        }),
      ).resolves.toMatchObject({
        accepted: false,
        status: 'rejected',
        conversationCreated: false,
        availability: { diagnostic: { code: 'session-required' } },
      });
    } finally {
      delete globalThis.__openNekoDesktopAgentDraftDriver;
      globalThis.window = previousWindow;
    }
  });

  it('waits for exact requested and effective Conversation configuration evidence', async () => {
    let publish;
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: connection('app-1', 'connection-1'),
          })),
          subscribe: vi.fn((_connection, listener) => {
            publish = listener;
            return () => {};
          }),
          send: vi.fn(),
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await driver.connect(owner());
      publish({
        type: 'projectionPatch',
        patch: {
          type: 'conversationProjectionPatch',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
          operations: [],
        },
      });
      const updating = driver.updateConfiguration({
        conversationId: 'conversation-1',
        providerId: 'provider',
        modelId: 'model-next',
        expectedStatus: 'applied',
        turnState: 'running',
        runningTurnIdentity: {
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          runId: 'run-1',
        },
        timeoutMs: 1000,
      });
      await Promise.resolve();
      publish({ type: 'settingsUpdated', success: true });
      publish({
        type: 'settingsData',
        conversationId: 'conversation-1',
        selectedProviderId: 'provider',
        selectedModelId: 'model-next',
        agentConfiguration: {
          request: { providerId: 'provider', modelId: 'model-next' },
          fields: {
            model: { effectiveValue: { providerId: 'provider', modelId: 'model-next' } },
          },
        },
      });
      await expect(updating).resolves.toMatchObject({
        status: 'applied',
        submissionCountBefore: 0,
        submissionCountAfter: 0,
      });
    } finally {
      await driver.dispose();
      globalThis.window = previousWindow;
    }
  });

  it('fails immediately when submit projects a conversation-scoped error before identity', async () => {
    let publish;
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: connection('app-1', 'connection-1'),
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
      await driver.connect(owner());
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
            connection: connection('app-1', 'connection-1'),
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
      await driver.connect(owner());
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
            connection: connection('app-1', 'connection-1'),
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
      await driver.connect(owner());
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
          connection: connection('app-1', 'connection-1'),
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

  it('captures queue and transcript snapshots through ordinary public Agent messages', async () => {
    let publish;
    const sent = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      openNekoDesktop: {
        agent: {
          getBootstrap: vi.fn(async () => ({
            status: 'ready',
            connection: connection('app-1', 'connection-1'),
          })),
          subscribe: vi.fn((_connection, listener) => {
            publish = listener;
            return () => {};
          }),
          send: vi.fn((_connection, message) => sent.push(message)),
        },
      },
    };
    const driver = createDesktopAgentDriver({
      evaluate: async (expression) => (0, eval)(expression),
    });
    try {
      await driver.connect(owner());
      const queued = await driver.queue({
        conversationId: 'conversation-1',
        prompt: 'follow up',
      });
      publish({
        type: 'messageQueued',
        conversationId: 'conversation-1',
        snapshot: queueSnapshot(1, 3),
      });
      const observed = driver.observeWorkflowStep({
        conversationId: 'conversation-1',
        afterEventOffset: queued.eventOffset,
        timeoutMs: 1000,
      });
      await Promise.resolve();
      publish({
        type: 'conversationSnapshot',
        conversation: {
          id: 'conversation-1',
          messages: [{ id: 'user-1', role: 'user', content: 'follow up' }],
        },
      });
      publish({ type: 'messageQueueSnapshot', snapshot: queueSnapshot(1, 3) });

      await expect(observed).resolves.toMatchObject({
        conversationId: 'conversation-1',
        queued: true,
        messageQueue: { pendingCount: 1, sequence: 3 },
        messages: [{ id: 'user-1', role: 'user' }],
      });
      expect(sent).toEqual([
        expect.objectContaining({ type: 'sendMessage' }),
        { type: 'getConversationSnapshot', conversationId: 'conversation-1' },
        { type: 'getMessageQueue', conversationId: 'conversation-1' },
      ]);
    } finally {
      await driver.dispose();
      globalThis.window = previousWindow;
    }
  });

  it('fails as infrastructure-blocked when no renderer evaluator exists', () => {
    expect(() => createDesktopAgentDriver({})).toThrow('requires a CDP renderer evaluate function');
  });

  it('reloads, reconnects and restores the exact conversation with a replacement connection', async () => {
    const next = connection('app-1', 'connection-2');
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
    const prior = connection('app-1', 'connection-1');

    await expect(
      driver.reloadAndRestore({
        connection: prior,
        conversationId: 'conversation-1',
        timeoutMs: 1000,
      }),
    ).resolves.toMatchObject({
      connection: { applicationInstanceId: 'app-1', connectionId: 'connection-2' },
      snapshot: { id: 'conversation-1' },
    });
    expect(waitForRenderer).toHaveBeenCalledOnce();
  });

  it('restarts the application, restores workspace/conversation identity and requires disposal facts', async () => {
    const prior = connection('app-1', 'connection-1');
    const next = connection('app-2', 'connection-2');
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

function owner() {
  return {
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    viewId: 'view-1',
  };
}

function connection(applicationInstanceId, connectionId) {
  return {
    applicationInstanceId,
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId,
  };
}

function queueSnapshot(pendingCount, sequence) {
  return {
    conversationId: 'conversation-1',
    pendingCount,
    sequence,
    pausedAfterCancel: false,
    items: [],
  };
}
