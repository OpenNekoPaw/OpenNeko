import {
  createWorldFoundationCommandHostRequest,
  parseWorldFoundationAnyHostRequest,
  parseWorldFoundationHostResult,
  parseWorldFoundationSnapshot,
} from '@neko/world/contracts';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T10:00:00.000Z';

function definition() {
  return {
    background: 'A city of archives.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}

describe('World Foundation host contract', () => {
  it('strictly parses a project command and rejects unsupported fields', () => {
    expect(
      createWorldFoundationCommandHostRequest('request-a', {
        operation: 'world-project-create',
        input: { worldProjectId: 'world-a', title: 'Archive City', draft: definition() },
      }),
    ).toEqual({
      requestId: 'request-a',
      operation: 'world-project-create',
      input: { worldProjectId: 'world-a', title: 'Archive City', draft: definition() },
    });

    expect(() =>
      parseWorldFoundationAnyHostRequest({
        requestId: 'request-a',
        operation: 'world-transformation-state-commit',
        input: {
          worldTransformationCandidateId: 'candidate-a',
          category: 'world-state',
          owner: 'world-runtime',
          requester: { actorId: 'foundation-author', authority: 'author' },
          base: {
            kind: 'runtime',
            worldVersionId: 'version-a',
            worldRunId: 'run-a',
            worldSaveId: 'save-a',
            branchId: 'branch-main',
            worldStateRevision: 0,
            timepoint: 0,
          },
          source: { intent: 'Change the weather.', sourceRefIds: [] },
          diff: [{ operation: 'add', semanticRef: 'world-fact:weather', bad: undefined }],
          requirements: [],
          createdAt: now,
        },
      }),
    ).toThrow();
  });

  it('isolates catalog diagnostics while preserving valid sibling records', () => {
    const snapshot = parseWorldFoundationSnapshot({
      world: {
        projects: [
          {
            worldProjectId: 'world-a',
            title: 'Archive City',
            draft: definition(),
            sourceRefs: [],
            reviewStatus: 'draft',
            createdAt: now,
            updatedAt: now,
          },
        ],
        versions: [],
        runtimes: [],
      },
      diagnostics: [
        {
          owner: 'world',
          recordKind: 'world-version',
          recordId: 'broken-version',
          message: 'Invalid record.',
        },
      ],
    });

    expect(snapshot.world.projects).toHaveLength(1);
    expect(snapshot.diagnostics).toHaveLength(1);
    expect(() =>
      parseWorldFoundationHostResult({ requestId: 'other-request', snapshot }, 'request-a'),
    ).toThrow('request identity mismatch');
  });
});
