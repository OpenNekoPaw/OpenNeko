import type { ContentBlock, Message, ToolCall } from '@neko/agent-contracts';
import {
  isPiUserMessagePresentationEntry,
  parsePiUserMessagePresentation,
  type PiConversationTranscriptEntry,
  type PiUserMessagePresentation,
} from '../../pi';

export function projectPiConversationEntries(
  entries: readonly PiConversationTranscriptEntry[],
): Message[] {
  const messages: Message[] = [];
  const toolCalls = new Map<string, { readonly block: ContentBlock; readonly call: ToolCall }>();
  let activeAssistantMessage:
    | {
        readonly message: Message;
        readonly blocks: ContentBlock[];
      }
    | undefined;
  let pendingUserPresentation:
    | {
        readonly entryId: string;
        readonly presentation: PiUserMessagePresentation;
      }
    | undefined;

  for (const entry of entries) {
    if (isPiUserMessagePresentationEntry(entry)) {
      if (pendingUserPresentation) {
        throw new Error(
          `Pi transcript contains consecutive user message presentations ${pendingUserPresentation.entryId} and ${entry.id}.`,
        );
      }
      pendingUserPresentation = {
        entryId: entry.id,
        presentation: parsePiUserMessagePresentation(entry.data),
      };
      continue;
    }
    if (entry.type !== 'message') {
      if (pendingUserPresentation) {
        throw new Error(
          `Pi user message presentation ${pendingUserPresentation.entryId} is not immediately followed by its user message.`,
        );
      }
      continue;
    }
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
      if (pendingUserPresentation && entry.parentId !== pendingUserPresentation.entryId) {
        throw new Error(
          `Pi user message presentation ${pendingUserPresentation.entryId} does not own user message ${entry.id}.`,
        );
      }
      const presentation = pendingUserPresentation?.presentation;
      messages.push({
        id: entry.id,
        role: 'user',
        content: presentation?.content ?? projectUserContent(source.content),
        timestamp: source.timestamp,
        ...(presentation?.contextReferences
          ? {
              contextReferences: presentation.contextReferences.map((reference) => ({
                ...reference,
              })),
            }
          : {}),
      });
      pendingUserPresentation = undefined;
      activeAssistantMessage = undefined;
      toolCalls.clear();
      continue;
    }

    if (pendingUserPresentation) {
      throw new Error(
        `Pi user message presentation ${pendingUserPresentation.entryId} is not followed by a user message.`,
      );
    }

    if (source.role !== 'assistant') {
      throw new Error(`Pi transcript contains unsupported presentation role ${source.role}.`);
    }

    if (source.stopReason === 'error') {
      const responseText = source.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      messages.push({
        id: entry.id,
        role: 'assistant',
        content: source.errorMessage
          ? responseText.length > 0
            ? `${responseText}\n\n${source.errorMessage}`
            : source.errorMessage
          : responseText,
        timestamp: source.timestamp,
        isError: true,
      });
      activeAssistantMessage = undefined;
      toolCalls.clear();
      continue;
    }

    if (!activeAssistantMessage) {
      const blocks: ContentBlock[] = [];
      const message: Message = {
        id: entry.id,
        role: 'assistant',
        content: '',
        timestamp: source.timestamp,
      };
      activeAssistantMessage = { message, blocks };
      messages.push(message);
    }

    const blocks = activeAssistantMessage.blocks;
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
    const responseText = source.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    activeAssistantMessage.message.content += responseText;
    if (blocks.length > 0) activeAssistantMessage.message.contentBlocks = blocks;
  }

  if (pendingUserPresentation) {
    throw new Error(
      `Pi user message presentation ${pendingUserPresentation.entryId} has no user message.`,
    );
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
