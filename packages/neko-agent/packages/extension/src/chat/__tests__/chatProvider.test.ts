import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

import * as vscode from 'vscode';
import {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
  type WebviewKeyboardEditableOwnerUpdate,
} from '@neko/shared/vscode/extension';
import type { ILogger } from '@neko/shared';
import type { PiConversationTranscriptEntry } from '@neko/agent/pi';
import {
  ChatViewProvider,
  createChatLocalResourceAccess,
  type ChatViewProviderOptions,
} from '../chatProvider';
import { setRootLogger } from '../../base';

describe('chatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRootLogger(createNoopLogger());
  });

  it('restores persisted character role tabs only after role controllers are initialized', () => {
    const context = createMockContext({
      'neko.tabState': {
        openTabs: [
          {
            id: 'tab-character-dialogue',
            title: 'Character Dialogue: 小橘',
            conversationId: 'character-dialogue-session-1',
            kind: 'character-dialogue',
            characterDialogueSession: {
              sessionId: 'character-dialogue-session-1',
              entityId: 'char-xiaoju',
              displayName: '小橘',
              mode: 'roleplay',
              profile: {
                entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
                displayName: '小橘',
                aliases: [],
                facts: [],
                sparsity: 'thin',
              },
              summary: 'thin profile',
              startedAt: '2026-06-02T00:00:00.000Z',
              status: 'active',
            },
          },
          {
            id: 'tab-embody-character',
            title: 'Embody: 小橘',
            conversationId: 'embody-character-session-1',
            kind: 'embody-character',
            embodyCharacterSession: {
              sessionId: 'embody-character-session-1',
              entityId: 'char-xiaoju',
              displayName: '小橘',
              profile: {
                entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
                displayName: '小橘',
                aliases: [],
                facts: [],
                sparsity: 'thin',
              },
              scopeSummary: ['project: current project'],
              summary: 'thin profile',
              startedAt: '2026-06-02T00:00:00.000Z',
              status: 'active',
            },
          },
        ],
        activeTabId: 'tab-embody-character',
      },
    });

    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([]),
    });

    expect(context.workspaceState.update).toHaveBeenCalledWith('neko.tabState', {
      openTabs: [],
      activeTabId: null,
    });

    provider.dispose();
  });

  it('preserves an explicitly empty tab state instead of reopening recent history', async () => {
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: 'conv-history',
      },
      'neko.tabState': {
        openTabs: [],
        activeTabId: null,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({ type: 'getActiveConversation' });
    await receiveMessage?.({ type: 'getTabState' });

    expect(context.workspaceState.update).not.toHaveBeenCalledWith(
      'neko.tabState',
      expect.objectContaining({
        openTabs: [expect.objectContaining({ conversationId: 'conv-history' })],
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activeConversation',
        conversation: null,
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: expect.any(Number),
      tabState: { openTabs: [], activeTabId: null },
    });

    provider.dispose();
  });

  it('persists a foreground Tab binding before projecting a newly created conversation', async () => {
    const context = createMockContext();
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([]),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await flushWebviewAsyncWork();
    vi.mocked(webview.postMessage).mockClear();
    vi.mocked(context.workspaceState.update).mockClear();
    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;

    await receiveMessage?.({ type: 'newConversation' });
    await flushWebviewAsyncWork();

    const tabStateUpdate = vi
      .mocked(context.workspaceState.update)
      .mock.calls.find(([key]) => key === 'neko.tabState');
    expect(tabStateUpdate?.[1]).toEqual({
      openTabs: [
        expect.objectContaining({
          id: expect.stringMatching(/^tab-/),
          conversationId: expect.any(String),
        }),
      ],
      activeTabId: expect.stringMatching(/^tab-/),
    });
    const postedTypes = vi.mocked(webview.postMessage).mock.calls.map(([message]) => message.type);
    expect(postedTypes.indexOf('tabState')).toBeGreaterThanOrEqual(0);
    expect(postedTypes.indexOf('tabState')).toBeLessThan(postedTypes.indexOf('activeConversation'));

    provider.dispose();
  });

  it('starts with entry state instead of restoring previously open conversation tabs', async () => {
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: 'conv-history',
      },
      'neko.tabState': {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({ type: 'getActiveConversation' });
    await receiveMessage?.({ type: 'getTabState' });

    expect(context.workspaceState.update).toHaveBeenCalledWith('neko.tabState', {
      openTabs: [],
      activeTabId: null,
    });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activeConversation',
        conversation: null,
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: expect.any(Number),
      tabState: { openTabs: [], activeTabId: null },
    });

    provider.dispose();
  });

  it('keeps same-session empty tab state after all tabs are closed', async () => {
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: 'conv-history',
      },
    });
    const firstWebview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview: firstWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveFirstMessage = vi.mocked(firstWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveFirstMessage?.({
      type: 'updateTabState',
      openTabs: [],
      activeTabId: null,
      expectedTabStateRevision: 0,
    });

    const secondWebview = vscode.createMockWebview();
    provider.resolveWebviewView(
      {
        webview: secondWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveSecondMessage = vi.mocked(secondWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveSecondMessage?.({ type: 'getActiveConversation' });
    await receiveSecondMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-second',
    });
    await receiveSecondMessage?.({ type: 'getTabState' });
    await flushWebviewAsyncWork();

    expect(secondWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activeConversation',
        conversation: null,
      }),
    );
    expect(secondWebview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: expect.any(Number),
      tabState: { openTabs: [], activeTabId: null },
    });

    provider.dispose();
  });

  it('preserves the active conversation when an empty tab state arrives during an agent turn', async () => {
    const now = Date.now();
    const historicalConversation = createPiConversationFixture({
      id: 'conv-history',
      title: 'History',
      messageId: 'msg-1',
      content: 'hi',
      now,
    });
    const context = createMockContext();
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([historicalConversation]),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    const providerInternals = provider as unknown as {
      _conversations: { getActiveId(): string | null };
      _messages?: {
        getAgentStateSnapshot(): readonly {
          readonly conversationId: 'conv-history';
          readonly phase: 'thinking';
          readonly startedAt: 1;
        }[];
        dispose(): void;
      };
    };
    expect(providerInternals._conversations.getActiveId()).toBe('conv-history');
    providerInternals._messages = {
      getAgentStateSnapshot: () => [
        { conversationId: 'conv-history', phase: 'thinking', startedAt: 1 },
      ],
      dispose: vi.fn(),
    };

    await receiveMessage?.({
      type: 'updateTabState',
      openTabs: [],
      activeTabId: null,
      expectedTabStateRevision: 1,
    });
    expect(providerInternals._conversations.getActiveId()).toBe('conv-history');

    provider.dispose();
  });

  it('preserves same-session open tabs when the webview is recreated', async () => {
    const now = Date.now();
    const historicalConversation = createPiConversationFixture({
      id: 'conv-history',
      title: 'History',
      messageId: 'msg-1',
      content: 'persisted transcript',
      now,
    });
    const context = createMockContext();
    const firstWebview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([historicalConversation]),
    });

    provider.resolveWebviewView(
      {
        webview: firstWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveFirstMessage = vi.mocked(firstWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveFirstMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    const secondWebview = vscode.createMockWebview();
    provider.resolveWebviewView(
      {
        webview: secondWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveSecondMessage = vi.mocked(secondWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveSecondMessage?.({ type: 'getActiveConversation' });
    await receiveSecondMessage?.({ type: 'getTabState' });
    await flushWebviewAsyncWork();

    expect(secondWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activeConversation',
        conversation: expect.objectContaining({
          id: 'conv-history',
          title: 'History',
          messages: [
            expect.objectContaining({
              id: 'msg-1',
              content: 'persisted transcript',
            }),
          ],
        }),
      }),
    );
    expect(secondWebview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: expect.any(Number),
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    provider.dispose();
  });

  it('atomically activates a history conversation and echoes activation correlation', async () => {
    const now = Date.now();
    const historicalConversation = createPiConversationFixture({
      id: 'conv-history',
      title: 'History',
      messageId: 'msg-1',
      content: 'persisted transcript',
      now,
    });
    const context = createMockContext({
      'neko.tabState': {
        openTabs: [],
        activeTabId: null,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([historicalConversation]),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    expect(receiveMessage).toBeDefined();
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });
    await flushWebviewAsyncWork();

    expect(context.workspaceState.update).toHaveBeenCalledWith('neko.tabState', {
      openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
      activeTabId: 'tab-history',
    });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activeConversation',
        activation: {
          activationId: 1,
          tabStateRevision: 1,
        },
        conversation: expect.objectContaining({
          id: 'conv-history',
          title: 'History',
          messages: [
            expect.objectContaining({
              id: 'msg-1',
              content: 'persisted transcript',
            }),
          ],
        }),
      }),
    );

    provider.dispose();
  });

  it('rejects a stale atomic activation without switching or emitting a correlated snapshot', async () => {
    const now = Date.now();
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'persisted transcript', timestamp: now }],
      createdAt: now,
      updatedAt: now,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: null,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 7,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 1,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });
    await flushWebviewAsyncWork();

    const providerInternals = provider as unknown as {
      _conversations: { getActiveId(): string | null };
    };
    expect(providerInternals._conversations.getActiveId()).toBeNull();
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sessionDiagnostic',
        code: 'stale-tab-state-revision',
        action: 'activate-conversation',
        conversationId: 'conv-history',
        tabId: 'tab-history',
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: 0,
      tabState: { openTabs: [], activeTabId: null },
    });
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'activeConversation', activation: expect.anything() }),
    );

    provider.dispose();
  });

  it('poisons ordinary conversation switching through the legacy tab-state mutation path', async () => {
    const now = Date.now();
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'persisted transcript', timestamp: now }],
      createdAt: now,
      updatedAt: now,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: null,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({
      type: 'updateTabState',
      openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
      activeTabId: 'tab-history',
      expectedTabStateRevision: 0,
    });

    const providerInternals = provider as unknown as {
      _conversations: { getActiveId(): string | null };
    };
    expect(providerInternals._conversations.getActiveId()).toBeNull();
    expect(context.workspaceState.update).not.toHaveBeenCalledWith('neko.tabState', {
      openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
      activeTabId: 'tab-history',
    });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sessionDiagnostic',
        code: 'invalid-conversation-activation',
        action: 'tab-state-mutation',
        conversationId: 'conv-history',
        tabId: 'tab-history',
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'tabState',
      revision: 0,
      tabState: { openTabs: [], activeTabId: null },
    });

    provider.dispose();
  });

  it('logs atomic tab state persistence with tab, conversation, and revision identity', async () => {
    const logger = createSpyLogger();
    setRootLogger(logger);
    const now = Date.now();
    const historicalConversation = createPiConversationFixture({
      id: 'conv-history',
      title: 'History',
      messageId: 'msg-1',
      content: 'persisted transcript',
      now,
    });
    const context = createMockContext();
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([historicalConversation]),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    expect(logger.debug).toHaveBeenCalledWith(
      'neko.agent.tab_state.persist',
      expect.objectContaining({
        tabId: 'tab-history',
        conversationId: 'conv-history',
        revision: 1,
      }),
    );

    provider.dispose();
    setRootLogger(createNoopLogger());
  });

  it('records tab state write metadata and warns when another local writer advanced it', async () => {
    const logger = createSpyLogger();
    setRootLogger(logger);
    const now = Date.now();
    const historicalConversation = createPiConversationFixture({
      id: 'conv-history',
      title: 'History',
      messageId: 'msg-1',
      content: 'persisted transcript',
      now,
    });
    const context = createMockContext({
      'neko.tabState.writeMetadata': {
        ownerId: 'other-window',
        revision: 5,
        updatedAt: 1000,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([historicalConversation]),
    });

    await context.workspaceState.update('neko.tabState.writeMetadata', {
      ownerId: 'other-window',
      revision: 6,
      updatedAt: 2000,
    });
    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 5,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'neko.agent.tab_state.stale_write_possible',
      expect.objectContaining({
        tabId: 'tab-history',
        conversationId: 'conv-history',
        loadedRevision: 5,
        currentOwnerId: 'other-window',
        currentRevision: 6,
      }),
    );
    expect(context.workspaceState.update).toHaveBeenCalledWith(
      'neko.tabState.writeMetadata',
      expect.objectContaining({
        ownerId: expect.stringMatching(/^chat-tab-state-/),
        revision: 7,
      }),
    );

    provider.dispose();
  });

  it('does not replay active conversation snapshots during webview visibility restore', async () => {
    const now = Date.now();
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'persisted transcript', timestamp: now }],
      createdAt: now,
      updatedAt: now,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: null,
      },
    });
    const webview = vscode.createMockWebview();
    let visibilityListener: (() => void) | undefined;
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn((listener: () => void) => {
        visibilityListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-history',
      tabId: 'tab-history',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
        activeTabId: 'tab-history',
      },
    });

    vi.mocked(webview.postMessage).mockClear();
    visibilityListener?.();
    await Promise.resolve();

    const postedTypes = vi
      .mocked(webview.postMessage)
      .mock.calls.map(([message]) => (message as { type?: string }).type);
    expect(postedTypes).not.toContain('activeConversation');
    expect(postedTypes).toContain('tabState');

    provider.dispose();
  });

  it('configures chat roots for extension assets, workspace, workspace cache, and media libraries', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      id: 'neko.neko-assets',
      extensionUri: vscode.Uri.file('/ext/neko-assets'),
      extensionPath: '/ext/neko-assets',
      isActive: true,
      packageJSON: {},
      extensionKind: 1,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => ['/external/media-library']),
        onDidChangeMediaLibraryRoots: vi.fn(() => ({ dispose: vi.fn() })),
      },
      activate: vi.fn(),
    } as any);
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();

    const access = createChatLocalResourceAccess(extensionUri, context);
    await access.configureChatWebview(webview as any);
    const roots = webview.options.localResourceRoots?.map((uri) => uri.fsPath);

    expect(roots).toEqual([
      '/ext/neko-agent/dist/webview',
      '/mock/workspace',
      '/external/media-library',
      '/mock/workspace/.neko/.cache',
    ]);
    expect(access.toWebviewUri(webview as any, '/external/media-library/page.jpg', 'test')).toBe(
      'file:///external/media-library/page.jpg',
    );

    access.dispose();
  });

  it('does not authorize extension-private document cache paths', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/resources/documents/doc_1/page.jpg',
      'test',
    );

    expect(uri).toBeUndefined();
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
    ]);

    access.dispose();
  });

  it('re-authorizes workspace resource cache paths when a restored webview has stale roots', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/mock/workspace/.neko/.cache/resources/documents/doc_1/page.jpg',
      'test',
    );

    expect(uri).toBe('file:///mock/workspace/.neko/.cache/resources/documents/doc_1/page.jpg');
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
      '/mock/workspace/.neko/.cache',
    ]);

    access.dispose();
  });

  it('does not project extension-private document cache paths using computed roots', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;
    const staleRoots = [vscode.Uri.file('/ext/neko-agent/dist/webview')];
    const webview = vscode.createMockWebview();
    Object.defineProperty(webview, 'options', {
      configurable: true,
      get: () => ({ localResourceRoots: staleRoots }),
      set: vi.fn(),
    });

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/resources/documents/doc_1/page.jpg',
      'neko-agent.conversation',
    );

    expect(uri).toBeUndefined();

    access.dispose();
  });

  it('rejects extension-private document cache paths when global storage uses a non-file uri scheme', async () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: {
        scheme: 'vscode-userdata',
        fsPath: '/global/neko-agent',
        path: '/global/neko-agent',
        toString: () => 'vscode-userdata:/global/neko-agent',
      },
    } as vscode.ExtensionContext;
    const webview = vscode.createMockWebview();
    webview.options = {
      localResourceRoots: [vscode.Uri.file('/ext/neko-agent/dist/webview')],
    };

    const access = createChatLocalResourceAccess(extensionUri, context);
    const uri = access.toWebviewUri(
      webview as any,
      '/global/neko-agent/resources/documents/doc_1/page.jpg',
      'neko-agent.stream-tool-result',
    );

    expect(uri).toBeUndefined();
    expect(webview.options.localResourceRoots?.map((root) => root.fsPath)).toEqual([
      '/ext/neko-agent/dist/webview',
    ]);

    access.dispose();
  });

  it('waits for local resource roots before loading chat HTML and message handlers', async () => {
    let finishConfigure!: () => void;
    const configureChatWebview = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishConfigure = resolve;
        }),
    );
    const localResourceAccess = {
      service: {},
      configureChatWebview,
      createProjector: vi.fn(),
      toWebviewUri: vi.fn(),
      toWebviewAsset: vi.fn(),
      dispose: vi.fn(),
    };
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: localResourceAccess as never,
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);

    expect(configureChatWebview).toHaveBeenCalledWith(webview);
    expect(webview.html).toBe('');
    expect(webview.onDidReceiveMessage).not.toHaveBeenCalled();

    finishConfigure();
    await Promise.resolve();

    expect(webview.html).toContain('<!DOCTYPE html>');
    expect(webview.html).toMatch(/assistant\.js\?v=[A-Za-z0-9]+/);
    expect(webview.html).toMatch(/assistant-style\.css\?v=[A-Za-z0-9]+/);
    expect(webview.onDidReceiveMessage).toHaveBeenCalled();

    provider.dispose();
  });

  it('reposts plugin availability when the webview requests config', async () => {
    vi.mocked(vscode.extensions.getExtension).mockImplementation((extensionId: string) =>
      extensionId === 'neko.neko-canvas'
        ? ({
            id: extensionId,
            extensionUri: vscode.Uri.file('/ext/neko-canvas'),
            extensionPath: '/ext/neko-canvas',
            isActive: true,
            packageJSON: {},
            extensionKind: 1,
            exports: {},
            activate: vi.fn(),
          } as any)
        : undefined,
    );
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    expect(receiveMessage).toBeDefined();

    vi.mocked(webview.postMessage).mockClear();
    await receiveMessage?.({ type: 'getConfig' });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'pluginsAvailable',
      plugins: {
        canvas: true,
        cut: false,
        sketch: false,
        model: false,
      },
    });

    provider.dispose();
  });

  it('reports missing session identity for invalid session-scoped webview messages', async () => {
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({ type: 'clearHistory' });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'sessionDiagnostic',
      code: 'missing-session-identity',
      severity: 'error',
      action: 'clearHistory',
      message: 'Session-scoped webview message "clearHistory" requires conversationId.',
    });

    provider.dispose();
  });

  it('reports protocol mismatch for a stale endpoint discovery message', async () => {
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({ type: 'projectionEndpointDiscover' });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'sessionDiagnostic',
      code: 'webview-protocol-mismatch',
      severity: 'error',
      action: 'projectionEndpointDiscover',
      message:
        'Agent Webview protocol mismatch: Extension expects v1, Webview sent no version. Reload the Webview.',
    });

    provider.dispose();
  });

  it('sets the agent editable keyboard context while the assistant input owns focus', async () => {
    const webview = vscode.createMockWebview();
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    expect(receiveMessage).toBeDefined();

    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      true,
    );

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: true,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      true,
    );

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: false });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: false,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      false,
    );

    provider.dispose();
  });

  it('does not treat keyboard ownership reports as chat readiness messages', async () => {
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    await provider.sendMessageToAssistant('queued message', false);
    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prefillInput' }),
    );

    await receiveMessage?.({ type: 'getConfig' });
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prefillInput', message: 'queued message' }),
    );

    await receiveMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-keyboard',
    });
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prefillInput', message: 'queued message' }),
    );

    provider.dispose();
  });

  it('announces a new projection endpoint epoch after each Webview replacement', async () => {
    const firstWebview = vscode.createMockWebview();
    const secondWebview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview: firstWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();
    const receiveFirstMessage = vi.mocked(firstWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveFirstMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-first',
    });
    const firstEndpointMessage = vi
      .mocked(firstWebview.postMessage)
      .mock.calls.map(([message]) => message)
      .find(
        (
          message,
        ): message is {
          type: 'projectionEndpointReady';
          protocolVersion: 1;
          endpointEpoch: string;
        } =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'projectionEndpointReady',
      );

    provider.resolveWebviewView(
      {
        webview: secondWebview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();
    const receiveSecondMessage = vi.mocked(secondWebview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveSecondMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-second',
    });
    const secondEndpointMessage = vi
      .mocked(secondWebview.postMessage)
      .mock.calls.map(([message]) => message)
      .find(
        (
          message,
        ): message is {
          type: 'projectionEndpointReady';
          protocolVersion: 1;
          endpointEpoch: string;
        } =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'projectionEndpointReady',
      );

    expect(firstEndpointMessage?.endpointEpoch).toEqual(expect.any(String));
    expect(secondEndpointMessage?.endpointEpoch).toEqual(expect.any(String));
    expect(secondEndpointMessage?.endpointEpoch).not.toBe(firstEndpointMessage?.endpointEpoch);

    provider.dispose();
  });

  it('replaces the projection endpoint once when the same Webview mounts a new realm', async () => {
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();
    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;

    await receiveMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-a',
    });
    await receiveMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-a',
    });
    await receiveMessage?.({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-b',
    });

    const endpointMessages = vi
      .mocked(webview.postMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (
          message,
        ): message is {
          type: 'projectionEndpointReady';
          protocolVersion: 1;
          realmId: string;
          endpointEpoch: string;
        } =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'projectionEndpointReady',
      );
    const firstRealmMessages = endpointMessages.filter((message) => message.realmId === 'realm-a');
    const secondRealmMessage = endpointMessages.find((message) => message.realmId === 'realm-b');

    expect(firstRealmMessages).toHaveLength(2);
    expect(firstRealmMessages[1]?.endpointEpoch).toBe(firstRealmMessages[0]?.endpointEpoch);
    expect(secondRealmMessage?.endpointEpoch).toEqual(expect.any(String));
    expect(secondRealmMessage?.endpointEpoch).not.toBe(firstRealmMessages[0]?.endpointEpoch);

    provider.dispose();
  });

  it('serves cache-only snapshots requested after Tab bindings restore', async () => {
    const now = Date.now();
    const conversationA = createPiConversationFixture({
      id: 'conv-a',
      title: 'A',
      messageId: 'msg-a',
      content: 'message-a',
      now,
    });
    const conversationB = createPiConversationFixture({
      id: 'conv-b',
      title: 'B',
      messageId: 'msg-b',
      content: 'message-b',
      now,
    });
    const context = createMockContext();
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
      piConversations: createPiConversationOptions([conversationA, conversationB]),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();
    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 1,
      conversationId: 'conv-a',
      tabId: 'tab-a',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-a', title: 'A', conversationId: 'conv-a' }],
        activeTabId: 'tab-a',
      },
    });
    await receiveMessage?.({
      type: 'activateConversation',
      activationId: 2,
      conversationId: 'conv-b',
      tabId: 'tab-b',
      expectedTabStateRevision: 1,
      tabState: {
        openTabs: [
          { id: 'tab-a', title: 'A', conversationId: 'conv-a' },
          { id: 'tab-b', title: 'B', conversationId: 'conv-b' },
        ],
        activeTabId: 'tab-b',
      },
    });
    await flushWebviewAsyncWork();
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({ type: 'getTabState' });
    await flushWebviewAsyncWork();

    const messages = vi.mocked(webview.postMessage).mock.calls.map(([message]) => message);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        type: 'tabState',
        tabState: expect.objectContaining({ activeTabId: 'tab-b' }),
      }),
    );
    expect(messages).toHaveLength(1);

    await receiveMessage?.({ type: 'getConversationSnapshot', conversationId: 'conv-a' });
    await receiveMessage?.({ type: 'getConversationSnapshot', conversationId: 'conv-b' });
    await flushWebviewAsyncWork();

    expect(vi.mocked(webview.postMessage).mock.calls.map(([message]) => message)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'conversationSnapshot',
          conversation: expect.objectContaining({ id: 'conv-a' }),
        }),
        expect.objectContaining({
          type: 'conversationSnapshot',
          conversation: expect.objectContaining({ id: 'conv-b' }),
        }),
      ]),
    );

    provider.dispose();
  });

  it('clears the agent editable keyboard context when the assistant view is hidden', async () => {
    const webview = vscode.createMockWebview();
    let visibilityListener: (() => void) | undefined;
    const view = {
      webview,
      visible: true,
      onDidChangeVisibility: vi.fn((listener: () => void) => {
        visibilityListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), createMockContext(), {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(view as never, {} as never, {} as never);
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      ((message: unknown) => void | Promise<void>) | undefined;
    await receiveMessage?.({ type: 'webviewKeyboardFocus', focused: true });
    await receiveMessage?.({ type: 'webviewKeyboardEditable', editable: true });
    vi.mocked(vscode.commands.executeCommand).mockClear();

    view.visible = false;
    visibilityListener?.();
    await Promise.resolve();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
      {
        ownerId: 'neko.agent:assistant',
        editable: false,
      } satisfies WebviewKeyboardEditableOwnerUpdate,
    );
    await Promise.resolve();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'neko.agent.keyboardEditable',
      false,
    );

    provider.dispose();
  });
});

