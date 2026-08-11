import { describe, expect, it } from 'vitest';
import {
  createCharacterAuthoringCommandRequest,
  createCharacterAuthoringSnapshotRequest,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterAuthoringHostRequest,
  parseCharacterAuthoringHostResult,
  type CharacterAuthoringBinding,
} from '@neko/chara/contracts';

describe('Character authoring Host contract', () => {
  const binding: CharacterAuthoringBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    contentProjectId: 'content-project-1',
    characterProjectId: 'character-1',
  };

  it('accepts only exact target-bound Character authoring operations', () => {
    expect(
      createCharacterAuthoringSnapshotRequest({
        requestId: 'request-1',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
      }),
    ).toMatchObject({ operation: 'authoring-snapshot-get', ...binding });
    expect(
      createCharacterAuthoringCommandRequest({
        requestId: 'request-2',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'character-project-set-review',
          input: { characterProjectId: 'character-1', reviewStatus: 'ready' },
        },
      }),
    ).toMatchObject({ operation: 'character-project-set-review', ...binding });
    expect(() =>
      parseCharacterAuthoringHostRequest({
        requestId: 'request-3',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        ...binding,
        operation: 'character-project-create',
        input: {
          characterProjectId: 'character-1',
          displayName: 'Wrong path',
          draft: definition(),
        },
      }),
    ).toThrow('is not permitted');
    expect(() =>
      createCharacterAuthoringCommandRequest({
        requestId: 'request-4',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'character-project-set-review',
          input: { characterProjectId: 'character-other', reviewStatus: 'ready' },
        },
      }),
    ).toThrow('targets another CharacterProject');
  });

  it('parses one owner snapshot and rejects cross-target or internal-version payloads', () => {
    const result = {
      requestId: 'request-1',
      ...binding,
      snapshot: {
        project: project('character-1'),
        versions: [publication('character-1')],
        diagnostics: [],
      },
    };
    expect(
      parseCharacterAuthoringHostResult(result, 'request-1', binding).snapshot.versions,
    ).toHaveLength(1);
    expect(() =>
      parseCharacterAuthoringHostResult(
        {
          ...result,
          snapshot: { ...result.snapshot, versions: [publication('character-other')] },
        },
        'request-1',
        binding,
      ),
    ).toThrow('another CharacterProject');
    expect(() =>
      parseCharacterAuthoringHostResult({ ...result, schemaVersion: 1 }, 'request-1', binding),
    ).toThrow('unknown or missing fields');
  });
});

function definition() {
  return {
    summary: 'Summary',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

function project(characterProjectId: string) {
  return {
    characterProjectId,
    displayName: 'Character',
    draft: definition(),
    evidence: [],
    candidates: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

function publication(characterProjectId: string) {
  return {
    characterVersionId: 'character-version-1',
    characterProjectId,
    label: 'Publication',
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-11T00:00:00.000Z',
  };
}
