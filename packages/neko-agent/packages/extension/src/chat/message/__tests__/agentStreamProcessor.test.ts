/**
 * AgentStreamProcessor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentStreamProcessor, type AgentStreamProcessorDeps } from '../agentStreamProcessor';
import type { AgentTurnTimelineItem } from '@neko-agent/types';
import { createGeneratedAssetRevisionRef, type EntityMemoryContribution } from '@neko/shared';
import { evaluateAgentTaskResultDelivery, normalizeAgentTaskResultObservation } from '@neko/agent';
import { createConversationProjectionStore } from '@neko/agent/runtime';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({
      get: (_key: string, fallback: unknown) => fallback,
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: any) => ({ toString: () => `webview-uri:${uri.fsPath}` })),
  };
}

function createMockCallbacks() {
  return {
    messageId: 'assistant-stream',
    onPhaseChange: vi.fn(),
  };
}

function createTaskRunScope(conversationId: string, runId: string, taskId: string) {
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId: taskId,
    childKind: 'task' as const,
  };
}

const testProjections = new Map<string, ReturnType<typeof createConversationProjectionStore>>();

function getProjectedTurn(conversationId: string) {
  return testProjections.get(conversationId)?.snapshot().turns.at(-1);
}

function getProjectedTimelineItems(conversationId: string): AgentTurnTimelineItem[] {
  return [...(getProjectedTurn(conversationId)?.items ?? [])];
}

function getProjectedTimelineToolResult(conversationId: string, toolCallId: string) {
  return getProjectedTimelineItems(conversationId)
    .filter((item) => item.kind === 'tool_call' && item.payload.toolCall.id === toolCallId)
    .at(-1)?.payload.toolCall.result;
}

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  message = 'Timed out waiting for test condition',
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await waitForMicrotasks();
  }
  throw new Error(message);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((outerResolve, outerReject) => {
    resolve = outerResolve;
    reject = outerReject;
  });
  return { promise, resolve, reject };
}

type TestAgentStreamProcessorDeps = Omit<AgentStreamProcessorDeps, 'getConversationProjection'> &
  Partial<Pick<AgentStreamProcessorDeps, 'getConversationProjection'>>;

function createAgentStreamProcessor(deps: TestAgentStreamProcessorDeps = {}): AgentStreamProcessor {
  const getConversationProjection =
    deps.getConversationProjection ??
    ((conversationId: string) => {
      const existing = testProjections.get(conversationId);
      if (existing) return existing;
      const created = createConversationProjectionStore(conversationId);
      testProjections.set(conversationId, created);
      return created;
    });
  return new AgentStreamProcessor({ ...deps, getConversationProjection });
}

/**
 * Helper to create an async iterable from an array of events
 */
