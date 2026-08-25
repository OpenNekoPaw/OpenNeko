import { describe, expect, it } from 'vitest';
import {
  createCharacterAuthoringCommandRequest,
  createCharacterAuthoringSnapshotRequest,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterAuthoringHostRequest,
  parseCharacterAuthoringHostResult,
  type CharacterAuthoringBinding,
} from '@neko/chara-domain/contracts';

describe('Character authoring Host contract', () => {
  const binding: CharacterAuthoringBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project', projectId: 'project-1' },
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
    expect(
      createCharacterAuthoringCommandRequest({
        requestId: 'request-storyline',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'character-storyline-create',
          input: {
            characterStorylineId: 'storyline-1',
            characterProjectId: 'character-1',
            displayName: 'First storyline',
            draft: storylineDraft(),
          },
        },
      }),
    ).toMatchObject({ operation: 'character-storyline-create', ...binding });
    expect(
      createCharacterAuthoringCommandRequest({
        requestId: 'request-test',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'character-authoring-test-capture',
          input: {
            characterProjectId: 'character-1',
            authoringTestSnapshotId: 'authoring-test-1',
          },
        },
      }),
    ).toMatchObject({ operation: 'character-authoring-test-capture', ...binding });
    expect(
      createCharacterAuthoringCommandRequest({
        requestId: 'request-continue',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        command: {
          operation: 'character-version-continue',
          input: {
            characterProjectId: 'character-1',
            characterVersionId: 'character-version-1',
            replaceWorkingDraft: true,
          },
        },
      }),
    ).toMatchObject({ operation: 'character-version-continue', ...binding });
    expect(() =>
      parseCharacterAuthoringHostRequest({
        requestId: 'request-continue-invalid',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        ...binding,
        operation: 'character-version-continue',
        input: {
          characterProjectId: 'character-1',
          characterVersionId: 'version-1',
          replaceWorkingDraft: false,
        },
      }),
    ).toThrow('must be explicitly true');
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
          sources: { evidence: [], assetRepresentations: [] },
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

  it('rejects retired standalone and Content Project authority shapes', () => {
    expect(() =>
      parseCharacterAuthoringHostRequest({
        requestId: 'request-standalone',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        ...binding,
        authority: { kind: 'standalone-library' },
        operation: 'authoring-snapshot-get',
      }),
    ).toThrow();
    expect(() =>
      parseCharacterAuthoringHostRequest({
        requestId: 'request-content-project',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        ...binding,
        authority: { kind: 'content-project', contentProjectId: 'project-1' },
        operation: 'authoring-snapshot-get',
      }),
    ).toThrow();
  });

  it('parses one owner snapshot and rejects cross-target or internal-version payloads', () => {
    const result = {
      requestId: 'request-1',
      ...binding,
      snapshot: {
        project: project('character-1'),
        versions: [publication('character-1')],
        authoringTestSnapshots: [],
        storylines: [],
        storylineDrafts: [],
        storylineVersions: [],
        lineage: null,
        referenceInventories: [
          {
            characterVersionId: 'character-version-1',
            coverage: 'complete',
            references: [],
            diagnostics: [],
          },
        ],
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
      parseCharacterAuthoringHostResult(
        {
          ...result,
          snapshot: {
            ...result.snapshot,
            versions: [
              publication('character-1'),
              { ...publication('character-1'), characterVersionId: 'character-version-2' },
            ],
            referenceInventories: [
              result.snapshot.referenceInventories[0],
              result.snapshot.referenceInventories[0],
            ],
          },
        },
        'request-1',
        binding,
      ),
    ).toThrow('reference inventory is incomplete or unowned');
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

function storylineDraft() {
  return {
    characterVersionId: 'version-1',
    premise: 'A beginning',
    constraints: [],
    nodeOrder: ['node-1'],
    nodes: [
      {
        storylineNodeId: 'node-1',
        title: 'Opening',
        spoilerVisibility: 'visible' as const,
        context: {
          situation: 'At home',
          allowedStoryFacts: [],
          forbiddenStoryFacts: [],
          narrativeMemories: [],
          knowledgeBoundary: [],
          behaviorConstraints: [],
          expressionConstraints: [],
          authorOnlyNotes: [],
        },
      },
    ],
    edges: [],
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
