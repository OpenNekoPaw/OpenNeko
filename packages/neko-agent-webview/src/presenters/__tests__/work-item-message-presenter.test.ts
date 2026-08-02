import { describe, expect, it } from 'vitest';
import type { ChildRunScope } from '@neko-agent/contracts';
import type { Message } from '@neko-agent/contracts';
import {
  attachWorkItemToMessageByToolCall,
  projectConversationWorkItemsFromMessages,
  projectSubAgentToolResultToWorkItem,
} from '../work-item-message-presenter';

describe('subagent work item message presenter', () => {
  it('rehydrates only explicitly scoped Subagent activity from Tool results', () => {
    const scope = subAgentScope('conv-1', 'parent-1', 'sub-1');
    const messages: Message[] = [
      {
        id: 'message-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'subagent',
              arguments: {},
              result: {
                success: true,
                data: {
                  id: 'sub-1',
                  parentAgentId: 'parent-1',
                  status: 'completed',
                  response: 'done',
                  scope,
                },
              },
            },
          },
        ],
      },
    ];

    const projection = projectConversationWorkItemsFromMessages({
      conversationId: 'conv-1',
      messages,
      now: () => 2,
    });

    expect(projection.messages[0]?.workItemIds).toEqual(['sub-1']);
    expect(projection.workItems).toEqual([
      expect.objectContaining({
        id: 'sub-1',
        kind: 'subagent',
        parentMessageId: 'message-1',
        parentToolCallId: 'tool-1',
      }),
    ]);
    expect(projection).not.toHaveProperty('backgroundTaskWorkItems');
  });

  it('rejects Subagent result data without matching runtime ownership', () => {
    expect(() =>
      projectSubAgentToolResultToWorkItem({
        id: 'sub-1',
        conversationId: 'conv-1',
        parentMessageId: 'message-1',
        data: {
          status: 'completed',
          scope: subAgentScope('conv-2', 'parent-1', 'sub-1'),
        },
      }),
    ).toThrow(/matching scope/i);
  });

  it('attaches activity only to the message owning the exact Tool Call', () => {
    const result = attachWorkItemToMessageByToolCall(
      [
        {
          id: 'message-1',
          contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-1' } }],
        },
        {
          id: 'message-2',
          contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-2' } }],
        },
      ],
      { toolCallId: 'tool-2', workItemId: 'sub-1' },
    );

    expect(result).toEqual({
      attached: true,
      messages: [
        expect.not.objectContaining({ workItemIds: expect.anything() }),
        expect.objectContaining({ id: 'message-2', workItemIds: ['sub-1'] }),
      ],
    });
  });
});

function subAgentScope(
  conversationId: string,
  parentRunId: string,
  childRunId: string,
): ChildRunScope {
  return {
    conversationId,
    runId: parentRunId,
    parentRunId,
    childRunId,
    childKind: 'subagent',
  };
}
