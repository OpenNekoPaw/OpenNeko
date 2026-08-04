import { describe, expect, it } from 'vitest';
import { assertProjectEntityDiscoveryProjectionBatch } from '../project-entity-discovery';

describe('Project Entity discovery projection contract', () => {
  it('accepts source-scoped candidate evidence and occurrences', () => {
    const request = batch();

    expect(assertProjectEntityDiscoveryProjectionBatch(request)).toBe(request);
  });

  it('rejects cross-owner evidence and stale occurrence fingerprints', () => {
    const request = batch();
    expect(() =>
      assertProjectEntityDiscoveryProjectionBatch({
        ...request,
        candidates: [
          {
            ...request.candidates[0]!,
            evidence: [
              {
                ...request.candidates[0]!.evidence[0]!,
                owner: 'media-library',
              },
            ],
          },
        ],
      }),
    ).toThrow('does not match its source');
    expect(() =>
      assertProjectEntityDiscoveryProjectionBatch({
        ...request,
        occurrences: [
          {
            ...request.occurrences[0]!,
            sourceFingerprint: 'sha256:stale',
          },
        ],
      }),
    ).toThrow('does not match its source');
  });

  it('rejects an unknown owner even when the projection batch is empty', () => {
    const request = batch();
    expect(() =>
      assertProjectEntityDiscoveryProjectionBatch({
        ...request,
        source: { ...request.source, owner: 'unknown' as 'workspace' },
        candidates: [],
        occurrences: [],
      }),
    ).toThrow('source identity is invalid');
  });
});

function batch() {
  return {
    source: {
      sourceId: 'workspace:story.fountain',
      owner: 'workspace' as const,
      fingerprint: 'sha256:story-v1',
    },
    candidates: [
      {
        candidateId: 'candidate:nova',
        kind: 'character' as const,
        proposedNames: { canonical: 'Nova', aliases: [] },
        freshness: 'fresh' as const,
        evidence: [
          {
            evidenceId: 'evidence:nova',
            owner: 'workspace' as const,
            sourceId: 'workspace:story.fountain',
          },
        ],
      },
    ],
    occurrences: [
      {
        occurrenceId: 'occurrence:nova',
        candidateId: 'candidate:nova',
        label: 'Nova',
        source: {
          sourceId: 'workspace:story.fountain',
          sourceKind: 'workspace' as const,
          freshness: 'fresh' as const,
        },
        role: 'definition' as const,
        location: '${WORKSPACE}/story.fountain:1',
        sourceFingerprint: 'sha256:story-v1',
      },
    ],
    updatedAt: '2026-08-05T05:00:00.000Z',
  };
}
