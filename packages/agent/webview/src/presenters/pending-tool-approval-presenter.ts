import type { Message, ToolCall } from '@neko/agent-contracts';
import { projectToolCallDisplayState } from './tool-call-presenter';

export interface PendingToolApprovalProjection {
  readonly toolCall: ToolCall;
  readonly summary: string;
}

export function projectPendingToolApprovals(
  messages: readonly Message[],
): readonly PendingToolApprovalProjection[] {
  const toolCallsById = new Map<
    string,
    PendingToolApprovalProjection & { readonly order: number }
  >();
  let order = 0;

  for (const message of messages) {
    for (const block of message.contentBlocks ?? []) {
      const toolCall = block.type === 'tool_call' ? block.toolCall : undefined;
      if (!toolCall) continue;
      const existing = toolCallsById.get(toolCall.id);
      toolCallsById.set(toolCall.id, {
        toolCall,
        summary: projectToolCallDisplayState(toolCall, block.toolProgress).summary,
        order: existing?.order ?? order++,
      });
    }
  }

  return [...toolCallsById.values()]
    .filter(({ toolCall }) => toolCall.pendingConfirmation === true)
    .sort((left, right) => left.order - right.order)
    .map(({ toolCall, summary }) => ({ toolCall, summary }));
}
