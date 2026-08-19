import { describe, expect, it, vi } from 'vitest';

import { DshAcpProjection } from '@neko/agent-runtime/acp';
import type {
  DshSessionChangedEvent,
  DshSessionHostResult,
} from '@neko/agent-contracts/dsh-session-host';
import type { ConversationDshSessionBoundClient } from '@neko/agent-runtime/application';

import { DesktopDshSessionHost } from './desktop-dsh-session-host';

const identity = {
  conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV',
  dshSessionId: 'dsh-session-1',
};

describe('Desktop DSH Session Host', () => {
  it('creates only through the exact sender-bound Agent Surface identity', async () => {
    const createConversation = vi.fn(async () => ({
      conversationId: identity.conversationId,
    }));
    const host = createHost({ createConversation });

    const result = requireSessionResult(
      await host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        {
          requestId: 'request-create',
          operation: 'create',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'surface-1',
          permissionPresetId: 'workspace-write',
          target: { kind: 'project', projectId: 'project-1' },
        },
      ),
    );

    expect(createConversation).toHaveBeenCalledWith({
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      permissionPresetId: 'workspace-write',
      target: { kind: 'project', projectId: 'project-1' },
    });
    expect(result.projection).toMatchObject(identity);
  });

  it('rejects a stale sender before creating a Conversation', async () => {
    const createConversation = vi.fn();
    const host = createHost({ createConversation });

    await expect(
      host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        {
          requestId: 'request-create',
          operation: 'create',
          windowId: 'window-1',
          rendererSessionId: 'renderer-stale',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'surface-1',
          permissionPresetId: 'workspace-write',
          target: { kind: 'surface' },
        },
      ),
    ).rejects.toThrow(/sender-bound/u);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('routes prompt by exact Conversation binding and preserves bounded Tool details', async () => {
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const applyConversation = vi.fn(async () => undefined);
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 1, opennekoTurn: 0 },
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Generate',
        status: 'pending',
        rawInput: { path: '/private/workspace' },
      },
    });
    const host = createHost({ prompt, projection, applyConversation });

    const result = requireSessionResult(
      await host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('prompt', { text: 'hello' }),
      ),
    );

    expect(prompt).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      prompt: [{ type: 'text', text: 'hello' }],
    });
    expect(applyConversation).toHaveBeenCalledWith(identity.conversationId, 'window-1');
    expect(applyConversation.mock.invocationCallOrder[0]).toBeLessThan(
      prompt.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(result.stopReason).toBe('end_turn');
    expect(result.projection.events).toEqual([
      {
        kind: 'tool',
        toolCallId: 'tool-1',
        turn: 0,
        status: 'pending',
        title: 'Generate',
        rawInput: { path: '/private/workspace' },
      },
    ]);
  });

  it('fails before ACP prompt when authoritative product context cannot be resolved', async () => {
    const prompt = vi.fn();
    const setSessionContext = vi.fn();
    const host = createHost({
      prompt,
      setSessionContext,
      promptContext: {
        resolve: vi.fn(async () => {
          throw new Error('Workspace authority is unavailable.');
        }),
      },
    });

    await expect(
      host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('prompt', { text: 'hello' }),
      ),
    ).rejects.toThrow(/Workspace authority is unavailable/u);
    expect(setSessionContext).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('routes composer selection by exact Surface identity without accepting Renderer model facts', async () => {
    const selectModel = vi.fn(async () => composerConfiguration());
    const host = createHost({ selectModel });
    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-composer-model',
        operation: 'composer-model',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        modelOptionId: 'deepseek:model',
      },
    );
    if (!('configuration' in result)) throw new Error('Expected composer configuration result.');
    expect(selectModel).toHaveBeenCalledWith({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      modelOptionId: 'deepseek:model',
    });
    expect(result.configuration.selectedModelOptionId).toBe('deepseek:model');
  });

  it('routes media-model selection only through the exact composer owner', async () => {
    const selectMediaModel = vi.fn(async () => composerConfiguration());
    const host = createHost({ selectMediaModel });
    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-composer-media-model',
        operation: 'composer-media-model',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        category: 'image',
        modelOptionId: 'nekoapi-media:gpt-image-2',
      },
    );
    if (!('configuration' in result)) throw new Error('Expected composer configuration result.');
    expect(selectMediaModel).toHaveBeenCalledWith({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      category: 'image',
      modelOptionId: 'nekoapi-media:gpt-image-2',
    });
  });

  it('routes only the exact DSH permission preset through the composer owner', async () => {
    const selectPermissionPreset = vi.fn(async () => composerConfiguration());
    const host = createHost({ selectPermissionPreset });
    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-composer-permission-preset',
        operation: 'composer-permission-preset',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        permissionPresetId: 'danger-full-access',
      },
    );
    if (!('configuration' in result)) throw new Error('Expected composer configuration result.');
    expect(selectPermissionPreset).toHaveBeenCalledWith({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      permissionPresetId: 'danger-full-access',
    });
  });

  it('rejects one invalid Tool detail visibly without hiding the Tool or sibling events', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 1 },
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'before' },
      },
    });
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 2, opennekoTurn: 0 },
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-invalid',
        title: 'Invalid detail',
        status: 'pending',
        rawInput: { invalid: undefined },
      },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('prompt', { text: 'hello' }),
      ),
    );

    expect(result.projection.events).toEqual([
      { kind: 'message', role: 'assistant', text: 'before' },
      expect.objectContaining({
        kind: 'diagnostic',
        code: 'ACP_TOOL_PAYLOAD_INVALID',
      }),
      {
        kind: 'tool',
        toolCallId: 'tool-invalid',
        turn: 0,
        status: 'pending',
        title: 'Invalid detail',
      },
    ]);
  });

  it('rejects a stale renderer before touching the bound client', async () => {
    const prompt = vi.fn();
    const host = createHost({ prompt });
    await expect(
      host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        { ...request('prompt', { text: 'hello' }), rendererSessionId: 'stale' },
      ),
    ).rejects.toThrow(/sender-bound/u);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('publishes changed only from the exact reverse binding', async () => {
    const publishChanged = vi.fn();
    const host = createHost({ publishChanged });
    await host.publishChanged(identity.dshSessionId);
    expect(publishChanged).toHaveBeenCalledWith({ conversationId: identity.conversationId });

    const missing = createHost({
      getByDshSessionId: async () => undefined,
      publishChanged,
    });
    await expect(missing.publishChanged('missing')).rejects.toThrow(
      /reverse Conversation binding/u,
    );
  });
});

