import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PiConversationTranscriptEntry } from '@neko/agent/pi';

import {
  ConversationBridge,
  type PiConversationPresentationAuthority,
  type PiConversationPresentationCatalogItem,
} from '../conversationBridge';

describe('ConversationBridge Pi presentation boundary', () => {
  let authority: ReturnType<typeof createAuthority>;
  let bridge: ConversationBridge;

  beforeEach(() => {
    authority = createAuthority();
    bridge = createBridge(authority);
  });

  it('uses Pi catalog fields for listings and lazily projects Pi Session history', async () => {
    authority.catalog.set('conversation-history', catalog('conversation-history', 2, 'History'));
    authority.entries.set('conversation-history', [
      messageEntry('entry-user', null, {
        role: 'user',
        content: 'hello',
        timestamp: 10,
      }),
      messageEntry('entry-assistant', 'entry-user', assistantMessage('world', 20)),
    ]);
    bridge = createBridge(authority, [...authority.catalog.values()]);
    const webview = createMockWebview();

    bridge.sendConversationList(webview as never);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'conversationList',
      conversations: [
        expect.objectContaining({
          id: 'conversation-history',
          title: 'History',
          messageCount: 2,
        }),
      ],
    });
    expect(authority.readConversationEntries).not.toHaveBeenCalled();

    expect(bridge.switchTo('conversation-history')).toBe(true);
    await bridge.sendActiveConversation(webview as never);
    expect(authority.readConversationEntries).toHaveBeenCalledWith('conversation-history');
    expect(webview.postMessage).toHaveBeenLastCalledWith({
      type: 'activeConversation',
      conversation: {
        id: 'conversation-history',
        title: 'History',
        messages: [
          expect.objectContaining({ id: 'entry-user', role: 'user', content: 'hello' }),
          expect.objectContaining({
            id: 'entry-assistant',
            role: 'assistant',
            content: 'world',
          }),
        ],
      },
    });
  });

  it('does not expose a conversation when Pi creation fails', async () => {
    authority.createConversation.mockRejectedValueOnce(new Error('catalog unavailable'));

    await expect(bridge.create()).rejects.toThrow('catalog unavailable');
    expect(bridge.list()).toEqual([]);
    expect(bridge.getActiveId()).toBeNull();
  });

  it('keeps the projection intact when authoritative deletion fails', async () => {
    const conversationId = await bridge.create();
    authority.deleteConversation.mockRejectedValueOnce(new Error('lease held'));

    await expect(bridge.delete(conversationId)).rejects.toThrow('lease held');
    expect(bridge.get(conversationId)).toBeDefined();
  });

  it('reconciles replaceable catalog metadata without copying transcript messages', async () => {
    const first = catalog('conversation-a', 3, 'A');
    bridge = createBridge(authority, [first]);
    authority.catalog.set('conversation-b', catalog('conversation-b', 4, 'B'));

    await expect(bridge.refreshFromPiAuthority()).resolves.toEqual({
      upsertedIds: ['conversation-b'],
      removedIds: ['conversation-a'],
    });
    expect(bridge.get('conversation-b')).toMatchObject({
      title: 'B',
      messageCount: 4,
      messages: [],
      messagesLoaded: false,
    });
    expect(authority.readConversationEntries).not.toHaveBeenCalled();
  });

  it('keeps streaming updates process-local until Pi commits the turn', async () => {
    const conversationId = await bridge.ensureActive();
    bridge.upsertMessageToConversation(conversationId, {
      id: 'assistant-stream',
      role: 'assistant',
      content: 'partial',
      timestamp: 1,
      isStreaming: true,
    });
    bridge.upsertMessageToConversation(conversationId, {
      id: 'assistant-stream',
      role: 'assistant',
      content: 'complete',
      timestamp: 2,
      isStreaming: false,
    });

    expect(bridge.get(conversationId)?.messages).toEqual([
      expect.objectContaining({ id: 'assistant-stream', content: 'complete' }),
    ]);
    expect(authority.readConversationEntries).not.toHaveBeenCalled();
  });

  it('reprojects document resources for Webview without mutating the Pi-derived view', async () => {
    const contentAccessRuntime = {
      loadProviderAsset: vi.fn().mockResolvedValue({
        status: 'ready',
        diagnostics: [],
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
      }),
    };
    const localResourceAccess = {
      toWebviewUri: vi.fn((_webview: unknown, source: string) => `vscode-webview://${source}`),
    };
    bridge = createBridge(authority, [], localResourceAccess, contentAccessRuntime);
    const conversationId = await bridge.ensureActive();
    const resourceRef = createDocumentEntryResourceRef();
    bridge.addMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        {
          id: 'block-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall: {
            id: 'read-image-1',
            name: 'ReadImage',
            arguments: {},
            result: {
              success: true,
              data: {
                images: [
                  {
                    label: 'Page 1',
                    width: 1511,
                    height: 2160,
                    mimeType: 'image/jpeg',
                    resourceRef,
                    documentImage: { resourceRef },
                  },
                ],
              },
            },
          },
        },
      ],
    });
    const webview = createMockWebview();

    await bridge.sendActiveConversation(webview as never);

    const posted = vi.mocked(webview.postMessage).mock.calls[0]?.[0] as any;
    const image = posted.conversation.messages[0].contentBlocks[0].toolCall.result.data.images[0];
    expect(image.renderUri).toBe('data:image/jpeg;base64,AQID');
    expect(localResourceAccess.toWebviewUri).not.toHaveBeenCalled();
    expect(JSON.stringify(bridge.get(conversationId)?.messages)).not.toContain('renderUri');
  });

  it('reports deleted and unknown snapshots with distinct diagnostics', async () => {
    const conversationId = await bridge.create();
    await bridge.delete(conversationId);
    const webview = createMockWebview();

    await expect(bridge.sendConversationSnapshot(webview as never, conversationId)).resolves.toBe(
      false,
    );
    await expect(bridge.sendConversationSnapshot(webview as never, 'missing')).resolves.toBe(false);
    expect(webview.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ code: 'deleted-conversation' }),
    );
    expect(webview.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ code: 'unknown-conversation' }),
    );
  });
});

