import { describe, expect, it } from 'vitest';
import {
  createWorldAuthoringCommandRequest,
  createWorldAuthoringSnapshotRequest,
  parseWorldAuthoringHostRequest,
  parseWorldAuthoringHostResult,
  type WorldAuthoringBinding,
} from '@neko/world/contracts';

describe('World authoring Host contract', () => {
  const binding: WorldAuthoringBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    contentProjectId: 'content-project-1',
    worldProjectId: 'world-1',
  };

  it('accepts only exact target-bound World authoring operations', () => {
    expect(
      createWorldAuthoringSnapshotRequest({
        requestId: 'request-1',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
      }),
    ).toMatchObject({ operation: 'authoring-snapshot-get', ...binding });
    expect(
      createWorldAuthoringCommandRequest({
        requestId: 'request-2',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'world-project-set-review',
          input: { worldProjectId: 'world-1', reviewStatus: 'ready' },
        },
      }),
    ).toMatchObject({ operation: 'world-project-set-review', ...binding });
    expect(() =>
      parseWorldAuthoringHostRequest({
        requestId: 'request-3',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        ...binding,
        operation: 'world-preview-run-create',
        input: {
          worldVersionId: 'world-version-1',
          worldRunId: 'world-run-1',
          worldSaveId: 'world-save-1',
          branchId: 'branch-1',
          saveLabel: 'Save',
        },
      }),
    ).toThrow('is not permitted');
    expect(() =>
      createWorldAuthoringCommandRequest({
        requestId: 'request-4',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'world-project-set-review',
          input: { worldProjectId: 'world-other', reviewStatus: 'ready' },
        },
      }),
    ).toThrow('targets another WorldProject');
  });

  it('parses one owner snapshot and rejects cross-target or internal-version payloads', () => {
    const result = {
      requestId: 'request-1',
      ...binding,
      snapshot: {
        project: project('world-1'),
        versions: [publication('world-1')],
        diagnostics: [],
      },
    };
    expect(
      parseWorldAuthoringHostResult(result, 'request-1', binding).snapshot.versions,
    ).toHaveLength(1);
    expect(() =>
      parseWorldAuthoringHostResult(
        {
          ...result,
          snapshot: { ...result.snapshot, versions: [publication('world-other')] },
        },
        'request-1',
        binding,
      ),
    ).toThrow('another WorldProject');
    expect(() =>
      parseWorldAuthoringHostResult({ ...result, schemaVersion: 1 }, 'request-1', binding),
    ).toThrow('unknown or missing fields');
  });
});

function definition() {
  return {
    background: 'Background',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}

function project(worldProjectId: string) {
  return {
    worldProjectId,
    title: 'World',
    draft: definition(),
    sourceRefs: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

function publication(worldProjectId: string) {
  return {
    worldVersionId: 'world-version-1',
    worldProjectId,
    label: 'Publication',
    definition: definition(),
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-11T00:00:00.000Z',
  };
}