function createHost(overrides: {
  readonly prompt?: ConversationDshSessionBoundClient['prompt'];
  readonly projection?: DshAcpProjection;
  readonly publishChanged?: (event: DshSessionChangedEvent) => void;
  readonly getByDshSessionId?: (sessionId: string) => Promise<typeof identity | undefined>;
  readonly createConversation?: (input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly workbenchInstanceId: string;
    readonly agentSurfaceId: string;
    readonly permissionPresetId: string;
    readonly target:
      { readonly kind: 'surface' } | { readonly kind: 'project'; readonly projectId: string };
  }) => Promise<{ readonly conversationId: string }>;
  readonly applyConversation?: (conversationId: string, windowId: string) => Promise<void>;
  readonly promptContext?: { resolve(conversationId: string): Promise<string> };
  readonly setSessionContext?: (conversationId: string, text: string) => Promise<void>;
  readonly selectModel?: () => Promise<ReturnType<typeof composerConfiguration>>;
  readonly selectMediaModel?: () => Promise<ReturnType<typeof composerConfiguration>>;
  readonly selectPermissionPreset?: () => Promise<ReturnType<typeof composerConfiguration>>;
}) {
  return new DesktopDshSessionHost({
    bindings: {
      getByDshSessionId: overrides.getByDshSessionId ?? (async () => ({ ...identity })),
    },
    conversations: {
      ensureLoaded: vi.fn(async () => identity.dshSessionId),
      prompt: overrides.prompt ?? vi.fn(async () => ({ stopReason: 'end_turn' as const })),
      cancel: vi.fn(async () => undefined),
      setSessionContext: overrides.setSessionContext ?? vi.fn(async () => undefined),
    },
    composer: {
      project: vi.fn(async () => composerConfiguration()),
      selectModel: overrides.selectModel ?? vi.fn(async () => composerConfiguration()),
      selectMediaModel: overrides.selectMediaModel ?? vi.fn(async () => composerConfiguration()),
      selectPermissionPreset:
        overrides.selectPermissionPreset ?? vi.fn(async () => composerConfiguration()),
      applyConversation: overrides.applyConversation ?? vi.fn(async () => undefined),
    },
    promptContext: overrides.promptContext ?? {
      resolve: vi.fn(async () => 'OpenNeko test context'),
    },
    createConversation:
      overrides.createConversation ??
      vi.fn(async () => ({ conversationId: identity.conversationId })),
    projection: overrides.projection ?? new DshAcpProjection(),
    windows: {
      resolveSender: () => ({ windowId: 'window-1', rendererSessionId: 'renderer-1' }),
    },
    publishChanged: overrides.publishChanged ?? vi.fn(),
  });
}

function requireSessionResult(
  result: Awaited<ReturnType<DesktopDshSessionHost['execute']>>,
): DshSessionHostResult {
  if (!('projection' in result)) throw new Error('Expected a DSH Session result.');
  return result;
}

function composerConfiguration() {
  return {
    models: [
      {
        id: 'deepseek:model',
        label: 'DeepSeek',
        providerId: 'deepseek',
        modelId: 'model',
        providerLabel: 'DeepSeek',
        category: 'llm' as const,
        capabilities: ['chat'],
      },
    ],
    selectedModelOptionId: 'deepseek:model',
    selectedMediaModelOptionIds: {},
    permissionPresetId: 'workspace-write',
    permissionPresets: [
      { id: 'read-only', label: 'read-only', selectable: true },
      { id: 'workspace-write', label: 'workspace-write', selectable: true },
      { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
    ],
  };
}

function request(operation: 'prompt', extra: { readonly text: string }) {
  return {
    requestId: 'request-1',
    operation,
    windowId: 'window-1',
    rendererSessionId: 'renderer-1',
    conversationId: identity.conversationId,
    ...extra,
  };
}