async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('AgentStreamProcessor', () => {
  let processor: AgentStreamProcessor;
  let webview: ReturnType<typeof createMockWebview>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const projection of testProjections.values()) projection.dispose();
    testProjections.clear();
    webview = createMockWebview();
    callbacks = createMockCallbacks();
    processor = createAgentStreamProcessor({});
  });

  describe('processStream', () => {
    it('should return empty result for empty stream', async () => {
      const events = toAsyncIterable([]);
      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('');
      expect(result.accumulatedThinking).toBe('');
      expect(result.hasError).toBe(false);
      expect(result.collectedToolCalls).toEqual([]);
      expect(result.contentBlocks).toEqual([]);
    });

    it('commits terminal state to the authoritative projection without Timeline delivery', async () => {
      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          { type: 'text', content: 'Hello' },
          { type: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        ]),
        callbacks,
      );

      expect(result.terminalStatus).toBe('completed');
      expect(getProjectedTurn('conv-1')).toMatchObject({
        messageId: 'assistant-stream',
        completion: { status: 'completed' },
      });
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'agentTurnTimeline' }),
      );
    });

    it('keeps model completion authoritative when the Webview endpoint is unavailable', async () => {
      webview.postMessage.mockResolvedValue(false);

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          { type: 'text', content: 'Retained answer' },
          { type: 'done', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
        ]),
        callbacks,
      );

      expect(result.terminalStatus).toBe('completed');
      expect(result.accumulatedResponse).toBe('Retained answer');
      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'assistant_text',
            payload: expect.objectContaining({ content: 'Retained answer' }),
          }),
        ]),
      );
    });

    it('marks AbortError streams cancelled while retaining final partial content', async () => {
      const cancellation = new Error('cancelled by user');
      cancellation.name = 'AbortError';

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          { type: 'text', content: 'Partial answer' },
          { type: 'error', error: cancellation },
        ]),
        callbacks,
      );

      expect(result.terminalStatus).toBe('cancelled');
      expect(result.accumulatedResponse).toBe('Partial answer');
      expect(getProjectedTurn('conv-1')?.completion).toMatchObject({ status: 'cancelled' });
    });

    it('rejects late delivery and partial persistence callbacks after disposal', async () => {
      const resume = createDeferred<void>();
      let now = 1_000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
      const conversations = { upsertMessageToConversation: vi.fn() };
      processor = createAgentStreamProcessor({ conversations: conversations as any });
      async function* delayedEvents() {
        yield { type: 'text' as const, content: 'before dispose' };
        await resume.promise;
        yield { type: 'text' as const, content: ' after dispose' };
      }

      const processing = processor.processStream(
        webview as any,
        'conv-1',
        delayedEvents(),
        callbacks,
      );
      await waitForCondition(
        () => conversations.upsertMessageToConversation.mock.calls.length === 1,
      );
      const postedBeforeDispose = webview.postMessage.mock.calls.length;

      processor.dispose();
      now += 300;
      resume.resolve();
      const result = await processing;
      nowSpy.mockRestore();

      expect(conversations.upsertMessageToConversation).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledTimes(postedBeforeDispose);
      expect(result.accumulatedResponse).toBe('before dispose after dispose');
      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'assistant_text',
            payload: expect.objectContaining({ content: 'before dispose' }),
          }),
        ]),
      );
    });

    it('should handle thinking_content events', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Let me think...' },
        { type: 'thinking_content', thinking: ' about this.' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Let me think... about this.');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.thinking).toBe('Let me think... about this.');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('thinking', undefined);

      expect(getProjectedTimelineItems('conv-1')[0]).toMatchObject({
        kind: 'thinking',
        payload: { content: 'Let me think... about this.' },
      });
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamThinking' }),
      );
    });

    it('should handle text events', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Hello ' },
        { type: 'text_delta', content: 'world!' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('Hello world!');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('text');
      expect(result.contentBlocks[0]!.content).toBe('Hello world!');
      expect(result.contentBlocks[0]!.isStreaming).toBe(false); // Marked complete at end
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('streaming', undefined);
    });

    it('persists partial assistant snapshots using the provided stream message id', async () => {
      const conversations = {
        get: vi.fn(() => ({
          id: 'conv-1',
          messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
        })),
        upsertMessageToConversation: vi.fn(),
      };
      processor = createAgentStreamProcessor({ conversations: conversations as any });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([{ type: 'text', content: 'Hello' }]),
        { ...callbacks, messageId: 'assistant-stream' },
      );

      expect(conversations.upsertMessageToConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          id: 'assistant-stream',
          role: 'assistant',
          content: 'Hello',
          isStreaming: true,
        }),
      );
    });

    it('should mark thinking complete when text starts', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Thinking...' },
        { type: 'text', content: 'Response' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.isThinkingComplete).toBe(true);
      expect(result.contentBlocks[1]!.type).toBe('text');
    });

    it('should handle tool_call events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.collectedToolCalls[0]!.name).toBe('read_file');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('tool_call');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('acting', 'read_file');
    });

    it('should stop text streaming when tool_call arrives', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Let me read that file.' },
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      // Text block should be finalized (not streaming)
      expect(result.contentBlocks[0]!.isStreaming).toBe(false);
    });

    it('should handle tool_result events and update tool call data', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tc-1', success: true, data: 'file content' },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.result).toEqual({
        success: true,
        data: 'file content',
        error: undefined,
      });

      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'tool_call',
            payload: {
              toolCall: expect.objectContaining({
                id: 'tc-1',
                result: expect.objectContaining({ success: true, data: 'file content' }),
              }),
            },
          }),
        ]),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResult' }),
      );
    });

    it('automates entity memory contributions and backfills the decision summary', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'created-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = createAgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-memory',
            name: 'AnalyzeComicPage',
            arguments: {},
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-memory',
            success: true,
            data: { entityMemoryContribution: contribution },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          status: 'succeeded',
          contributionId: 'contribution-page-1',
          decisions: [
            {
              kind: 'created-candidate',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        },
      });
      expect(result.collectedToolCalls[0]!.result?.artifacts).toEqual([
        {
          type: 'artifactExecutionSummary',
          summary: expect.objectContaining({
            summaryId: 'entity-memory:contribution-page-1',
            actionId: 'entity-memory.processContribution',
            providerId: 'neko-entity',
            status: 'succeeded',
          }),
        },
      ]);
      expect(getProjectedTimelineToolResult('conv-1', 'tc-memory')?.data).toMatchObject({
        entityMemoryAutomation: expect.objectContaining({
          contributionId: 'contribution-page-1',
        }),
      });
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResultBackfill' }),
      );
    });

    it('automates entity memory contributions embedded in final composite text', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'matched-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = createAgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```neko-composite\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          profile: 'media-production.animation-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [
            {
              blockId: 'summary',
              kind: 'text',
              format: 'plain',
              text: 'summary',
            },
          ],
        }) +
        '\n```';

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: makeReadImageArguments(),
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: makeReadImageResultData(),
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          contributionId: 'contribution-page-1',
          decisions: [
            {
              kind: 'matched-candidate',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        },
      });
      expect(getProjectedTimelineToolResult('conv-1', 'tc-memory')?.artifacts).toEqual([
        {
          type: 'artifactExecutionSummary',
          summary: expect.objectContaining({
            artifactId: 'comic-storyboard-plan',
            status: 'succeeded',
          }),
        },
      ]);
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResultBackfill' }),
      );
    });

    it('automates entity memory contributions embedded in json fenced composite artifacts', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'matched-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = createAgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```json\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          profile: 'media-production.animation-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [
            {
              blockId: 'storyboard-domain',
              kind: 'domain',
              domainKind: 'StoryboardTable',
              schemaVersion: 1,
              payload: {
                schemaVersion: 1,
                kind: 'storyboard-table',
                title: 'Storyboard',
                scenes: [
                  {
                    sceneId: 'scene-1',
                    sceneTitle: 'Page 1',
                    shots: [
                      {
                        shotNumber: 1,
                        duration: 3,
                        visualDescription: 'Panel action.',
                        characterAction: 'Hero enters.',
                        imageStrategy: 'use-as-reference',
                        sourceMediaRefs: [
                          {
                            refId: 'source-panel-1',
                            role: 'source',
                            locator: {
                              type: 'tool-result',
                              toolCallId: 'tc-memory',
                              assetIndex: 0,
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }) +
        '\n```';

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: makeReadImageArguments(),
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: makeReadImageResultData(),
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          contributionId: 'contribution-page-1',
        },
      });
    });

    it('automates entity memory contributions embedded in uppercase neko fenced artifacts', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [{ kind: 'matched-candidate', candidateId: 'candidate:hero' }],
        }),
      };
      processor = createAgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```NEKO\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [{ blockId: 'summary', kind: 'text', text: 'summary' }],
        }) +
        '\n```';

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: makeReadImageArguments(),
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: makeReadImageResultData(),
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
    });

    it('projects ReadImage arguments to webview URIs when the tool call starts', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = createAgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-read-image',
            name: 'ReadImage',
            arguments: {
              images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.arguments).toEqual({
        images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
      });
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        '/tmp/page-1.jpg',
        'neko-agent.stream-tool-result',
      );
      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'tool_call',
            payload: {
              toolCall: expect.objectContaining({
                id: 'tc-read-image',
                arguments: {
                  images: [
                    {
                      label: 'Page 1',
                      path: '/tmp/page-1.jpg',
                    },
                  ],
                },
              }),
            },
          }),
        ]),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolCall' }),
      );
    });

    it('projects document resource refs through unified content access without exposing host paths', async () => {
      const materializedPath = '/workspace/.neko-runtime/resources/documents/doc_1/page-1.jpg';
      const archiveRef = {
        kind: 'document-entry',
        source: { filePath: '/books/a.epub', format: 'epub' },
        entryPath: 'image/Page_1.jpg',
        versionPolicy: 'versioned-export',
      };
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) =>
          filePath === materializedPath ? 'vscode-webview://page-1.jpg' : undefined,
        ),
      };
      const contentAccessRuntime = {
        loadProviderAsset: vi.fn(async () => ({
          status: 'ready',
          source: { kind: 'file', path: materializedPath },
          diagnostics: [],
          uri: materializedPath,
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
        })),
      };
      const workItemProjections = {
        acceptWebviewMessage: vi.fn(),
      };
      processor = createAgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
        contentAccessRuntime: contentAccessRuntime as any,
        workItemProjections: workItemProjections as any,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-read-doc-image',
            name: 'ReadImage',
            arguments: {
              images: [{ label: 'Page 1', resourceRef: archiveRef }],
            },
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-read-doc-image',
            success: true,
            data: {
              source: { filePath: '/books/a.epub', format: 'epub' },
              images: [
                {
                  label: 'Page 1',
                  width: 1494,
                  height: 2133,
                  mimeType: 'image/jpeg',
                  resourceRef: archiveRef,
                  documentImage: {
                    resourceRef: archiveRef,
                  },
                },
              ],
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.result?.data).toEqual({
        source: { filePath: '/books/a.epub', format: 'epub' },
        images: [
          {
            label: 'Page 1',
            width: 1494,
            height: 2133,
            mimeType: 'image/jpeg',
            resourceRef: archiveRef,
            documentImage: {
              resourceRef: archiveRef,
            },
          },
        ],
      });
      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          caller: 'message-resource-projection',
          preferredTarget: 'local-path',
          variant: expect.objectContaining({ role: 'document-entry', mimeType: 'image/jpeg' }),
        }),
      );
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        materializedPath,
        'neko-agent.document-resource',
      );
      expect(getProjectedTimelineToolResult('conv-1', 'tc-read-doc-image')?.data).toMatchObject({
        images: [
          expect.objectContaining({
            resourceRef: archiveRef,
            documentImage: expect.objectContaining({ resourceRef: archiveRef }),
          }),
        ],
      });
      expect(getProjectedTimelineToolResult('conv-1', 'tc-read-doc-image')?.data).not.toMatchObject(
        {
          images: [expect.objectContaining({ renderUri: expect.any(String) })],
        },
      );
      expect(JSON.stringify(webview.postMessage.mock.calls)).not.toContain(materializedPath);
      expect(workItemProjections.acceptWebviewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agentTurnTimelineUpdate',
          operations: expect.arrayContaining([
            expect.objectContaining({
              operation: 'upsert',
              item: expect.objectContaining({
                kind: 'tool_call',
                payload: {
                  toolCall: expect.objectContaining({
                    result: {
                      data: expect.objectContaining({
                        images: [
                          expect.not.objectContaining({
                            renderUri: expect.any(String),
                          }),
                        ],
                      }),
                      success: true,
                      error: undefined,
                    },
                  }),
                },
              }),
            }),
          ]),
        }),
      );
    });

    it('keeps projected ReadImage resources on final repaired storyboard streamComplete', async () => {
      const materializedPath = '/workspace/.neko-runtime/resources/documents/doc_1/page-1.jpg';
      const archiveRef = {
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/story.epub', format: 'epub' },
        entryPath: 'OPS/page-1.jpg',
        versionPolicy: 'versioned-export',
      };
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) =>
          filePath === materializedPath ? 'vscode-webview://page-1.jpg' : undefined,
        ),
      };
      const contentAccessRuntime = {
        loadProviderAsset: vi.fn(async () => ({
          status: 'ready',
          source: { kind: 'file', path: materializedPath },
          diagnostics: [],
          uri: materializedPath,
          mimeType: 'image/jpeg',
          sizeBytes: 2048,
        })),
      };
      processor = createAgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
        contentAccessRuntime: contentAccessRuntime as any,
      });
      const repairedMarkdown = [
        '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| 开场 | S01 | P1 | 整页 | keep | 3s | 主角出现 | 缓慢推近 | 低风声 | 主角 |  | 黑白工业巨构前的孤独主角 | needs-review | use-as-reference | story | 建立空间与人物 | false |  |',
      ].join('\n');
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-read-image',
            name: 'ReadImage',
            arguments: {
              images: [{ alias: 'P1', label: 'Page 1', resourceRef: archiveRef }],
            },
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-read-image',
            success: true,
            data: {
              images: [
                {
                  alias: 'P1',
                  label: 'Page 1',
                  width: 1511,
                  height: 2160,
                  mimeType: 'image/jpeg',
                  resourceRef: archiveRef,
                },
              ],
            },
          },
        },
        {
          type: 'text_delta',
          content: '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |',
        },
        {
          type: 'assistant_text_replacement',
          replacement: { reason: 'output-validation-retry', attempt: 1 },
        },
        {
          type: 'text_delta',
          content: repairedMarkdown,
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      const streamComplete = webview.postMessage.mock.calls
        .map(([message]) => message)
        .find((message) => message.type === 'streamComplete');
      expect(streamComplete?.contentBlocks?.map((block: { type: string }) => block.type)).toEqual([
        'tool_call',
        'text',
      ]);
      expect(streamComplete?.contentBlocks?.[0]).toMatchObject({
        type: 'tool_call',
        toolCall: {
          id: 'tc-read-image',
          name: 'ReadImage',
          result: {
            success: true,
            data: {
              images: [
                expect.objectContaining({
                  alias: 'P1',
                  renderUri: 'vscode-webview://page-1.jpg',
                  resourceRef: archiveRef,
                }),
              ],
            },
          },
        },
      });
      expect(streamComplete?.contentBlocks?.[1]).toMatchObject({
        type: 'text',
        content: repairedMarkdown,
        isStreaming: false,
      });
      expect(JSON.stringify(streamComplete?.contentBlocks)).not.toContain('镜号');
      expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          caller: 'message-resource-projection',
          preferredTarget: 'local-path',
          variant: expect.objectContaining({ role: 'document-entry', mimeType: 'image/jpeg' }),
        }),
      );
    });

    it('projects top-level tool result media fields for webview delivery', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = createAgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const imagePath = '/tmp/page-1.jpg';
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-read-image',
            name: 'ReadImage',
            arguments: {},
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-read-image',
            success: true,
            data: { images: [{ path: imagePath, mimeType: 'image/jpeg', byteSize: 10 }] },
            attachments: [
              {
                type: 'image',
                path: imagePath,
                mimeType: 'image/jpeg',
                assetRef: {
                  assetId: 'read-image-page-1',
                  uri: imagePath,
                  mimeType: 'image/jpeg',
                },
              },
            ],
            perceptionCards: [
              {
                version: 1,
                assetId: 'read-image-page-1',
                modality: 'image',
                createdAt: 1,
                layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                perceptual: {
                  keyframeRefs: [
                    {
                      assetId: 'read-image-page-1',
                      uri: imagePath,
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(localResourceAccess.toWebviewUri).toHaveBeenCalled();
      expect(getProjectedTimelineToolResult('conv-1', 'tc-read-image')).toMatchObject({
        attachments: [
          expect.objectContaining({
            path: imagePath,
            assetRef: expect.objectContaining({ uri: imagePath }),
          }),
        ],
        perceptionCards: [
          expect.objectContaining({
            perceptual: expect.objectContaining({
              keyframeRefs: [expect.objectContaining({ uri: imagePath })],
            }),
          }),
        ],
      });
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResult' }),
      );
    });

    it('should handle tool_confirmation events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'write_file', arguments: {} },
        },
        {
          type: 'tool_confirmation',
          toolConfirmation: {
            toolCall: { id: 'tc-1', name: 'write_file' },
            action: 'confirm',
            description: 'Writing file',
            details: { path: '/tmp/out.ts' },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'tool_call',
            payload: {
              toolCall: expect.objectContaining({
                id: 'tc-1',
                name: 'write_file',
                pendingConfirmation: true,
              }),
            },
          }),
        ]),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolConfirmation' }),
      );
    });

    it('should handle error events', async () => {
      // Start with a non-idle phase so the phase transition to idle is triggered
      const events = toAsyncIterable([
        { type: 'text', content: 'Partial response' },
        { type: 'error', error: { message: 'Rate limited' } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.hasError).toBe(true);
      expect(result.errorMessage).toBe('Rate limited');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'error',
            payload: { message: 'Rate limited' },
          }),
        ]),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });

    it('should handle messageQueued events', async () => {
      const events = toAsyncIterable([
        {
          type: 'messageQueued',
          content: 'Queued message',
          pendingCount: 2,
          releasedQueuedMessageItem: {
            id: 'queue-1',
            conversationId: 'conv-1',
            content: 'Queued prompt',
            createdAt: 123,
            source: 'composer',
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'messageQueued',
          content: 'Queued message',
          pendingCount: 2,
          releasedItem: expect.objectContaining({
            id: 'queue-1',
            content: 'Queued prompt',
          }),
        }),
      );
    });

    it('should handle done event without treating usage as context tokens', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Done!' },
        { type: 'done', usage: { totalTokens: 1500 } },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount' }),
      );
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
    });

    it('should refresh context token count from the session after stream completion', async () => {
      processor = createAgentStreamProcessor({
        getContextTokenCount: vi.fn().mockReturnValue(2400),
      });
      const events = toAsyncIterable([
        { type: 'text', content: 'Done!' },
        { type: 'done', usage: { totalTokens: 1500 } },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount', tokenCount: 2400 }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount', tokenCount: 1500 }),
      );
    });

    it('should handle done event without usage', async () => {
      const events = toAsyncIterable([{ type: 'done' }]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      // Should not send token count
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount' }),
      );
    });

    it('should handle full conversation flow', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Analyzing...' },
        { type: 'text', content: 'I will read the file.' },
        { type: 'tool_call', toolCall: { id: 'tc-1', name: 'read', arguments: { p: '/f.ts' } } },
        { type: 'tool_result', toolResult: { toolCallId: 'tc-1', success: true, data: 'content' } },
        { type: 'text', content: ' Here is the result.' },
        { type: 'done', usage: { totalTokens: 500 } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Analyzing...');
      expect(result.accumulatedResponse).toBe('I will read the file. Here is the result.');
      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.hasError).toBe(false);
      // thinking + text + tool_call + text
      expect(result.contentBlocks).toHaveLength(4);
    });

    it('commits anchored turn projection without direct Timeline Webview messages', async () => {
      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          { type: 'text', content: 'Before tool.' },
          {
            type: 'tool_call',
            toolCall: { id: 'tc-1', name: 'read', arguments: { path: 'a.md' } },
          },
          {
            type: 'tool_result',
            toolResult: { toolCallId: 'tc-1', success: true, data: { text: 'A' } },
          },
          { type: 'text_delta', content: ' After tool.' },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'agentTurnTimeline' }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      expect(getProjectedTimelineItems('conv-1')).toEqual([
        expect.objectContaining({
          itemId: 'text-1',
          sequence: 1,
          kind: 'assistant_text',
          status: 'complete',
        }),
        expect.objectContaining({
          itemId: 'tool-tc-1',
          sequence: 2,
          status: 'succeeded',
          payload: {
            toolCall: {
              id: 'tc-1',
              name: 'read',
              arguments: { path: 'a.md' },
              result: { success: true, data: { text: 'A' } },
            },
          },
        }),
        expect.objectContaining({
          itemId: 'text-3',
          sequence: 3,
          kind: 'assistant_text',
          status: 'complete',
        }),
      ]);
      expect(
        getProjectedTurn('conv-1')?.completion?.finalContentBlocks?.map((block) => block.type),
      ).toEqual(['text', 'tool_call', 'text']);
    });

    it('should send full background task views for task progress updates', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const unsubscribe = vi.fn();
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return unsubscribe;
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
          saveOutputs: vi.fn(),
        },
      };
      const handleTerminalTask = vi.fn(async () => undefined);
      processor = createAgentStreamProcessor({
        platform: platform as any,
        taskResultObservations: { handleTerminalTask },
      });
      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'video',
                message: 'Generate a city flythrough',
                routedTo: { provider: 'runway' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => progressCallback !== undefined);

      await progressCallback?.({
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-video',
        status: 'processing',
        progress: 45,
        providerId: 'runway',
        modelId: 'gen-3',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: {
          prompt: 'Generate a city flythrough',
          metadata: { conversationId: 'conv-1', runId: 'run-media' },
        },
      });
      await progressCallback?.({
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-video',
        status: 'completed',
        progress: 100,
        providerId: 'runway',
        modelId: 'gen-3',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:02.000Z'),
        outputs: [{ type: 'video', url: 'https://example.com/video.mp4', mimeType: 'video/mp4' }],
        request: {
          prompt: 'Generate a city flythrough',
          metadata: { conversationId: 'conv-1', runId: 'run-media' },
        },
      });
      await processing;

      expect(getProjectedTimelineItems('conv-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'task',
            parentAnchor: 'tool_call',
            parentToolCallId: 'tc-media',
            payload: {
              workItem: expect.objectContaining({
                id: 'task-media',
                kind: 'tool-background-task',
              }),
            },
          }),
        ]),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'taskUpdated' }),
      );
      expect(handleTerminalTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-media',
          status: 'completed',
          lifecycle: expect.objectContaining({ ownerConversationId: 'conv-1' }),
        }),
        expect.objectContaining({
          source: 'media-task',
          parentMessageId: 'assistant-stream',
          parentToolCallId: 'tc-media',
        }),
      );
    });

    it('records completed generated images with ReadImage follow-up resource refs', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return vi.fn();
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
        },
      };
      const generatedPath = '/workspace/neko/generated/image/task-media_0.png';
      const mediaDeliveryHost = {
        createProgressViewDelivery: vi.fn(async () => ({
          view: {
            id: 'task-media',
            scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
            type: 'image',
            status: 'completed',
            progress: 100,
            result: { urls: ['webview-uri:/workspace/neko/generated/image/task-media_0.png'] },
            updatedAt: '2026-01-01T00:00:01.000Z',
          },
          deliveryPlan: {
            resultUrls: ['generated-assets/asset-1.png'],
            thumbnailUrl: 'generated-assets/asset-1.png',
            hostOutputPaths: [generatedPath],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
            generatedAssets: [
              {
                id: 'asset-1',
                type: 'generated-image',
                path: generatedPath,
                assetRef: {
                  assetId: 'asset-1',
                  uri: 'generated-assets/asset-1.png',
                  mimeType: 'image/png',
                },
                lifecycle: createGeneratedAssetRevisionRef({
                  assetId: 'asset-1',
                  contentDigest: 'sha256:image',
                  mediaKind: 'image',
                  mimeType: 'image/png',
                  generation: {
                    taskId: 'task-media',
                    runId: 'run-media',
                    providerId: 'openai',
                    modelId: 'gpt-image-1',
                  },
                }),
                mimeType: 'image/png',
                generatedAt: '2026-01-01T00:00:01.000Z',
                width: 1024,
                height: 1024,
                ratio: '1:1',
              },
            ],
          },
        })),
      };
      const followUpPrompts: string[] = [];
      const handleTerminalTask = vi.fn(async (task, options) => {
        const observation = normalizeAgentTaskResultObservation({
          task,
          source: 'media-task',
          ...(options.parentMessageId ? { parentMessageId: options.parentMessageId } : {}),
          ...(options.parentToolCallId ? { parentToolCallId: options.parentToolCallId } : {}),
        });
        const decision = evaluateAgentTaskResultDelivery({
          observation,
          policy: options.deliveryPolicy,
          now: 40,
        });
        if (decision.kind === 'auto-resume-agent') {
          followUpPrompts.push(decision.followUpRequest.prompt);
        }
      });
      processor = createAgentStreamProcessor({
        platform: platform as any,
        mediaDeliveryHost: mediaDeliveryHost as any,
        taskResultObservations: { handleTerminalTask },
      });
      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                runStartedAt: 101,
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => progressCallback !== undefined);

      const completedTask = {
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        completedAt: new Date('2026-01-01T00:00:01.000Z'),
        outputs: [{ type: 'image', url: 'https://example.com/image.png', mimeType: 'image/png' }],
        request: {
          prompt: 'Generate a cat',
          metadata: {
            conversationId: 'conv-1',
            runId: 'run-media',
            runStartedAt: 101,
            resultDeliveryPolicy: { kind: 'auto-resume-agent' },
          },
        },
      };
      waitForTask.resolve(completedTask);
      await progressCallback?.(completedTask);
      await processing;

      const observedTask = handleTerminalTask.mock.calls[0]?.[0];
      const assets = (observedTask?.output?.data as { assets?: readonly unknown[] } | undefined)
        ?.assets;

      expect(assets?.[0]).toMatchObject({
        id: 'asset-1',
        mimeType: 'image/png',
        resourceRef: {
          provider: 'generated-asset',
          kind: 'generated',
          source: {
            kind: 'generated-asset',
            generatedAssetId: 'asset-1',
          },
        },
        localPath: generatedPath,
      });
      expect(followUpPrompts[0]).toContain('Generated image inputs for ReadImage:');
      expect(followUpPrompts[0]).toContain('"resourceRef"');
      expect(followUpPrompts[0]).toContain('Do not use the task id');
      expect(followUpPrompts[0]).not.toContain('- asset: asset-1');
    });

    it('should backfill completed media assets with stable refs and trigger perception', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const backfillSink = { applyBackfill: vi.fn().mockResolvedValue(undefined) };
      const perceptionPipeline = { perceive: vi.fn().mockResolvedValue({ card: {} }) };
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return vi.fn();
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
        },
      };
      const mediaDeliveryHost = {
        createProgressViewDelivery: vi.fn(async () => ({
          view: {
            id: 'task-media',
            scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
            type: 'image',
            status: 'completed',
            progress: 100,
            result: { urls: ['webview-uri:/workspace/.neko/generated/image/out.png'] },
            updatedAt: '2026-01-01T00:00:01.000Z',
          },
          deliveryPlan: {
            resultUrls: ['/workspace/.neko/generated/image/out.png'],
            thumbnailUrl: '/workspace/.neko/generated/image/out.png',
            localPaths: ['/workspace/.neko/generated/image/out.png'],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
            generatedAssets: [
              {
                id: 'asset-1',
                type: 'generated-image',
                path: '/workspace/.neko/generated/image/out.png',
                assetRef: {
                  assetId: 'asset-1',
                  uri: 'generated-assets/asset-1.png',
                  mimeType: 'image/png',
                },
                mimeType: 'image/png',
                generatedAt: '2026-01-01T00:00:01.000Z',
                width: 1024,
                height: 1024,
                ratio: '1:1',
              },
            ],
          },
        })),
      };
      processor = createAgentStreamProcessor({
        platform: platform as any,
        mediaDeliveryHost: mediaDeliveryHost as any,
        mediaBackfill: {
          backfillSink,
          perceptionPipeline: perceptionPipeline as any,
        },
      });

      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => progressCallback !== undefined);

      const completedTask = {
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        outputs: [{ type: 'image', url: 'https://example.com/image.png', mimeType: 'image/png' }],
        request: {
          prompt: 'Generate a cat',
          metadata: {
            conversationId: 'conv-1',
            runId: 'run-media',
            understandingModels: {
              image: { providerId: 'google', modelId: 'gemini-flash' },
            },
          },
        },
      };
      waitForTask.resolve(completedTask);
      await progressCallback?.(completedTask);
      await processing;

      expect(backfillSink.applyBackfill).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tc-media',
          dataPatch: expect.objectContaining({
            status: 'completed',
            taskId: 'task-media',
            resultAssetRefs: [
              expect.objectContaining({
                uri: 'generated-assets/asset-1.png',
                mimeType: 'image/png',
              }),
            ],
          }),
          attachments: [
            expect.objectContaining({
              type: 'image',
              path: 'generated-assets/asset-1.png',
            }),
          ],
        }),
      );
      expect(perceptionPipeline.perceive).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: expect.objectContaining({
            ref: expect.objectContaining({
              uri: 'generated-assets/asset-1.png',
            }),
          }),
          sourceToolCallId: 'tc-media',
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-flash' },
          },
          policy: expect.objectContaining({ timing: 'on-completion', layers: [0, 2] }),
        }),
      );
    });

    it('should not backfill cache-local generated assets without stable refs', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const backfillSink = { applyBackfill: vi.fn().mockResolvedValue(undefined) };
      const perceptionPipeline = { perceive: vi.fn().mockResolvedValue({ card: {} }) };
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return vi.fn();
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
        },
      };
      const mediaDeliveryHost = {
        createProgressViewDelivery: vi.fn(async () => ({
          view: {
            id: 'task-media',
            scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
            type: 'image',
            status: 'completed',
            progress: 100,
            result: { urls: ['webview-uri:/workspace/.neko/.cache/generated/image/out.png'] },
            updatedAt: '2026-01-01T00:00:01.000Z',
          },
          deliveryPlan: {
            resultUrls: ['/workspace/.neko/.cache/generated/image/out.png'],
            thumbnailUrl: '/workspace/.neko/.cache/generated/image/out.png',
            localPaths: ['/workspace/.neko/.cache/generated/image/out.png'],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
            generatedAssets: [
              {
                id: 'draft-asset-1',
                type: 'generated-image',
                path: '/workspace/.neko/.cache/generated/image/out.png',
                mimeType: 'image/png',
                generatedAt: '2026-01-01T00:00:01.000Z',
                width: 1024,
                height: 1024,
                ratio: '1:1',
              },
            ],
          },
        })),
      };
      processor = createAgentStreamProcessor({
        platform: platform as any,
        mediaDeliveryHost: mediaDeliveryHost as any,
        mediaBackfill: {
          backfillSink,
          perceptionPipeline: perceptionPipeline as any,
        },
      });

      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => progressCallback !== undefined);

      const completedTask = {
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        outputs: [{ type: 'image', url: 'https://example.com/image.png', mimeType: 'image/png' }],
        request: {
          prompt: 'Generate a cat',
          metadata: { conversationId: 'conv-1', runId: 'run-media' },
        },
      };
      waitForTask.resolve(completedTask);
      await progressCallback?.(completedTask);
      await processing;

      expect(backfillSink.applyBackfill).toHaveBeenCalledWith(
        expect.objectContaining({
          dataPatch: expect.objectContaining({
            resultAssetRefs: [],
          }),
          attachments: [],
        }),
      );
      expect(perceptionPipeline.perceive).not.toHaveBeenCalled();
    });

    it('should ignore background task progress from another conversation', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const unsubscribe = vi.fn();
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return unsubscribe;
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
          saveOutputs: vi.fn(),
        },
      };
      processor = createAgentStreamProcessor({ platform: platform as any });

      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => progressCallback !== undefined);

      await progressCallback?.({
        id: 'task-media',
        scope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
        type: 'text-to-image',
        status: 'processing',
        progress: 50,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: {
          prompt: 'Generate a cat',
          metadata: { conversationId: 'conv-other', runId: 'run-other' },
        },
      });
      await processing;

      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'taskUpdated' }),
      );
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should dispose background task progress subscriptions', async () => {
      const unsubscribe = vi.fn();
      const waitForTask = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, _callback: (task: any) => Promise<void>) => {
            return unsubscribe;
          }),
          waitForTask: vi.fn(() => waitForTask.promise),
          saveOutputs: vi.fn(),
        },
      };
      processor = createAgentStreamProcessor({ platform: platform as any });

      const processing = processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                conversationId: 'conv-1',
                runId: 'run-media',
                taskId: 'task-media',
                taskScope: createTaskRunScope('conv-1', 'run-media', 'task-media'),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );
      await waitForCondition(() => platform.media.onProgress.mock.calls.length === 1);

      processor.dispose();
      await processing;

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should clear background task progress subscriptions by conversation', async () => {
      const unsubscribeA = vi.fn();
      const unsubscribeB = vi.fn();
      const waitForTaskA = createDeferred<any>();
      const waitForTaskB = createDeferred<any>();
      const platform = {
        media: {
          onProgress: vi
            .fn()
            .mockImplementationOnce(
              (_taskId: string, _callback: (task: any) => Promise<void>) => unsubscribeA,
            )
            .mockImplementationOnce(
              (_taskId: string, _callback: (task: any) => Promise<void>) => unsubscribeB,
            ),
          waitForTask: vi
            .fn()
            .mockImplementationOnce(() => waitForTaskA.promise)
            .mockImplementationOnce(() => waitForTaskB.promise),
          saveOutputs: vi.fn(),
        },
      };
      processor = createAgentStreamProcessor({ platform: platform as any });

      const events = (conversationId: string, taskId: string) =>
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: `tc-${taskId}`,
              success: true,
              data: {
                backgroundMode: true,
                conversationId,
                runId: `run-${taskId}`,
                taskId,
                taskScope: createTaskRunScope(conversationId, `run-${taskId}`, taskId),
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]);

      const first = processor.processStream(
        webview as any,
        'conv-a',
        events('conv-a', 'task-a'),
        callbacks,
      );
      await waitForCondition(() => platform.media.onProgress.mock.calls.length === 1);
      const second = processor.processStream(
        webview as any,
        'conv-b',
        events('conv-b', 'task-b'),
        callbacks,
      );
      await waitForCondition(() => platform.media.onProgress.mock.calls.length === 2);

      processor.clearConversation('conv-a');
      waitForTaskB.resolve({
        id: 'task-b',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        outputs: [{ type: 'image', url: 'https://example.com/image.png', mimeType: 'image/png' }],
        request: {
          prompt: 'Generate a cat',
          metadata: { conversationId: 'conv-b', runId: 'run-task-b' },
        },
      });
      await Promise.all([first, second]);

      expect(unsubscribeA).toHaveBeenCalledTimes(1);
      expect(unsubscribeB).not.toHaveBeenCalled();
    });
  });

  describe('updateToolResultWithUrls', () => {
    it('should do nothing without conversations', () => {
      processor = createAgentStreamProcessor({});
      // Should not throw
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/path/to/file.png']);
    });

    it('should update tool results matching taskId in contentBlocks', () => {
      const messages = [
        {
          contentBlocks: [
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'generate',
                arguments: {},
                result: {
                  success: true,
                  data: { taskId: 'task-2', backgroundMode: true },
                },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        updateMessagesForConversation: vi.fn(),
      };

      processor = createAgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-2', ['/out/video.mp4']);

      expect(conversations.updateMessagesForConversation).toHaveBeenCalled();
    });

    it('should not update when taskId does not match', () => {
      const messages = [
        {
          contentBlocks: [
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'generate',
                arguments: {},
                result: {
                  success: true,
                  data: { taskId: 'task-99', backgroundMode: true },
                },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        updateMessagesForConversation: vi.fn(),
      };

      processor = createAgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/out/file.png']);

      expect(conversations.updateMessagesForConversation).not.toHaveBeenCalled();
    });

    it('should handle missing conversation gracefully', () => {
      const conversations = {
        get: vi.fn().mockReturnValue(undefined),
        updateMessagesForConversation: vi.fn(),
      };

      processor = createAgentStreamProcessor({ conversations: conversations as any });
      // Should not throw
      processor.updateToolResultWithUrls('conv-missing', 'task-1', ['/file.png']);
      expect(conversations.updateMessagesForConversation).not.toHaveBeenCalled();
    });
  });
});

function makeEntityMemoryContribution(): EntityMemoryContribution {
  return {
    contributionId: 'contribution-page-1',
    sourcePackage: 'neko-agent',
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'tc-memory',
      assetIndex: 0,
    },
    reviewPolicy: 'requires-user-review',
    characterObservations: [
      {
        observationId: 'obs-page-1-hero',
        sourceRef: {
          kind: 'tool-result',
          toolCallId: 'tc-memory',
          assetIndex: 0,
          range: { panelId: 'P1' },
        },
        provenance: {
          source: 'comic',
          providerId: 'neko-agent',
          toolCallId: 'tc-memory',
        },
        reviewStatus: 'needs-review',
        mention: {
          mentionId: 'mention-page-1-hero',
          kind: 'visual',
          candidateName: '少年英雄',
          confidence: 0.86,
        },
        dimensions: [
          {
            dimension: 'appearance',
            value: 'Short dark hair and hooded jacket',
            confidence: 0.8,
          },
        ],
        confidence: 0.84,
      },
    ],
  };
}

function makeReadImageArguments(): Record<string, unknown> {
  return {
    images: [
      {
        label: 'Page 1',
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'OPS/page-1.jpg',
          versionPolicy: 'versioned-export',
        },
      },
    ],
  };
}

function makeReadImageResultData(): Record<string, unknown> {
  return {
    images: [
      {
        label: 'Page 1',
        resourceRef: {
          kind: 'document-entry',
          source: { filePath: '/books/a.epub', format: 'epub' },
          entryPath: 'OPS/page-1.jpg',
          versionPolicy: 'versioned-export',
        },
      },
    ],
  };
}
