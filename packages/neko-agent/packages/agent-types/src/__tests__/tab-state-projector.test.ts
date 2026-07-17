import { describe, expect, it } from 'vitest';
import {
  buildTabStateMessage,
  normalizeTabState,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
} from '..';

describe('tab state projector', () => {
  it('normalizes unknown persisted tab state', () => {
    expect(
      normalizeTabState({
        openTabs: [
          { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' },
          { id: 'bad', title: 'Missing conversation' },
          null,
        ],
        activeTabId: 'tab-1',
      }),
    ).toEqual({
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    });

    expect(normalizeTabState({ openTabs: 'bad', activeTabId: 1 })).toEqual({
      openTabs: [],
      activeTabId: null,
    });
  });

  it('projects tab updates without sharing mutable tab references', () => {
    const tab = { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' };
    const projected = projectTabStateUpdate({ openTabs: [tab], activeTabId: 'tab-1' });

    expect(projected).toEqual({ openTabs: [tab], activeTabId: 'tab-1' });
    expect(projected.openTabs[0]).not.toBe(tab);
  });

  it('preserves Embody Character session metadata', () => {
    const embodyTab = {
      id: 'tab-embody',
      title: 'Embody: 小橘',
      conversationId: 'conv-embody',
      kind: 'embody-character' as const,
      embodyCharacterSession: {
        sessionId: 'embody-neko-story-char-xiaoju',
        entityId: 'char-xiaoju',
        displayName: '小橘',
        profile: {
          entityRef: {
            entityId: 'char-xiaoju',
            entityKind: 'character' as const,
            projectRoot: '/workspace',
            source: 'neko-story',
          },
          displayName: '小橘',
          aliases: [],
          facts: [],
          sparsity: 'thin' as const,
        },
        source: 'neko-story',
        scopeSummary: ['project: current project'],
        summary: 'User embodies 小橘.',
        startedAt: '2026-06-02T00:00:00.000Z',
        status: 'active' as const,
      },
    };

    expect(
      normalizeTabState({
        openTabs: [embodyTab],
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      openTabs: [embodyTab],
      activeTabId: 'tab-embody',
    });
  });

  it('resolves active Embody Character sessions without ordinary conversation switching', () => {
    const tabState = {
      openTabs: [
        {
          id: 'tab-embody',
          title: 'Embody: 小橘',
          conversationId: 'embody-session-1',
          kind: 'embody-character' as const,
        },
      ],
      activeTabId: 'tab-embody',
    };

    expect(
      resolveActiveTabConversationId({
        tabState,
        hasConversation: () => false,
        hasEmbodyCharacterSession: (sessionId) => sessionId === 'embody-session-1',
      }),
    ).toBe('embody-session-1');
  });

  it('resolves the active conversation only when the tab and conversation exist', () => {
    const tabState = {
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    };

    expect(
      resolveActiveTabConversationId({
        tabState,
        hasConversation: (conversationId) => conversationId === 'conv-1',
      }),
    ).toBe('conv-1');

    expect(
      resolveActiveTabConversationId({
        tabState,
        hasConversation: () => false,
      }),
    ).toBeNull();
  });

  it('builds a tabState webview message', () => {
    expect(
      buildTabStateMessage(
        {
          openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
          activeTabId: 'tab-1',
        },
        7,
      ),
    ).toEqual({
      type: 'tabState',
      revision: 7,
      tabState: {
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
        activeTabId: 'tab-1',
      },
    });
  });
});
