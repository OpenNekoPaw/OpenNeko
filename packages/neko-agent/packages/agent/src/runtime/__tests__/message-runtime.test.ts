import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MENTION_EXCLUDE_GLOB } from '../../input/mention-excludes';
import {
  AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
  AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
  type AgentContextPayload,
  type ResourceRef,
} from '@neko/shared';
import {
  AGENT_TURN_PRECONDITION_MESSAGE,
  appendAmbientCanvasSystemPrompt,
  buildAgentAssistantMessageFromStream,
  buildAgentErrorAssistantMessage,
  buildAgentExecutionMetadata,
  buildAgentProjectFileSearchPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  buildAgentTurnExecutionMetadata,
  buildAgentTurnRuntimePlan,
  buildEnhancedAgentMessage,
  buildProviderExpressionTargets,
  buildRuntimeMediaModelSelections,
  createAgentMessageId,
  executeAgentProjectFileSearch,
  formatAgentContextPayload,
  mergeReferencedMediaImageAttachments,
  prepareAgentMessageDispatch,
  prepareAgentMessageFileReferences,
  projectAgentFileMentions,
  projectAgentMentionExtras,
  projectAgentProjectFilesMessage,
  projectContextReferences,
  projectThreeReferenceContextImageResources,
  runAgentMessageTurnRuntime,
  selectAgentTurnProvider,
  shouldPersistAgentAssistantStream,
  summarizeAgentEventProgress,
  type AgentThreeReferenceImageResource,
} from '../turn/message-runtime';

