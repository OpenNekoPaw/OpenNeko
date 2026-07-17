import type { PiConversationTranscriptEntry } from '@neko/agent/pi';
import type { ContentBlock, Message, ToolCall } from '@neko-agent/types';

export function projectPiConversationEntries(
  entries: readonly PiConversationTranscriptEntry[],
): Message[] {
  const messages: Message[] = [];
  const toolCalls = new Map<string, { readonly block: ContentBlock; readonly call: ToolCall }>();

  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const source = entry.message;
    if (source.role === 'toolResult') {
      const target = toolCalls.get(source.toolCallId);
      if (!target) {
        throw new Error(
          `Pi transcript contains tool result ${source.toolCallId} without its assistant tool call.`,
        );
      }
      const text = projectContent(source.content);
      const result = {
        success: !source.isError,
        data: source.details ?? text,
        ...(source.isError ? { error: text || `Tool ${source.toolName} failed.` } : {}),
      };
      target.call.result = result;
      target.block.toolCall = { ...target.call, result };
      continue;
    }

    if (source.role === 'user') {
      messages.push({
        id: entry.id,
        role: 'user',
        content: projectUserContent(source.content),
        timestamp: source.timestamp,
      });
      continue;
    }

    if (source.role !== 'assistant') {
      throw new Error(`Pi transcript contains unsupported presentation role ${source.role}.`);
    }

    const blocks: ContentBlock[] = [];
    for (const [index, part] of source.content.entries()) {
      if (part.type === 'text') {
        blocks.push({
          id: `${entry.id}:text:${index}`,
          type: 'text',
          timestamp: source.timestamp,
          content: part.text,
          isStreaming: false,
        });
        continue;
      }
      if (part.type === 'thinking') {
        blocks.push({
          id: `${entry.id}:thinking:${index}`,
          type: 'thinking',
          timestamp: source.timestamp,
          thinking: part.redacted ? '' : part.thinking,
          isThinkingComplete: true,
        });
        continue;
      }
      const call: ToolCall = {
        id: part.id,
        name: part.name,
        arguments: part.arguments,
      };
      const block: ContentBlock = {
        id: `${entry.id}:tool:${part.id}`,
        type: 'tool_call',
        timestamp: source.timestamp,
        toolCall: call,
      };
      blocks.push(block);
      toolCalls.set(part.id, { block, call });
    }
    messages.push({
      id: entry.id,
      role: 'assistant',
      content: source.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
      timestamp: source.timestamp,
      ...(source.stopReason === 'error' ? { isError: true } : {}),
      ...(blocks.length === 0 ? {} : { contentBlocks: blocks }),
    });
  }

  return messages;
}

function projectUserContent(
  content:
    | string
    | readonly (
        | { readonly type: 'text'; readonly text: string }
        | { readonly type: 'image'; readonly mimeType: string }
      )[],
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : `[Image: ${part.mimeType}]`))
    .join('\n');
}

function projectContent(
  content: readonly { readonly type: string; readonly text?: string }[],
): string {
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '[Image]')).join('\n');
}
