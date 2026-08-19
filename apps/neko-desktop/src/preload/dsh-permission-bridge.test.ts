import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DSH_PERMISSION_CHANGED_CHANNEL,
  DSH_PERMISSION_HOST_CHANNEL,
} from '@neko/agent-contracts/dsh-permission-host';

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

describe('DSH permission preload bridge', () => {
  it('uses the exact renderer session and complete permission identity', async () => {
    const bridge = requireBridge();
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) {
        return bootstrap(request.requestId as string);
      }
      expect(channel).toBe(DSH_PERMISSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        conversationId: 'conversation-1',
        pending: [],
      };
    });
    await bridge.bootstrap.get();
    await bridge.dshPermissions.decide(
      {
        conversationId: 'conversation-1',
        dshSessionId: 'session-1',
        turn: 4,
        toolCallId: 'tool-1',
      },
      'allow-once',
    );

    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_PERMISSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'decide',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: 'conversation-1',
        dshSessionId: 'session-1',
        turn: 4,
        toolCallId: 'tool-1',
        optionId: 'allow-once',
      }),
    );
  });

  it('projects changed notifications by Conversation identity', () => {
    const listener = vi.fn();
    const dispose = requireBridge().dshPermissions.subscribe(listener);
    state.listeners.get(DSH_PERMISSION_CHANGED_CHANNEL)?.({}, {
      conversationId: 'conversation-1',
    });
    expect(listener).toHaveBeenCalledWith({ conversationId: 'conversation-1' });
    dispose();
  });

  it('rejects another Conversation in the result or a pending sibling', async () => {
    const bridge = requireBridge();
    let permissionRequest = 0;
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_PERMISSION_HOST_CHANNEL);
      permissionRequest += 1;
      return permissionRequest === 1
        ? {
            requestId: request.requestId,
            conversationId: 'conversation-other',
            pending: [],
          }
        : {
            requestId: request.requestId,
            conversationId: 'conversation-1',
            pending: [permission({ conversationId: 'conversation-other' })],
          };
    });
    await bridge.bootstrap.get();

    await expect(bridge.dshPermissions.list('conversation-1')).rejects.toThrow(
      /owner identity does not match/u,
    );
    await expect(bridge.dshPermissions.list('conversation-1')).rejects.toThrow(
      /owner identity does not match/u,
    );
  });

  it('rejects a permission mutation result from another DSH Session', async () => {
    const bridge = requireBridge();
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_PERMISSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        conversationId: 'conversation-1',
        pending: [permission({ dshSessionId: 'session-other' })],
      };
    });
    await bridge.bootstrap.get();

    await expect(
      bridge.dshPermissions.decide(
        {
          conversationId: 'conversation-1',
          dshSessionId: 'session-1',
          turn: 4,
          toolCallId: 'tool-1',
        },
        'allow-once',
      ),
    ).rejects.toThrow(/owner identity does not match/u);
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

function permission(overrides: { readonly conversationId?: string; readonly dshSessionId?: string }) {
  return {
    conversationId: overrides.conversationId ?? 'conversation-1',
    dshSessionId: overrides.dshSessionId ?? 'session-1',
    turn: 4,
    toolCallId: 'tool-1',
    title: 'Allow once?',
    options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
  };
}
