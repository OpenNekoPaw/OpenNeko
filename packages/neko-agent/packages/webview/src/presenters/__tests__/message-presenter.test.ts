import { describe, expect, it } from 'vitest';
import type { Message, ToolCall } from '@neko-agent/types';
import {
  projectAssistantTextReplacementIntoMessages,
  projectMessageCancelledIntoMessages,
  projectStreamingCompleteIntoMessages,
  projectStreamingTextIntoMessages,
  projectStreamingThinkingIntoMessages,
  projectToolCallIntoMessages,
  projectToolConfirmationIntoMessages,
  projectToolResultIntoMessages,
} from '../message-presenter';
import { projectToolResultBackfillIntoMessages } from '../tool-result-backfill-presenter';
import { projectMarkdownResourceRendering } from '../markdown-resource-rendering-presenter';

describe('message presenter', () => {
  it('creates an assistant message when projecting a tool call without a target', () => {
    const result = projectToolCallIntoMessages({
      messages: [],
      streamingMessageId: null,
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      arguments: { prompt: 'cat' },
      now: () => 1000,
    });

    expect(result).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      streamingMessageId: '1000',
      messages: [
        {
          id: '1000',
          role: 'assistant',
          isStreaming: true,
          contentBlocks: [
            {
              id: 'block-tool-tool-1',
              type: 'tool_call',
              timestamp: 1000,
              toolCall: {
                id: 'tool-1',
                name: 'GenerateImage',
                arguments: { prompt: 'cat' },
              },
            },
          ],
        },
      ],
    });
  });

  it('projects tool results into the matching message and returns subagent work items', () => {
    const messages = createToolMessages();

    const result = projectToolResultIntoMessages({
      conversationId: 'conv-1',
      messages,
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        subAgentId: 'sub-1',
        scope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'parent-run-1',
          childRunId: 'sub-1',
          childKind: 'subagent',
        },
        status: 'completed',
        description: 'Review implementation',
        response: 'Looks good',
      },
      now: () => 2000,
    });

    expect(result.updated).toBe(true);
    expect(result.targetMessageId).toBe('msg-1');
    expect(result.workItemIds).toEqual(['sub-1']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['sub-1'],
        contentBlocks: [
          {
            toolCall: {
              id: 'tool-1',
              pendingConfirmation: false,
              result: {
                success: true,
                data: {
                  subAgentId: 'sub-1',
                  status: 'completed',
                },
              },
            },
          },
        ],
      },
    ]);
    expect(result.workItems).toMatchObject([
      {
        id: 'sub-1',
        conversationId: 'conv-1',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        progress: 100,
        subAgent: { response: 'Looks good' },
      },
    ]);
  });

  it('preserves tool result media attachments for later Markdown resource rendering', () => {
    const result = projectToolResultIntoMessages({
      messages: createToolMessages({}, { name: 'ReadImage' }),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        images: [
          {
            label: 'Page 1',
            alias: 'P1',
            mimeType: 'image/jpeg',
            resourceRef: {
              id: 'page-1',
              scope: 'project',
              provider: 'read-image',
              kind: 'media',
              source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
              locator: { kind: 'file', path: 'images/page-1.jpg' },
              fingerprint: { strategy: 'provider', providerId: 'read-image', value: 'page-1' },
            },
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: 'vscode-webview://page-1',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'P1',
            uri: 'vscode-webview://page-1',
            mimeType: 'image/jpeg',
            label: 'Page 1',
          },
        },
      ],
    });

    const toolResult = result.messages[0]?.contentBlocks?.[0]?.toolCall?.result;
    expect(toolResult?.attachments).toEqual([
      expect.objectContaining({ path: 'vscode-webview://page-1' }),
    ]);
  });

  it('preserves composite artifact transfers in tool result and backfill projection', () => {
    const artifact = makeArtifactSnapshot('artifact-1', 'Draft plan');
    const blockPage = makeArtifactBlockPage('artifact-1', 'page-2');
    const summary = makeArtifactExecutionSummary('artifact-1', 'canvas.ingestMarkdown');
    const result = projectToolResultIntoMessages({
      messages: createToolMessages(),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: { status: 'queued' },
      artifacts: [artifact, blockPage],
    });

    const restoredMessages = JSON.parse(JSON.stringify(result.messages)) as Message[];

    const updatedArtifact = makeArtifactSnapshot('artifact-1', 'Updated plan');
    const backfilled = projectToolResultBackfillIntoMessages({
      messages: restoredMessages,
      streamingMessageId: null,
      message: {
        type: 'toolResultBackfill',
        conversationId: 'conv-1',
        toolCallId: 'tool-1',
        dataPatch: { status: 'completed' },
        artifacts: [updatedArtifact, summary],
      },
    });

    expect(result.messages[0]?.contentBlocks?.[0]?.toolCall?.result?.artifacts).toEqual([
      artifact,
      blockPage,
    ]);
    expect(backfilled.messages[0]?.contentBlocks?.[0]?.toolCall?.result).toMatchObject({
      data: { status: 'completed' },
      artifacts: [updatedArtifact, blockPage, summary],
    });
  });

  it('merges task work item ids from tool results', () => {
    const result = projectToolResultIntoMessages({
      messages: createToolMessages({ workItemIds: ['task-existing'] }),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskIds: ['task-1', 'task-2', 'task-1'],
      },
      now: () => 3000,
    });

    expect(result.workItemIds).toEqual(['task-1', 'task-2']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['task-existing', 'task-1', 'task-2'],
        contentBlocks: [
          {
            type: 'tool_call',
            toolCall: {
              id: 'tool-1',
              result: {
                success: true,
                data: {
                  backgroundMode: true,
                  taskIds: ['task-1', 'task-2', 'task-1'],
                },
              },
            },
          },
        ],
      },
    ]);
  });

  it('projects completed background task results into task work items', () => {
    const result = projectToolResultIntoMessages({
      conversationId: 'conv-1',
      messages: createToolMessages(
        {},
        {
          name: 'GenerateVideo',
          arguments: { prompt: 'Fallback prompt' },
        },
      ),
      streamingMessageId: null,
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        taskId: 'task-1',
        taskScope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'parent-run-1',
          childRunId: 'task-1',
          childKind: 'task',
        },
        type: 'video',
        status: 'completed',
        message: 'A cinematic cat',
        routedTo: { provider: 'openai', model: 'sora' },
        urls: ['webview://video.mp4'],
        localPaths: ['/tmp/video.mp4'],
      },
      now: () => 4000,
    });

    expect(result.workItemIds).toEqual(['task-1']);
    expect(result.messages).toMatchObject([
      {
        id: 'msg-1',
        workItemIds: ['task-1'],
      },
    ]);
    expect(result.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        progress: 100,
        task: {
          type: 'video',
          prompt: 'A cinematic cat',
          providerId: 'openai',
          providerName: 'sora',
          result: {
            urls: ['webview://video.mp4'],
          },
        },
      },
    ]);
    const workItem = result.workItems[0];
    expect(workItem?.kind).toBe('tool-background-task');
    expect(workItem && 'task' in workItem ? workItem.task.result : undefined).not.toHaveProperty(
      'localPaths',
    );
  });

  it('projects tool confirmations into the matching tool call', () => {
    const result = projectToolConfirmationIntoMessages({
      messages: createToolMessages(),
      toolCallId: 'tool-1',
      action: 'write',
      description: 'Write file',
      details: { path: 'README.md' },
    });

    expect(result).toMatchObject({
      updated: true,
      targetMessageId: 'msg-1',
      messages: [
        {
          contentBlocks: [
            {
              toolCall: {
                id: 'tool-1',
                pendingConfirmation: true,
                confirmation: {
                  action: 'write',
                  description: 'Write file',
                  details: { path: 'README.md' },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('projects streaming text into new and existing assistant messages', () => {
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      content: 'Hello',
      now: () => 1000,
    });

    const appended = projectStreamingTextIntoMessages({
      messages: created.messages,
      streamingMessageId: '1000',
      content: ' world',
      now: () => 1001,
      randomId: () => 'abcde',
    });

    expect(created).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      streamingMessageId: '1000',
      isThinking: false,
    });
    expect(appended).toMatchObject({
      updated: true,
      targetMessageId: '1000',
      isThinking: false,
      messages: [
        {
          id: '1000',
          content: 'Hello world',
          isStreaming: true,
          contentBlocks: [
            {
              id: 'block-1000',
              type: 'text',
              content: 'Hello world',
              isStreaming: true,
            },
          ],
        },
      ],
    });
  });

  it('continues a restored streaming assistant message by message id', () => {
    const result = projectStreamingTextIntoMessages({
      messages: [
        {
          id: 'assistant-stream',
          role: 'assistant',
          content: 'Hello',
          timestamp: 1000,
          isStreaming: true,
          contentBlocks: [
            {
              id: 'block-text',
              type: 'text',
              timestamp: 1000,
              content: 'Hello',
              isStreaming: true,
            },
          ],
        },
      ],
      streamingMessageId: null,
      messageId: 'assistant-stream',
      content: ' world',
    });

    expect(result).toMatchObject({
      updated: true,
      targetMessageId: 'assistant-stream',
      isThinking: false,
      messages: [
        {
          id: 'assistant-stream',
          content: 'Hello world',
          contentBlocks: [
            {
              id: 'block-text',
              content: 'Hello world',
              isStreaming: true,
            },
          ],
        },
      ],
    });
  });

  it('replaces invalid streamed text while preserving tool resource context', () => {
    const withTool = projectToolCallIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'assistant-stream',
      toolCallId: 'tool-read-image',
      toolName: 'ReadImage',
      arguments: {},
      now: () => 1000,
    });
    const withToolResult = projectToolResultIntoMessages({
      messages: withTool.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      toolCallId: 'tool-read-image',
      success: true,
      data: {
        images: [
          {
            label: 'Page 1',
            alias: 'P1',
            mimeType: 'image/jpeg',
            resourceRef: {
              id: 'page-1',
              scope: 'project',
              provider: 'read-image',
              kind: 'media',
              source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
              locator: { kind: 'file', path: 'images/page-1.jpg' },
              fingerprint: { strategy: 'provider', providerId: 'read-image', value: 'page-1' },
            },
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: 'vscode-webview://page-1',
          mimeType: 'image/jpeg',
          assetRef: {
            assetId: 'P1',
            uri: 'vscode-webview://page-1',
            mimeType: 'image/jpeg',
            label: 'Page 1',
          },
        },
      ],
      now: () => 1001,
    });
    const invalidText = projectStreamingTextIntoMessages({
      messages: withToolResult.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      content: '| 页码 | 画面内容 |\n| --- | --- |\n| P1 | frame |',
      now: () => 1002,
    });
    const replaced = projectAssistantTextReplacementIntoMessages({
      messages: invalidText.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      now: () => 1003,
    });
    const repairedMarkdown =
      '| scene | shot | source | visual |\n| --- | --- | --- | --- |\n| Opening | 1 | P1 | frame |';
    const repaired = projectStreamingTextIntoMessages({
      messages: replaced.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      content: repairedMarkdown,
      now: () => 1004,
    });

    expect(repaired.messages[0]?.content).toBe(repairedMarkdown);
    expect(repaired.messages[0]?.contentBlocks?.map((block) => block.type)).toEqual([
      'tool_call',
      'text',
    ]);
    const projection = projectMarkdownResourceRendering({
      markdown: repairedMarkdown,
      siblingBlocks: repaired.messages[0]?.contentBlocks,
    });
    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['vscode-webview://page-1'],
      }),
    ]);
  });

  it('closes the active response block before inserting a tool call', () => {
    const firstText = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'assistant-stream',
      content: 'I will inspect the file.',
      now: () => 1000,
    });

    const withTool = projectToolCallIntoMessages({
      messages: firstText.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      toolCallId: 'tool-read',
      toolName: 'ReadDocument',
      arguments: { path: '${A}/book.epub' },
      now: () => 1001,
    });

    const secondText = projectStreamingTextIntoMessages({
      messages: withTool.messages,
      streamingMessageId: 'assistant-stream',
      messageId: 'assistant-stream',
      content: ' I found the manifest.',
      now: () => 1002,
      randomId: () => 'after-tool',
    });

    expect(secondText.messages[0]?.content).toBe('I will inspect the file. I found the manifest.');
    expect(secondText.messages[0]?.contentBlocks).toMatchObject([
      {
        type: 'text',
        content: 'I will inspect the file.',
        isStreaming: false,
      },
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-read',
          name: 'ReadDocument',
        },
      },
      {
        type: 'text',
        content: ' I found the manifest.',
        isStreaming: true,
      },
    ]);
  });

  it('projects streaming thinking into new and existing assistant messages', () => {
    const created = projectStreamingThinkingIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content: 'Thinking',
      now: () => 1000,
    });

    const appended = projectStreamingThinkingIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
      content: ' more',
      now: () => 1001,
      randomId: () => 'abcde',
    });

    expect(appended).toMatchObject({
      updated: true,
      targetMessageId: 'msg-1',
      isThinking: true,
      messages: [
        {
          id: 'msg-1',
          contentBlocks: [
            {
              id: 'block-thinking-msg-1',
              type: 'thinking',
              thinking: 'Thinking more',
              isThinkingComplete: false,
            },
          ],
        },
      ],
    });
  });

  it('projects stream completion and cancellation state', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
        isStreaming: true,
        contentBlocks: [
          {
            id: 'block-text',
            type: 'text',
            timestamp: 1,
            content: 'Hello',
            isStreaming: true,
          },
          {
            id: 'block-thinking',
            type: 'thinking',
            timestamp: 1,
            thinking: 'Reasoning',
            isThinkingComplete: false,
          },
        ],
      },
    ];

    const completed = projectStreamingCompleteIntoMessages({
      messages,
      streamingMessageId: 'msg-1',
    });
    const cancelled = projectMessageCancelledIntoMessages({
      messages,
      streamingMessageId: 'msg-1',
    });

    expect(completed).toMatchObject({
      updated: true,
      streamingMessageId: null,
      isThinking: false,
      messages: [
        {
          id: 'msg-1',
          isStreaming: false,
          contentBlocks: [
            { id: 'block-text', isStreaming: false },
            { id: 'block-thinking', isThinkingComplete: true },
          ],
        },
      ],
    });
    expect(cancelled).toMatchObject({
      updated: true,
      streamingMessageId: null,
      isThinking: false,
      messages: [
        {
          id: 'msg-1',
          content: 'Hello\n\n*(Cancelled)*',
          isStreaming: false,
          isCancelled: true,
        },
      ],
    });
  });

  it('merges final content blocks without reordering the active streamed timeline', () => {
    const messages: Message[] = [
      {
        id: 'assistant-stream',
        role: 'assistant',
        content: 'Before. After.',
        timestamp: 1,
        isStreaming: true,
        contentBlocks: [
          {
            id: 'block-before',
            type: 'text',
            timestamp: 1,
            content: 'Before.',
            isStreaming: false,
          },
          {
            id: 'block-tool-tool-1',
            type: 'tool_call',
            timestamp: 2,
            toolCall: {
              id: 'tool-1',
              name: 'ReadDocument',
              arguments: { path: '${A}/book.epub' },
            },
          },
          {
            id: 'block-after',
            type: 'text',
            timestamp: 3,
            content: ' After.',
            isStreaming: true,
          },
        ],
      },
    ];

    const completed = projectStreamingCompleteIntoMessages({
      messages,
      streamingMessageId: 'assistant-stream',
      contentBlocks: [
        {
          id: 'block-before',
          type: 'text',
          timestamp: 1,
          content: 'Before.',
          isStreaming: false,
        },
        {
          id: 'block-after',
          type: 'text',
          timestamp: 3,
          content: ' After.',
          isStreaming: false,
        },
        {
          id: 'block-tool-tool-1',
          type: 'tool_call',
          timestamp: 2,
          toolCall: {
            id: 'tool-1',
            name: 'ReadDocument',
            arguments: { path: '${A}/book.epub' },
            result: {
              success: true,
              data: { title: 'book' },
            },
          },
        },
      ],
    });

    expect(completed.messages[0]?.contentBlocks).toMatchObject([
      { id: 'block-before', type: 'text', content: 'Before.', isStreaming: false },
      {
        id: 'block-tool-tool-1',
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          result: { success: true, data: { title: 'book' } },
        },
      },
      { id: 'block-after', type: 'text', content: ' After.', isStreaming: false },
    ]);
  });

  it('preserves fenced Markdown source when local streaming completes', () => {
    const source =
      'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","sections":[{"heading":"Shot 1","mediaRefs":[{"toolCallId":"read-1","assetIndex":0,"caption":"原图"}]}]}\n```';
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content: source,
      now: () => 1000,
    });

    const completed = projectStreamingCompleteIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
    });

    expect(completed.messages).toMatchObject([
      {
        id: 'msg-1',
        content: source,
        isStreaming: false,
        contentBlocks: [
          {
            id: 'block-msg-1',
            type: 'text',
            content: source,
            isStreaming: false,
          },
        ],
      },
    ]);
  });

  it('uses runtime-projected composite metadata without replacing Markdown source', () => {
    const source =
      'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","sections":[{"heading":"主要角色观察","content":"| 角色 | 观察 |\\n| --- | --- |\\n| 瑞德 | 红色围巾。 |"}]}\n```';
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content: source,
      now: () => 1000,
    });

    const completed = projectStreamingCompleteIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
      contentBlocks: [
        {
          id: 'block-msg-1',
          type: 'text',
          timestamp: 1000,
          content: source,
          isStreaming: false,
        },
        {
          id: 'block-msg-1-composite-1',
          type: 'composite',
          timestamp: 1000,
          composite: {
            template: 'storyboard-table',
            extensions: {
              'neko.entityMemoryContributionPayload': {
                contributionId: 'character-analysis-opening',
                sourcePackage: 'neko-agent',
                sourceRef: { kind: 'manual', label: 'Agent character analysis: Opening' },
                reviewPolicy: 'requires-user-review',
              },
            },
            sections: [
              {
                heading: '主要角色观察',
                content: '| 角色 | 观察 |\n| --- | --- |\n| 瑞德 | 红色围巾。 |',
              },
            ],
          },
          compositeSource: {
            kind: 'normalized-markdown-code-block',
            sourceBlockId: 'block-msg-1',
            startOffset: 12,
            endOffset: source.length,
            language: 'neko-composite',
            candidateIndex: 0,
          },
        },
      ],
    });

    expect(completed.messages[0]?.content).toBe(source);
    expect(completed.messages[0]?.contentBlocks?.[1]?.compositeSource).toMatchObject({
      sourceBlockId: 'block-msg-1',
    });
    expect(completed.messages[0]?.contentBlocks?.[1]?.composite).toMatchObject({
      extensions: {
        'neko.entityMemoryContributionPayload': {
          contributionId: 'character-analysis-opening',
          reviewPolicy: 'requires-user-review',
        },
      },
    });
  });

  it('preserves uppercase structured fences for normalized historical rendering', () => {
    const source =
      'Storyboard\n\n```NEKO\n{"schemaVersion":1,"kind":"composite-artifact","artifactId":"artifact-storyboard","blocks":[{"blockId":"storyboard-domain","kind":"domain","domainKind":"StoryboardTable","payload":{"schemaVersion":1,"kind":"storyboard-table","title":"Opening","scenes":[{"sceneId":"scene-1","sceneTitle":"Page 1","shots":[{"shotNumber":1,"duration":3,"visualDescription":"Panel action and composition.","characterAction":"Rin enters the frame.","imageStrategy":"use-as-reference"}]}]}}]}\n```';
    const created = projectStreamingTextIntoMessages({
      messages: [],
      streamingMessageId: null,
      messageId: 'msg-1',
      content: source,
      now: () => 1000,
    });

    const completed = projectStreamingCompleteIntoMessages({
      messages: created.messages,
      streamingMessageId: 'msg-1',
    });

    expect(completed.messages[0]?.content).toBe(source);
    expect(completed.messages[0]?.contentBlocks).toEqual([
      expect.objectContaining({
        id: 'block-msg-1',
        type: 'text',
        content: source,
        isStreaming: false,
      }),
    ]);
  });
});

