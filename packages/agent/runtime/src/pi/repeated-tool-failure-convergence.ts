import type { ShouldStopAfterTurnContext } from '@earendil-works/pi-agent-core';
import { stableStringify } from '@neko/shared';

export class RepeatedToolFailureConvergence {
  private previousSignature: string | undefined;

  observe(context: ShouldStopAfterTurnContext): string | undefined {
    const failure = singleToolFailure(context);
    if (failure === undefined) {
      this.previousSignature = undefined;
      return undefined;
    }
    if (failure.signature !== this.previousSignature) {
      this.previousSignature = failure.signature;
      return undefined;
    }
    this.previousSignature = undefined;
    return `Agent stopped after ${failure.toolName} repeated the same failed Tool call twice consecutively.`;
  }
}

function singleToolFailure(
  context: ShouldStopAfterTurnContext,
): { readonly signature: string; readonly toolName: string } | undefined {
  if (context.message.role !== 'assistant' || context.toolResults.length !== 1) return undefined;
  const toolCalls = context.message.content.filter((item) => item.type === 'toolCall');
  if (toolCalls.length !== 1) return undefined;
  const [toolCall] = toolCalls;
  const [toolResult] = context.toolResults;
  if (
    toolCall === undefined ||
    toolResult === undefined ||
    !toolResult.isError ||
    toolResult.toolCallId !== toolCall.id ||
    toolResult.toolName !== toolCall.name
  ) {
    return undefined;
  }
  return {
    toolName: toolCall.name,
    signature: stableStringify({
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      content: toolResult.content,
    }),
  };
}
