import { describe, expect, it } from 'vitest';
import type { AgentState, Message, OpenTab } from '@neko-agent/types';
import {
  applyUserMessageToTabState,
  generateConversationTitle,
  projectDisplayTabs,
} from '../tab-display-presenter';

describe('tab display presenter', () => {
  it('generates compact conversation titles from user content', () => {
    expect(generateConversationTitle('  Plan the opening sequence  ')).toBe(
      'Plan the opening sequence',
    );
    expect(
      generateConversationTitle(
        'Create a storyboard shot list for the rainy rooftop chase with lighting notes',
      ),
    ).toBe('Create a storyboard shot list for the rainy...');
    expect(generateConversationTitle('   ')).toBe('New Chat');
  });

  it('applies the first user message to tab title and conversation summary immediately', () => {
    const projected = applyUserMessageToTabState({
      openTabs: [{ id: 'tab-1', title: 'New Chat', conversationId: 'conv-1' }],
      conversations: [{ id: 'conv-1', title: 'New Chat', messageCount: 0, updatedAt: 1 }],
      conversationId: 'conv-1',
      messageContent: 'Draft the scene outline',
      timestamp: 100,
    });

    expect(projected.openTabs).toEqual([
      { id: 'tab-1', title: 'Draft the scene outline', conversationId: 'conv-1' },
    ]);
    expect(projected.conversations).toEqual([
      { id: 'conv-1', title: 'Draft the scene outline', messageCount: 1, updatedAt: 100 },
    ]);
  });

  it('projects running and completed tab status without mutating persisted tabs', () => {
    const tabs: OpenTab[] = [
      { id: 'tab-1', title: 'Active', conversationId: 'conv-1' },
      { id: 'tab-2', title: 'Done', conversationId: 'conv-2' },
      { id: 'tab-3', title: 'Agent', conversationId: 'conv-3' },
    ];
    const activeMessages: Message[] = [
      { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
    ];
    const agentState: AgentState = { phase: 'acting', toolName: 'read_file', startedAt: 2 };

    const projected = projectDisplayTabs({
      openTabs: tabs,
      conversations: [{ id: 'conv-2', title: 'Done', messageCount: 2, updatedAt: 2 }],
      activeConversationId: 'conv-1',
      activeMessages,
      activeStreaming: { streamingMessageId: 'assistant-1', isThinking: false },
      messagesByConversation: new Map(),
      streamingByConversation: new Map(),
      agentStateByConversation: new Map([['conv-3', agentState]]),
    });

    expect(projected.map((tab) => tab.displayStatus)).toEqual(['running', 'completed', 'running']);
    expect(tabs[0]).not.toHaveProperty('displayStatus');
  });

  it('prefers canonical render snapshots for background tab status', () => {
    const projected = projectDisplayTabs({
      openTabs: [{ id: 'tab-1', title: 'Background', conversationId: 'conv-1' }],
      conversations: [],
      activeConversationId: null,
      activeMessages: [],
      activeStreaming: { streamingMessageId: null, isThinking: false },
      messagesByConversation: new Map([
        ['conv-1', [{ id: 'legacy', role: 'assistant', content: 'done', timestamp: 1 }]],
      ]),
      streamingByConversation: new Map([
        ['conv-1', { streamingMessageId: null, isThinking: false }],
      ]),
      renderSnapshotsByConversation: new Map([
        [
          'conv-1',
          {
            messages: [],
            streaming: { streamingMessageId: 'stream-1', isThinking: true },
          },
        ],
      ]),
      agentStateByConversation: new Map(),
    });

    expect(projected[0]?.displayStatus).toBe('running');
  });

  it('does not carry stale displayStatus from persisted tab records', () => {
    const tabs = [
      {
        id: 'tab-1',
        title: 'Generated cat image',
        conversationId: 'conv-1',
        displayStatus: 'running',
      },
    ] as unknown as OpenTab[];

    const projected = projectDisplayTabs({
      openTabs: tabs,
      conversations: [],
      activeConversationId: null,
      activeMessages: [],
      activeStreaming: { streamingMessageId: null, isThinking: false },
      messagesByConversation: new Map(),
      streamingByConversation: new Map(),
      agentStateByConversation: new Map(),
    });

    expect(projected[0]).not.toHaveProperty('displayStatus');
  });
});
