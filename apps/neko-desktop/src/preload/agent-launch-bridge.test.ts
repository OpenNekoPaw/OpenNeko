import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_LAUNCH_HOST_CHANNEL } from '@neko/agent-contracts/agent-launch-host';
import { DESKTOP_AGENT_CHANNELS } from '../shared/agent-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

await import('./index');

describe('Desktop Agent launch preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        application: {
          applicationId: 'neko-desktop',
          instanceId: 'application-1',
        },
        window: { windowId: 'window-1', rendererSessionId: 'renderer-session-1' },
        host: { id: 'electron', kind: 'electron', ui: 'graphical' },
        runtime: { platform: 'darwin' },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
  });

  it('attaches an exact scope without accepting a renderer-provided Window or path', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(AGENT_LAUNCH_HOST_CHANNEL);
        expect(request).toMatchObject({
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'agent-surface-1',
          viewId: 'agent-view:window-1',
        });
        expect(request).not.toHaveProperty('windowId');
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request.requestId,
          status: 'ready',
          catalog: createCatalog(),
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agentLaunch.attach('workbench-1', 'agent-surface-1', 'agent-view:window-1', {
        kind: 'assistant',
        assistantSpaceId: 'assistant:1',
      }),
    ).resolves.toEqual(createCatalog());
  });

  it('preserves cancellation and detaches the exact connection', async () => {
    const catalog = createCatalog();
    electron.invoke.mockImplementation(
      async (
        _channel: string,
        request: { readonly requestId: string; readonly operation: string },
      ) => ({
        requestId: request.requestId,
        status: request.operation === 'authorize-resource' ? 'cancelled' : 'detached',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agentLaunch.authorizeResource(catalog.connection, 'directory'),
    ).resolves.toBeUndefined();
    await expect(bridge.agentLaunch.detach(catalog.connection)).resolves.toBeUndefined();
    expect(electron.invoke.mock.calls[1]?.[1]).toMatchObject({
      operation: 'detach',
      connection: catalog.connection,
    });
  });

  it('keeps queued session events valid until exact Main detach completes', async () => {
    const connection = createSessionConnection();
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        if (channel === DESKTOP_AGENT_CHANNELS.bootstrapGet) {
          return { requestId: request.requestId, status: 'ready', connection };
        }
        expect(channel).toBe(DESKTOP_AGENT_CHANNELS.connectionDetach);
        expect(request).toMatchObject({ connection });
        return { requestId: request.requestId, status: 'detached' };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const bootstrap = await bridge.agent.getBootstrap(
      'workbench-1',
      'agent-surface-1',
      'project-1',
      'view-1',
      'conversation-1',
    );
    if (bootstrap.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');
    const unsubscribe = bridge.agent.subscribe(connection, vi.fn());
    unsubscribe();
    const eventHandler = electron.on.mock.calls.find(
      ([channel]) => channel === DESKTOP_AGENT_CHANNELS.messageEvent,
    )?.[1] as ((event: unknown, value: unknown) => void) | undefined;
    if (!eventHandler) throw new Error('Desktop Agent event handler was not registered.');

    expect(() =>
      eventHandler(undefined, {
        connection,
        sequence: 1,
        message: { type: 'globalError', message: 'queued before detach' },
      }),
    ).not.toThrow();
    await expect(bridge.agent.detach(connection)).resolves.toBeUndefined();
    expect(() =>
      eventHandler(undefined, {
        connection,
        sequence: 2,
        message: { type: 'globalError', message: 'queued after detach response' },
      }),
    ).not.toThrow();
    expect(() =>
      eventHandler(undefined, {
        connection,
        sequence: 3,
        status: 'detached',
      }),
    ).not.toThrow();
    expect(() =>
      eventHandler(undefined, {
        connection,
        sequence: 4,
        message: { type: 'globalError', message: 'foreign after detach' },
      }),
    ).toThrow(
      "Desktop Agent rejected message:globalError event 4 for foreign connection 'connection-1'.",
    );
  });
});

function createCatalog() {
  return {
    connection: {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      connectionId: 'launch-1',
      scope: { kind: 'assistant' as const, assistantSpaceId: 'assistant:1' },
    },
    models: [],
    commands: [],
    skills: [],
    characters: [],
    resources: [],
  };
}

function createSessionConnection() {
  return {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId: 'connection-1',
  };
}
