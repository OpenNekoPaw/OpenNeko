import { describe, expect, it } from 'vitest';
import {
  projectCanonicalStoryboardTableToCutHandoff,
  validateCanonicalStoryboardTable,
  type ResourceRef,
  type StoryboardTable,
} from '../index';
import { projectCanonicalStoryboardToCanvasPayload } from '../../utils/storyboardPlanner';

const NOW = '2026-07-11T00:00:00.000Z';

function imageRef(): ResourceRef {
  return {
    id: 'image-1',
    scope: 'project',
    provider: 'fixture',
    kind: 'media',
    source: {
      kind: 'media-library',
      mediaLibraryId: 'image-1',
      identity: { hash: 'image-hash' },
    },
    fingerprint: { strategy: 'hash', value: 'image-hash' },
  };
}

function storyboard(): StoryboardTable {
  const resourceRef = imageRef();
  const trace = {
    traceId: 'image-1:root',
    sourceProfile: 'from-image-sequence' as const,
    sourceRef: resourceRef,
  };
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    contractVersion: 1,
    title: 'Canonical Storyboard',
    sourceProfile: 'from-image-sequence',
    revision: {
      revisionId: 'storyboard-v1',
      sequence: 1,
      contentDigest: 'digest-v1',
      createdAt: NOW,
    },
    sourceTrace: [trace],
    projections: [],
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene 1',
        sourceTrace: [trace],
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A still image fills the frame.',
            characterAction: 'The camera slowly pushes in.',
            imageStrategy: 'reuse-original',
            sourceTrace: [trace],
            sourceMediaRefs: [
              {
                refId: 'image-1',
                role: 'source',
                locator: { type: 'asset', assetId: 'image-1' },
                resourceRef,
                mimeType: 'image/png',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('canonical Storyboard projections', () => {
  it('projects Canvas as revision-bound read-only state without mutating Storyboard truth', () => {
    const table = storyboard();
    const result = projectCanonicalStoryboardToCanvasPayload(table);

    expect(result.diagnostics).toEqual([]);
    expect(result.payload).toMatchObject({
      sourceStoryboardRevisionId: 'storyboard-v1',
      projectionMode: 'read-only-projection',
      scenes: [{ sceneId: 'scene-1', shotPlans: [{ shotId: 'shot-1' }] }],
    });
    expect(table.projections).toEqual([]);
    expect(table.scenes[0]?.shots[0]?.visualDescription).toBe('A still image fills the frame.');
  });

  it('creates a one-way Cut handoff bound to the validated canonical revision', () => {
    const table = storyboard();
    const result = projectCanonicalStoryboardTableToCutHandoff(
      table,
      { resolveImagePath: () => '${PROJECT}/media/image-1.png' },
      { now: () => NOW },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.handoff).toEqual({
      target: 'cut',
      storyboardRevisionId: 'storyboard-v1',
      mode: 'one-way-handoff',
      createdAt: NOW,
    });
    expect(result.payload?.shots[0]).toMatchObject({
      id: 'shot-1',
      imagePath: '${PROJECT}/media/image-1.png',
    });
    expect(table.projections).toEqual([]);
  });

  it('rejects non-canonical tables instead of falling back to legacy projection', () => {
    const table = { ...storyboard(), contractVersion: undefined };
    const cut = projectCanonicalStoryboardTableToCutHandoff(table, {
      resolveImagePath: () => '${PROJECT}/media/image-1.png',
    });
    const canvas = projectCanonicalStoryboardToCanvasPayload(table);

    expect(cut.payload).toBeUndefined();
    expect(canvas.payload).toBeUndefined();
    expect(cut.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-canonical-contract' })]),
    );
    expect(validateCanonicalStoryboardTable(table).ok).toBe(false);
  });
});