describe('message runtime helpers', () => {
  it('creates deterministic agent message ids when adapters are provided', () => {
    expect(
      createAgentMessageId({
        now: () => 1000,
        randomSuffix: () => 'abc123456',
      }),
    ).toBe('1000-abc123456');
  });

  it('maps agent media models to capability-specific provider expression targets', () => {
    expect(
      buildProviderExpressionTargets({
        image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
        video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      }),
    ).toEqual([
      { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro-1.1' },
      { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
    ]);
  });

  it('maps a non-agent media model to all generation capabilities', () => {
    expect(
      buildProviderExpressionTargets(undefined, {
        providerId: 'openai',
        modelId: 'gpt-image-1',
        category: 'image',
      }),
    ).toEqual([
      { capability: 'image.generate', providerId: 'openai', modelId: 'gpt-image-1' },
      { capability: 'video.generate', providerId: 'openai', modelId: 'gpt-image-1' },
      { capability: 'audio.generate', providerId: 'openai', modelId: 'gpt-image-1' },
    ]);
  });

  it('projects music-capable audio models through the audio runtime slot', () => {
    expect(
      buildRuntimeMediaModelSelections({
        audio: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    ).toEqual({
      audio: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
    });
  });

  it('keeps generic execution overrides and media models without creating plan runtime metadata', () => {
    expect(
      buildAgentTurnExecutionMetadata(
        'plan',
        {
          traceId: 'trace-1',
        },
        {
          image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
        },
        {
          image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
        },
      ),
    ).toEqual({
      traceId: 'trace-1',
      mediaModels: {
        image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
      },
      understandingModels: {
        image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
      },
    });
  });

  it('builds execution metadata from context packet and conversation lineage', () => {
    expect(
      buildAgentExecutionMetadata({
        metadata: { traceId: 'trace-1' },
        multimodalContextPacket: { kind: 'canvas-selection' },
        conversationId: 'conv-1',
        parentAgentId: 'agent-conv-1',
      }),
    ).toEqual({
      traceId: 'trace-1',
      multimodalContextPacket: { kind: 'canvas-selection' },
      conversationId: 'conv-1',
      parentAgentId: 'agent-conv-1',
    });
  });

  it('summarizes agent events into subagent progress labels', () => {
    expect(
      summarizeAgentEventProgress({
        type: 'tool_progress',
        toolProgress: {
          toolCallId: 'tool-1',
          toolName: 'read_file',
          percent: 42,
          stage: 'Reading file',
        },
      }),
    ).toBe('42% Reading file');
  });

  it('assembles enhanced user message from referenced files and attachments', () => {
    expect(
      buildEnhancedAgentMessage({
        message: 'please inspect this',
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello world' },
          },
        ],
        fileContents: [{ path: 'src/app.ts', content: 'export const app = true;' }],
        attachmentText: '\nAttachment body',
      }),
    ).toContain('### File: src/app.ts');
  });

  it('formats structured context payloads inside the agent runtime', () => {
    expect(
      formatAgentContextPayload({
        type: 'document-selection',
        id: 'selection-1',
        label: 'Selection',
        summary: 'Selected text',
        data: { selectedText: 'hello world' },
      }),
    ).toBe('[Content: Selection]\nhello world');

    expect(
      formatAgentContextPayload({
        type: 'file',
        id: 'file-1',
        label: 'notes.md',
        summary: 'File notes',
        data: { filePath: 'notes.md' },
      }),
    ).toBe('[File: notes.md]\nnotes.md');
  });

  it('preserves 3D reference roles and guide restrictions in Agent evidence', () => {
    const payload = threeReferencePayload();
    const projected = formatAgentContextPayload(payload);

    expect(projected).toContain('[3D Reference: Neutral mannequin]');
    expect(projected).toContain('Guide restriction: not an appearance reference');
    expect(projected).toContain('Pose control (depth): pose-control');
    expect(projected).toContain('Camera: front, FOV 45°, aspect 1');
    expect(projected).not.toContain('ordinary image');
    expect(projectThreeReferenceContextImageResources([payload])).toEqual([
      { role: 'pose', resource: resourceRef('pose-control') },
      { role: 'camera', resource: resourceRef('camera-composition') },
    ]);
  });

  it('rejects invalid 3D reference payloads instead of projecting generic context', () => {
    const payload: AgentContextPayload = {
      type: '3d-reference',
      id: '3d-reference:invalid',
      label: 'Invalid reference',
      summary: 'Invalid',
      data: {},
    };

    expect(() => projectThreeReferenceContextImageResources([payload])).toThrow(
      /Agent 3D Reference context is invalid/,
    );
  });

  it('does not treat non-document context data as document context by field shape alone', () => {
    expect(
      formatAgentContextPayload({
        type: 'file',
        id: 'file-1',
        label: 'notes.md',
        summary: 'File notes',
        data: {
          filePath: 'notes.md',
          source: { provider: 'workspace' },
          excerpt: { text: 'not a document selection' },
        },
      }),
    ).toBe('[File: notes.md]\nnotes.md');
  });

  it('formats only resolved Entity snapshots as Agent context', () => {
    expect(
      formatAgentContextPayload({
        type: 'entity',
        id: 'entity:char-xiaoju',
        label: '小橘',
        summary: 'thin search summary',
        data: {
          schemaVersion: AGENT_RESOLVED_ENTITY_CONTEXT_SCHEMA_VERSION,
          kind: AGENT_RESOLVED_ENTITY_CONTEXT_KIND,
          entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
          entity: {
            id: 'char-xiaoju',
            kind: 'character',
            canonicalName: '小橘',
            displayName: '橘猫侦探',
            aliases: ['橘子'],
            status: 'confirmed',
            metadata: { role: '侦探' },
          },
        },
      }),
    ).toContain('Canonical name: 小橘');

    expect(() =>
      formatAgentContextPayload({
        type: 'entity',
        id: 'entity:char-xiaoju',
        label: '小橘',
        summary: 'thin search summary',
        data: { navigationData: { sourceId: 'char-xiaoju' } },
      }),
    ).toThrow('Agent Entity context is unresolved');
  });

  it('formats document context source and locator metadata for follow-up reads', () => {
    expect(
      formatAgentContextPayload({
        type: 'document-selection',
        id: 'selection-1',
        label: 'book.epub · Chapter 1',
        summary: 'Selected text',
        data: {
          filePath: '/books/book.epub',
          text: 'selected paragraph',
          contentKind: 'text',
          source: { filePath: '/books/book.epub', format: 'epub', fileId: 'book-1' },
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          excerpt: { contentKind: 'text', text: 'selected paragraph', truncated: false },
        },
      }),
    ).toContain('Follow-up: use ReadDocument with the structured source ref shown above');
  });

  it('instructs document reads through canonical source refs', () => {
    const enhanced = buildEnhancedAgentMessage({
      message: 'analyze this',
      documentReferences: [{ path: '${A}/books/book.epub' }],
    });

    expect(enhanced).toContain('source={"kind":"file","path":"${A}/books/book.epub"}');
  });

  it('localizes runtime document reference instructions while preserving tool contracts', () => {
    const enhanced = buildEnhancedAgentMessage({
      message: '分析前10页，生成分镜表',
      documentReferences: [{ path: '${A}/books/book.epub' }],
      locale: 'zh-CN',
    });

    expect(enhanced).toContain('--- 引用文档 ---');
    expect(enhanced).toContain('[文档: ${A}/books/book.epub]');
    expect(enhanced).toContain('分析该文档前，先调用 ReadDocument');
    expect(enhanced).toContain('source={"kind":"file","path":"${A}/books/book.epub"}');
    expect(enhanced).not.toContain('--- Referenced Documents ---');
    expect(enhanced).not.toContain('Do not inline the whole document as chat context.');
  });

  it('localizes structured document context labels for zh runtime prompts', () => {
    const projected = formatAgentContextPayload(
      {
        type: 'document-selection',
        id: 'selection-1',
        label: 'book.epub · Chapter 1',
        summary: 'Selected text',
        data: {
          filePath: '/books/book.epub',
          text: 'selected paragraph',
          contentKind: 'text',
          source: { filePath: '/books/book.epub', format: 'epub', fileId: 'book-1' },
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          excerpt: { contentKind: 'text', text: 'selected paragraph', truncated: false },
        },
      },
      'zh',
    );

    expect(projected).toContain('[文档: book.epub · Chapter 1]');
    expect(projected).toContain('来源: /books/book.epub');
    expect(projected).toContain('格式: epub');
    expect(projected).toContain('摘录:\nselected paragraph');
    expect(projected).toContain('调用 ReadDocument');
    expect(projected).not.toContain('Follow-up: use ReadDocument');
  });

  it('prepares referenced file contents with injected input processor', async () => {
    const onReferenceError = vi.fn();

    const result = await prepareAgentMessageFileReferences({
      messageText: 'inspect @src/app.ts',
      inputProcessor: {
        process: async () => ({
          fileReferences: [
            { path: 'src/app.ts', content: 'export const app = true;' },
            { path: 'src/missing.ts' },
          ],
          errors: [{ reference: '@src/missing.ts', error: 'missing' }],
        }),
      },
      onReferenceError,
    });

    expect(result).toEqual({
      message: 'inspect @src/app.ts',
      fileContents: [{ path: 'src/app.ts', content: 'export const app = true;' }],
      documentReferences: [],
    });
    expect(onReferenceError).toHaveBeenCalledWith({
      reference: '@src/missing.ts',
      error: 'missing',
    });
  });

  it('prepares document references without asking the input processor to inline them', async () => {
    const process = vi.fn(async () => ({
      fileReferences: [{ path: 'src/app.ts', content: 'export const app = true;' }],
      errors: [],
    }));

    const result = await prepareAgentMessageFileReferences({
      messageText: '分析 @${A}/books/story.epub 并检查 @src/app.ts',
      inputProcessor: {
        parseReferences: () => [
          {
            original: '@${A}/books/story.epub',
            path: '${A}/books/story.epub',
          },
          { original: '@src/app.ts', path: 'src/app.ts' },
        ],
        process,
      },
    });

    expect(process).toHaveBeenCalledWith('分析  并检查 @src/app.ts');
    expect(result.fileContents).toEqual([
      { path: 'src/app.ts', content: 'export const app = true;' },
    ]);
    expect(result.documentReferences).toEqual([{ path: '${A}/books/story.epub' }]);
  });

  it('keeps message usable when referenced file processor throws', async () => {
    const onProcessingError = vi.fn();

    await expect(
      prepareAgentMessageFileReferences({
        messageText: 'inspect @src/app.ts',
        inputProcessor: {
          process: async () => {
            throw new Error('processor failed');
          },
        },
        onProcessingError,
      }),
    ).resolves.toEqual({
      message: 'inspect @src/app.ts',
      fileContents: [],
      documentReferences: [],
    });
    expect(onProcessingError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('merges preprocessed referenced media images lazily', async () => {
    const onProcessed = vi.fn();
    const createMediaProcessor = vi.fn().mockResolvedValue({
      process: vi.fn().mockResolvedValue({
        type: 'video-frames',
        images: [{ media_type: 'image/jpeg', data: 'frame-1' }],
        metadata: { frameCount: 1 },
      }),
    });

    await expect(
      mergeReferencedMediaImageAttachments({
        message: '[File: clip.mp4]\n/tmp/clip.mp4',
        existingImages: [{ type: 'base64', media_type: 'image/png', data: 'existing' }],
        createMediaProcessor,
        onProcessed,
      }),
    ).resolves.toEqual([
      { type: 'base64', media_type: 'image/png', data: 'existing' },
      { type: 'base64', media_type: 'image/jpeg', data: 'frame-1' },
    ]);
    expect(createMediaProcessor).toHaveBeenCalledTimes(1);
    expect(onProcessed).toHaveBeenCalledWith({
      filePath: '/tmp/clip.mp4',
      mediaType: 'video-frames',
      metadata: { frameCount: 1 },
    });
  });

  it('does not create a media processor when no file chips exist', async () => {
    const createMediaProcessor = vi.fn();

    await expect(
      mergeReferencedMediaImageAttachments({
        message: 'plain text',
        existingImages: [],
        createMediaProcessor,
      }),
    ).resolves.toEqual([]);
    expect(createMediaProcessor).not.toHaveBeenCalled();
  });

  it('prepares a complete media dispatch from files, attachments, and referenced media', async () => {
    const createReferencedMediaProcessor = vi.fn().mockResolvedValue({
      process: vi.fn().mockResolvedValue({
        type: 'video-frames',
        images: [{ media_type: 'image/jpeg', data: 'frame-1' }],
      }),
    });

    await expect(
      prepareAgentMessageDispatch({
        request: {
          conversationId: 'conv-1',
          messageText: 'render this [File: clip]\n/tmp/clip.mp4',
          sessionMode: 'image',
          mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          attachments: [{ id: 'att-1', name: 'notes.txt', type: 'file', path: '/tmp/notes.txt' }],
        },
        inputProcessor: {
          process: async () => ({
            fileReferences: [{ path: 'src/story.md', content: 'Story beat' }],
            errors: [],
          }),
        },
        processAttachments: async () => ({
          textContent: '\nAttachment notes',
          imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'attached' }],
        }),
        createReferencedMediaProcessor,
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({
      conversationId: 'conv-1',
      enhancedMessage: expect.stringContaining('### File: src/story.md'),
      userMessage: {
        id: 'user-1',
        role: 'user',
        content: 'render this [File: clip]\n/tmp/clip.mp4',
        timestamp: 123,
        attachments: [{ id: 'att-1', name: 'notes.txt', type: 'file', path: '/tmp/notes.txt' }],
      },
      mediaImages: [
        { type: 'base64', media_type: 'image/png', data: 'attached' },
        { type: 'base64', media_type: 'image/jpeg', data: 'frame-1' },
      ],
      route: {
        kind: 'media',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      },
    });
    expect(createReferencedMediaProcessor).toHaveBeenCalledTimes(1);
  });

  it('adds exact 3D reference resources to the Agent multimodal attachments', async () => {
    const processContextImageResources = vi.fn(
      async (resources: readonly AgentThreeReferenceImageResource[]) =>
        resources.map((input) => ({
          type: 'base64' as const,
          media_type: 'image/png',
          data: input.resource.id,
        })),
    );

    const prepared = await prepareAgentMessageDispatch({
      request: {
        conversationId: 'conv-3d',
        messageText: 'Use this reference',
        sessionMode: 'agent',
        contextPayloads: [threeReferencePayload()],
      },
      processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
      processContextImageResources,
      generateMessageId: () => 'user-3d',
    });

    expect(processContextImageResources).toHaveBeenCalledWith([
      { role: 'pose', resource: resourceRef('pose-control') },
      { role: 'camera', resource: resourceRef('camera-composition') },
    ]);
    expect(prepared.mediaImages).toEqual([
      { type: 'base64', media_type: 'image/png', data: 'pose-control' },
      { type: 'base64', media_type: 'image/png', data: 'camera-composition' },
    ]);
  });

  it('routes agent-mode messages to the agent path', async () => {
    await expect(
      prepareAgentMessageDispatch({
        request: {
          conversationId: 'conv-1',
          messageText: 'help',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({
      conversationId: 'conv-1',
      enhancedMessage: 'help',
      userMessage: {
        id: 'user-1',
        role: 'user',
        content: 'help',
        timestamp: 123,
      },
      mediaImages: [],
      route: { kind: 'agent' },
    });
  });
  it('rejects message turns without an explicit conversationId', async () => {
    const postMessage = vi.fn();
    const persistUserMessage = vi.fn();
    const processAttachments = vi.fn(async () => ({
      textContent: '',
      imageAttachments: [],
    }));
    const onMissingConversationId = vi.fn();

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: '',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments,
        persistUserMessage,
        postMessage,
        onMissingConversationId,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'rejected-missing-conversation' });

    expect(onMissingConversationId).toHaveBeenCalledTimes(1);
    expect(processAttachments).not.toHaveBeenCalled();
    expect(persistUserMessage).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot send message without an explicit conversationId.',
    });
  });

  it('persists the user message and posts thinking before executing an agent turn', async () => {
    const events: string[] = [];
    const executeAgentTurn = vi.fn(async () => {
      events.push('execute-agent');
    });

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'inspect @src/app.ts',
          sessionMode: 'agent',
          chatModel: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
          agentModels: {
            primary: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
          },
          llmConfig: {
            reasoningPreset: 'balanced',
            creativityPreset: 'creative',
          },
          llmRuntimeOptions: {
            temperature: 0.7,
            topP: 0.95,
            thinkingBudget: 4096,
          },
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
          },
        },
        inputProcessor: {
          process: async () => ({
            fileReferences: [{ path: 'src/app.ts', content: 'export const app = true;' }],
            errors: [],
          }),
        },
        processAttachments: async () => ({
          textContent: '\nAttachment body',
          imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'image-1' }],
        }),
        persistUserMessage: (conversationId, message) => {
          events.push(`persist:${conversationId}:${message.role}`);
        },
        postMessage: (message) => {
          events.push(`post:${message.type}`);
        },
        executeAgentTurn,
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({ status: 'agent-dispatched' });

    expect(events).toEqual(['persist:conv-1:user', 'post:thinking', 'execute-agent']);
    expect(executeAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        message: expect.stringContaining('### File: src/app.ts'),
        chatModel: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
        agentModels: {
          primary: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
        },
        llmConfig: {
          reasoningPreset: 'balanced',
          creativityPreset: 'creative',
        },
        llmRuntimeOptions: {
          temperature: 0.7,
          topP: 0.95,
          thinkingBudget: 4096,
        },
        understandingModels: {
          image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
        },
        imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'image-1' }],
      }),
    );
  });

  it('removes the prewritten user message when the agent turn is queued', async () => {
    const removeUserMessage = vi.fn();
    const executeAgentTurn = vi.fn(async () => ({ status: 'queued' as const, pendingCount: 1 }));

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'continue after current turn',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({
          textContent: '',
          imageAttachments: [],
        }),
        persistUserMessage: vi.fn(),
        removeUserMessage,
        postMessage: vi.fn(),
        executeAgentTurn,
        generateMessageId: () => 'user-queued',
        now: () => 123,
      }),
    ).resolves.toEqual({ status: 'agent-queued', pendingCount: 1 });

    expect(removeUserMessage).toHaveBeenCalledWith('conv-1', 'user-queued');
  });

  it('returns the agent turn precondition result without reporting dispatch success', async () => {
    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({
          textContent: '',
          imageAttachments: [],
        }),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeAgentTurn: async () => ({
          status: 'precondition-unmet',
          reason: 'chat-provider-not-configured',
        }),
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({
      status: 'agent-precondition-unmet',
      reason: 'chat-provider-not-configured',
    });
  });

  it('returns the agent turn failure result without reporting dispatch success', async () => {
    const error = new Error('stream failed');

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({
          textContent: '',
          imageAttachments: [],
        }),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeAgentTurn: async () => ({ status: 'failed', error }),
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'agent-failed', error });
  });

  it('adds runtime locale metadata before dispatching to the agent executor', async () => {
    const executeAgentTurn = vi.fn(async () => undefined);

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: '分析前10页，生成分镜表',
          sessionMode: 'agent',
          locale: 'zh-CN',
          executionOverrides: { metadata: { traceId: 'trace-1' } },
        },
        processAttachments: async () => ({
          textContent: '',
          imageAttachments: [],
        }),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeAgentTurn,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'agent-dispatched' });

    expect(executeAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        executionOverrides: {
          metadata: {
            traceId: 'trace-1',
            locale: 'zh',
          },
        },
        locale: 'zh-CN',
      }),
    );
  });

  it('runs turn preflight before preparing and dispatching the agent message', async () => {
    const events: string[] = [];

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: '分析前10页，生成分镜表',
          sessionMode: 'agent',
        },
        beforePrepareAgentTurn: async ({ conversationId, userInput }) => {
          events.push(`preflight:${conversationId}:${userInput}`);
        },
        processAttachments: async () => {
          events.push('prepare-attachments');
          return { textContent: '', imageAttachments: [] };
        },
        persistUserMessage: () => {
          events.push('persist-user');
        },
        postMessage: (message) => {
          events.push(`post:${message.type}`);
        },
        executeAgentTurn: async () => {
          events.push('execute-agent');
        },
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'agent-dispatched' });

    expect(events).toEqual([
      'preflight:conv-1:分析前10页，生成分镜表',
      'prepare-attachments',
      'persist-user',
      'post:thinking',
      'execute-agent',
    ]);
  });

  it('dispatches non-agent media turns when a media runtime is available', async () => {
    const executeMediaTurn = vi.fn(async () => undefined);
    const executeAgentTurn = vi.fn(async () => undefined);

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'render image',
          sessionMode: 'image',
          mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeMediaTurn,
        executeAgentTurn,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'media-dispatched' });

    expect(executeMediaTurn).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      prompt: 'render image',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
    });
    expect(executeAgentTurn).not.toHaveBeenCalled();
  });

  it('projects 3D reference roles into direct image media controls', async () => {
    const executeMediaTurn = vi.fn(async () => undefined);

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'render image',
          sessionMode: 'image',
          mediaModel: { providerId: 'fal', modelId: 'flux-control', category: 'image' },
          contextPayloads: [threeReferencePayload()],
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        processContextImageResources: async (resources) =>
          resources.map((resource) => ({
            type: 'base64' as const,
            media_type: 'image/png',
            data: resource.resource.id,
          })),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeMediaTurn,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'media-dispatched' });

    expect(executeMediaTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        mediaModel: { providerId: 'fal', modelId: 'flux-control', category: 'image' },
        threeReferenceControls: {
          appearanceReferences: [],
          controlImage: {
            imageRef: resourceRef('pose-control'),
            mode: 'depth',
            identity: { sessionId: 'session-1', revision: 2 },
          },
          camera: {
            value: {
              cameraId: 'front',
              position: { x: 0, y: 1, z: 3 },
              target: { x: 0, y: 1, z: 0 },
              fieldOfViewDeg: 45,
              aspectRatio: 1,
            },
            identity: { sessionId: 'session-1', revision: 2 },
          },
        },
      }),
    );
  });

  it('returns an unmet precondition with a scoped error when no agent runtime is available', async () => {
    const postMessage = vi.fn();
    const persistErrorMessage = vi.fn();

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        persistUserMessage: vi.fn(),
        persistErrorMessage,
        postMessage,
        generateMessageId: vi.fn().mockReturnValueOnce('user-1').mockReturnValueOnce('error-1'),
        now: () => 123,
      }),
    ).resolves.toEqual({ status: 'precondition-unmet', reason: 'no-agent-runtime' });

    expect(persistErrorMessage).toHaveBeenCalledWith('conv-1', {
      id: 'error-1',
      role: 'assistant',
      content: AGENT_TURN_PRECONDITION_MESSAGE,
      timestamp: 123,
      isError: true,
    });
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'thinking',
      conversationId: 'conv-1',
    });
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'error', conversationId: 'conv-1' }),
    );
  });

  it('appends ambient canvas context to the system prompt', () => {
    const prompt = appendAmbientCanvasSystemPrompt('base prompt', [
      { nodeId: 'node-1', type: 'image', summary: 'Hero frame' },
    ]);

    expect(prompt).toContain('[image] Hero frame (id: node-1)');
    expect(prompt).not.toContain('canvas_get_node');
    expect(prompt).not.toContain('canvas_update_node');
    expect(prompt).not.toContain('canvas_generate_image');
  });

  it('builds a project file search plan for the host adapter', () => {
    expect(buildAgentProjectFileSearchPlan({ filter: 'app', limit: 12 })).toEqual({
      includePattern: '**/*app*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 12,
      purpose: 'mention',
    });
    expect(buildAgentProjectFileSearchPlan({ purpose: 'roleplay' })).toEqual({
      includePattern: '**/*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 30,
      purpose: 'roleplay',
    });
    expect(buildAgentProjectFileSearchPlan({ filter: 'hero', purpose: 'entry' })).toEqual({
      includePattern: '**/*hero*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 30,
      purpose: 'entry',
    });
  });

  it('projects host file candidates to mention file rows', () => {
    expect(
      projectAgentFileMentions([
        { relativePath: 'src/app.ts', source: 'workspace', icon: 'TS' },
        { relativePath: 'docs\\intro.md' },
      ]),
    ).toEqual([
      { path: 'src/app.ts', name: 'app.ts', type: 'file', source: 'workspace', icon: 'TS' },
      { path: 'docs/intro.md', name: 'intro.md', type: 'file' },
    ]);
  });

  it('projects canvas ambient nodes to filtered mention extras', () => {
    expect(
      projectAgentMentionExtras(
        [
          { nodeId: 'node-1', type: 'shot', summary: 'Hero frame' },
          { nodeId: 'node-2', type: 'scene', summary: 'Outro scene' },
        ],
        'hero',
      ),
    ).toEqual([
      {
        type: 'canvas-node',
        id: 'node-1',
        label: 'Hero frame',
        summary: 'Canvas: Hero frame',
        source: 'canvas',
      },
    ]);
  });

  it('projects typed Media Library candidates to mention extras', () => {
    expect(
      projectAgentMentionExtras([], 'hero', undefined, undefined, [
        {
          type: 'media',
          id: 'media-1',
          label: 'Hero portrait',
          summary: 'Media: Hero portrait',
          source: 'media-library',
          icon: '🎭',
          filePath: 'neko\\assets\\Characters\\hero.png',
          mediaType: 'image',
          entityType: 'character',
          navigationData: { partition: 'media-library' },
        },
      ]),
    ).toEqual([
      {
        type: 'media',
        id: 'media-1',
        label: 'Hero portrait',
        summary: 'Media: Hero portrait',
        source: 'media-library',
        icon: '🎭',
        filePath: 'neko/assets/Characters/hero.png',
        mediaType: 'image',
        entityType: 'character',
        navigationData: { partition: 'media-library' },
      },
    ]);
  });

  it('builds the projectFiles webview message with explicit conversation scope', () => {
    expect(
      projectAgentProjectFilesMessage({
        conversationId: 'conv-1',
        filter: '',
        files: [{ relativePath: 'src/app.ts' }],
        canvasNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
      }),
    ).toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      filter: '',
      files: [{ path: 'src/app.ts', name: 'app.ts', type: 'file' }],
      mentionExtras: [
        {
          type: 'canvas-node',
          id: 'node-1',
          label: 'Hero frame',
          summary: 'Canvas: Hero frame',
          source: 'canvas',
        },
      ],
    });
  });

  it('keeps mention candidates matched only by host search text', () => {
    expect(
      projectAgentProjectFilesMessage({
        conversationId: 'conv-1',
        filter: '灯神',
        files: [],
        mentionCandidates: [
          {
            type: 'media',
            id: 'media-lamp-genie',
            label: '参考图 01',
            summary: 'Media: reference image',
            searchText: '灯神 genie reference concept',
            source: 'media-library',
            filePath: 'neko/assets/References/reference-01.png',
            mediaType: 'image',
          },
        ],
      }),
    ).toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      filter: '灯神',
      files: [],
      mentionExtras: [
        {
          type: 'media',
          id: 'media-lamp-genie',
          label: '参考图 01',
          summary: 'Media: reference image',
          searchText: '灯神 genie reference concept',
          source: 'media-library',
          filePath: 'neko/assets/References/reference-01.png',
          mediaType: 'image',
        },
      ],
    });
  });

  it('executes project file search through host adapters and merges canvas mentions', async () => {
    const searchProjectFiles = vi.fn(async () => [
      { relativePath: 'src/app.ts' },
      { relativePath: 'docs\\intro.md' },
    ]);

    await expect(
      executeAgentProjectFileSearch({
        conversationId: 'conv-1',
        filter: 'app',
        searchProjectFiles,
        getCanvasNodes: () => [{ nodeId: 'node-1', type: 'shot', summary: 'App hero' }],
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      filter: 'app',
      files: [
        { path: 'src/app.ts', name: 'app.ts', type: 'file' },
        { path: 'docs/intro.md', name: 'intro.md', type: 'file' },
      ],
      mentionExtras: [
        {
          type: 'canvas-node',
          id: 'node-1',
          label: 'App hero',
          summary: 'Canvas: App hero',
          source: 'canvas',
        },
      ],
    });
    expect(searchProjectFiles).toHaveBeenCalledWith({
      includePattern: '**/*app*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 30,
      purpose: 'mention',
    });
  });

  it('skips workspace file search for roleplay candidate refreshes', async () => {
    const searchProjectFiles = vi.fn(async () => [{ relativePath: 'src/app.ts' }]);
    const getMentionCandidates = vi.fn(async () => [
      {
        type: 'entity' as const,
        id: 'entity:char-xiaoju',
        label: '小橘',
        summary: 'Character: 小橘',
        source: 'entity-graph' as const,
        entityType: 'character',
      },
    ]);

    await expect(
      executeAgentProjectFileSearch({
        filter: '',
        purpose: 'roleplay',
        searchProjectFiles,
        getMentionCandidates,
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      filter: '',
      purpose: 'roleplay',
      files: [],
      mentionExtras: [
        {
          type: 'entity',
          id: 'entity:char-xiaoju',
          label: '小橘',
          summary: 'Character: 小橘',
          source: 'entity-graph',
          entityType: 'character',
        },
      ],
    });
    expect(searchProjectFiles).not.toHaveBeenCalled();
    expect(getMentionCandidates).toHaveBeenCalledWith({
      includePattern: '**/*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 30,
      purpose: 'roleplay',
    });
  });

  it('runs entry-page search without conversation-scoped canvas context', async () => {
    const searchProjectFiles = vi.fn(async () => [{ relativePath: 'assets/hero.png' }]);
    const getCanvasNodes = vi.fn(() => [
      { nodeId: 'node-1', type: 'shot', summary: 'Current shot' },
    ]);

    await expect(
      executeAgentProjectFileSearch({
        filter: 'hero',
        purpose: 'entry',
        searchProjectFiles,
        getCanvasNodes,
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      filter: 'hero',
      purpose: 'entry',
      files: [{ path: 'assets/hero.png', name: 'hero.png', type: 'file' }],
      mentionExtras: [],
    });
    expect(searchProjectFiles).toHaveBeenCalledWith({
      includePattern: '**/*hero*',
      excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
      limit: 30,
      purpose: 'entry',
    });
    expect(getCanvasNodes).not.toHaveBeenCalled();
  });

  it('keeps project file search usable when the host search adapter fails', async () => {
    const onSearchError = vi.fn();

    await expect(
      executeAgentProjectFileSearch({
        conversationId: 'conv-1',
        filter: 'missing',
        searchProjectFiles: async () => {
          throw new Error('findFiles failed');
        },
        getCanvasNodes: () => [{ nodeId: 'node-1', type: 'shot', summary: 'Fallback shot' }],
        onSearchError,
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      filter: 'missing',
      files: [],
      mentionExtras: [],
    });
    expect(onSearchError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('projects a successful agent stream result into a persisted assistant message', () => {
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-1',
        timestamp: 123,
        stream: {
          accumulatedResponse: 'Done',
          accumulatedThinking: 'Thinking',
          hasError: false,
          collectedToolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              arguments: { path: 'src/app.ts' },
              result: { success: true, data: { ok: true } },
            },
          ],
          contentBlocks: [
            {
              id: 'block-1',
              type: 'text',
              timestamp: 123,
              content: 'Done',
              isStreaming: false,
            },
            {
              id: 'block-tool-call-1',
              type: 'tool_call',
              timestamp: 124,
              toolCall: {
                id: 'call-1',
                name: 'read_file',
                arguments: { path: 'src/app.ts' },
                result: { success: true, data: { ok: true } },
              },
            },
          ],
        },
      }),
    ).toEqual({
      id: 'msg-1',
      role: 'assistant',
      content: 'Done',
      timestamp: 123,
      contentBlocks: [
        {
          id: 'block-1',
          type: 'text',
          timestamp: 123,
          content: 'Done',
          isStreaming: false,
        },
        {
          id: 'block-tool-call-1',
          type: 'tool_call',
          timestamp: 124,
          toolCall: {
            id: 'call-1',
            name: 'read_file',
            arguments: { path: 'src/app.ts' },
            result: { success: true, data: { ok: true } },
          },
        },
      ],
    });
  });

  it('does not persist empty agent stream results', () => {
    const emptyStream = {
      accumulatedResponse: '',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [],
    };

    expect(shouldPersistAgentAssistantStream(emptyStream)).toBe(false);
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-empty',
        timestamp: 123,
        stream: emptyStream,
      }),
    ).toBeNull();
  });

  it('persists content-block-only agent stream results', () => {
    const stream = {
      accumulatedResponse: '',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [
        {
          id: 'block-1',
          type: 'text' as const,
          timestamp: 123,
          content: 'Rendered from block',
          isStreaming: false,
        },
      ],
    };

    expect(shouldPersistAgentAssistantStream(stream)).toBe(true);
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-block-only',
        timestamp: 123,
        stream,
      }),
    ).toEqual({
      id: 'msg-block-only',
      role: 'assistant',
      content: '',
      timestamp: 123,
      contentBlocks: [
        {
          id: 'block-1',
          type: 'text',
          timestamp: 123,
          content: 'Rendered from block',
          isStreaming: false,
        },
      ],
    });
  });

  it('persists partial failed agent stream results as error messages', () => {
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-error',
        timestamp: 123,
        stream: {
          accumulatedResponse: 'Partial',
          accumulatedThinking: '',
          hasError: true,
          errorMessage: 'Provider timed out',
          collectedToolCalls: [],
          contentBlocks: [],
        },
      }),
    ).toEqual({
      id: 'msg-error',
      role: 'assistant',
      content: 'Partial\n\nProvider timed out',
      timestamp: 123,
      isError: true,
    });
  });

  it('persists error-only agent stream results as error messages', () => {
    const stream = {
      accumulatedResponse: '',
      accumulatedThinking: '',
      hasError: true,
      errorMessage: 'Provider timed out',
      collectedToolCalls: [],
      contentBlocks: [],
    };

    expect(shouldPersistAgentAssistantStream(stream)).toBe(true);
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-error-only',
        timestamp: 123,
        stream,
      }),
    ).toEqual({
      id: 'msg-error-only',
      role: 'assistant',
      content: 'Provider timed out',
      timestamp: 123,
      isError: true,
    });
  });

  it('builds standalone assistant error messages', () => {
    expect(
      buildAgentErrorAssistantMessage({
        id: 'msg-error',
        timestamp: 123,
        message: 'Failed',
      }),
    ).toEqual({
      id: 'msg-error',
      role: 'assistant',
      content: 'Failed',
      timestamp: 123,
      isError: true,
    });
  });

  it('builds agent context patch with canvas packet taking precedence over timeline packet', () => {
    expect(
      buildAgentTurnContextPatch({
        imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
        timelineContextPacket: { kind: 'timeline' },
        canvasNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
        canvasContextPacket: { kind: 'canvas' },
        executionMetadata: { traceId: 'trace-1' },
      }),
    ).toEqual({
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
      canvasContext: {
        selectedNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
      },
      multimodalContextPacket: { kind: 'canvas' },
      metadata: { traceId: 'trace-1' },
    });
  });

  it('builds agent context patch with timeline packet when no canvas packet exists', () => {
    expect(
      buildAgentTurnContextPatch({
        imageAttachments: [],
        timelineContextPacket: { kind: 'timeline' },
        canvasNodes: [],
      }),
    ).toEqual({
      multimodalContextPacket: { kind: 'timeline' },
    });
  });

  it('builds a turn runtime plan for provider context and execution metadata', () => {
    expect(
      buildAgentTurnRuntimePlan({
        executionMode: 'ask',
        executionOverrides: { metadata: { traceId: 'trace-1' } },
        mediaModels: {
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
        understandingModels: {
          image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
        },
      }),
    ).toEqual({
      providerExpressionTargets: [
        { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
      ],
      runtimeMediaModels: {
        video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      },
      executionMetadata: {
        traceId: 'trace-1',
        mediaModels: {
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
        understandingModels: {
          image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
        },
      },
    });
  });

  it('injects perception tool routing when chat and perception models differ', () => {
    const plan = buildAgentTurnConfigurationPlan({
      conversationId: 'conv-1',
      baseSystemPrompt: 'base',
      executionMode: 'ask',
      chatModel: { providerId: 'openai', modelId: 'gpt-text', category: 'llm' },
      understandingModels: {
        image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
      },
    });

    expect(plan.systemPrompt).toContain('Runtime Media Perception Routing');
    expect(plan.systemPrompt).toContain('perception.image.understand');
    expect(plan.systemPrompt).toContain(
      'do not stop because the chat model lacks native media input',
    );
    expect(plan.executionMetadata).toEqual({
      understandingModels: {
        image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
      },
    });
  });

  it('does not inject perception tool routing when chat and perception models match', () => {
    const plan = buildAgentTurnConfigurationPlan({
      conversationId: 'conv-1',
      baseSystemPrompt: 'base',
      executionMode: 'ask',
      chatModel: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
      understandingModels: {
        image: { providerId: 'google', modelId: 'gemini-2.5-flash', category: 'llm' },
      },
    });

    expect(plan.systemPrompt).not.toContain('Runtime Media Perception Routing');
  });

  it('selects the requested configured provider and model', () => {
    const providers = new Map([
      ['openai', { id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] }],
      ['anthropic', { id: 'anthropic', isConfigured: true, modelIds: ['claude-3'] }],
    ]);

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'openai',
        requestedModelId: 'gpt-4.1',
        getProvider: (id) => providers.get(id),
      }),
    ).toEqual({
      ok: true,
      effectiveProviderId: 'openai',
      effectiveModelId: 'gpt-4.1',
      provider: { id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] },
    });
  });

  it('rejects unavailable requested provider without trying another provider', () => {
    const getProvider = vi.fn(() => undefined);

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'missing',
        requestedModelId: 'gpt-4.1',
        getProvider,
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'missing',
      effectiveModelId: 'gpt-4.1',
      reason: 'chat-provider-not-configured',
    });
    expect(getProvider).toHaveBeenCalledWith('missing');
    expect(getProvider).not.toHaveBeenCalledWith('anthropic');
  });

  it('returns a provider configuration result when selected provider is unavailable', () => {
    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'openai',
        requestedModelId: 'gpt-4.1',
        getProvider: () => ({ id: 'openai', isConfigured: false }),
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'openai',
      effectiveModelId: 'gpt-4.1',
      reason: 'chat-provider-not-configured',
    });
  });

  it('rejects missing chat provider and model selections', () => {
    expect(
      selectAgentTurnProvider({
        getProvider: () => {
          throw new Error('provider lookup should not be used');
        },
      }),
    ).toEqual({
      ok: false,
      reason: 'missing-chat-provider',
    });

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'openai',
        getProvider: () => {
          throw new Error('provider lookup should not be used');
        },
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'openai',
      reason: 'missing-chat-model',
    });
  });

  it('rejects model IDs that are not enabled for the selected provider', () => {
    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'openai',
        requestedModelId: 'missing-model',
        getProvider: () => ({ id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] }),
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'openai',
      effectiveModelId: 'missing-model',
      reason: 'chat-model-not-found',
    });
  });

  it('allows text-only chat models for plain text turns without requiring vision', () => {
    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'local',
        requestedModelId: 'llama3',
        getProvider: () => ({
          id: 'local',
          isConfigured: true,
          modelIds: ['llama3'],
          modelCapabilities: { llama3: ['chat'] },
        }),
      }),
    ).toEqual({
      ok: true,
      effectiveProviderId: 'local',
      effectiveModelId: 'llama3',
      provider: {
        id: 'local',
        isConfigured: true,
        modelIds: ['llama3'],
        modelCapabilities: { llama3: ['chat'] },
      },
    });
  });

  it('validates required model capabilities without provider fallback', () => {
    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'local',
        requestedModelId: 'text-only',
        requiredCapabilities: ['vision'],
        getProvider: () => ({
          id: 'local',
          isConfigured: true,
          modelIds: ['text-only'],
          modelCapabilities: { 'text-only': ['chat'] },
        }),
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'local',
      effectiveModelId: 'text-only',
      reason: 'missing-required-capability',
    });

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'local',
        requestedModelId: 'vision-model',
        requiredCapabilities: ['vision'],
        getProvider: () => ({
          id: 'local',
          isConfigured: true,
          modelIds: ['vision-model'],
          modelCapabilities: { 'vision-model': ['chat', 'vision'] },
        }),
      }),
    ).toEqual({
      ok: true,
      effectiveProviderId: 'local',
      effectiveModelId: 'vision-model',
      provider: {
        id: 'local',
        isConfigured: true,
        modelIds: ['vision-model'],
        modelCapabilities: { 'vision-model': ['chat', 'vision'] },
      },
    });
  });

  it('builds agent turn configuration without host-specific platform objects', () => {
    expect(
      buildAgentTurnConfigurationPlan({
        conversationId: 'conv-1',
        baseSystemPrompt: 'base',
        customSystemPrompt: 'Prefer concise replies.',
        ambientCanvas: [{ nodeId: 'node-1', type: 'shot', summary: 'Opening shot' }],
        executionMode: 'plan',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
        executionOverrides: { metadata: { traceId: 'trace-1' } },
        temperature: 0.7,
        topP: 0.9,
        workspaceRoot: '/repo',
      }),
    ).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        systemPrompt: expect.stringContaining('base\n\n## User Custom Instructions'),
        executionMode: 'plan',
        modelId: 'gpt-4.1',
        temperature: 0.7,
        topP: 0.9,
        workspaceRoot: '/repo',
        maxIterations: 200,
        providerExpressionTargets: [
          { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro' },
        ],
        executionMetadata: expect.objectContaining({
          traceId: 'trace-1',
          mediaModels: {
            image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          },
        }),
      }),
    );
    const plan = buildAgentTurnConfigurationPlan({
      conversationId: 'conv-1',
      baseSystemPrompt: 'base',
      customSystemPrompt: 'Prefer concise replies.',
      executionMode: 'ask',
    });
    expect(plan.systemPrompt).toContain('base');
    expect(plan.systemPrompt).toContain('Prefer concise replies.');
    expect(plan.systemPrompt).toContain('runtime tool protocol');
  });

  it('lets per-turn execution overrides replace the configured execution mode', () => {
    expect(
      buildAgentTurnConfigurationPlan({
        conversationId: 'conv-1',
        baseSystemPrompt: 'base',
        executionMode: 'ask',
        executionOverrides: { executionMode: 'auto' },
      }),
    ).toEqual(
      expect.objectContaining({
        executionMode: 'auto',
        executionMetadata: undefined,
      }),
    );
  });

  it('projectContextReferences extracts lightweight references from payloads', () => {
    expect(projectContextReferences(undefined)).toBeUndefined();
    expect(projectContextReferences([])).toBeUndefined();

    expect(
      projectContextReferences([
        {
          type: 'file',
          id: 'f1',
          label: 'notes.txt',
          summary: 'File: notes.txt',
          data: { filePath: '/tmp/notes.txt' },
        },
        {
          type: 'canvas-node',
          id: 'node-42',
          label: 'Shot #003',
          summary: 'Wide shot',
          data: { nodes: ['node-42'] },
        },
        {
          type: 'story-selection',
          id: 's1',
          label: 'Scene 1',
          summary: 'Selected text',
          data: { selectedText: 'Once upon a time' },
        },
      ]),
    ).toEqual([
      {
        type: 'file',
        id: 'f1',
        label: 'notes.txt',
        summary: 'File: notes.txt',
        navigationData: { filePath: '/tmp/notes.txt' },
      },
      {
        type: 'canvas-node',
        id: 'node-42',
        label: 'Shot #003',
        summary: 'Wide shot',
        navigationData: { nodeId: 'node-42' },
      },
      { type: 'story-selection', id: 's1', label: 'Scene 1', summary: 'Selected text' },
    ]);
  });

  it('prepareAgentMessageDispatch includes contextReferences in userMessage', async () => {
    const result = await prepareAgentMessageDispatch({
      request: {
        conversationId: 'conv-1',
        messageText: 'describe this',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'file',
            id: 'f1',
            label: 'img.png',
            summary: '',
            data: { filePath: '/tmp/img.png' },
          },
        ],
      },
      processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
      generateMessageId: () => 'msg-1',
      now: () => 100,
    });

    expect(result.userMessage.contextReferences).toEqual([
      { type: 'file', id: 'f1', label: 'img.png', navigationData: { filePath: '/tmp/img.png' } },
    ]);
  });

  it('prepareAgentMessageDispatch projects selected file references into persisted user message chips', async () => {
    const result = await prepareAgentMessageDispatch({
      request: {
        conversationId: 'conv-1',
        messageText: 'analyze @${A}/books/story.epub',
        sessionMode: 'agent',
        fileReferences: [
          {
            id: 'file-ref:${A}/books/story.epub',
            label: 'story.epub',
            path: '${A}/books/story.epub',
            mediaType: 'document',
          },
        ],
      },
      processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
      generateMessageId: () => 'msg-1',
      now: () => 100,
    });

    expect(result.userMessage.contextReferences).toEqual([
      {
        type: 'file',
        id: 'file-ref:${A}/books/story.epub',
        label: 'story.epub',
        summary: '${A}/books/story.epub',
        mediaType: 'document',
        navigationData: {
          path: '${A}/books/story.epub',
          filePath: '${A}/books/story.epub',
        },
      },
    ]);
  });
});

function resourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'preview-variant',
    kind: 'preview',
    source: {
      kind: 'preview-asset',
      previewAssetId: id,
      filePath: `/workspace/.neko/.cache/resources/three-reference-captures/${id}.png`,
    },
    locator: { kind: 'preview-asset', assetId: id },
    fingerprint: {
      strategy: 'provider',
      value: `preview:${id}`,
      providerId: 'preview-variant',
    },
  };
}

function threeReferencePayload(): AgentContextPayload {
  return {
    type: '3d-reference',
    id: '3d-reference:session-1:2',
    label: 'Neutral mannequin',
    summary: 'Pose and camera guide',
    data: {
      contractVersion: 1,
      staging: {
        schemaVersion: 1,
        sessionId: 'session-1',
        revision: 2,
        subject: {
          kind: 'builtin-preset',
          presetId: 'guide-neutral-mannequin',
          presetVersion: 1,
          fingerprint: 'preset-fingerprint',
          presetKind: 'mannequin',
          appearancePolicy: 'guide-only',
          allowedPurposes: ['pose', 'camera'],
        },
        selectedPurposes: ['pose', 'camera'],
        camera: {
          cameraId: 'front',
          position: { x: 0, y: 1, z: 3 },
          target: { x: 0, y: 1, z: 0 },
          fieldOfViewDeg: 45,
          aspectRatio: 1,
        },
        pose: { poseId: 'standing', joints: [] },
      },
      outputs: [
        {
          kind: 'pose',
          sessionId: 'session-1',
          revision: 2,
          controlImage: resourceRef('pose-control'),
          controlMode: 'depth',
          joints: [],
        },
        {
          kind: 'camera',
          sessionId: 'session-1',
          revision: 2,
          camera: {
            cameraId: 'front',
            position: { x: 0, y: 1, z: 3 },
            target: { x: 0, y: 1, z: 0 },
            fieldOfViewDeg: 45,
            aspectRatio: 1,
          },
          compositionImage: resourceRef('camera-composition'),
        },
      ],
    },
  };
}
