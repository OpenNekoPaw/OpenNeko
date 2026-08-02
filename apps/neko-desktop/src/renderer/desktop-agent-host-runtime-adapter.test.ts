import { describe, expect, it, vi } from 'vitest';
import type { AgentHostToWebviewMessage } from '@neko-agent/contracts';
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
          send,
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1', 3),
      storage,
    });

    adapter.send({ type: 'newConversation' });
    adapter.setState({ schemaVersion: 'presentation.v1', draft: 'hello' });

    expect(send).toHaveBeenCalledWith({ type: 'newConversation' });
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
      (_listener: (message: AgentHostToWebviewMessage) => void) => unsubscribe,
    );
    const adapter = createElectronAgentHostRuntimeAdapter({
      bridge: {
        agent: {
          getBootstrap: vi.fn(),
          send: vi.fn(),
          subscribe,
        },
      },
      bootstrap: bootstrap('view-1', 1),
      storage: createStorage(),
    });

    const subscription = adapter.subscribe(vi.fn());
    subscription.dispose();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

function bridge() {
  return {
    agent: {
      getBootstrap: vi.fn(),
      send: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };
}

function bootstrap(viewId: string, viewEpoch: number) {
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
      connectionId: 'connection-1',
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
