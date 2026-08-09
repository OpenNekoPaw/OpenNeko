import { describe, expect, it } from 'vitest';

import type { PiConversationTranscriptEntry } from '../../../pi';
import { projectPiConversationEntries } from '../pi-conversation-history-projector';

describe('projectPiConversationEntries', () => {
  it('projects one clean referenced user message from the structured presentation entry', () => {
    const entries: PiConversationTranscriptEntry[] = [
      {
        type: 'custom',
        id: 'presentation-entry',
        parentId: null,
        timestamp: new Date(5).toISOString(),
        customType: 'openneko.user-message-presentation',
        data: {
          turnId: 'turn-1',
          content: '分析图片',
          contextReferences: [
            {
              type: 'image',
              id: 'file:test.png',
              label: 'test.png',
              mediaType: 'image',
              contentLocator: { kind: 'workspace-file', path: 'test.png' },
            },
          ],
        },
      },
      messageEntry('user-entry', 'presentation-entry', {
        role: 'user',
        content:
          '分析图片\n\n--- Attached Context ---\n\n[Image: test.png]\nContentLocator: {"kind":"workspace-file","path":"test.png"}',
        timestamp: 10,
      }),
    ];

    expect(projectPiConversationEntries(entries)).toEqual([
      {
        id: 'user-entry',
        role: 'user',
        content: '分析图片',
        timestamp: 10,
        contextReferences: [
          {
            type: 'image',
            id: 'file:test.png',
            label: 'test.png',
            mediaType: 'image',
            contentLocator: { kind: 'workspace-file', path: 'test.png' },
          },
        ],
      },
    ]);
  });

  it('fails locally when a presentation entry is not paired with a user message', () => {
    expect(() =>
      projectPiConversationEntries([
        {
          type: 'custom',
          id: 'presentation-entry',
          parentId: null,
          timestamp: new Date(5).toISOString(),
          customType: 'openneko.user-message-presentation',
          data: { turnId: 'turn-1', content: 'Analyze' },
        },
      ]),
    ).toThrow('has no user message');
  });

  it('rejects a presentation attached to another Pi branch entry', () => {
    expect(() =>
      projectPiConversationEntries([
        {
          type: 'custom',
          id: 'presentation-entry',
          parentId: null,
          timestamp: new Date(5).toISOString(),
          customType: 'openneko.user-message-presentation',
          data: { turnId: 'turn-1', content: 'Analyze' },
        },
        messageEntry('user-entry', null, {
          role: 'user',
          content: 'Internal locator prompt',
          timestamp: 10,
        }),
      ]),
    ).toThrow('does not own user message user-entry');
  });

  it('projects the active Pi branch with stable entry ids and tool results', () => {
    const entries: PiConversationTranscriptEntry[] = [
      messageEntry('user-entry', null, {
        role: 'user',
        content: 'inspect the image',
        timestamp: 10,
      }),
      messageEntry('assistant-entry', 'user-entry', {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'need evidence' },
          { type: 'toolCall', id: 'tool-1', name: 'InspectImage', arguments: { ref: 'r1' } },
          { type: 'text', text: 'Done.' },
        ],
        api: 'openai-completions',
        provider: 'fixture',
        model: 'fixture-model',
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: 20,
      }),
      messageEntry('tool-entry', 'assistant-entry', {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'InspectImage',
        content: [{ type: 'text', text: 'evidence' }],
        details: { kind: 'evidence' },
        isError: false,
        timestamp: 30,
      }),
    ];

    expect(projectPiConversationEntries(entries)).toEqual([
      {
        id: 'user-entry',
        role: 'user',
        content: 'inspect the image',
        timestamp: 10,
      },
      expect.objectContaining({
        id: 'assistant-entry',
        role: 'assistant',
        content: 'Done.',
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'thinking', thinking: 'need evidence' }),
          expect.objectContaining({
            type: 'tool_call',
            toolCall: expect.objectContaining({
              id: 'tool-1',
              result: { success: true, data: { kind: 'evidence' } },
            }),
          }),
          expect.objectContaining({ type: 'text', content: 'Done.' }),
        ]),
      }),
    ]);
  });

  it('fails visibly when a tool result has no originating Pi tool call', () => {
    expect(() =>
      projectPiConversationEntries([
        messageEntry('tool-entry', null, {
          role: 'toolResult',
          toolCallId: 'missing',
          toolName: 'MissingTool',
          content: [{ type: 'text', text: 'orphan' }],
          isError: true,
          timestamp: 1,
        }),
      ]),
    ).toThrow('without its assistant tool call');
  });

  it('preserves the persisted Pi diagnostic for an error-only assistant entry', () => {
    expect(
      projectPiConversationEntries([
        messageEntry('assistant-error', 'user-entry', {
          role: 'assistant',
          content: [],
          api: 'openai-completions',
          provider: 'fixture',
          model: 'fixture-model',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'error',
          errorMessage: 'Provider runtime module is unavailable.',
          timestamp: 20,
        }),
      ]),
    ).toEqual([
      {
        id: 'assistant-error',
        role: 'assistant',
        content: 'Provider runtime module is unavailable.',
        timestamp: 20,
        isError: true,
      },
    ]);
  });
});

function messageEntry(
  id: string,
  parentId: string | null,
  message: Extract<PiConversationTranscriptEntry, { type: 'message' }>['message'],
): PiConversationTranscriptEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: new Date(message.timestamp).toISOString(),
    message,
  };
}
