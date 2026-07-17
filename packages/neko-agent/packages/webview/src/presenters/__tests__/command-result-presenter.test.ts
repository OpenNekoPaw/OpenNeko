import { describe, expect, it } from 'vitest';
import {
  projectCloseCurrentConversationTab,
  projectSlashCommandResultMessage,
} from '../command-result-presenter';

describe('command result presenter', () => {
  it('projects command failures to assistant error messages', () => {
    expect(
      projectSlashCommandResultMessage(
        {
          type: 'slashCommandResult',
          conversationId: 'conv-1',
          command: 'bad',
          success: false,
          error: 'Command failed',
        },
        { now: () => 1000 },
      ),
    ).toEqual({
      effects: [
        {
          type: 'appendAssistantMessage',
          message: {
            id: '1000',
            role: 'assistant',
            content: 'Command failed',
            timestamp: 1000,
            isError: true,
          },
        },
      ],
    });
  });

  it('projects status data to a markdown assistant message', () => {
    expect(
      projectSlashCommandResultMessage(
        {
          type: 'slashCommandResult',
          conversationId: 'conv-1',
          command: 'status',
          success: true,
          action: 'showStatus',
          data: {
            provider: 'openai',
            model: 'gpt',
            conversationCount: 2,
            messageCount: 5,
            tokenCount: 123,
            activeSkill: 'review',
            executionMode: 'ask',
          },
        },
        { now: () => 1000 },
      ).effects[0],
    ).toMatchObject({
      type: 'appendAssistantMessage',
      message: {
        content: `**Status:**
- Provider: openai
- Model: gpt
- Conversations: 2
- Messages in current: 5
- Context tokens: 123
- Execution mode: ask`,
      },
    });
  });

  it('projects execution mode changes and chat-only actions to effects', () => {
    expect(
      projectSlashCommandResultMessage(
        {
          type: 'slashCommandResult',
          conversationId: 'conv-1',
          command: 'plan',
          success: true,
          action: 'updateExecutionMode',
          message: 'Execution mode changed to plan',
          data: { executionMode: 'plan' },
        },
        { now: () => 1000 },
      ).effects,
    ).toMatchObject([
      { type: 'appendAssistantMessage', message: { content: 'Execution mode changed to plan' } },
    ]);

    expect(
      projectSlashCommandResultMessage({
        type: 'slashCommandResult',
        conversationId: 'conv-1',
        command: 'tasks',
        success: true,
        action: 'showTasks',
      }).effects,
    ).toEqual([{ type: 'setActiveTab', activeTab: 'chat' }]);
  });

  it('projects resume conversation data to a markdown assistant message', () => {
    expect(
      projectSlashCommandResultMessage(
        {
          type: 'slashCommandResult',
          conversationId: 'conv-1',
          command: 'resume',
          success: true,
          action: 'resumeConversation',
          data: {
            conversations: [
              { title: 'First', messageCount: 3 },
              { title: 'Second', messageCount: 4 },
            ],
          },
        },
        { now: () => 1000 },
      ).effects[0],
    ).toMatchObject({
      type: 'appendAssistantMessage',
      message: {
        content:
          '**Recent Conversations:**\n1. **First** (3 messages)\n2. **Second** (4 messages)\n\nClick on a conversation in the sidebar to resume it.',
      },
    });
  });

  it('projects current tab close state without depending on React state setters', () => {
    expect(
      projectCloseCurrentConversationTab({
        activeConversationId: 'conv-1',
        openTabs: [
          { id: 'tab-1', title: 'One', conversationId: 'conv-1' },
          { id: 'tab-2', title: 'Two', conversationId: 'conv-2' },
        ],
      }),
    ).toEqual({
      updated: true,
      openTabs: [{ id: 'tab-2', title: 'Two', conversationId: 'conv-2' }],
      activeTabId: 'tab-2',
      activeConversationId: 'conv-2',
    });
  });
});
