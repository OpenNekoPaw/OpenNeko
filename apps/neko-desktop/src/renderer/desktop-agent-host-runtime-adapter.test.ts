import { describe, expect, it, vi } from 'vitest';
import type { AgentHostToWebviewMessage } from '@neko/agent-contracts';
import {
  createElectronAgentHostRuntimeAdapter,
  type DesktopAgentPresentationStorage,
} from './desktop-agent-host-runtime-adapter';

describe('Electron AgentHostRuntimeAdapter', () => {
  it('delegates only the fixed Agent namespace and scopes presentation state by Workspace owner', async () => {
    const send = vi.fn();
    const createConversation = vi.fn(async () => ({
      submissionId: 'submission-create',
      conversationId: 'conversation-created',
      turnId: 'turn-created',
      queueItemId: 'queue-created',
      message: 'first',
      createdAt: 1,
      state: 'active' as const,
    }));
    const submitMessage = vi.fn(async () => ({
      submissionId: 'submission-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      queueItemId: 'queue-item-1',
      message: 'hello',
      createdAt: 1,
      state: 'active' as const,
    }));
    const subscribe = vi.fn(() => vi.fn());
    const storage = createStorage();
    const adapter = createElectronAgentHostRuntimeAdapter({
      bridge: {
        agent: {
          getBootstrap: vi.fn(),
          getAssistantBootstrap: vi.fn(),
          detach: vi.fn(),
          send,
          createConversation,
          submitMessage,
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1'),
      storage,
    });

    await adapter.createConversation({
      type: 'createConversation',
      input: { kind: 'message', text: 'first' },
      sessionMode: 'agent',
    });
    await adapter.submitMessage({
      type: 'sendMessage',
      conversationId: 'conversation-1',
      message: 'hello',
      sessionMode: 'agent',
    });
    adapter.setState({ draft: 'hello' });

    expect(createConversation).toHaveBeenCalledWith(
      bootstrap('view-1').connection,
      expect.objectContaining({
        type: 'createConversation',
        input: { kind: 'message', text: 'first' },
      }),
    );
    expect(submitMessage).toHaveBeenCalledWith(
      bootstrap('view-1').connection,
      expect.objectContaining({ type: 'sendMessage', conversationId: 'conversation-1' }),
    );
    expect(adapter.getState()).toEqual({ draft: 'hello' });
    expect(storage.values).toEqual(
      new Map([['openneko:agent:presentation:workspace:workspace-1:view-1', '{"draft":"hello"}']]),
    );
  });

  it('restores presentation state across exact connection replacement', () => {
    const storage = createStorage();
    const first = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1', 'connection-1'),
      storage,
    });
    const second = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1', 'connection-2'),
      storage,
    });
    first.setState({ draft: 'old' });
    expect(second.getState()).toEqual({ draft: 'old' });
    second.setState({ draft: 'current' });
    expect(first.getState()).toEqual({ draft: 'current' });
  });

  it('keeps another Workspace presentation state isolated', () => {
    const storage = createStorage();
    const first = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1', 'connection-1'),
      storage,
    });
    const second = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: {
        ...bootstrap('view-1', 'connection-2'),
        connection: {
          ...bootstrap('view-1', 'connection-2').connection,
          workspaceId: 'workspace-2',
        },
      },
      storage,
    });
    first.setState({ draft: 'first' });
    second.setState({ draft: 'second' });

    expect(first.getState()).toEqual({ draft: 'first' });
    expect(second.getState()).toEqual({ draft: 'second' });
  });

  it('returns a local invalid-state marker without rewriting malformed JSON', () => {
    const storage = createStorage();
    storage.values.set('openneko:agent:presentation:workspace:workspace-1:view-1', '{invalid');
    const adapter = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1'),
      storage,
    });

    expect(adapter.getState()).toEqual({ stateReadFailure: 'invalid-json' });
    expect(storage.values.get('openneko:agent:presentation:workspace:workspace-1:view-1')).toBe(
      '{invalid',
    );
  });

  it('disposes local subscriptions before detaching its exact Host connection', async () => {
    const unsubscribe = vi.fn();
    const detach = vi.fn(async () => undefined);
    const subscribe = vi.fn(
      (
        _connection: ReturnType<typeof bootstrap>['connection'],
        _listener: (message: AgentHostToWebviewMessage) => void,
      ) => unsubscribe,
    );
    const adapter = createElectronAgentHostRuntimeAdapter({
      bridge: {
        agent: {
          getBootstrap: vi.fn(),
          getAssistantBootstrap: vi.fn(),
          detach,
          send: vi.fn(),
          createConversation: vi.fn(),
          submitMessage: vi.fn(),
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1'),
      storage: createStorage(),
    });

    const subscription = adapter.subscribe(vi.fn());
    await adapter.dispose();
    subscription.dispose();

    expect(subscribe).toHaveBeenCalledWith(bootstrap('view-1').connection, expect.any(Function));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledWith(bootstrap('view-1').connection);
    await adapter.dispose();
    expect(detach).toHaveBeenCalledOnce();
  });

  it('keeps replacement adapter sends bound to the connection that created them', () => {
    const send = vi.fn();
    const subscribe = vi.fn(() => vi.fn());
    const sharedBridge = {
      agent: {
        getBootstrap: vi.fn(),
        getAssistantBootstrap: vi.fn(),
        detach: vi.fn(),
        send,
        createConversation: vi.fn(),
        submitMessage: vi.fn(),
        subscribe,
      },
    };
    const firstBootstrap = bootstrap('view-1', 'connection-old');
    const nextBootstrap = bootstrap('view-1', 'connection-new');
    const first = createElectronAgentHostRuntimeAdapter({
      bridge: sharedBridge,
      bootstrap: firstBootstrap,
      storage: createStorage(),
    });
    const next = createElectronAgentHostRuntimeAdapter({
      bridge: sharedBridge,
      bootstrap: nextBootstrap,
      storage: createStorage(),
    });

    first.subscribe(vi.fn());
    next.subscribe(vi.fn());
    first.send({
      type: 'projectionDetach',
      key: {
        attachmentId: 'attachment-old',
        tabId: 'tab-old',
        conversationId: 'conversation-old',
      },
      reason: 'tab-closed',
    });

    expect(subscribe).toHaveBeenNthCalledWith(1, firstBootstrap.connection, expect.any(Function));
    expect(subscribe).toHaveBeenNthCalledWith(2, nextBootstrap.connection, expect.any(Function));
    expect(send).toHaveBeenCalledWith(
      firstBootstrap.connection,
      expect.objectContaining({
        type: 'projectionDetach',
        key: expect.objectContaining({ attachmentId: 'attachment-old' }),
      }),
    );
    expect(send).not.toHaveBeenCalledWith(
      nextBootstrap.connection,
      expect.objectContaining({ type: 'projectionDetach' }),
    );
  });
});

function bridge() {
  return {
    agent: {
      getBootstrap: vi.fn(),
      getAssistantBootstrap: vi.fn(),
      detach: vi.fn(),
      send: vi.fn(),
      createConversation: vi.fn(),
      submitMessage: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };
}

function bootstrap(viewId: string, connectionId = 'connection-1') {
  return {
    requestId: 'request-1',
    status: 'ready' as const,
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: `agent-surface:${connectionId}`,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId,
      connectionId,
    },
  };
}

function createStorage(): DesktopAgentPresentationStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
