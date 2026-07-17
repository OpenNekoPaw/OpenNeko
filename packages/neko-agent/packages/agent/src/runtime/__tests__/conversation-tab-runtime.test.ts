import { describe, expect, it, vi } from 'vitest';
import {
  buildChatAmbientCanvasUpdateMessage,
  buildChatContextInjectionMessage,
  buildChatExternalInputMessage,
  buildChatPluginCommandsMessage,
  buildChatRestorePlan,
  buildChatTabStateMessage,
  buildInvalidWebviewPayloadMessage,
  requireActiveConversationTabBinding,
  syncActiveConversationFromTabState,
  updateTabStateRuntime,
  type ConversationTabRuntimeEffects,
} from '../conversation-tab-runtime';

function createEffects(
  overrides: Partial<ConversationTabRuntimeEffects> = {},
): ConversationTabRuntimeEffects {
  return {
    hasConversation: (conversationId) => conversationId === 'conv-1',
    getActiveConversationId: () => 'conv-0',
    switchConversation: vi.fn(() => true),
    onConversationSwitched: vi.fn(),
    ...overrides,
  };
}

describe('conversation-tab-runtime', () => {
  it('requires an exact active conversation Tab binding', () => {
    expect(
      requireActiveConversationTabBinding(
        {
          openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
          activeTabId: 'tab-1',
        },
        'send context payload',
      ),
    ).toEqual({ tabId: 'tab-1', conversationId: 'conv-1' });

    expect(() =>
      requireActiveConversationTabBinding(
        { openTabs: [], activeTabId: null },
        'send context payload',
      ),
    ).toThrow('Cannot send context payload without an active conversation Tab.');
    expect(() =>
      requireActiveConversationTabBinding(
        {
          openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
          activeTabId: 'tab-missing',
        },
        'send context payload',
      ),
    ).toThrow('Cannot send context payload without an active conversation Tab.');
  });

  it('switches active conversation to the active tab conversation', () => {
    const effects = createEffects();
    const result = syncActiveConversationFromTabState(
      {
        tabState: {
          openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
          activeTabId: 'tab-1',
        },
      },
      effects,
    );

    expect(result).toEqual({ kind: 'switched', conversationId: 'conv-1' });
    expect(effects.switchConversation).toHaveBeenCalledWith('conv-1');
    expect(effects.onConversationSwitched).toHaveBeenCalledWith('conv-1');
  });

  it('skips when the active tab conversation is already active', () => {
    const effects = createEffects({ getActiveConversationId: () => 'conv-1' });

    expect(
      syncActiveConversationFromTabState(
        {
          tabState: {
            openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
            activeTabId: 'tab-1',
          },
        },
        effects,
      ),
    ).toEqual({ kind: 'skipped', reason: 'already-active', conversationId: 'conv-1' });
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('skips when the restored tab points at a missing conversation', () => {
    const effects = createEffects({ hasConversation: () => false });

    expect(
      syncActiveConversationFromTabState(
        {
          tabState: {
            openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
            activeTabId: 'tab-1',
          },
        },
        effects,
      ),
    ).toEqual({ kind: 'skipped', reason: 'no-active-tab-conversation' });
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('recognizes active Character Dialogue tabs without switching ordinary conversations', () => {
    const effects = createEffects({
      hasConversation: () => false,
      hasCharacterDialogueSession: (sessionId) => sessionId === 'npc-session-1',
    });

    expect(
      syncActiveConversationFromTabState(
        {
          tabState: {
            openTabs: [
              {
                id: 'tab-npc',
                title: 'NPC: Xiaoju',
                conversationId: 'npc-session-1',
                kind: 'character-dialogue',
              },
            ],
            activeTabId: 'tab-npc',
          },
        },
        effects,
      ),
    ).toEqual({ kind: 'character-dialogue-active', sessionId: 'npc-session-1' });
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('recognizes active Embody Character tabs without switching ordinary conversations', () => {
    const effects = createEffects({
      hasConversation: () => false,
      hasEmbodyCharacterSession: (sessionId) => sessionId === 'embody-session-1',
    });

    expect(
      syncActiveConversationFromTabState(
        {
          tabState: {
            openTabs: [
              {
                id: 'tab-embody',
                title: 'Embody: Xiaoju',
                conversationId: 'embody-session-1',
                kind: 'embody-character',
              },
            ],
            activeTabId: 'tab-embody',
          },
        },
        effects,
      ),
    ).toEqual({ kind: 'embody-character-active', sessionId: 'embody-session-1' });
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('projects tab state updates and then runs active conversation sync', () => {
    const tab = { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' };
    const effects = createEffects();

    expect(updateTabStateRuntime({ openTabs: [tab], activeTabId: 'tab-1' }, effects)).toEqual({
      tabState: {
        openTabs: [tab],
        activeTabId: 'tab-1',
      },
      sync: { kind: 'switched', conversationId: 'conv-1' },
    });
    expect(effects.switchConversation).toHaveBeenCalledWith('conv-1');
  });

  it('clears the active conversation when the persisted tab state is empty', () => {
    const effects = createEffects({
      getActiveConversationId: () => 'conv-1',
      shouldClearActiveConversationForEmptyTabState: () => true,
      clearActiveConversation: vi.fn(),
    });

    expect(updateTabStateRuntime({ openTabs: [], activeTabId: null }, effects)).toEqual({
      tabState: {
        openTabs: [],
        activeTabId: null,
      },
      sync: { kind: 'active-conversation-cleared' },
    });
    expect(effects.clearActiveConversation).toHaveBeenCalledTimes(1);
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('preserves the active conversation when an empty tab state is not clearable', () => {
    const effects = createEffects({
      getActiveConversationId: () => 'conv-1',
      shouldClearActiveConversationForEmptyTabState: () => false,
      clearActiveConversation: vi.fn(),
    });

    expect(updateTabStateRuntime({ openTabs: [], activeTabId: null }, effects)).toEqual({
      tabState: {
        openTabs: [],
        activeTabId: null,
      },
      sync: {
        kind: 'skipped',
        reason: 'empty-tab-state-preserved-active-conversation',
        conversationId: 'conv-1',
      },
    });
    expect(effects.clearActiveConversation).not.toHaveBeenCalled();
    expect(effects.switchConversation).not.toHaveBeenCalled();
  });

  it('builds a webview restore plan with ordered host effects', () => {
    const tab = { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' };

    expect(
      buildChatRestorePlan({
        tabState: { openTabs: [tab], activeTabId: 'tab-1' },
        hasWebview: true,
        pluginCommands: [
          {
            id: 'plugin.cmd',
            name: 'Plugin command',
            description: 'Run plugin command',
            extensionId: 'neko.plugin',
          },
        ],
      }),
    ).toEqual({
      actions: [
        { type: 'sendConversationList' },
        { type: 'sendSettings', conversationId: 'conv-1' },
        {
          type: 'postTabState',
          message: {
            type: 'tabState',
            tabState: { openTabs: [tab], activeTabId: 'tab-1' },
          },
        },
        { type: 'sendActiveConversationTasks' },
        { type: 'sendAgentStateSnapshot' },
        {
          type: 'postPluginCommands',
          message: {
            type: 'pluginCommands',
            commands: [
              {
                id: 'plugin.cmd',
                name: 'Plugin command',
                description: 'Run plugin command',
                extensionId: 'neko.plugin',
              },
            ],
          },
        },
      ],
    });
  });

  it('keeps restore host effects minimal when no webview is attached', () => {
    expect(
      buildChatRestorePlan({
        tabState: { openTabs: [], activeTabId: null },
        hasWebview: false,
      }),
    ).toEqual({
      actions: [{ type: 'sendConversationList' }],
    });
  });

  it('projects chat provider webview messages at the runtime boundary', () => {
    const tab = { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' };
    const payload = {
      source: 'canvas' as const,
      kind: 'selection' as const,
      title: 'Selected node',
      metadata: { nodeId: 'node-1' },
    };

    expect(
      buildChatAmbientCanvasUpdateMessage({
        nodes: [{ id: 'node-1', label: 'Node 1', kind: 'image' }],
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'ambientCanvasUpdate',
      nodes: [{ id: 'node-1', label: 'Node 1', kind: 'image' }],
      conversationId: 'conv-1',
    });
    expect(
      buildChatContextInjectionMessage(payload, { tabId: 'tab-1', conversationId: 'conv-1' }),
    ).toEqual({
      type: 'injectContext',
      tabId: 'tab-1',
      conversationId: 'conv-1',
      payload,
    });
    expect(buildChatExternalInputMessage({ message: 'run', autoSend: true })).toEqual({
      type: 'externalMessage',
      message: 'run',
    });
    expect(buildChatExternalInputMessage({ message: 'draft', autoSend: false })).toEqual({
      type: 'prefillInput',
      message: 'draft',
    });
    expect(
      buildChatPluginCommandsMessage([
        {
          id: 'plugin.cmd',
          name: 'Plugin command',
          description: 'Run plugin command',
          extensionId: 'neko.plugin',
        },
      ]),
    ).toEqual({
      type: 'pluginCommands',
      commands: [
        {
          id: 'plugin.cmd',
          name: 'Plugin command',
          description: 'Run plugin command',
          extensionId: 'neko.plugin',
        },
      ],
    });
    expect(buildChatTabStateMessage({ openTabs: [tab], activeTabId: 'tab-1' })).toEqual({
      type: 'tabState',
      tabState: { openTabs: [tab], activeTabId: 'tab-1' },
    });
    expect(buildInvalidWebviewPayloadMessage({ type: 'removedMessage', value: 1 })).toEqual({
      type: 'sessionDiagnostic',
      code: 'invalid-webview-message',
      severity: 'error',
      action: 'removedMessage',
      message: 'Invalid Agent Webview message "removedMessage"; payload keys: type, value.',
    });
    expect(buildInvalidWebviewPayloadMessage({ type: 'projectionEndpointDiscover' })).toEqual({
      type: 'sessionDiagnostic',
      code: 'webview-protocol-mismatch',
      severity: 'error',
      action: 'projectionEndpointDiscover',
      message:
        'Agent Webview protocol mismatch: Extension expects v1, Webview sent no version. Reload the Webview.',
    });
  });
});