function createToolMessages(
  overrides: Partial<Message> = {},
  toolOverrides: Partial<ToolCall> = {},
): Message[] {
  const toolCall = {
    id: 'tool-1',
    name: 'GenerateImage',
    arguments: { prompt: 'cat' },
    ...toolOverrides,
  };
  return [
    {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        {
          id: 'block-tool-tool-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall,
        },
      ],
      ...overrides,
    },
  ];
}

function makeArtifactSnapshot(artifactId: string, title: string) {
  return {
    type: 'artifactSnapshot' as const,
    complete: true,
    artifact: {
      schemaVersion: 1 as const,
      kind: 'composite-artifact' as const,
      artifactId,
      title,
      blocks: [{ blockId: 'summary', kind: 'text' as const, text: title }],
    },
  };
}

function makeArtifactBlockPage(artifactId: string, cursor: string) {
  return {
    type: 'artifactBlockPage' as const,
    artifactId,
    blocks: [{ blockId: cursor, kind: 'text' as const, text: 'Paged block' }],
    cursor,
    complete: false,
  };
}

function makeArtifactExecutionSummary(artifactId: string, actionId: string) {
  return {
    type: 'artifactExecutionSummary' as const,
    summary: {
      summaryId: `summary:${artifactId}:${actionId}`,
      artifactId,
      actionId,
      providerId: 'neko-canvas',
      status: 'succeeded' as const,
    },
  };
}
