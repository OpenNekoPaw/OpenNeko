import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_LAUNCH_HOST_CHANNEL } from '@neko/agent-contracts/agent-launch-host';
import { DESKTOP_AGENT_CHANNELS } from '../shared/agent-contract';
import { projectAgentConfigurationPolicy } from '@neko/agent-runtime/application';

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
        phase: 'draft',
        draftId: 'draft:entry',
        binding: { kind: 'assistant', assistantSpaceId: 'assistant:1', baseGrantIds: [] },
        bindingReceipt: null,
      }),
    ).resolves.toEqual({
      requestId: expect.stringContaining('agent-launch-attach'),
      status: 'ready',
      catalog: createCatalog(),
    });
  });

  it('preserves an unavailable attach result instead of throwing an IPC error', async () => {
    electron.invoke.mockImplementation(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        status: 'unavailable',
        diagnostic: {
          code: 'agent-workspace-binding-unavailable',
          owner: 'workspace',
          message: 'Workspace access is unavailable.',
        },
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agentLaunch.attach('workbench-1', 'agent-surface-1', 'agent-view:window-1', {
        phase: 'draft',
        draftId: 'draft:workspace',
        binding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
        },
        bindingReceipt: null,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'agent-workspace-binding-unavailable', owner: 'workspace' },
    });
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

  it('forwards an exact Draft target binding through the typed launch channel', async () => {
    const catalog = createCatalog();
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: { readonly requestId: string; readonly operation: string },
      ) => {
        expect(channel).toBe(AGENT_LAUNCH_HOST_CHANNEL);
        expect(request).toMatchObject({
          operation: 'bind-target',
          connection: catalog.connection,
          binding: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'workspace-grant-1',
          },
        });
        return { requestId: request.requestId, status: 'ready', catalog };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agentLaunch.bindTarget(catalog.connection, {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      }),
    ).resolves.toEqual(catalog);
  });

  it('forwards Workspace mention search with the exact binding receipt', async () => {
    const catalog = createCatalog();
    const projection = {
      bindingReceiptId: 'binding:launch-1',
      filter: 'hero',
      files: [
        {
          locator: { kind: 'workspace-file' as const, path: 'hero.md' },
          name: 'hero.md',
          type: 'file' as const,
          referenceReceipt: {
            catalogEntryId: 'mention:hero',
            referenceId: 'workspace-reference:hero',
            ownerKind: 'workspace' as const,
            ownerId: 'workspace-1',
            bindingReceiptId: 'binding:launch-1',
          },
        },
      ],
      mentionExtras: [],
    };
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: { readonly requestId: string; readonly operation: string },
      ) => {
        expect(channel).toBe(AGENT_LAUNCH_HOST_CHANNEL);
        expect(request).toMatchObject({
          operation: 'search-workspace-mentions',
          connection: catalog.connection,
          bindingReceiptId: 'binding:launch-1',
          filter: 'hero',
        });
        return { requestId: request.requestId, status: 'mentions', projection };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agentLaunch.searchWorkspaceMentions(catalog.connection, 'binding:launch-1', 'hero'),
    ).resolves.toEqual(projection);
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

  it('preserves an invalid persisted Conversation bootstrap as typed unavailable', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(DESKTOP_AGENT_CHANNELS.bootstrapGet);
        return {
          requestId: request.requestId,
          status: 'unavailable',
          diagnostic: {
            code: 'desktop-agent-conversation-unavailable',
            severity: 'error',
            conversationId: 'conversation-invalid',
            fieldNames: ['lifecycle'],
            message: 'Stored Conversation data is unavailable.',
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.agent.getBootstrap(
        'workbench-1',
        'agent-surface-1',
        'project-1',
        'view-1',
        'conversation-invalid',
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-agent-conversation-unavailable',
        conversationId: 'conversation-invalid',
        fieldNames: ['lifecycle'],
      },
    });
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
      draftId: 'draft:entry',
      connectionId: 'launch-1',
    },
    interaction: {
      phase: 'draft' as const,
      draftId: 'draft:entry',
      binding: {
        kind: 'assistant' as const,
        assistantSpaceId: 'assistant:1',
        baseGrantIds: [],
      },
      bindingReceipt: {
        bindingReceiptId: 'binding:launch-1',
        draftId: 'draft:entry',
        connectionId: 'launch-1',
        binding: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant:1',
          baseGrantIds: [],
        },
      },
    },
    models: [],
    configuration: projectAgentConfigurationPolicy({
      models: [],
      request: null,
      source: 'global-default',
      defaults: {
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      },
    }),
    inputs: [],
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
