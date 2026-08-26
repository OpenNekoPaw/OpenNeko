import { describe, expect, it } from 'vitest';
import type { DshSessionHostEvent } from '@neko/agent-contracts/dsh-session-host';

import { projectDshTranscriptPresentation } from './transcript-presentation';

describe('DSH transcript presentation', () => {
  it('classifies pre-Tool assistant text as a progress note and preserves the final answer', () => {
    const events: readonly DshSessionHostEvent[] = [
      { kind: 'turn', turn: 2, phase: 'start', startedAt: 1_000 },
      {
        kind: 'message',
        role: 'assistant',
        turn: 2,
        step: 0,
        text: 'I am checking the source material first.',
        messageId: 'progress-1',
        state: 'final',
      },
      {
        kind: 'tool',
        turn: 2,
        toolCallId: 'tool-1',
        title: 'openneko.document',
        status: 'pending',
      },
      {
        kind: 'message',
        role: 'assistant',
        turn: 2,
        step: 1,
        text: 'The document is ready.',
        messageId: 'answer-1',
        state: 'final',
      },
      { kind: 'turn', turn: 2, phase: 'end', startedAt: 1_000, completedAt: 2_000 },
    ];

    const items = projectDshTranscriptPresentation(events);

    expect(items.map((item) => item.kind)).toEqual([
      'event',
      'progress-note',
      'tool-group',
      'event',
      'event',
    ]);
    expect(items[1]).toMatchObject({ kind: 'progress-note', event: { messageId: 'progress-1' } });
    expect(items[2]).toMatchObject({ kind: 'tool-group', hasProcessNote: true });
    expect(items[3]).toMatchObject({ kind: 'event', event: { messageId: 'answer-1' } });
  });

  it('merges duplicate Tool lifecycle rows without losing bounded payloads', () => {
    const events: readonly DshSessionHostEvent[] = [
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-1',
        title: 'openneko.document',
        status: 'pending',
        rawInput: { operation: 'read' },
      },
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-2',
        title: 'openneko.read_image',
        status: 'pending',
      },
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-1',
        title: 'openneko.document',
        status: 'completed',
        rawOutput: { pages: 4 },
      },
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-2',
        title: 'openneko.read_image',
        status: 'failed',
        rawOutput: { diagnostic: 'unsupported image' },
      },
    ];

    const items = projectDshTranscriptPresentation(events);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: 'tool-group',
      turn: 3,
      sourceIndex: 0,
      hasProcessNote: false,
      tools: [
        {
          kind: 'tool',
          turn: 3,
          toolCallId: 'tool-1',
          title: 'openneko.document',
          status: 'completed',
          rawInput: { operation: 'read' },
          rawOutput: { pages: 4 },
        },
        {
          kind: 'tool',
          turn: 3,
          toolCallId: 'tool-2',
          title: 'openneko.read_image',
          status: 'failed',
          rawOutput: { diagnostic: 'unsupported image' },
        },
      ],
    });
  });

  it('merges Tool lifecycle updates across interleaved events without moving the event', () => {
    const events: readonly DshSessionHostEvent[] = [
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-1',
        title: 'openneko.document',
        status: 'pending',
        rawInput: { operation: 'read' },
      },
      {
        kind: 'thought',
        turn: 3,
        step: 1,
        text: 'Waiting for the Tool to continue.',
        messageId: 'thought-1',
        state: 'final',
      },
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-1',
        title: 'openneko.document',
        status: 'completed',
        rawOutput: { pages: 4 },
      },
    ];

    const items = projectDshTranscriptPresentation(events);

    expect(items).toEqual([
      {
        kind: 'tool-group',
        turn: 3,
        sourceIndex: 0,
        hasProcessNote: false,
        tools: [
          {
            kind: 'tool',
            turn: 3,
            toolCallId: 'tool-1',
            title: 'openneko.document',
            status: 'completed',
            rawInput: { operation: 'read' },
            rawOutput: { pages: 4 },
          },
        ],
      },
      {
        kind: 'event',
        event: events[1],
        sourceIndex: 1,
      },
    ]);
  });

  it('keeps repeated Tool call identities isolated by Turn', () => {
    const events: readonly DshSessionHostEvent[] = [
      {
        kind: 'tool',
        turn: 3,
        toolCallId: 'tool-1',
        status: 'completed',
        rawOutput: { turn: 3 },
      },
      { kind: 'turn', turn: 3, phase: 'end', startedAt: 1_000, completedAt: 2_000 },
      { kind: 'turn', turn: 4, phase: 'start', startedAt: 3_000 },
      {
        kind: 'tool',
        turn: 4,
        toolCallId: 'tool-1',
        status: 'in_progress',
        rawInput: { turn: 4 },
      },
    ];

    const items = projectDshTranscriptPresentation(events);

    expect(items[0]).toMatchObject({
      kind: 'tool-group',
      turn: 3,
      tools: [{ status: 'completed', rawOutput: { turn: 3 } }],
    });
    expect(items[3]).toMatchObject({
      kind: 'tool-group',
      turn: 4,
      tools: [{ status: 'in_progress', rawInput: { turn: 4 } }],
    });
  });

  it('fails visibly when the transcript contains a missing event', () => {
    const events = new Array<DshSessionHostEvent>(1);

    expect(() => projectDshTranscriptPresentation(events)).toThrow(
      'DSH transcript event 0 is missing.',
    );
  });
});
