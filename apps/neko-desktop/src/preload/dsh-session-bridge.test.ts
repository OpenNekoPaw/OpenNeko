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
import { DESKTOP_BRIDGE_CHANNELS } from '../shared/bridge-contract';

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
          title: 'Create in project',
          todos: [],
          inbox: { nextTurn: [], nextStep: [] },
          events: [],
        },
      };
    });
    await requireBridge().bootstrap.get();

    await requireBridge().dshSessions.create(
      'workbench-1',
      'surface-1',
      'workspace-write',
      {
        kind: 'authoring',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project', projectId: 'project-1' },
        target: null,
      },
      {
        kind: 'message',
        text: 'Create in project',
        references: [],
        images: [],
        contextPayloads: [],
      },
    );

    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'create',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      permissionPresetId: 'workspace-write',
      target: {
        kind: 'authoring',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project', projectId: 'project-1' },
        target: null,
      },
      initialInput: {
        kind: 'message',
        text: 'Create in project',
        references: [],
        images: [],
        contextPayloads: [],
      },
    });
  });

  it('uses bootstrap identity and emits only the canonical submit request', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        stopReason: 'end_turn',
        projection: {
          conversationId: 'conversation-1',
          dshSessionId: 'session-1',
          title: 'Hello',
          todos: [],
          inbox: { nextTurn: [], nextStep: [] },
          events: [],
        },
      };
    });
    await requireBridge().bootstrap.get();
    await requireBridge().dshSessions.submit('conversation-1', {
      kind: 'message',
      text: 'hello',
      references: [],
      images: [],
      contextPayloads: [],
    });

    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'submit',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
      input: { kind: 'message', text: 'hello', references: [], images: [], contextPayloads: [] },
    });
  });

  it('uses the renderer session established by the sender-bound lifecycle', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel === DESKTOP_BRIDGE_CHANNELS.bootstrapGet) {
        return bootstrap(request.requestId as string);
      }
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        stopReason: 'end_turn',
        projection: {
          conversationId: 'conversation-1',
          dshSessionId: 'session-1',
          title: 'Hello',
          todos: [],
          inbox: { nextTurn: [], nextStep: [] },
          events: [],
        },
      };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();
    const dispose = bridge.lifecycle.subscribe(vi.fn());
    const lifecycle = state.listeners.get(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent);
    lifecycle?.({}, lifecycleEvent('renderer-loading', 'renderer-2', 1));
    lifecycle?.({}, lifecycleEvent('renderer-ready', 'renderer-2', 2));

    await bridge.dshSessions.submit('conversation-1', {
      kind: 'message',
      text: 'hello after reload',
      references: [],
      images: [],
      contextPayloads: [],
    });

    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        windowId: 'window-1',
        rendererSessionId: 'renderer-2',
        conversationId: 'conversation-1',
      }),
    );
    dispose();
  });

  it('rejects lifecycle identity changes from another application Window', async () => {
    state.invoke.mockImplementation(async (_channel: string, request: Record<string, unknown>) =>
      bootstrap(request.requestId as string),
    );
    const bridge = requireBridge();
    await bridge.bootstrap.get();
    const dispose = bridge.lifecycle.subscribe(vi.fn());

    expect(() =>
      state.listeners.get(DESKTOP_BRIDGE_CHANNELS.lifecycleEvent)?.(
        {},
        { ...lifecycleEvent('renderer-loading', 'renderer-2', 1), windowId: 'window-other' },
      ),
    ).toThrow(/does not match the bootstrapped application Window/u);
    dispose();
  });

  it('routes inbox send-now with exact Conversation and Message identities', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        projection: {
          conversationId: 'conversation-1',
          dshSessionId: 'session-1',
          title: 'Hello',
          todos: [],
          inbox: { nextTurn: [], nextStep: [] },
          events: [],
        },
      };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await bridge.dshSessions.sendInboxMessageNow('conversation-1', 'message-1');

    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'inbox-send-now',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });
  });

  it('routes composer model, media model, and mode through strict sender-bound operations', async () => {
    const configuration = {
      models: [
        {
          id: 'deepseek-official:deepseek-v4',
          label: 'DeepSeek V4',
          providerId: 'deepseek-official',
          modelId: 'deepseek-v4',
          providerLabel: 'DeepSeek',
          category: 'llm' as const,
          capabilities: ['chat'],
        },
        {
          id: 'nekoapi-media:gpt-image-2',
          label: 'GPT Image 2',
          providerId: 'nekoapi-media',
          modelId: 'gpt-image-2',
          providerLabel: 'NekoAPI Media',
          category: 'image' as const,
          capabilities: ['image.generate'],
        },
      ],
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      selectedMediaModelOptionIds: { image: 'nekoapi-media:gpt-image-2' },
      permissionPresetId: 'workspace-write',
      permissionPresets: [
        { id: 'read-only', label: 'read-only', selectable: true },
        { id: 'workspace-write', label: 'workspace-write', selectable: true },
        { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
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
    await bridge.dshSessions.selectComposerCanvas(
      'workbench-1',
      'surface-1',
      'conversation-1',
      'neko/boards/story.nkc',
    );
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'composer-canvas',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        conversationId: 'conversation-1',
        canvasId: 'neko/boards/story.nkc',
      }),
    );
    await bridge.dshSessions.selectComposerMediaModel(
      'workbench-1',
      'surface-1',
      'image',
      'nekoapi-media:gpt-image-2',
    );
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'composer-media-model',
        category: 'image',
        modelOptionId: 'nekoapi-media:gpt-image-2',
      }),
    );
    await bridge.dshSessions.selectComposerPermissionPreset(
      'workbench-1',
      'surface-1',
      'danger-full-access',
    );
    expect(state.invoke).toHaveBeenLastCalledWith(
      DSH_SESSION_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'composer-permission-preset',
        permissionPresetId: 'danger-full-access',
      }),
    );
  });

  it('requests Workspace mentions through the exact sender-bound Agent Surface', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        mentions: [
          {
            id: 'files:scene',
            kind: 'file',
            label: 'scene.md',
            contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
            source: 'workspace',
            mediaType: 'text',
          },
        ],
      };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await expect(
      bridge.dshSessions.searchComposerMentions('workbench-1', 'surface-1', 'scene'),
    ).resolves.toHaveLength(1);
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'composer-mentions',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      filter: 'scene',
    });
  });

  it('materializes a selected Asset through the exact sender-bound Agent Surface', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        materialized: {
          assetId: 'asset-lighting',
          label: 'lighting.png',
          contentLocator: {
            file: { authority: 'workspace', path: 'assets/lighting.png' },
          },
          source: 'asset-library',
        },
      };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await expect(
      bridge.dshSessions.materializeComposerAsset('workbench-1', 'surface-1', 'asset-lighting'),
    ).resolves.toMatchObject({ contentLocator: { file: { path: 'assets/lighting.png' } } });
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'composer-materialize-asset',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      assetId: 'asset-lighting',
    });
  });

  it('requests and releases an opaque image preview with bootstrap sender identity', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return request.operation === 'image-preview'
        ? {
            requestId: request.requestId,
            preview: {
              url: 'openneko://resource/lease-1/image',
              mediaType: 'image/png',
              byteLength: 4,
              width: 1,
              height: 1,
            },
          }
        : { requestId: request.requestId, released: true };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await expect(
      bridge.dshSessions.getImageAttachmentPreview('conversation-1', 'attachment-1'),
    ).resolves.toMatchObject({ url: 'openneko://resource/lease-1/image' });
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'image-preview',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
      attachmentId: 'attachment-1',
    });

    await expect(
      bridge.dshSessions.releaseImageAttachmentPreviews('conversation-1'),
    ).resolves.toBeUndefined();
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'image-previews-release',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
    });
  });

  it('opens an exact completed write through sender-bound Conversation and Tool identity', async () => {
    state.invoke.mockImplementation(async (channel: string, request: Record<string, unknown>) => {
      if (channel.endsWith('bootstrap:get')) return bootstrap(request.requestId as string);
      expect(channel).toBe(DSH_SESSION_HOST_CHANNEL);
      return { requestId: request.requestId, opened: true };
    });
    const bridge = requireBridge();
    await bridge.bootstrap.get();

    await expect(
      bridge.dshSessions.openWrittenFile('conversation-1', 'tool-write-document'),
    ).resolves.toBeUndefined();
    expect(state.invoke).toHaveBeenLastCalledWith(DSH_SESSION_HOST_CHANNEL, {
      requestId: expect.any(String),
      operation: 'written-file-open',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      conversationId: 'conversation-1',
      toolCallId: 'tool-write-document',
    });
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
          title: 'Other',
          todos: [],
          inbox: { nextTurn: [], nextStep: [] },
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
            title: 'Hello',
            todos: [],
            inbox: { nextTurn: [], nextStep: [] },
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

function lifecycleEvent(
  type: 'renderer-loading' | 'renderer-ready',
  rendererSessionId: string,
  sequence: number,
) {
  return {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    rendererSessionId,
    sequence,
    type,
  };
}
