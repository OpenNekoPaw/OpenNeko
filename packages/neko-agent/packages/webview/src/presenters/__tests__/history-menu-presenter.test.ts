import { describe, expect, it } from 'vitest';
import type { AgentState, ConversationSummary, OpenTab } from '@neko-agent/types';
import { projectHistoryCleanup, projectHistoryConversationItems } from '../history-menu-presenter';

describe('history menu presenter', () => {
  it('protects open and running conversations during cleanup', () => {
    const conversations: ConversationSummary[] = [
      { id: 'conv-open', title: 'Open', messageCount: 2, updatedAt: 10 },
      { id: 'conv-running', title: 'Running', messageCount: 4, updatedAt: 20 },
      { id: 'conv-done', title: 'Done', messageCount: 3, updatedAt: 30 },
      { id: 'conv-empty', title: 'Empty', messageCount: 0, updatedAt: 40 },
    ];
    const openTabs: OpenTab[] = [{ id: 'tab-open', title: 'Open', conversationId: 'conv-open' }];
    const agentState: AgentState = { phase: 'acting', toolName: 'read_file', startedAt: 20 };

    const items = projectHistoryConversationItems({
      conversations,
      openTabs,
      activeConversationId: 'conv-open',
      activeStreaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      streamingByConversation: new Map([
        [
          'conv-running',
          { streamingMessageId: 'assistant-1', isThinking: true, queuedMessageCount: 0 },
        ],
      ]),
      agentStateByConversation: new Map([['conv-running', agentState]]),
    });

    expect(items).toMatchObject([
      { id: 'conv-open', canDelete: false, protectedReason: 'open' },
      { id: 'conv-running', executionStatus: 'running', protectedReason: 'running' },
      { id: 'conv-done', executionStatus: 'completed', canDelete: true },
      { id: 'conv-empty', canDelete: true },
    ]);
    expect(projectHistoryCleanup({ historyItems: items })).toEqual({
      deletableConversationIds: ['conv-done', 'conv-empty'],
      protectedConversationCount: 2,
    });
  });
});
