import { describe, expect, it } from 'vitest';
import type { Message, ToolCall } from '@neko/agent-contracts';
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

  it('projects null active conversations', async () => {
    await expect(buildActiveConversationMessage(null)).resolves.toEqual({
      type: 'activeConversation',
      conversation: null,
    });
  });

  it('projects active conversation resources through a locator resolver', async () => {
    const contentLocator = {
      kind: 'workspace-file' as const,
      path: 'images/out.png',
    };
    const toolCall: ToolCall = {
      id: 'tool-1',
      name: 'GenerateImage',
      arguments: {},
      result: {
        success: true,
        data: { contentLocator, url: '/tmp/out.png', mimeType: 'image/png' },
      },
    };
    const messageWithToolCalls = {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [toolCall],
    } satisfies Message & { readonly toolCalls: readonly ToolCall[] };

    await expect(
      buildActiveConversationMessage(
        {
          id: 'conv-1',
          title: 'Assets',
          messages: [messageWithToolCalls],
          updatedAt: 100,
        },
        {
          resolveDisplayLocator: async () => ({
            status: 'ready',
            descriptor: previewDescriptor(contentLocator),
          }),
        },
      ),
    ).resolves.toEqual({
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
                  data: {
                    contentLocator,
                    url: 'images/out.png',
                    mimeType: 'image/png',
                    previewDescriptor: previewDescriptor(contentLocator),
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });
});

function previewDescriptor(contentLocator: {
  readonly kind: 'workspace-file';
  readonly path: string;
}) {
  return {
    descriptorId: 'agent-display:attachment-1:image-1',
    sourceFingerprint: 'sha256:image-1',
    contentLocator,
    url: `openneko://resource/${'a'.repeat(32)}`,
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: 'out.png',
    byteLength: 42,
  };
}
