import { describe, expect, it, vi } from 'vitest';
import type { AgentHostToWebviewMessage } from '@neko/agent-contracts';
import {
  createElectronAgentHostRuntimeAdapter,
  type DesktopAgentPresentationStorage,
} from './desktop-agent-host-runtime-adapter';

describe('Electron AgentHostRuntimeAdapter', () => {
  it('delegates only the fixed Agent namespace and scopes presentation state by View epoch', () => {
    const send = vi.fn();
    const subscribe = vi.fn(() => vi.fn());
    const storage = createStorage();
    const adapter = createElectronAgentHostRuntimeAdapter({
      bridge: {
        agent: {
          getBootstrap: vi.fn(),
          getAssistantBootstrap: vi.fn(),
          send,
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1', 3),
      storage,
    });

    adapter.send({ type: 'newConversation' });
    adapter.setState({ schemaVersion: 'presentation.v1', draft: 'hello' });

    expect(send).toHaveBeenCalledWith(bootstrap('view-1', 3).connection, {
      type: 'newConversation',
    });
    expect(adapter.getState()).toEqual({
      schemaVersion: 'presentation.v1',
      draft: 'hello',
    });
    expect(storage.values).toEqual(
      new Map([
        [
          'openneko:agent:presentation:view-1:3',
          '{"schemaVersion":"presentation.v1","draft":"hello"}',
        ],
      ]),
    );
  });

  it('keeps another View epoch presentation state isolated', () => {
    const storage = createStorage();
    const first = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1', 1),
      storage,
    });
    const second = createElectronAgentHostRuntimeAdapter({
      bridge: bridge(),
      bootstrap: bootstrap('view-1', 2),
      storage,
    });
    first.setState({ draft: 'old' });
    second.setState({ draft: 'current' });

    expect(first.getState()).toEqual({ draft: 'old' });
    expect(second.getState()).toEqual({ draft: 'current' });
  });

  it('disposes the preload subscription without owning Host lifecycle', () => {
    const unsubscribe = vi.fn();
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
          send: vi.fn(),
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1', 1),
      storage: createStorage(),
    });

    const subscription = adapter.subscribe(vi.fn());
    subscription.dispose();

    expect(subscribe).toHaveBeenCalledWith(bootstrap('view-1', 1).connection, expect.any(Function));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps replacement adapter sends bound to the connection that created them', () => {
    const send = vi.fn();
    const subscribe = vi.fn(() => vi.fn());
    const sharedBridge = {
      agent: {
        getBootstrap: vi.fn(),
        getAssistantBootstrap: vi.fn(),
        send,
        subscribe,
      },
    };
    const firstBootstrap = bootstrap('view-1', 1, 'connection-old');
    const nextBootstrap = bootstrap('view-1', 1, 'connection-new');
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
        endpointEpoch: 'endpoint-old',
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
        key: expect.objectContaining({ endpointEpoch: 'endpoint-old' }),
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
      send: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };
}

function bootstrap(viewId: string, viewEpoch: number, connectionId = 'connection-1') {
  return {
    schemaVersion: 1 as const,
    requestId: 'request-1',
    status: 'ready' as const,
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId,
      viewEpoch,
      rendererEpoch: 1,
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
