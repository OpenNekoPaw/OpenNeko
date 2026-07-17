import { describe, expect, it } from 'vitest';
import type { AgentTurnTimelineItem, AgentWorkItem, ContentBlock } from '@neko-agent/types';
import {
  createAgentTurnTimelineAccumulator as createAgentTurnTimelineProjector,
  type AgentTurnTimelineAccumulatorUpdate,
} from '../agent-turn-timeline-accumulator';
import { createConversationProjectionStore } from '../../projection/conversation-projection-store';

function createAgentTurnTimelineAccumulator(input: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly now?: () => number;
}) {
  const projector = createAgentTurnTimelineProjector(input);
  const projection = createConversationProjectionStore(input.conversationId);
  const apply = (update: AgentTurnTimelineAccumulatorUpdate | null) => {
    if (update) projection.apply(update);
    return update;
  };
  return {
    project: (...args: Parameters<typeof projector.project>) => apply(projector.project(...args)),
    projectWorkItem: (...args: Parameters<typeof projector.projectWorkItem>) =>
      apply(projector.projectWorkItem(...args)),
    complete: (...args: Parameters<typeof projector.complete>) =>
      apply(projector.complete(...args)),
    snapshot: () => {
      const snapshot = projection.snapshot();
      const turn = snapshot.turns.find((candidate) => candidate.messageId === input.messageId);
      if (!turn) {
        throw new Error(`Expected projection for ${input.conversationId}/${input.messageId}.`);
      }
      return { conversationId: snapshot.conversationId, ...turn };
    },
    dispose: () => {
      projector.dispose();
      projection.dispose();
    },
  };
}

function textItem(snapshot: { readonly items: readonly AgentTurnTimelineItem[] }) {
  const item = snapshot.items.find((candidate) => candidate.kind === 'assistant_text');
  if (!item || item.kind !== 'assistant_text') throw new Error('Expected assistant text item.');
  return item;
}

function createWorkItem(status: AgentWorkItem['status'], progress: number): AgentWorkItem {
  return {
    id: 'task-1',
    conversationId: 'conv-1',
    kind: 'media-task',
    parentMessageId: 'msg-1',
    parentToolCallId: 'tool-1',
    title: 'Render shot',
    status,
    progress,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    task: {
      id: 'task-1',
      type: 'video',
      name: 'Render shot',
      prompt: 'Animate',
      providerId: 'provider-1',
      providerName: 'Provider',
      status,
      progress,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      steps: [{ id: 'step-1', name: 'Render', status: 'running' }],
    },
  };
}

const finalBlocks: readonly ContentBlock[] = [
  {
    id: 'text-final',
    type: 'text',
    timestamp: 10,
    content: 'final',
    isStreaming: false,
  },
];