interface PiConversationFixture {
  readonly id: string;
  readonly title: string;
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly id: string;
  }[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

function createPiConversationFixture(input: {
  readonly id: string;
  readonly title: string;
  readonly messageId: string;
  readonly content: string;
  readonly now: number;
}): PiConversationFixture {
  return {
    id: input.id,
    title: input.title,
    messages: [{ role: 'user', content: input.content, id: input.messageId }],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function createPiConversationOptions(
  initialRecords: readonly PiConversationFixture[],
): NonNullable<ChatViewProviderOptions['piConversations']> {
  const records = new Map(initialRecords.map((record) => [record.id, record]));
  const catalog = () =>
    [...records.values()].map((record) => ({
      workspaceId: 'workspace-test',
      conversationId: record.id,
      title: record.title,
      activeBranchId: 'main',
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
      messageCount: record.messages.length,
    }));
  return {
    initialCatalog: catalog(),
    authority: {
      listConversationPresentationCatalog: vi.fn(async () => catalog()),
      createConversation: vi.fn(async ({ conversationId, title }) => {
        const now = Date.now();
        records.set(conversationId, {
          id: conversationId,
          title: title ?? 'New conversation',
          messages: [],
          createdAt: now,
          updatedAt: now,
        });
        return catalog().find((record) => record.conversationId === conversationId)!;
      }),
      updateConversationTitle: vi.fn(async (conversationId, title) => {
        const record = records.get(conversationId);
        if (!record) throw new Error(`Missing conversation ${conversationId}`);
        records.set(conversationId, { ...record, title });
      }),
      deleteConversation: vi.fn(async (conversationId) => records.delete(conversationId)),
      readConversationEntries: vi.fn(async (conversationId) => {
        const record = records.get(conversationId);
        if (!record) throw new Error(`Missing conversation ${conversationId}`);
        return record.messages.flatMap<PiConversationTranscriptEntry>((message, index) => {
          const timestamp = record.createdAt + index;
          return [
            {
              type: 'message',
              id: message.id,
              parentId: record.messages[index - 1]?.id ?? null,
              timestamp: new Date(timestamp).toISOString(),
              message:
                message.role === 'assistant'
                  ? createPiAssistantMessage(projectRecordContent(message.content), timestamp)
                  : {
                      role: 'user',
                      content: projectRecordContent(message.content),
                      timestamp,
                    },
            },
          ];
        });
      }),
    },
  };
}

function createPiAssistantMessage(content: string, timestamp: number) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: content }],
    api: 'openai-completions' as const,
    provider: 'fixture',
    model: 'fixture-model',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop' as const,
    timestamp,
  };
}

