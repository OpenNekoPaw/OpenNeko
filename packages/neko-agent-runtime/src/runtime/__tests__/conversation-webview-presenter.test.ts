import { describe, expect, it } from 'vitest';
import type { Message, ToolCall } from '@neko-agent/types';
import {
  buildActiveConversationMessage,
  buildConversationListMessage,
} from '../../session/conversation-host-message';

describe('conversation-host-message', () => {
  it('projects conversation list payloads', () => {
    expect(
      buildConversationListMessage([
        {
          id: 'conv-1',
          title: 'Plan',
          messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
          updatedAt: 100,
        },
      ]),
    ).toEqual({
      type: 'conversationList',
      conversations: [{ id: 'conv-1', title: 'Plan', messageCount: 1, updatedAt: 100 }],
    });
  });

  it('projects null active conversations', () => {
    expect(buildActiveConversationMessage(null)).toEqual({
      type: 'activeConversation',
      conversation: null,
    });
  });

  it('projects active conversation resource urls through host resolver', () => {
    const toolCall: ToolCall = {
      id: 'tool-1',
      name: 'GenerateImage',
      arguments: {},
      result: { success: true, data: { url: '/tmp/out.png' } },
    };
    const messageWithToolCalls = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [toolCall],
    } satisfies Message & { readonly toolCalls: readonly ToolCall[] };

    expect(
      buildActiveConversationMessage(
        {
          id: 'conv-1',
          title: 'Assets',
          messages: [messageWithToolCalls],
          updatedAt: 100,
        },
        { resolveLocalMediaPath: (filePath) => `webview://${filePath}` },
      ),
    ).toEqual({
      type: 'activeConversation',
      conversation: {
        id: 'conv-1',
        title: 'Assets',
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: '',
            timestamp: 1,
            toolCalls: [
              {
                id: 'tool-1',
                name: 'GenerateImage',
                arguments: {},
                result: {
                  success: true,
                  data: { url: 'webview:///tmp/out.png' },
                },
              },
            ],
          },
        ],
      },
    });
  });
});