describe('AgentTurnTimelineAccumulator', () => {
  it('preserves exact source and semantic ordering across thinking, text, tools, and later text', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      now: () => 100,
    });

    accumulator.project({ type: 'thinking_content', thinking: 'plan' }, 1);
    accumulator.project({ type: 'text_delta', content: 'Before.' }, 2);
    accumulator.project(
      { type: 'tool_call', toolCall: { id: 'tool-1', name: 'read', arguments: { path: 'a' } } },
      3,
    );
    accumulator.project({ type: 'text_delta', content: ' After.' }, 4);

    const snapshot = accumulator.snapshot();
    expect(snapshot.items.map((item) => [item.sequence, item.kind, item.status])).toEqual([
      [1, 'thinking', 'complete'],
      [2, 'assistant_text', 'complete'],
      [3, 'tool_call', 'pending'],
      [4, 'assistant_text', 'streaming'],
    ]);
    expect(
      snapshot.items
        .filter((item) => item.kind === 'assistant_text')
        .map((item) => item.payload.content),
    ).toEqual(['Before.', ' After.']);
  });

  it('keeps external error detail byte-stable and uses a semantic code when detail is absent', () => {
    const externalAccumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-external-error',
      now: () => 100,
    });
    const externalMessage = 'Provider detail: E42 / 配额';
    externalAccumulator.project({ type: 'error', error: new Error(externalMessage) }, 1);

    expect(externalAccumulator.snapshot().items[0]).toMatchObject({
      kind: 'error',
      payload: { message: externalMessage },
    });
    expect(externalAccumulator.snapshot().items[0]?.payload).not.toHaveProperty('code');

    const fallbackAccumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-semantic-error',
      now: () => 100,
    });
    fallbackAccumulator.project({ type: 'error', error: new Error('   ') }, 2);

    expect(fallbackAccumulator.snapshot().items[0]).toMatchObject({
      kind: 'error',
      payload: { code: 'agent-error-without-detail' },
    });
    expect(fallbackAccumulator.snapshot().items[0]?.payload).not.toHaveProperty('message');
    expect(JSON.stringify(fallbackAccumulator.snapshot())).not.toContain('An error occurred');
  });

  it('uses stable item identity and monotonic revisions for append, replacement, and completion', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      now: () => 20,
    });

    const first = accumulator.project({ type: 'text_delta', content: 'invalid' }, 1);
    const second = accumulator.project({ type: 'text_delta', content: ' table' }, 2);
    const replacement = accumulator.project(
      {
        type: 'assistant_text_replacement',
        replacement: { reason: 'output-validation-retry', attempt: 1 },
      },
      3,
    );
    const repaired = accumulator.project({ type: 'text_delta', content: 'fixed' }, 4);
    const completed = accumulator.complete(finalBlocks);

    const operations = [first, second, replacement, repaired]
      .flatMap((update) => update?.operations ?? [])
      .flatMap((operation) =>
        'item' in operation && operation.item.kind === 'assistant_text' ? [operation.item] : [],
      );
    expect(operations.map((item) => item.itemId)).toEqual(['text-1', 'text-1', 'text-1', 'text-1']);
    expect(operations.map((item) => item.itemRevision)).toEqual([1, 2, 3, 4]);
    expect(operations.map((item) => item.payload.sourceGeneration)).toEqual([1, 1, 2, 2]);
    expect(textItem(accumulator.snapshot()).payload.content).toBe('fixed');
    expect(textItem(accumulator.snapshot()).itemRevision).toBe(5);
    expect(completed?.completion?.status).toBe('completed');
  });

  it('keeps concurrent turns isolated', () => {
    const first = createAgentTurnTimelineAccumulator({ conversationId: 'conv-a', messageId: 'a' });
    const second = createAgentTurnTimelineAccumulator({ conversationId: 'conv-b', messageId: 'b' });

    first.project({ type: 'text_delta', content: 'alpha' }, 1);
    second.project({ type: 'text_delta', content: 'beta' }, 1);
    first.project({ type: 'text_delta', content: '-one' }, 2);

    expect(textItem(first.snapshot()).payload.content).toBe('alpha-one');
    expect(textItem(second.snapshot()).payload.content).toBe('beta');
    expect(first.snapshot().turnId).not.toBe(second.snapshot().turnId);
  });

  it('returns snapshots that cannot mutate authoritative tool, work-item, or completion state', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      now: () => 20,
    });
    accumulator.project(
      {
        type: 'tool_call',
        toolCall: { id: 'tool-1', name: 'read', arguments: { nested: { value: 'original' } } },
      },
      1,
    );
    accumulator.projectWorkItem(createWorkItem('processing', 50));
    accumulator.complete(finalBlocks);

    const snapshot = accumulator.snapshot();
    const tool = snapshot.items.find((item) => item.kind === 'tool_call');
    const workItem = snapshot.items.find((item) => item.kind === 'media');
    if (!tool || tool.kind !== 'tool_call' || !workItem || workItem.kind !== 'media') {
      throw new Error('Expected tool and media items.');
    }
    const nested = tool.payload.toolCall.arguments['nested'];
    if (typeof nested !== 'object' || nested === null || !('value' in nested)) {
      throw new Error('Expected nested tool argument.');
    }
    expect(() => {
      nested.value = 'mutated';
    }).toThrow(TypeError);
    expect(() => {
      workItem.payload.workItem.task.steps?.push({
        id: 'step-2',
        name: 'Mutated',
        status: 'failed',
      });
    }).toThrow(TypeError);
    const finalBlock = snapshot.completion?.finalContentBlocks?.[0];
    expect(() => {
      if (finalBlock) finalBlock.content = 'mutated';
    }).toThrow(TypeError);

    const next = accumulator.snapshot();
    const nextTool = next.items.find((item) => item.kind === 'tool_call');
    const nextWorkItem = next.items.find((item) => item.kind === 'media');
    if (
      !nextTool ||
      nextTool.kind !== 'tool_call' ||
      !nextWorkItem ||
      nextWorkItem.kind !== 'media'
    ) {
      throw new Error('Expected tool and media items.');
    }
    expect(nextTool.payload.toolCall.arguments).toEqual({ nested: { value: 'original' } });
    expect(nextWorkItem.payload.workItem.task.steps).toHaveLength(1);
    expect(next.completion?.finalContentBlocks?.[0]?.content).toBe('final');
  });

  it('projects work-item progress as latest authoritative state with stable sequence', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      now: () => 10,
    });

    const pending = accumulator.projectWorkItem(createWorkItem('processing', 25));
    const completed = accumulator.projectWorkItem(createWorkItem('completed', 100));
    const item = accumulator.snapshot().items[0];

    expect(pending?.operations[0]).toMatchObject({
      operation: 'upsert',
      item: { sequence: 1, itemRevision: 1, status: 'pending' },
    });
    expect(completed?.operations[0]).toMatchObject({
      operation: 'upsert',
      item: { sequence: 1, itemRevision: 2, status: 'succeeded' },
    });
    expect(item).toMatchObject({ sequence: 1, itemRevision: 2, status: 'succeeded' });
  });

  it.each(['completed', 'cancelled', 'failed'] as const)(
    'records %s terminal status and rejects late mutation while retaining snapshots',
    (status) => {
      const accumulator = createAgentTurnTimelineAccumulator({
        conversationId: 'conv-1',
        messageId: `msg-${status}`,
        now: () => 10,
      });
      accumulator.project({ type: 'text_delta', content: 'partial' }, 1);
      accumulator.complete(finalBlocks, status);

      expect(accumulator.snapshot().completion?.status).toBe(status);
      expect(() => accumulator.project({ type: 'text_delta', content: 'late' }, 2)).toThrow(
        /after completed/,
      );
      expect(textItem(accumulator.snapshot()).payload.content).toBe('partial');
    },
  );

  it('rejects events and snapshots after disposal', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-1',
      messageId: 'msg-1',
    });
    accumulator.project({ type: 'text_delta', content: 'partial' }, 1);
    accumulator.dispose();

    expect(() => accumulator.project({ type: 'text_delta', content: 'late' }, 2)).toThrow(
      /after disposed/,
    );
    expect(() => accumulator.snapshot()).toThrow(/disposed/);
  });

  it('emits only linear append bytes for four thousand transport chunks', () => {
    const accumulator = createAgentTurnTimelineAccumulator({
      conversationId: 'conv-linear',
      messageId: 'msg-linear',
    });
    const chunks = Array.from({ length: 4_000 }, (_, index) =>
      index % 7 === 0 ? `| ${index} | shot | action |\n` : `${index % 10}`,
    );
    let outbound = '';

    for (const [index, content] of chunks.entries()) {
      const update = accumulator.project({ type: 'text_delta', content }, index);
      const operation = update?.operations.find(
        (candidate) => candidate.operation === 'append' && candidate.item.kind === 'assistant_text',
      );
      if (operation?.operation === 'append' && operation.item.kind === 'assistant_text') {
        outbound += operation.item.payload.content;
      }
    }

    const expected = chunks.join('');
    expect(outbound).toBe(expected);
    expect(new TextEncoder().encode(outbound).byteLength).toBe(
      new TextEncoder().encode(expected).byteLength,
    );
    expect(textItem(accumulator.snapshot()).payload.content).toBe(expected);
  });
});
