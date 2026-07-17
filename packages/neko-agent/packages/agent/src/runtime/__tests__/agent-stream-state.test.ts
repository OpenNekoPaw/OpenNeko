import { describe, expect, it } from 'vitest';
import {
  applyAgentStreamEventToState,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToWebviewMessages,
} from '../stream/agent-stream-state';

describe('agent stream state reducer', () => {
  it('creates deterministic stream message ids when adapters are provided', () => {
    expect(
      createAgentStreamMessageId({
        now: () => 1000,
        randomSuffix: () => 'abc1234',
      }),
    ).toBe('msg-1000-abc1234');
  });

  it('accumulates thinking and text blocks with phase changes', () => {
    const state = createAgentStreamProjectionState();

    expect(
      applyAgentStreamEventToState(
        state,
        { type: 'thinking_content', thinking: 'Think' },
        { now: () => 100 },
      ),
    ).toEqual({ phaseChange: { phase: 'thinking', toolName: undefined } });
    applyAgentStreamEventToState(
      state,
      { type: 'thinking_content', thinking: ' more' },
      { now: () => 101 },
    );
    expect(
      applyAgentStreamEventToState(state, { type: 'text', content: 'Answer' }, { now: () => 102 }),
    ).toEqual({ phaseChange: { phase: 'streaming', toolName: undefined } });

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedThinking).toBe('Think more');
    expect(state.accumulatedResponse).toBe('Answer');
    expect(state.contentBlocks).toEqual([
      {
        id: 'block-thinking-100',
        type: 'thinking',
        timestamp: 100,
        thinking: 'Think more',
        isThinkingComplete: true,
      },
      {
        id: 'block-text-102',
        type: 'text',
        timestamp: 102,
        content: 'Answer',
        isStreaming: false,
      },
    ]);
  });

  it('collects tool calls, finalizes text, and writes tool results back', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(state, { type: 'text', content: 'Need a file' }, { now: () => 1 });
    expect(
      applyAgentStreamEventToState(
        state,
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: '/tmp/a.ts' } },
        },
        { now: () => 2 },
      ),
    ).toEqual({ phaseChange: { phase: 'acting', toolName: 'read_file' } });
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
    });

    expect(state.collectedToolCalls).toEqual([
      {
        id: 'tool-1',
        name: 'read_file',
        arguments: { path: '/tmp/a.ts' },
        result: { success: true, data: 'content', error: undefined },
      },
    ]);
    expect(state.contentBlocks[0]?.isStreaming).toBe(false);
    expect(state.contentBlocks[1]?.toolCall?.result).toEqual({
      success: true,
      data: 'content',
      error: undefined,
    });
  });

  it('preserves ordinary text block spacing when finalizing', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(state, { type: 'text', content: 'First.' }, { now: () => 1 });
    applyAgentStreamEventToState(
      state,
      {
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'read_file', arguments: {} },
      },
      { now: () => 2 },
    );
    applyAgentStreamEventToState(state, { type: 'text', content: ' Second.' }, { now: () => 3 });

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedResponse).toBe('First. Second.');
  });

  it('preserves fenced Markdown source and projects semantic composite metadata', () => {
    const state = createAgentStreamProjectionState();
    const source =
      'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","sections":[{"heading":"Shot 1","mediaRefs":[{"toolCallId":"read-1","assetIndex":0}]}]}\n```';

    applyAgentStreamEventToState(state, { type: 'text', content: source }, { now: () => 10 });

    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedResponse).toBe(source);
    expect(state.contentBlocks).toEqual([
      {
        id: 'block-text-10',
        type: 'text',
        timestamp: 10,
        content: source,
        isStreaming: false,
      },
      {
        id: 'block-text-10-composite-1',
        type: 'composite',
        timestamp: 10,
        composite: {
          template: 'storyboard-table',
          sections: [
            {
              heading: 'Shot 1',
              mediaRefs: [{ toolCallId: 'read-1', assetIndex: 0 }],
            },
          ],
        },
        compositeSource: {
          kind: 'normalized-markdown-code-block',
          sourceBlockId: 'block-text-10',
          startOffset: 12,
          endOffset: source.length,
          language: 'neko-composite',
          candidateIndex: 0,
        },
      },
    ]);
  });

  it('keeps composite blocks domain-neutral by default', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      {
        type: 'text',
        content:
          'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","title":"Opening","sections":[{"heading":"主要角色观察","content":"| 角色 | 当前证据支撑的观察 |\\n| --- | --- |\\n| 瑞德 | 红色围巾。 |"}]}\n```',
      },
      { now: () => 10 },
    );

    finalizeAgentStreamProjectionState(state);

    const composite = state.contentBlocks.find((block) => block.type === 'composite')?.composite;
    expect(composite?.extensions?.['neko.entityMemoryContributionPayload']).toBeUndefined();
  });

  it('applies injected composite projectors during finalization', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      {
        type: 'text',
        content:
          'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","title":"Opening","sections":[{"heading":"Shot 1","content":"Opening shot"}]}\n```',
      },
      { now: () => 10 },
    );

    finalizeAgentStreamProjectionState(state, {
      projectCompositeBlock: (composite) => ({
        ...composite,
        extensions: {
          ...(composite.extensions ?? {}),
          'neko.testProjection': true,
        },
      }),
    });

    const composite = state.contentBlocks.find((block) => block.type === 'composite')?.composite;
    expect(composite?.extensions?.['neko.testProjection']).toBe(true);
  });

  it('applies delayed tool result backfill to collected calls and blocks', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      {
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'generate_image', arguments: { prompt: 'rain' } },
      },
      { now: () => 1 },
    );
    applyAgentStreamEventToState(state, {
      type: 'tool_result',
      toolResult: {
        toolCallId: 'tool-1',
        success: true,
        data: { taskId: 'task-1', status: 'queued', prompt: 'rain' },
      },
    });

    applyAgentStreamEventToState(state, {
      type: 'tool_result_backfill',
      toolResultBackfill: {
        toolCallId: 'tool-1',
        timestamp: 2,
        dataPatch: {
          status: 'completed',
          prompt: 'incoming should not overwrite',
          thumbnailAssetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        },
        perceptionCards: [
          {
            version: 1,
            assetId: 'asset-1',
            modality: 'image',
            createdAt: 2,
            layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          },
        ],
      },
    });

    expect(state.collectedToolCalls[0]?.result).toEqual(
      expect.objectContaining({
        success: true,
        data: {
          taskId: 'task-1',
          status: 'completed',
          prompt: 'rain',
          thumbnailAssetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/.neko/generated/image/out.png',
            mimeType: 'image/png',
          },
        },
        perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
        backfillDiagnostics: [
          {
            path: 'prompt',
            reason: 'conflict',
            existing: 'rain',
            incoming: 'incoming should not overwrite',
          },
        ],
      }),
    );
    expect(state.contentBlocks[0]?.toolCall?.result).toEqual(state.collectedToolCalls[0]?.result);
  });

  it('marks errors and emits idle phase changes', () => {
    const state = createAgentStreamProjectionState();
    applyAgentStreamEventToState(state, { type: 'text', content: 'partial' });

    expect(applyAgentStreamEventToState(state, { type: 'error', error: new Error('bad') })).toEqual(
      { phaseChange: { phase: 'idle', toolName: undefined } },
    );
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe('bad');
  });

  it('keeps missing error detail absent from runtime state and host projection', () => {
    const state = createAgentStreamProjectionState();
    state.errorMessage = 'POISON LEGACY PROSE';

    applyAgentStreamEventToState(state, { type: 'error', error: new Error('   ') });

    expect(state.hasError).toBe(true);
    expect(state).not.toHaveProperty('errorMessage');
    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: { type: 'error', error: new Error('   ') },
      }),
    ).toEqual([{ type: 'error', conversationId: 'conv-1' }]);
    expect(JSON.stringify(state)).not.toContain('An error occurred');
  });

  it('preserves external error detail in runtime state and host projection', () => {
    const state = createAgentStreamProjectionState();
    const message = 'Provider detail: E42 / 配额';
    const event = { type: 'error', error: new Error(message) } as const;

    applyAgentStreamEventToState(state, event);

    expect(state.errorMessage).toBe(message);
    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event,
      }),
    ).toEqual([{ type: 'error', conversationId: 'conv-1', message }]);
  });

  it('preserves streamed storyboard text when post-stream validation fails', () => {
    const state = createAgentStreamProjectionState();
    const streamedTable = '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |';
    applyAgentStreamEventToState(state, {
      type: 'text_delta',
      content: streamedTable,
    });

    applyAgentStreamEventToState(state, {
      type: 'error',
      error: Object.assign(new Error('bad storyboard'), {
        name: 'AgentError',
        code: 'storyboard-table-forbidden-header',
      }),
    });

    expect(state.accumulatedResponse).toBe(streamedTable);
    expect(state.contentBlocks).toEqual([
      expect.objectContaining({
        type: 'text',
        content: streamedTable,
      }),
    ]);
    expect(state.errorMessage).toBe('bad storyboard');
  });

  it('replaces streamed assistant text when output validation retries internally', () => {
    const state = createAgentStreamProjectionState();

    applyAgentStreamEventToState(
      state,
      { type: 'text_delta', content: 'invalid table' },
      {
        now: () => 10,
      },
    );
    applyAgentStreamEventToState(state, {
      type: 'assistant_text_replacement',
      replacement: { reason: 'output-validation-retry', attempt: 1 },
    });
    applyAgentStreamEventToState(
      state,
      { type: 'text_delta', content: 'fixed table' },
      {
        now: () => 12,
      },
    );
    finalizeAgentStreamProjectionState(state);

    expect(state.accumulatedResponse).toBe('fixed table');
    expect(state.contentBlocks).toEqual([
      expect.objectContaining({
        id: 'block-text-10',
        type: 'text',
        content: 'fixed table',
        isStreaming: false,
      }),
    ]);
  });

  it('projects agent events to webview protocol messages', () => {
    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
      }),
    ).toEqual([
      {
        type: 'toolCall',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        arguments: { path: 'a.ts' },
      },
    ]);

    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: { type: 'done', usage: { inputTokens: 20, outputTokens: 22, totalTokens: 42 } },
      }),
    ).toEqual([{ type: 'streamComplete', conversationId: 'conv-1', messageId: 'msg-1' }]);

    expect(
      projectAgentStreamEventToWebviewMessages({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        event: {
          type: 'tool_result_backfill',
          toolResultBackfill: {
            toolCallId: 'tool-1',
            timestamp: 1,
            dataPatch: { status: 'completed' },
            artifacts: [makeArtifactSnapshot('artifact-1')],
          },
        },
      }),
    ).toEqual([
      {
        type: 'toolResultBackfill',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tool-1',
        dataPatch: { status: 'completed' },
        attachments: undefined,
        perceptionCards: undefined,
        backfillDiagnostics: undefined,
        artifacts: [makeArtifactSnapshot('artifact-1')],
      },
    ]);
  });
});

function makeArtifactSnapshot(artifactId: string) {
  return {
    type: 'artifactSnapshot' as const,
    complete: true,
    artifact: {
      schemaVersion: 1 as const,
      kind: 'composite-artifact' as const,
      artifactId,
      title: 'Shot plan',
      blocks: [{ blockId: 'summary', kind: 'text' as const, text: 'Review shots.' }],
    },
  };
}
