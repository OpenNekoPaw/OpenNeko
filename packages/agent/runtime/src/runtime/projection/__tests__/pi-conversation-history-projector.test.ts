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
              contentLocator: { file: { authority: 'workspace' as const, path: 'test.png' } },
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
            contentLocator: { file: { authority: 'workspace' as const, path: 'test.png' } },
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
      {
        type: 'custom',
        id: 'turn-timing',
        parentId: 'user-entry',
        timestamp: new Date(11).toISOString(),
        customType: 'openneko.turn-presentation-timing',
        data: { turnId: 'turn-1', startedAt: 20, completedAt: 60 },
      },
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
        turnTiming: { startedAt: 20, completedAt: 60 },
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

  it('projects every assistant iteration in one persisted user turn as one ordered message', () => {
    const entries: PiConversationTranscriptEntry[] = [
      messageEntry('user-entry', null, {
        role: 'user',
        content: 'analyze the document',
        timestamp: 10,
      }),
      {
        type: 'custom',
        id: 'turn-timing',
        parentId: 'user-entry',
        timestamp: new Date(11).toISOString(),
        customType: 'openneko.turn-presentation-timing',
        data: { turnId: 'turn-1', startedAt: 20, completedAt: 60 },
      },
      messageEntry('assistant-read-document', 'user-entry', {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'inspect the manifest' },
          {
            type: 'toolCall',
            id: 'tool-document',
            name: 'ReadDocument',
            arguments: { ref: 'document' },
          },
        ],
        api: 'openai-completions',
        provider: 'fixture',
        model: 'fixture-model',
        usage: zeroUsage(),
        stopReason: 'toolUse',
        timestamp: 20,
      }),
      messageEntry('tool-document-result', 'assistant-read-document', {
        role: 'toolResult',
        toolCallId: 'tool-document',
        toolName: 'ReadDocument',
        content: [{ type: 'text', text: 'manifest' }],
        details: { pages: 402 },
        isError: false,
        timestamp: 30,
      }),
      messageEntry('assistant-read-image', 'tool-document-result', {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'inspect representative pages' },
          {
            type: 'toolCall',
            id: 'tool-image',
            name: 'ReadImage',
            arguments: { ref: 'page-1' },
          },
        ],
        api: 'openai-completions',
        provider: 'fixture',
        model: 'fixture-model',
        usage: zeroUsage(),
        stopReason: 'toolUse',
        timestamp: 40,
      }),
      messageEntry('tool-image-result', 'assistant-read-image', {
        role: 'toolResult',
        toolCallId: 'tool-image',
        toolName: 'ReadImage',
        content: [{ type: 'text', text: 'page evidence' }],
        details: { images: 5 },
        isError: false,
        timestamp: 50,
      }),
      messageEntry('assistant-final', 'tool-image-result', {
        role: 'assistant',
        content: [{ type: 'text', text: '# Final analysis' }],
        api: 'openai-completions',
        provider: 'fixture',
        model: 'fixture-model',
        usage: zeroUsage(),
        stopReason: 'stop',
        timestamp: 60,
      }),
    ];

    const messages = projectPiConversationEntries(entries);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: 'assistant-read-document',
      role: 'assistant',
      content: '# Final analysis',
      timestamp: 20,
      turnTiming: { startedAt: 20, completedAt: 60 },
      contentBlocks: [
        { id: 'assistant-read-document:thinking:0', type: 'thinking' },
        {
          id: 'assistant-read-document:tool:tool-document',
          type: 'tool_call',
          toolCall: {
            id: 'tool-document',
            result: { success: true, data: { pages: 402 } },
          },
        },
        { id: 'assistant-read-image:thinking:0', type: 'thinking' },
        {
          id: 'assistant-read-image:tool:tool-image',
          type: 'tool_call',
          toolCall: {
            id: 'tool-image',
            result: { success: true, data: { images: 5 } },
          },
        },
        {
          id: 'assistant-final:text:0',
          type: 'text',
          content: '# Final analysis',
        },
      ],
    });
  });

  it('restores the canonical ReadImage ToolResult shape from durable Pi details', () => {
    const contentLocator = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'images/cover.jpg' },
    };
    const entries: PiConversationTranscriptEntry[] = [
      messageEntry('assistant-entry', null, {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'tool-image', name: 'ReadImage', arguments: {} }],
        api: 'openai-completions',
        provider: 'fixture',
        model: 'fixture-model',
        usage: zeroUsage(),
        stopReason: 'toolUse',
        timestamp: 20,
      }),
      messageEntry('tool-entry', 'assistant-entry', {
        role: 'toolResult',
        toolCallId: 'tool-image',
        toolName: 'ReadImage',
        content: [{ type: 'text', text: '{"image_ref":"image-1"}' }],
        details: {
          success: true,
          data: { images: [{ label: 'cover.jpg', contentLocator }] },
          attachments: [
            {
              type: 'image',
              path: 'content:cover',
              assetRef: { assetId: 'cover', uri: 'content:cover', contentLocator },
            },
          ],
          perceptionCards: [
            {
              assetId: 'cover',
              modality: 'image',
              createdAt: 20,
              layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
              structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 42 },
            },
          ],
          backfillDiagnostics: [{ path: 'data.images', reason: 'conflict' }],
        },
        isError: false,
        timestamp: 30,
      }),
    ];

    const messages = projectPiConversationEntries(entries);
    const block = messages[0]?.contentBlocks?.find((candidate) => candidate.type === 'tool_call');

    expect(block?.toolCall?.result).toEqual({
      success: true,
      data: { images: [{ label: 'cover.jpg', contentLocator }] },
      attachments: [
        {
          type: 'image',
          path: 'content:cover',
          assetRef: { assetId: 'cover', uri: 'content:cover', contentLocator },
        },
      ],
      perceptionCards: [
        {
          assetId: 'cover',
          modality: 'image',
          createdAt: 20,
          layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
          structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 42 },
        },
      ],
      backfillDiagnostics: [{ path: 'data.images', reason: 'conflict' }],
    });
    expect(block?.toolCall?.result?.data).not.toHaveProperty('success');
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

function zeroUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
