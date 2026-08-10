import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '../character-lore-storyline-memory';
import {
  decodeCharacterRecords,
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterRun,
  parseCharacterVersion,
  parseUserCharacterRelationship,
} from '../character';
import {
  createCharacterConversationLaunchHostRequest,
  parseCharacterConversationLaunchHostResult,
} from '../character-conversation-launch';
import { describe, expect, it } from 'vitest';

const now = '2026-08-09T10:00:00.000Z';

function definition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [
      { representationId: 'portrait-main', kind: 'portrait', resourceRef: 'asset:portrait-a' },
    ],
  };
}

describe('Character canonical contracts', () => {
  it('requires author defaults to select exact compatible representations', () => {
    const selected = parseCharacterVersion({
      characterVersionId: 'character-version-avatar',
      characterProjectId: 'character-project-a',
      label: 'Avatar publication',
      definition: {
        ...definition(),
        representationRefs: [
          { representationId: 'portrait-main', kind: 'portrait', resourceRef: 'asset:portrait-a' },
          { representationId: 'avatar-main', kind: 'vrm', resourceRef: 'asset:avatar-a' },
        ],
        representationDefaults: {
          portraitRepresentationId: 'portrait-main',
          avatarRepresentationId: 'avatar-main',
        },
      },
      acceptedEvidenceIds: [],
      publishedAt: now,
    });

    expect(selected.definition.representationDefaults).toEqual({
      portraitRepresentationId: 'portrait-main',
      avatarRepresentationId: 'avatar-main',
    });
    expect(() =>
      parseCharacterVersion({
        ...selected,
        definition: {
          ...selected.definition,
          representationDefaults: { avatarRepresentationId: 'portrait-main' },
        },
      }),
    ).toThrow(/exact compatible representation/u);
  });

  it('parses a reviewed CharacterProject and immutable publication record', () => {
    const project = parseCharacterProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
      evidence: [
        {
          evidenceId: 'evidence-a',
          sourceRef: 'document:scene-1',
          excerpt: 'Lin returns the key.',
          observedAt: now,
        },
      ],
      candidates: [
        {
          candidateId: 'candidate-a',
          field: 'canon',
          proposedValue: 'Returns borrowed objects.',
          evidenceIds: ['evidence-a'],
          status: 'accepted',
          reviewedAt: now,
        },
      ],
      reviewStatus: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    const published = parseCharacterVersion({
      characterVersionId: 'character-version-a',
      characterProjectId: project.characterProjectId,
      label: 'First publication',
      definition: project.draft,
      acceptedEvidenceIds: ['evidence-a'],
      publishedAt: now,
    });

    expect(published.characterVersionId).toBe('character-version-a');
    expect(published.definition).not.toBe(project.draft);
    const forbiddenField = ['schema', 'Version'].join('');
    expect(() => parseCharacterVersion({ ...published, [forbiddenField]: 1 })).toThrow(
      /unsupported fields/u,
    );
  });

  it('keeps an authoring-test snapshot separate from CharacterVersion identity', () => {
    const snapshot = parseCharacterAuthoringTestSnapshot({
      authoringTestSnapshotId: 'authoring-test-a',
      characterProjectId: 'character-project-a',
      capturedAt: now,
      definition: definition(),
    });

    expect(snapshot).not.toHaveProperty('characterVersionId');
    expect(() => parseCharacterVersion(snapshot)).toThrow();
  });

  it('requires one primary AgentSession only for agent-controlled CharacterRun', () => {
    const agentRun = parseCharacterRun({
      characterRunId: 'character-run-agent',
      characterVersionId: 'character-version-a',
      participantId: 'participant-agent',
      controller: { kind: 'agent', primaryAgentSessionId: 'agent-session-a' },
      runtimeBinding: { kind: 'companion', relationshipId: 'relationship-a' },
      createdAt: now,
    });
    const humanRun = parseCharacterRun({
      characterRunId: 'character-run-human',
      characterVersionId: 'character-version-a',
      participantId: 'participant-human',
      controller: { kind: 'human', userId: 'user-a' },
      runtimeBinding: { kind: 'companion', relationshipId: 'relationship-a' },
      createdAt: now,
    });

    expect(agentRun.controller).toEqual({
      kind: 'agent',
      primaryAgentSessionId: 'agent-session-a',
    });
    expect(humanRun.controller).toEqual({ kind: 'human', userId: 'user-a' });
    expect(() =>
      parseCharacterRun({
        ...humanRun,
        runtimeBinding: { kind: 'narrative', externalCompositionRef: 'composition:run-a' },
      }),
    ).toThrow(/unsupported fields|kind/u);
    expect(() =>
      parseCharacterRun({
        ...humanRun,
        controller: {
          kind: 'human',
          userId: 'user-a',
          primaryAgentSessionId: 'hidden-session',
        },
      }),
    ).toThrow(/cannot bind an AgentSession/u);
  });

  it('parses explicit relationship memory and rejects unreviewed accepted state', () => {
    const relationship = parseUserCharacterRelationship({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterVersionId: 'character-version-a',
      memories: [
        {
          memoryId: 'memory-a',
          content: 'The user prefers tea.',
          sourceRef: 'room-event:message-a',
          acceptedAt: now,
        },
      ],
      candidates: [
        {
          candidateId: 'memory-candidate-a',
          content: 'The user may prefer quiet rooms.',
          sourceRef: 'agent-session:turn-a',
          status: 'pending',
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(relationship.memories).toHaveLength(1);
    expect(relationship.candidates[0]?.status).toBe('pending');
  });

  it('isolates one invalid CharacterVersion while retaining valid siblings', () => {
    const valid = {
      characterVersionId: 'character-version-valid',
      characterProjectId: 'character-project-a',
      label: 'Valid',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: now,
    };
    const result = decodeCharacterRecords(
      [valid, { ...valid, characterVersionId: 'character-version-invalid', rawPath: '/private' }],
      'character-version',
      parseCharacterVersion,
      'characterVersionId',
    );

    expect(result.records.map((record) => record.characterVersionId)).toEqual([
      'character-version-valid',
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-character-record',
        recordId: 'character-version-invalid',
      }),
    ]);
  });

  it('strictly binds Character conversation launch to one exact Desktop Draft', () => {
    const request = createCharacterConversationLaunchHostRequest({
      requestId: 'character-launch-a',
      rendererSessionId: 'renderer-session-a',
      workbenchInstanceId: 'workbench-a',
      agentSurfaceId: 'agent-surface-a',
      agentViewId: 'agent-view-a',
      draftId: 'draft-a',
      message: 'Hello.',
      selection: {
        runtimeKind: 'companion',
        characters: [{ characterVersionId: 'character-version-a' }],
      },
    });

    expect(request.selection.characters).toEqual([{ characterVersionId: 'character-version-a' }]);
    expect(() =>
      createCharacterConversationLaunchHostRequest({
        ...request,
        selection: {
          ...request.selection,
          characters: [
            { characterVersionId: 'character-version-a' },
            { characterVersionId: 'character-version-a' },
          ],
        },
      }),
    ).toThrow(/duplicate identity/u);
    expect(() =>
      parseCharacterConversationLaunchHostResult(
        {
          requestId: 'foreign-request',
          launch: {
            topology: 'dialogue',
            runtimeKind: 'companion',
            characterProjectId: 'character-project-a',
            characterVersionId: 'character-version-a',
            characterRunId: 'character-run-a',
            dialogueRunId: 'dialogue-run-a',
            primaryAgentSessionId: 'conversation:character:a',
          },
        },
        request.requestId,
      ),
    ).toThrow(/request identity mismatch/u);
  });
});
