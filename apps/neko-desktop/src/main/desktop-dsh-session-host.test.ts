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
          initialInput: {
            kind: 'message',
            text: 'Create in project',
            references: [],
            images: [],
            contextPayloads: [],
          },
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
      initialInput: {
        kind: 'message',
        text: 'Create in project',
        references: [],
        images: [],
        contextPayloads: [],
      },
    });
    expect(result.projection).toMatchObject({ ...identity, title: 'Create in project' });
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
          initialInput: {
            kind: 'message',
            text: 'Hello',
            references: [],
            images: [],
            contextPayloads: [],
          },
        },
      ),
    ).rejects.toThrow(/sender-bound/u);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it('routes prompt by exact Conversation binding and preserves bounded Tool details', async () => {
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const applyConversation = vi.fn(async () => ({ supportsImageInput: false }));
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
        request('submit', {
          input: {
            kind: 'message',
            text: 'hello',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
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

  it('injects the exact selected context receipt before the DSH prompt', async () => {
    const resolve = vi.fn(async () => 'OpenNeko context with selected Asset');
    const setSessionContext = vi.fn(async () => undefined);
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const host = createHost({ prompt, setSessionContext, promptContext: { resolve } });
    const contextPayload = {
      type: 'asset' as const,
      id: 'asset-lighting',
      label: 'Lighting',
      summary: 'Soft studio lighting',
      data: { assetRef: { assetId: 'asset-lighting' } },
    };
    const selectedResource = {
      label: 'draft.epub',
      contentLocator: { file: { authority: 'workspace' as const, path: 'books/draft.epub' } },
    };
    const canvasTurnTarget = {
      kind: 'exact-canvas' as const,
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/story.nkc',
    };

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', {
        input: {
          kind: 'message',
          text: 'Use this reference',
          references: [selectedResource],
          images: [],
          contextPayloads: [contextPayload],
          canvasTurnTarget,
        },
      }),
    );

    expect(resolve).toHaveBeenCalledWith(
      identity.conversationId,
      [contextPayload],
      [selectedResource],
      canvasTurnTarget,
    );
    expect(setSessionContext).toHaveBeenCalledWith(
      identity.conversationId,
      'OpenNeko context with selected Asset',
    );
    expect(setSessionContext.mock.invocationCallOrder[0]).toBeLessThan(
      prompt.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('enqueues an ordinary message into the exact running DSH Session without reconfiguring it', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 1 },
    });
    const enqueueInboxMessage = vi.fn(async () => ({ nextTurn: [], nextStep: [] }));
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const applyConversation = vi.fn(async () => ({ supportsImageInput: false }));
    const readConversationExecution = vi.fn(async () => ({ supportsImageInput: false }));
    const setSessionContext = vi.fn(async () => undefined);
    const resolve = vi.fn(async () => 'OpenNeko exact Canvas context');
    const canvasTurnTarget = {
      kind: 'exact-canvas' as const,
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/story.nkc',
    };
    const host = createHost({
      projection,
      enqueueInboxMessage,
      prompt,
      applyConversation,
      readConversationExecution,
      setSessionContext,
      promptContext: { resolve },
    });

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', {
        input: {
          kind: 'message',
          text: 'next request',
          references: [],
          images: [],
          contextPayloads: [],
          canvasTurnTarget,
        },
      }),
    );

    expect(enqueueInboxMessage).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      prompt: [{ type: 'text', text: 'next request' }],
      displayContent: [{ type: 'text', text: 'next request' }],
      contextText: 'OpenNeko exact Canvas context',
    });
    expect(resolve).toHaveBeenCalledWith(identity.conversationId, [], [], canvasTurnTarget);
    expect(readConversationExecution).toHaveBeenCalledWith(identity.conversationId, 'window-1');
    expect(prompt).not.toHaveBeenCalled();
    expect(applyConversation).not.toHaveBeenCalled();
    expect(setSessionContext).not.toHaveBeenCalled();
  });

  it('enqueues a pasted image with separate model bytes and durable display identity', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 1 },
    });
    const enqueueInboxMessage = vi.fn(async () => ({ nextTurn: [], nextStep: [] }));
    const admitPromptImages = vi.fn(async () => [
      {
        source: { kind: 'inline' as const, imageIndex: 0, name: 'clipboard.png' },
        data: 'AQID',
        mimeType: 'image/png' as const,
      },
    ]);
    const host = createHost({
      projection,
      enqueueInboxMessage,
      admitPromptImages,
      readConversationExecution: vi.fn(async () => ({ supportsImageInput: true })),
    });

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', {
        input: {
          kind: 'message',
          text: '',
          references: [],
          images: [{ name: 'clipboard.png', mimeType: 'image/png', data: 'AQID' }],
          contextPayloads: [],
        },
      }),
    );

    expect(enqueueInboxMessage).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      prompt: [
        {
          type: 'image',
          data: 'AQID',
          mimeType: 'image/png',
          _meta: { opennekoDisplayName: 'clipboard.png' },
        },
      ],
      displayContent: [{ type: 'image', name: 'clipboard.png' }],
      contextText: 'OpenNeko test context',
    });
  });

  it('adds an admitted native image block after its resource identity', async () => {
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const admitPromptImages = vi.fn(async () => [
      {
        source: { kind: 'reference' as const, referenceIndex: 0 },
        data: 'aW1hZ2U=',
        mimeType: 'image/png' as const,
      },
    ]);
    const selectedResource = {
      label: 'board.png',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'images/board.png' },
      },
    };
    const host = createHost({
      prompt,
      admitPromptImages,
      applyConversation: vi.fn(async () => ({ supportsImageInput: true })),
    });

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', {
        input: {
          kind: 'message',
          text: '',
          references: [selectedResource],
          images: [],
          contextPayloads: [],
        },
      }),
    );

    expect(admitPromptImages).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      windowId: 'window-1',
      references: [selectedResource],
      images: [],
      modelSupportsImageInput: true,
    });
    expect(prompt).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      prompt: [
        {
          type: 'resource_link',
          name: 'board.png',
          uri: `openneko-content:${encodeURIComponent(JSON.stringify(selectedResource.contentLocator))}`,
        },
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      ],
    });
  });

  it('submits a pasted image as a named native image block without fabricating a resource', async () => {
    const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const admitPromptImages = vi.fn(async () => [
      {
        source: { kind: 'inline' as const, imageIndex: 0, name: 'clipboard.png' },
        data: 'AQID',
        mimeType: 'image/png' as const,
      },
    ]);
    const host = createHost({
      prompt,
      admitPromptImages,
      applyConversation: vi.fn(async () => ({ supportsImageInput: true })),
    });

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', {
        input: {
          kind: 'message',
          text: '分析图片',
          references: [],
          images: [{ name: 'clipboard.png', mimeType: 'image/png', data: 'AQID' }],
          contextPayloads: [],
        },
      }),
    );

    expect(prompt).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      prompt: [
        { type: 'text', text: '分析图片' },
        {
          type: 'image',
          data: 'AQID',
          mimeType: 'image/png',
          _meta: { opennekoDisplayName: 'clipboard.png' },
        },
      ],
    });
    expect(JSON.stringify(prompt.mock.calls)).not.toContain('resource_link');
  });

  it('projects ACP resource links to canonical ContentLocators without exposing their URI', async () => {
    const projection = new DshAcpProjection();
    const locator = { file: { authority: 'workspace' as const, path: 'books/卷01.epub' } };
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 0 },
      update: {
        sessionUpdate: 'user_message_chunk',
        messageId: 'resource-message',
        content: {
          type: 'resource_link',
          name: '卷01.epub',
          uri: `openneko-content:${encodeURIComponent(JSON.stringify(locator))}`,
        },
      },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('submit', {
          input: {
            kind: 'message',
            text: 'continue',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
      ),
    );

    expect(result.projection.events).toEqual([
      {
        kind: 'message',
        role: 'user',
        messageId: 'resource-message',
        content: [{ type: 'resource', label: '卷01.epub', contentLocator: locator }],
      },
    ]);
    expect(JSON.stringify(result.projection.events)).not.toContain('openneko-content:');
  });

  it('projects persisted DSH attachment identities as image tokens after replay', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 0 },
      update: {
        sessionUpdate: 'user_message_chunk',
        messageId: 'image-message',
        content: {
          type: 'resource_link',
          name: 'clipboard.png',
          uri: `openneko-dsh-attachment:${encodeURIComponent(
            JSON.stringify({
              attachmentId: 'attachment-1',
              mediaType: 'image/png',
              bytes: 4,
              width: 1,
              height: 1,
            }),
          )}`,
        },
      },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('submit', {
          input: {
            kind: 'message',
            text: 'continue',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
      ),
    );

    expect(result.projection.events).toEqual([
      {
        kind: 'message',
        role: 'user',
        messageId: 'image-message',
        content: [
          {
            type: 'image',
            label: 'clipboard.png',
            attachment: {
              attachmentId: 'attachment-1',
              mediaType: 'image/png',
              byteLength: 4,
              width: 1,
              height: 1,
            },
          },
        ],
      },
    ]);
  });

  it('projects only an exact Conversation image through a sender-bound lazy resource reader', async () => {
    const projection = new DshAcpProjection();
    const attachment = {
      attachmentId: 'attachment-1',
      mediaType: 'image/png' as const,
      bytes: 4,
      width: 1,
      height: 1,
    };
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 0 },
      update: {
        sessionUpdate: 'user_message_chunk',
        messageId: 'image-message',
        content: {
          type: 'resource_link',
          name: 'clipboard.png',
          uri: `openneko-dsh-attachment:${encodeURIComponent(JSON.stringify(attachment))}`,
        },
      },
    });
    const readImageAttachment = vi.fn(async () => ({ attachment, data: 'YWJjZA==' }));
    let readResource: ((signal: AbortSignal) => Promise<Uint8Array>) | undefined;
    const projectImagePreview = vi.fn(
      (input: { readonly read: (signal: AbortSignal) => Promise<Uint8Array> }) => {
        readResource = input.read;
        return {
          url: 'openneko://resource/lease-1/image',
          mediaType: 'image/png' as const,
          byteLength: 4,
          width: 1,
          height: 1,
        };
      },
    );
    const host = createHost({ projection, readImageAttachment, projectImagePreview });

    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-image-preview',
        operation: 'image-preview',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: identity.conversationId,
        attachmentId: 'attachment-1',
      },
    );

    expect(result).toEqual({
      requestId: 'request-image-preview',
      preview: {
        url: 'openneko://resource/lease-1/image',
        mediaType: 'image/png',
        byteLength: 4,
        width: 1,
        height: 1,
      },
    });
    expect(readImageAttachment).not.toHaveBeenCalled();
    expect(readResource).toBeDefined();
    await expect(
      readResource?.(new AbortController().signal).then((bytes) => [...bytes]),
    ).resolves.toEqual([97, 98, 99, 100]);
    expect(readImageAttachment).toHaveBeenCalledWith(identity.conversationId, 'attachment-1');

    await expect(
      host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        {
          requestId: 'request-foreign-preview',
          operation: 'image-preview',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          conversationId: identity.conversationId,
          attachmentId: 'attachment-foreign',
        },
      ),
    ).rejects.toThrow(/exact Conversation/u);
    expect(projectImagePreview).toHaveBeenCalledTimes(1);
  });

  it('isolates an invalid ACP resource link as a local diagnostic', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 0 },
      update: {
        sessionUpdate: 'user_message_chunk',
        messageId: 'bad-resource-message',
        content: { type: 'resource_link', name: 'bad.epub', uri: 'openneko-content:not-json' },
      },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('submit', {
          input: {
            kind: 'message',
            text: 'continue',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
      ),
    );

    expect(result.projection.events).toEqual([
      expect.objectContaining({ kind: 'diagnostic', code: 'ACP_RESOURCE_LINK_INVALID' }),
    ]);
    expect(JSON.stringify(result.projection.events)).not.toContain('not-json');
  });

  it('executes a DSH command without creating a model turn or applying prompt context', async () => {
    const prompt = vi.fn();
    const executeCommand = vi.fn(async () => ({
      commandId: 'command-1',
      outcome: 'success' as const,
    }));
    const applyConversation = vi.fn();
    const host = createHost({ prompt, executeCommand, applyConversation });

    await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      request('submit', { input: { kind: 'command', line: '/help models' } }),
    );

    expect(executeCommand).toHaveBeenCalledWith(identity.conversationId, '/help models');
    expect(applyConversation).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('invokes a catalog-validated DSH Skill through the canonical prompt context path', async () => {
    const prompt = vi.fn();
    const invokeSkill = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
    const applyConversation = vi.fn(async () => ({ supportsImageInput: false }));
    const host = createHost({ prompt, invokeSkill, applyConversation });

    const result = requireSessionResult(
      await host.execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        request('submit', {
          input: {
            kind: 'skill',
            skillName: 'story-review',
            displayText: '$story-review chapter-1',
            args: 'chapter-1',
          },
        }),
      ),
    );

    expect(invokeSkill).toHaveBeenCalledWith({
      conversationId: identity.conversationId,
      skillName: 'story-review',
      displayText: '$story-review chapter-1',
      args: 'chapter-1',
    });
    expect(applyConversation).toHaveBeenCalledWith(identity.conversationId, 'window-1');
    expect(prompt).not.toHaveBeenCalled();
    expect(result.stopReason).toBe('end_turn');
  });

  it('routes Workspace mention search through the exact sender-bound Surface', async () => {
    const searchMentions = vi.fn(async () => [
      {
        id: 'files:scene',
        kind: 'file' as const,
        label: 'scene.md',
        contentLocator: { file: { authority: 'workspace' as const, path: 'notes/scene.md' } },
        source: 'workspace' as const,
        mediaType: 'text' as const,
      },
    ]);
    const host = createHost({ searchMentions });

    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-mentions',
        operation: 'composer-mentions',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        filter: 'scene',
      },
    );

    if (!('mentions' in result)) throw new Error('Expected composer mentions result.');
    expect(searchMentions).toHaveBeenCalledWith({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      filter: 'scene',
    });
    expect(result.mentions).toHaveLength(1);
  });

  it('materializes one exact Asset through the sender-bound Surface without a Tool path', async () => {
    const materializeAsset = vi.fn(async () => ({
      assetId: 'asset-lighting',
      label: 'lighting.png',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'assets/lighting.png' },
      },
      source: 'asset-library' as const,
    }));
    const host = createHost({ materializeAsset });

    const result = await host.execute(
      { webContentsId: 1, frameUrl: 'openneko://app' },
      {
        requestId: 'request-materialize',
        operation: 'composer-materialize-asset',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        assetId: 'asset-lighting',
      },
    );

    if (!('materialized' in result)) throw new Error('Expected materialized Asset result.');
    expect(materializeAsset).toHaveBeenCalledWith({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      assetId: 'asset-lighting',
    });
    expect(result.materialized.contentLocator.file.path).toBe('assets/lighting.png');
  });

  it('delegates canonical DSH turn timing without using Desktop receipt time', async () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 2 },
    });
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 1,
      time: 4_250,
      type: 'turn/end',
      data: { turn: 2, reason: { kind: 'completed' } },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        {
          requestId: 'request-snapshot',
          operation: 'snapshot',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          conversationId: identity.conversationId,
        },
      ),
    );

    expect(result.projection.events).toEqual([
      { kind: 'turn', turn: 2, phase: 'start', startedAt: 1_000 },
      {
        kind: 'turn',
        turn: 2,
        phase: 'end',
        startedAt: 1_000,
        completedAt: 4_250,
        reason: 'completed',
      },
    ]);
  });

  it('delegates the exact DSH context-pressure read model without recalculation', async () => {
    const projection = new DshAcpProjection();
    projection.acceptContextPressure({
      sessionId: identity.dshSessionId,
      sourceSequence: 12,
      pressure: {
        pressureTokens: 38_924,
        projectedTokens: 41_100,
        contextWindow: 256_000,
      },
    });

    const result = requireSessionResult(
      await createHost({ projection }).execute(
        { webContentsId: 1, frameUrl: 'openneko://app' },
        {
          requestId: 'request-pressure',
          operation: 'snapshot',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          conversationId: identity.conversationId,
        },
      ),
    );

    expect(result.projection.contextPressure).toEqual({
      pressureTokens: 38_924,
      projectedTokens: 41_100,
      contextWindow: 256_000,
    });
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
        request('submit', {
          input: {
            kind: 'message',
            text: 'hello',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
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
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 0 },
    });
    projection.acceptSessionEvent({
      sessionId: identity.dshSessionId,
      sequence: 1,
      time: 1_001,
      type: 'step/start',
      data: { turn: 0, step: 0 },
    });
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: {
        opennekoSequence: 2,
        opennekoTurn: 0,
        opennekoStep: 0,
        opennekoBlockIndex: 0,
        opennekoMessagePhase: 'delta',
      },
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'dsh:0:0:text',
        content: { type: 'text', text: 'before' },
      },
    });
    projection.acceptSessionUpdate({
      sessionId: identity.dshSessionId,
      _meta: { opennekoSequence: 3, opennekoTurn: 0 },
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
        request('submit', {
          input: {
            kind: 'message',
            text: 'hello',
            references: [],
            images: [],
            contextPayloads: [],
          },
        }),
      ),
    );

    expect(result.projection.events).toEqual([
      { kind: 'turn', turn: 0, phase: 'start', startedAt: 1_000 },
      {
        kind: 'message',
        role: 'assistant',
        turn: 0,
        step: 0,
        text: 'before',
        messageId: 'dsh:0:0:text',
        state: 'streaming',
      },
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
        {
          ...request('submit', {
            input: {
              kind: 'message',
              text: 'hello',
              references: [],
              images: [],
              contextPayloads: [],
            },
          }),
          rendererSessionId: 'stale',
        },
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
    readonly initialInput: import('@neko/agent-contracts/dsh-session-host').DshComposerSubmitInput;
  }) => Promise<{ readonly conversationId: string }>;
  readonly applyConversation?: (
    conversationId: string,
    windowId: string,
  ) => Promise<{ readonly supportsImageInput: boolean }>;
  readonly readConversationExecution?: (
    conversationId: string,
    windowId: string,
  ) => Promise<{ readonly supportsImageInput: boolean }>;
  readonly enqueueInboxMessage?: ConversationDshSessionBoundClient['enqueueInboxMessage'];
  readonly readImageAttachment?: ConversationDshSessionBoundClient['readImageAttachment'];
  readonly projectImagePreview?: ConstructorParameters<
    typeof DesktopDshSessionHost
  >[0]['imagePreviews']['project'];
  readonly releaseImagePreviews?: (windowId: string, conversationId: string) => void;
  readonly admitPromptImages?: (input: {
    readonly conversationId: string;
    readonly windowId: string;
    readonly references: readonly {
      readonly label: string;
      readonly contentLocator: import('@neko/content').ContentLocator;
    }[];
    readonly images: readonly import('@neko/agent-contracts').DshComposerImageInput[];
    readonly modelSupportsImageInput: boolean;
  }) => Promise<readonly import('./desktop-dsh-prompt-image-admission').DesktopDshPromptImage[]>;
  readonly promptContext?: {
    resolve(
      conversationId: string,
      contextPayloads?: readonly import('@neko/agent-contracts').AgentContextPayload[],
      selectedResources?: readonly {
        readonly label: string;
        readonly contentLocator: import('@neko/content').ContentLocator;
      }[],
      canvasTurnTarget?: import('@neko/canvas-domain').CanvasWorkspaceTurnTarget,
    ): Promise<string>;
  };
  readonly setSessionContext?: (conversationId: string, text: string) => Promise<void>;
  readonly executeCommand?: ConversationDshSessionBoundClient['executeCommand'];
  readonly invokeSkill?: ConversationDshSessionBoundClient['invokeSkill'];
  readonly selectModel?: () => Promise<ReturnType<typeof composerConfiguration>>;
  readonly selectMediaModel?: () => Promise<ReturnType<typeof composerConfiguration>>;
  readonly selectPermissionPreset?: () => Promise<ReturnType<typeof composerConfiguration>>;
  readonly searchMentions?: () => Promise<
    readonly import('@neko/agent-contracts/dsh-session-host').DshComposerMentionProjection[]
  >;
  readonly materializeAsset?: () => Promise<
    import('@neko/agent-contracts/dsh-session-host').DshComposerMaterializedAssetProjection
  >;
}) {
  return new DesktopDshSessionHost({
    bindings: {
      getByDshSessionId: overrides.getByDshSessionId ?? (async () => ({ ...identity })),
    },
    catalog: {
      get: vi.fn(async (conversationId: string) => ({
        conversationId,
        title: 'Create in project',
        createdAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
        context: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-space:test',
          baseGrantIds: [],
        },
      })),
    },
    conversations: {
      ensureLoaded: vi.fn(async () => identity.dshSessionId),
      prompt: overrides.prompt ?? vi.fn(async () => ({ stopReason: 'end_turn' as const })),
      cancel: vi.fn(async () => undefined),
      setSessionContext: overrides.setSessionContext ?? vi.fn(async () => undefined),
      executeCommand:
        overrides.executeCommand ??
        vi.fn(async () => ({ commandId: 'command-1', outcome: 'success' as const })),
      invokeSkill:
        overrides.invokeSkill ?? vi.fn(async () => ({ stopReason: 'end_turn' as const })),
      readInbox: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
      readImageAttachment:
        overrides.readImageAttachment ??
        vi.fn(async () => {
          throw new Error('Unexpected image attachment read.');
        }),
      enqueueInboxMessage:
        overrides.enqueueInboxMessage ?? vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
      removeInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    },
    composer: {
      project: vi.fn(async () => composerConfiguration()),
      selectModel: overrides.selectModel ?? vi.fn(async () => composerConfiguration()),
      selectMediaModel: overrides.selectMediaModel ?? vi.fn(async () => composerConfiguration()),
      selectPermissionPreset:
        overrides.selectPermissionPreset ?? vi.fn(async () => composerConfiguration()),
      searchMentions: overrides.searchMentions ?? vi.fn(async () => []),
      materializeAsset:
        overrides.materializeAsset ??
        vi.fn(async () => ({
          assetId: 'asset-1',
          label: 'asset.png',
          contentLocator: {
            file: { authority: 'workspace' as const, path: 'assets/asset.png' },
          },
          source: 'asset-library' as const,
        })),
      applyConversation:
        overrides.applyConversation ?? vi.fn(async () => ({ supportsImageInput: false })),
      readConversationExecution:
        overrides.readConversationExecution ?? vi.fn(async () => ({ supportsImageInput: false })),
    },
    promptImages: {
      admit: overrides.admitPromptImages ?? vi.fn(async () => []),
    },
    imagePreviews: {
      project:
        overrides.projectImagePreview ??
        vi.fn(() => {
          throw new Error('Unexpected image attachment preview projection.');
        }),
      release: overrides.releaseImagePreviews ?? vi.fn(),
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

function request(
  operation: 'submit',
  extra: {
    readonly input: import('@neko/agent-contracts/dsh-session-host').DshComposerSubmitInput;
  },
) {
  return {
    requestId: 'request-1',
    operation,
    windowId: 'window-1',
    rendererSessionId: 'renderer-1',
    conversationId: identity.conversationId,
    ...extra,
  };
}
