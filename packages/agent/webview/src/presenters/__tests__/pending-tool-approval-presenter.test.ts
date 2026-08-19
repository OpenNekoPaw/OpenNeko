import { describe, expect, it } from 'vitest';
import type { Message, ToolCall } from '@neko/agent-contracts';
import { projectPendingToolApprovals } from '../pending-tool-approval-presenter';

describe('projectPendingToolApprovals', () => {
  it('retains every pending Tool Call in transcript order', () => {
    const first = toolCall('tool-a', true);
    const resolved = toolCall('tool-resolved', false);
    const second = toolCall('tool-b', true);

    expect(
      projectPendingToolApprovals([
        assistantMessage('message-a', [first, resolved]),
        assistantMessage('message-b', [second, first]),
      ]).map((approval) => approval.toolCall.id),
    ).toEqual(['tool-a', 'tool-b']);
  });

  it('removes a Tool Call as soon as the canonical projection is no longer pending', () => {
    expect(
      projectPendingToolApprovals([
        assistantMessage('message-a', [toolCall('tool-a', true)]),
        assistantMessage('message-b', [toolCall('tool-a', false)]),
      ]),
    ).toEqual([]);
  });
});

function assistantMessage(id: string, toolCalls: readonly ToolCall[]): Message {
  return {
    id,
    role: 'assistant',
    content: '',
    timestamp: 1,
    contentBlocks: toolCalls.map((toolCall, index) => ({
      id: `${id}-block-${index}`,
      type: 'tool_call',
      timestamp: index,
      toolCall,
    })),
  };
}

function toolCall(id: string, pendingConfirmation: boolean): ToolCall {
  return {
    id,
    name: 'GenerateImage',
    arguments: { prompt: id },
    pendingConfirmation,
    confirmation: {
      action: 'Generate image',
      description: `Approve ${id}`,
      details: {},
    },
  };
}
