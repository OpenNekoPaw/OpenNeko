import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  ConversationProjectionPatch,
} from '@neko-agent/types';
import { createTerminalTimelineProjector } from './timeline-projector';
import { createTestAgentTerminalPresentation } from '../presentation/testing';

const identity = {
  conversationId: 'conv-1',
  turnId: 'turn-1',
  runId: 'run-1',
  messageId: 'msg-1',
} as const;

describe('createTerminalTimelineProjector', () => {
  it('projects canonical text, tool result, and later text in Timeline order', () => {
    const projector = createProjector();

    const firstRows = projector.projectMessage(
      patch(0, [
        appendText({
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 1,
          content: 'Before ',
        }),
      ]),
    );
    const laterRows = projector.projectMessage(
      patch(1, [
        appendText({
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 2,
          content: 'tool.',
        }),
        {
          operation: 'complete',
          itemId: 'text-1',
          itemRevision: 3,
          kind: 'assistant_text',
          sourceGeneration: 1,
          status: 'complete',
          updatedAt: 1002,
        },
        upsert({
          itemId: 'tool-call-1',
          sequence: 2,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'succeeded',
          parentAnchor: 'turn',
          payload: {
            toolCall: {
              id: 'call-1',
              name: 'ReadFile',
              arguments: { path: 'brief.md' },
              result: { success: true, data: { pages: 3 } },
            },
          },
        }),
        appendText({
          itemId: 'text-2',
          sequence: 3,
          itemRevision: 1,
          content: 'After tool.',
        }),
      ]),
    );

    expect(firstRows).toEqual([
      expect.objectContaining({ id: 'text-1', status: 'streaming', content: 'Before ' }),
    ]);
    expect(laterRows.map((row) => [row.id, row.status, row.content ?? row.toolCallId])).toEqual([
      ['text-1', 'streaming', 'Before tool.'],
      ['text-1', 'complete', 'Before tool.'],
      ['tool-call-1', 'success', 'call-1'],
      ['text-2', 'streaming', 'After tool.'],
    ]);
    expect(laterRows[2]).toMatchObject({
      toolArguments: { path: 'brief.md' },
      toolResult: { pages: 3 },
    });
  });

  it('preserves canonical Tool artifact facts without a second result accumulator', () => {
    const projector = createProjector();

    const rows = projector.projectMessage(
      patch(0, [
        upsert({
          itemId: 'tool-call-image',
          sequence: 1,
          itemRevision: 1,
          kind: 'tool_call',
          status: 'succeeded',
          parentAnchor: 'turn',
          payload: {
            toolCall: {
              id: 'call-image',
              name: 'GenerateImage',
              arguments: { prompt: 'cat' },
              result: {
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
            },
          },
        }),
      ]),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'tool-call-image',
        kind: 'tool',
        status: 'success',
        toolCallId: 'call-image',
        artifactFacts: [
          expect.objectContaining({
            ref: 'asset-image-1',
            kind: 'generated-asset',
            relativePath: 'neko/generated/image-1.png',
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('blob:https://neko.local/temp');
  });

  it('fails visibly for stale item revisions and missing parent anchors', () => {
    const projector = createProjector();
    projector.projectMessage(
      patch(0, [
        appendText({
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 2,
          content: 'current',
        }),
      ]),
    );

    const staleRows = projector.projectMessage(
      patch(1, [
        appendText({
          itemId: 'text-1',
          sequence: 1,
          itemRevision: 1,
          content: 'stale',
        }),
      ]),
    );
    const missingParentRows = projector.projectMessage(
      patch(2, [
        upsert({
          itemId: 'error-1',
          sequence: 2,
          itemRevision: 1,
          kind: 'error',
          status: 'failed',
          parentAnchor: 'item',
          parentItemId: 'missing-item',
          payload: { code: 'provider-failed' },
        }),
      ]),
    );

    expect(staleRows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        diagnosticCode: 'timeline-stale-item-revision',
        parent: { kind: 'item', id: 'text-1' },
      }),
    ]);
    expect(missingParentRows).toEqual([
      expect.objectContaining({
        kind: 'diagnostic',
        diagnosticCode: 'unknown-parent-item-anchor',
        parent: { kind: 'item', id: 'missing-item' },
      }),
    ]);
  });

  it('clears derived presenter state on reset', () => {
    const projector = createProjector();
    const operation = appendText({
      itemId: 'text-1',
      sequence: 1,
      itemRevision: 1,
      content: 'fresh',
    });

    projector.projectMessage(patch(0, [operation]));
    projector.reset();

    expect(projector.projectMessage(patch(0, [operation]))).toEqual([
      expect.objectContaining({ id: 'text-1', content: 'fresh', sequence: 1 }),
    ]);
  });
});

function createProjector() {
  return createTerminalTimelineProjector({
    presentation: createTestAgentTerminalPresentation(),
    now: () => 1000,
  });
}

function patch(
  baseProjectionVersion: number,
  operations: readonly AgentTurnTimelineOperation[],
): ConversationProjectionPatch {
  return {
    type: 'conversationProjectionPatch',
    ...identity,
    baseProjectionVersion,
    projectionVersion: baseProjectionVersion + 1,
    operations,
  };
}

function appendText(input: {
  readonly itemId: string;
  readonly sequence: number;
  readonly itemRevision: number;
  readonly content: string;
}): Extract<AgentTurnTimelineOperation, { readonly operation: 'append' }> {
  return {
    operation: 'append',
    item: {
      ...identity,
      itemId: input.itemId,
      sequence: input.sequence,
      itemRevision: input.itemRevision,
      kind: 'assistant_text',
      status: 'streaming',
      payload: { content: input.content, format: 'markdown', sourceGeneration: 1 },
      createdAt: 1000,
      updatedAt: 1000 + input.itemRevision,
    },
  };
}

function upsert(
  item: Omit<AgentTurnTimelineItem, keyof typeof identity | 'createdAt' | 'updatedAt'>,
): Extract<AgentTurnTimelineOperation, { readonly operation: 'upsert' }> {
  return {
    operation: 'upsert',
    item: {
      ...identity,
      ...item,
      createdAt: 1000,
      updatedAt: 1000 + item.itemRevision,
    } as Exclude<
      AgentTurnTimelineItem,
      Extract<AgentTurnTimelineItem, { kind: 'assistant_text' | 'thinking' }>
    >,
  };
}
