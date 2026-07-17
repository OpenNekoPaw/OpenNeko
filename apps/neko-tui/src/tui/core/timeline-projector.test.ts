import { describe, expect, it } from 'vitest';
import type { TaskWorkItem } from '@neko-agent/types';
import { createTerminalTimelineProjector } from './timeline-projector';
import { createTestAgentTerminalPresentation } from '../presentation/testing';

describe('createTerminalTimelineProjector', () => {
  it('keeps text, tool, and later text in emitted order', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    const rows = [
      ...projector.projectEvent({ type: 'text_delta', content: 'Reading ' }),
      ...projector.projectEvent({
        type: 'tool_call',
        toolCall: { id: 'call-1', name: 'ReadFile', arguments: { path: 'brief.md' } },
      }),
      ...projector.projectEvent({
        type: 'tool_result',
        toolResult: { toolCallId: 'call-1', success: true, data: { pages: 3 } },
      }),
      ...projector.projectEvent({ type: 'text_delta', content: 'Done.' }),
      ...projector.projectEvent({ type: 'done' }),
    ];

    expect(rows.map((row) => [row.kind, row.status, row.content ?? row.toolCallId])).toEqual([
      ['assistant_text', 'streaming', 'Reading '],
      ['assistant_text', 'complete', 'Reading '],
      ['tool', 'running', 'call-1'],
      ['tool', 'success', 'call-1'],
      ['assistant_text', 'streaming', 'Done.'],
      ['assistant_text', 'complete', 'Done.'],
    ]);
    expect(rows.find((row) => row.kind === 'tool' && row.status === 'success')).toMatchObject({
      toolArguments: { path: 'brief.md' },
      toolResult: { pages: 3 },
    });
  });

  it('anchors tool failures to their originating tool call id', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    projector.projectEvent({
      type: 'tool_call',
      toolCall: { id: 'call-fail', name: 'WriteFile', arguments: { path: 'out.txt' } },
    });
    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-fail',
        success: false,
        data: null,
        error: 'Permission denied',
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'error',
        toolCallId: 'call-fail',
        parent: { kind: 'tool', id: 'call-fail' },
        toolArguments: { path: 'out.txt' },
        toolResult: null,
        toolError: 'Permission denied',
        resultSummary: 'Permission denied',
      }),
    ]);
  });

  it('projects tool media outputs as terminal references', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    projector.projectEvent({
      type: 'tool_call',
      toolCall: { id: 'call-image', name: 'GenerateImage', arguments: { prompt: 'cat' } },
    });
    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-image',
        success: true,
        data: {},
        attachments: [
          {
            type: 'image',
            path: 'blob:https://neko.local/temp',
            mimeType: 'image/png',
            assetRef: {
              assetId: 'asset-image-1',
              uri: 'neko/generated/image-1.png',
              mimeType: 'image/png',
            },
          },
        ],
      },
    });

    expect(rows[0]).toMatchObject({
      kind: 'tool',
      status: 'success',
      resultSummary: expect.stringContaining('Image reference'),
    });
    expect(rows[0]?.resultSummary).toContain('asset: asset-image-1');
    expect(rows[0]?.resultSummary).toContain('file: neko/generated/image-1.png');
    expect(rows[0]?.resultSummary).not.toContain('blob:');
  });

  it('keeps structured tool facts when canonical timeline messages replace event rows', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    const rows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'tool-call-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'tool_call',
            status: 'failed',
            parentAnchor: 'turn',
            payload: {
              toolCall: {
                id: 'call-1',
                name: 'CreateSkill',
                arguments: {
                  target: 'project',
                  skill: { name: 'portable-review' },
                },
                result: {
                  success: false,
                  data: { code: 'skill-already-exists' },
                  error: 'Skill directory already exists',
                },
              },
            },
            createdAt: 1000,
            updatedAt: 1001,
          },
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'error',
        toolCallId: 'call-1',
        toolArguments: {
          target: 'project',
          skill: { name: 'portable-review' },
        },
        toolResult: { code: 'skill-already-exists' },
        toolError: 'Skill directory already exists',
      }),
    ]);
  });

  it('preserves structured tool facts when delayed backfill replaces a canonical row', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'tool-call-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'tool_call',
            status: 'complete',
            parentAnchor: 'turn',
            payload: {
              toolCall: {
                id: 'call-1',
                name: 'CreateSkill',
                arguments: { target: 'project' },
                result: {
                  success: true,
                  data: { code: 'created', status: 'pending' },
                },
              },
            },
            createdAt: 1000,
            updatedAt: 1001,
          },
        },
      ],
    });

    const rows = projector.projectEvent({
      type: 'tool_result_backfill',
      toolResultBackfill: {
        toolCallId: 'call-1',
        timestamp: 1002,
        dataPatch: { status: 'completed', fingerprint: 'sha256:abc' },
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'tool',
        status: 'success',
        toolCallId: 'call-1',
        toolArguments: { target: 'project' },
        toolResult: {
          code: 'created',
          status: 'completed',
          fingerprint: 'sha256:abc',
        },
      }),
    ]);
  });

  it('projects canonical runtime append, complete, tool, and later text operations in order', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });
    const identity = { conversationId: 'conv-1', turnId: 'turn-1', messageId: 'msg-1' };

    const firstRows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      ...identity,
      operations: [
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'Before ', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      ],
    });
    const boundaryRows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      ...identity,
      operations: [
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-1',
            sequence: 1,
            itemRevision: 2,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'tool.', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1000,
            updatedAt: 1001,
          },
        },
        {
          operation: 'complete',
          itemId: 'text-1',
          itemRevision: 3,
          kind: 'assistant_text',
          sourceGeneration: 1,
          status: 'complete',
          updatedAt: 1002,
        },
        {
          operation: 'upsert',
          item: {
            ...identity,
            itemId: 'tool-call-1',
            sequence: 2,
            itemRevision: 1,
            kind: 'tool_call',
            status: 'succeeded',
            parentAnchor: 'turn',
            payload: {
              toolCall: {
                id: 'call-1',
                name: 'GetContext',
                arguments: {},
                result: { success: true, data: { ok: true } },
              },
            },
            createdAt: 1002,
            updatedAt: 1003,
          },
        },
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-3',
            sequence: 3,
            itemRevision: 1,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'After tool.', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1004,
            updatedAt: 1004,
          },
        },
      ],
    });

    expect(firstRows).toEqual([
      expect.objectContaining({ id: 'text-1', status: 'streaming', content: 'Before ' }),
    ]);
    expect(boundaryRows.map((row) => [row.id, row.status, row.content ?? row.toolCallId])).toEqual([
      ['text-1', 'streaming', 'Before tool.'],
      ['text-1', 'complete', 'Before tool.'],
      ['tool-call-1', 'success', 'call-1'],
      ['text-3', 'streaming', 'After tool.'],
    ]);
  });

  it('projects coalesced item revision jumps as monotonic mutations', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });
    const identity = { conversationId: 'conv-1', turnId: 'turn-1', messageId: 'msg-1' };

    const rows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      ...identity,
      operations: [
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-coalesced',
            sequence: 1,
            itemRevision: 1,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'a', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-coalesced',
            sequence: 1,
            itemRevision: 2_000,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'b', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1000,
            updatedAt: 1001,
          },
        },
        {
          operation: 'append',
          item: {
            ...identity,
            itemId: 'text-coalesced',
            sequence: 1,
            itemRevision: 4_000,
            kind: 'assistant_text',
            status: 'streaming',
            payload: { content: 'c', format: 'markdown', sourceGeneration: 1 },
            createdAt: 1000,
            updatedAt: 1002,
          },
        },
        {
          operation: 'complete',
          itemId: 'text-coalesced',
          itemRevision: 4_001,
          kind: 'assistant_text',
          sourceGeneration: 1,
          status: 'complete',
          updatedAt: 1003,
        },
      ],
    });

    expect(rows.map((row) => [row.kind, row.status, row.content])).toEqual([
      ['assistant_text', 'streaming', 'a'],
      ['assistant_text', 'streaming', 'ab'],
      ['assistant_text', 'streaming', 'abc'],
      ['assistant_text', 'complete', 'abc'],
    ]);
  });

  it('projects task and media progress with task ids and parent identities', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });
    const task = createTaskWorkItem({
      id: 'task-1',
      kind: 'tool-background-task',
      parentToolCallId: 'call-2',
      title: 'Storyboard export',
      progress: 45,
      status: 'processing',
    });
    const media = createTaskWorkItem({
      id: 'media-1',
      kind: 'media-task',
      parentToolCallId: 'call-3',
      title: 'Shot render',
      progress: 80,
      status: 'processing',
    });

    const rows = [
      ...projector.projectMessage({
        type: 'taskUpdated',
        conversationId: 'conv-1',
        workItem: task,
      }),
      ...projector.projectMessage({
        type: 'mediaTaskProgress',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'call-3',
        workItem: media,
      }),
    ];

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'task',
        status: 'processing',
        taskId: 'task-1',
        taskTitle: 'Storyboard export',
        progress: 45,
        parent: { kind: 'tool', id: 'call-2' },
      }),
      expect.objectContaining({
        kind: 'media',
        status: 'processing',
        taskId: 'media-1',
        taskTitle: 'Shot render',
        progress: 80,
        parent: { kind: 'tool', id: 'call-3' },
      }),
    ]);
  });

  it('localizes Neko-owned tool-result and backfill summaries while preserving semantic keys', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation('zh-cn'),
      now: () => 1000,
    });

    projector.projectEvent({
      type: 'tool_call',
      toolCall: { id: 'call-localized', name: 'LocalizedTool', arguments: {} },
    });
    const failed = projector.projectEvent({
      type: 'tool_result',
      toolResult: { toolCallId: 'call-localized', success: false, data: {} },
    });
    expect(failed.at(-1)).toMatchObject({ resultSummary: '失败' });

    const backfill = projector.projectEvent({
      type: 'tool_result_backfill',
      toolResultBackfill: {
        toolCallId: 'call-localized',
        timestamp: 1001,
        dataPatch: { perceptionCards: [], artifacts: [] },
      },
    });
    expect(backfill.at(-1)).toMatchObject({
      backfillSummary: '已更新 perceptionCards, artifacts',
    });
  });

  it('keeps error fallback semantic until presentation and preserves external detail', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    const fallbackRows = projector.projectEvent({ type: 'error', error: new Error('   ') });
    expect(fallbackRows).toEqual([expect.objectContaining({ kind: 'error', status: 'error' })]);
    expect(fallbackRows[0]).not.toHaveProperty('content');

    const externalMessage = 'Provider detail: E42 / 配额';
    const externalRows = projector.projectEvent({
      type: 'error',
      error: new Error(externalMessage),
    });
    expect(externalRows.at(-1)).toMatchObject({
      kind: 'error',
      content: externalMessage,
    });

    const canonicalRows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'error-code-only',
            sequence: 10,
            itemRevision: 1,
            kind: 'error',
            status: 'failed',
            payload: { code: 'agent-error-without-detail' },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      ],
    });
    expect(canonicalRows).toEqual([
      expect.objectContaining({
        kind: 'error',
        status: 'error',
        diagnosticCode: 'agent-error-without-detail',
      }),
    ]);
    expect(canonicalRows[0]).not.toHaveProperty('content');
    expect(JSON.stringify(canonicalRows)).not.toContain('An error occurred');
  });

  it('emits diagnostics for unknown required tool anchors', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    const rows = projector.projectEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'missing-call',
        success: true,
        data: {},
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        status: 'error',
        diagnosticCode: 'unknown-tool-result-anchor',
        parent: { kind: 'tool', id: 'missing-call' },
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('content');
  });

  it('emits diagnostics for invalid timeline item parent anchors', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation(),
      now: () => 1000,
    });

    const rows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'task-task-2',
            sequence: 1,
            itemRevision: 1,
            kind: 'task',
            status: 'pending',
            parentAnchor: 'item',
            parentItemId: 'missing-item',
            payload: {
              workItem: createTaskWorkItem({
                id: 'task-2',
                kind: 'tool-background-task',
                parentToolCallId: null,
                title: 'Background export',
                progress: 10,
                status: 'queued',
              }),
            },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        status: 'error',
        diagnosticCode: 'unknown-parent-item-anchor',
        parent: { kind: 'item', id: 'missing-item' },
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('content');
  });

  it('localizes Neko-owned composite reference prose', () => {
    const projector = createTerminalTimelineProjector({
      presentation: createTestAgentTerminalPresentation('zh-cn'),
      now: () => 1000,
    });

    const rows = projector.projectMessage({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      operations: [
        {
          operation: 'upsert',
          item: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            messageId: 'msg-1',
            itemId: 'composite-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'composite',
            status: 'complete',
            parentAnchor: 'turn',
            payload: {
              composite: {
                template: 'report',
                sections: [],
              },
            },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        content: '复合内容可通过终端引用访问。',
      }),
    ]);
  });
});

function createTaskWorkItem(
  overrides: Pick<
    TaskWorkItem,
    'id' | 'kind' | 'parentToolCallId' | 'title' | 'progress' | 'status'
  >,
): TaskWorkItem {
  return {
    id: overrides.id,
    conversationId: 'conv-1',
    kind: overrides.kind,
    parentMessageId: 'msg-1',
    parentToolCallId: overrides.parentToolCallId,
    title: overrides.title,
    status: overrides.status,
    progress: overrides.progress,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:01.000Z',
    task: {
      scope: {
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'run-1',
        childRunId: overrides.id,
        childKind: 'task',
      },
      id: overrides.id,
      type: overrides.kind === 'media-task' ? 'image' : 'video',
      name: overrides.title,
      prompt: overrides.title,
      providerId: 'mock',
      providerName: 'mock-model',
      status: overrides.status,
      progress: overrides.progress,
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:01.000Z',
    },
  };
}