function projectRecordContent(content: string): string {
  return content;
}

function createMockContext(
  initialWorkspaceState: Readonly<Record<string, unknown>> = {},
): vscode.ExtensionContext {
  const store = new Map<string, unknown>(Object.entries(initialWorkspaceState));
  const memento = {
    get: vi.fn(
      <T>(key: string, defaultValue?: T): T | undefined => (store.get(key) as T) ?? defaultValue,
    ),
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
  return {
    globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    workspaceState: memento,
    globalState: memento,
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function createImmediateLocalResourceAccess() {
  return {
    service: {},
    configureChatWebview: vi.fn(async () => {}),
    createProjector: vi.fn(),
    toWebviewUri: vi.fn(),
    toWebviewAsset: vi.fn(),
    dispose: vi.fn(),
  };
}

async function flushWebviewAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createSpyLogger(): ILogger & {
  readonly debug: ReturnType<typeof vi.fn>;
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
} {
  const logger = createNoopLogger() as ILogger & {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    child: ReturnType<typeof vi.fn>;
  };
  logger.debug = vi.fn();
  logger.info = vi.fn();
  logger.warn = vi.fn();
  logger.error = vi.fn();
  logger.child = vi.fn(() => logger);
  return logger;
}

function createNoopLogger(): ILogger {
  return {
    source: 'noop',
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => createNoopLogger(),
  };
}
