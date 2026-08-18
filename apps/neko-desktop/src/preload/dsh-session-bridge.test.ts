import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DSH_SESSION_CHANGED_CHANNEL,
  DSH_SESSION_HOST_CHANNEL,
} from '@neko/agent-contracts/dsh-session-host';
import {
  DSH_RUNTIME_CHANGED_CHANNEL,
  DSH_RUNTIME_HOST_CHANNEL,
} from '@neko/agent-contracts/dsh-runtime-host';
import { internalVersionFields } from '@neko/agent-contracts/testing';

const state = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  listeners: new Map<string, (event: unknown, value: unknown) => void>(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      state.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: state.invoke,
    on: (channel: string, listener: (event: unknown, value: unknown) => void) => {
      state.listeners.set(channel, listener);
    },
  },
}));

beforeAll(async () => {
  await import('./index');
});

beforeEach(() => {
  state.invoke.mockReset();
});

describe('DSH Session preload bridge', () => {
  it('creates from exact Surface identity without accepting domain or DSH authority', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        projection: {
          conversationId: 'conversation-created',
          dshSessionId: 'session-created',
          events: [],
        },
      };
    });
    await requireBridge().bootstrap.get();

    await requireBridge().dshSessions.create('workbench-1', 'surface-1');

    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'create',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
    });
  });

  it('uses bootstrap identity and emits only the canonical prompt request', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        stopReason: 'end_turn',
        projection: {
          conversationId: 'conversation-1',
          dshSessionId: 'session-1',
          events: [],
        },
      };
    });
    await requireBridge().bootstrap.get();
    await requireBridge().dshSessions.prompt('conversation-1', 'hello');

    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'prompt',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
      text: 'hello',
    });
  });

  it('routes composer model and mode through strict sender-bound operations', async () => {
    const configuration = {
      models: [
        {
          id: 'deepseek-official:deepseek-v4',
          label: 'DeepSeek V4',
          providerId: 'deepseek-official',
          modelId: 'deepseek-v4',
        },
      ],
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      executionMode: 'ask',
      modes: [
        { id: 'plan', available: false, diagnostic: 'Unavailable.' },
        { id: 'ask', available: true },
        { id: 'auto', available: true },
      ],
    };
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return { requestId: request.requestId, configuration };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await expect(
      bridge.dshSessions.getComposerConfiguration('workbench-1', 'surface-1'),
    ).resolves.toEqual(configuration);
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'composer-snapshot',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    );
    await bridge.dshSessions.selectComposerModel(
      'workbench-1',
      'surface-1',
      'deepseek-official:deepseek-v4',
    );
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'composer-model',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    );
    await bridge.dshSessions.selectComposerMode('workbench-1', 'surface-1', 'auto');
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({ operation: 'composer-mode', mode: 'auto' }),
    );
  });

  it('projects changed events by Conversation identity', () => {
    const listener = vi.fn();
    const dispose = requireBridge().dshSessions.subscribe(listener);
    state.listeners.get(DSH_SESSION_CHANGED_CHANNEL)?.({}, { conversationId: 'conversation-1' });
    expect(listener).toHaveBeenCalledWith({ conversationId: 'conversation-1' });
    dispose();
  });

  it('rejects a Session projection owned by another Conversation', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        projection: {
          conversationId: 'conversation-other',
          dshSessionId: 'session-other',
          events: [],
        },
      };
    });
    await requireBridge().bootstrap.get();

    await expect(requireBridge().dshSessions.getSnapshot('conversation-1')).rejects.toThrow(
      /Conversation identity does not match/u,
    );
  });

  it('rejects shared internal-version fixtures at the preload consumer', async () => {
    const bridge = requireBridge();
    state.invoke.mockImplementation(async (_channel: string, request: Record<string, unknown>) =>
      bootstrap(request.requestId as string),
    );
    await bridge.bootstrap.get();
    for (const { field, value } of internalVersionFields) {
      state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
        return {
          requestId: request.requestId,
          projection: {
            conversationId: 'conversation-1',
            dshSessionId: 'session-1',
            events: [],
            [field]: value,
          },
        };
      });
      await expect(bridge.dshSessions.getSnapshot('conversation-1')).rejects.toThrow(
        new RegExp(`unexpected=${field}`, 'u'),
      );
    }
  });

  it('routes explicit runtime restart with sender identity and decodes its result', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_RUNTIME_HOST_CHANNEL);
      return { requestId: request.requestId, projection: { status: 'running' } };
    });
    await requireBridge().bootstrap.get();

    await expect(requireBridge().dshRuntime.restart()).resolves.toEqual({ status: 'running' });
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_RUNTIME_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'restart',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
    });
  });

  it('strictly decodes runtime events before notifying Renderer listeners', () => {
    const listener = vi.fn();
    const dispose = requireBridge().dshRuntime.subscribe(listener);
    state.listeners.get(DSH_RUNTIME_CHANGED_CHANNEL)?.(
      {},
      {
        status: 'unavailable',
        diagnostic: {
          code: 'desktop-dsh-runtime-unavailable',
          message: 'DSH subprocess exited unexpectedly.',
        },
      },
    );
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'unavailable' }));
    expect(() =>
      state.listeners.get(DSH_RUNTIME_CHANGED_CHANNEL)?.(
        {},
        {
          status: 'running',
          fallback: 'pi',
        },
      ),
    ).toThrow(/unexpected=fallback/u);
    dispose();
  });
});

function requireBridge() {
  if (!state.bridge) throw new Error('Preload bridge was not exposed.');
  return state.bridge;
}

function bootstrap(requestId: string) {
  return {
    requestId,
    application: { applicationId: 'neko-desktop', instanceId: 'application-1' },
    window: { windowId: 'window-1', rendererSessionId: 'renderer-1' },
    host: { id: 'host-1', kind: 'electron', ui: 'graphical' },
    runtime: { platform: 'darwin' },
    status: 'foundation-ready',
  };
}
