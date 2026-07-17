import { describe, expect, it } from 'vitest';
import type { CreativeEntityChangedRef } from '@neko/shared';
import {
  applyCandidateEntityBackfill,
  mergePendingCandidateEntityBackfill,
} from './canvasEntityBackfill';

describe('canvas entity candidate backfill', () => {
  it('sets entityRef and clears candidateId on matching shot characters', () => {
    const result = applyCandidateEntityBackfill(makeCanvasData('candidate-rin'), [
      candidateRef('candidate-rin', 'char-rin'),
    ]);

    expect(result.updated).toBe(true);
    expect(result.matchedCount).toBe(1);
    expect(result.data.nodes).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          characters: [
            {
              characterName: 'Rin',
              entityRef: { entityId: 'char-rin', entityKind: 'character' },
            },
          ],
        }),
      }),
    ]);
  });

  it('is a no-op for mismatched candidates and records recovery diagnostics', () => {
    const result = applyCandidateEntityBackfill(makeCanvasData('candidate-rin'), [
      candidateRef('candidate-mika', 'char-mika'),
    ]);

    expect(result.updated).toBe(false);
    expect(result.matchedCount).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'no-matching-shot-character',
        candidateId: 'candidate-mika',
      }),
    ]);
  });

  it('does not backfill duplicate candidate refs with conflicting entities', () => {
    const result = applyCandidateEntityBackfill(makeCanvasData('candidate-rin'), [
      candidateRef('candidate-rin', 'char-rin'),
      candidateRef('candidate-rin', 'char-other'),
    ]);

    expect(result.updated).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'duplicate-candidate-ref',
        candidateId: 'candidate-rin',
      }),
    ]);
  });

  it('keeps recoverable pending refs unique for later retry', () => {
    const pending = mergePendingCandidateEntityBackfill([], {
      changedRefs: [candidateRef('candidate-rin', 'char-rin')],
      diagnostics: [
        {
          code: 'no-matching-shot-character',
          candidateId: 'candidate-rin',
          message: 'Canvas document is not available yet.',
        },
      ],
    });
    const merged = mergePendingCandidateEntityBackfill(pending.pending, {
      changedRefs: [
        candidateRef('candidate-rin', 'char-rin'),
        candidateRef('candidate-mika', 'char-mika'),
      ],
      diagnostics: [
        {
          code: 'no-matching-shot-character',
          candidateId: 'candidate-mika',
          message: 'Canvas document is not available yet.',
        },
      ],
    });

    expect(pending.queued).toBe(true);
    expect(merged.queued).toBe(true);
    expect(merged.pending.map((entry) => entry.changedRefs.map((ref) => ref.id))).toEqual([
      ['candidate-rin'],
      ['candidate-mika'],
    ]);
  });

  it('does not queue unrecoverable invalid or conflicting refs', () => {
    const invalid = mergePendingCandidateEntityBackfill([], {
      changedRefs: [{ kind: 'candidate', id: 'candidate-rin' }],
      diagnostics: [
        {
          code: 'invalid-candidate-ref',
          candidateId: 'candidate-rin',
          message: 'Candidate change ref needs an entityRef for Canvas backfill.',
        },
      ],
    });
    const duplicate = mergePendingCandidateEntityBackfill(invalid.pending, {
      changedRefs: [candidateRef('candidate-rin', 'char-rin')],
      diagnostics: [
        {
          code: 'duplicate-candidate-ref',
          candidateId: 'candidate-rin',
          message: 'Candidate resolved to multiple entity refs.',
        },
      ],
    });

    expect(invalid).toEqual({ pending: [], queued: false });
    expect(duplicate).toEqual({ pending: [], queued: false });
  });
});

function makeCanvasData(candidateId: string): Record<string, unknown> {
  return {
    version: '1.0',
    nodes: [
      {
        id: 'shot-1',
        type: 'shot',
        data: {
          characters: [
            {
              characterName: 'Rin',
              candidateId,
            },
          ],
        },
      },
    ],
    connections: [],
  };
}

function candidateRef(candidateId: string, entityId: string): CreativeEntityChangedRef {
  return {
    kind: 'candidate',
    id: candidateId,
    entityRef: { entityId, entityKind: 'character' },
  };
}