function createBridge(
  authority: ReturnType<typeof createAuthority>,
  initialCatalog: readonly PiConversationPresentationCatalogItem[] = [],
  localResourceAccess?: unknown,
  contentAccessRuntime?: unknown,
): ConversationBridge {
  return new ConversationBridge(
    '/workspace',
    localResourceAccess as never,
    contentAccessRuntime ? () => contentAccessRuntime as never : undefined,
    { authority, initialCatalog },
  );
}

function createAuthority() {
  const catalogRecords = new Map<string, PiConversationPresentationCatalogItem>();
  const entries = new Map<string, readonly PiConversationTranscriptEntry[]>();
  const authority: PiConversationPresentationAuthority & {
    readonly catalog: typeof catalogRecords;
    readonly entries: typeof entries;
    readonly createConversation: ReturnType<typeof vi.fn>;
    readonly deleteConversation: ReturnType<typeof vi.fn>;
    readonly readConversationEntries: ReturnType<typeof vi.fn>;
  } = {
    catalog: catalogRecords,
    entries,
    listConversationPresentationCatalog: vi.fn(async () => [...catalogRecords.values()]),
    createConversation: vi.fn(async ({ conversationId, title }) => {
      const record = catalog(conversationId, 0, title ?? 'New conversation');
      catalogRecords.set(conversationId, record);
      entries.set(conversationId, []);
      return record;
    }),
    updateConversationTitle: vi.fn(async (conversationId, title) => {
      const current = catalogRecords.get(conversationId);
      if (!current) throw new Error(`Missing ${conversationId}`);
      catalogRecords.set(conversationId, { ...current, title });
    }),
    deleteConversation: vi.fn(async (conversationId) => {
      entries.delete(conversationId);
      return catalogRecords.delete(conversationId);
    }),
    readConversationEntries: vi.fn(async (conversationId) => entries.get(conversationId) ?? []),
  };
  return authority;
}

function catalog(
  conversationId: string,
  messageCount: number,
  title: string,
): PiConversationPresentationCatalogItem {
  return {
    workspaceId: 'workspace-1',
    conversationId,
    title,
    activeBranchId: 'main',
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: `2026-07-17T00:00:${String(messageCount).padStart(2, '0')}.000Z`,
    messageCount,
  };
}

function messageEntry(
  id: string,
  parentId: string | null,
  message: Extract<PiConversationTranscriptEntry, { type: 'message' }>['message'],
): PiConversationTranscriptEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: new Date(message.timestamp).toISOString(),
    message,
  };
}

function assistantMessage(content: string, timestamp: number) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: content }],
    api: 'openai-completions' as const,
    provider: 'fixture',
    model: 'fixture-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop' as const,
    timestamp,
  };
}

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { toString(): string }) => ({
      toString: () => `vscode-webview://${uri.toString()}`,
    })),
  };
}

function createDocumentEntryResourceRef() {
  return {
    kind: 'document-entry',
    source: { filePath: '/workspace/books/story.epub', format: 'epub' },
    entryPath: 'OPS/page-1.jpg',
    versionPolicy: 'versioned-export',
  };
}
