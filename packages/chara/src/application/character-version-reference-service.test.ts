import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterProject,
  parseCharacterVersion,
} from '@neko/chara/contracts';
import type { CharacterDurableCatalog } from './character-durable-catalog';
import {
  CharaOwnedCharacterVersionReferenceReader,
  CharacterVersionReferenceInventoryService,
  type CharacterVersionReferenceReader,
} from './character-version-reference-service';

const versionId = 'version-a';

describe('CharacterVersion reference inventory', () => {
  it('aggregates exact owner results without changing their identities', async () => {
    const service = new CharacterVersionReferenceInventoryService({
      chara: reader('chara', 'character-run', 'run-a'),
      agent: reader('agent', 'conversation', 'conversation-a'),
      project: reader('project', 'project-dependency', 'project-a:canvas:board'),
    });
    await expect(service.readInventory(versionId)).resolves.toEqual({
      characterVersionId: versionId,
      coverage: 'complete',
      references: [
        reference('chara', 'character-run', 'run-a'),
        reference('agent', 'conversation', 'conversation-a'),
        reference('project', 'project-dependency', 'project-a:canvas:board'),
      ],
      diagnostics: [],
    });
  });

  it('keeps successful sibling owners visible and marks a failed owner incomplete', async () => {
    const service = new CharacterVersionReferenceInventoryService({
      chara: reader('chara', 'character-run', 'run-a'),
      agent: {
        ownerKind: 'agent',
        readReferences: async () => {
          throw new Error('Conversation catalog unavailable.');
        },
      },
      project: reader('project', 'project-dependency', 'project-a:canvas:board'),
    });
    await expect(service.readInventory(versionId)).resolves.toEqual({
      characterVersionId: versionId,
      coverage: 'incomplete',
      references: [
        reference('chara', 'character-run', 'run-a'),
        reference('project', 'project-dependency', 'project-a:canvas:board'),
      ],
      diagnostics: [{ ownerKind: 'agent', message: 'Conversation catalog unavailable.' }],
    });
  });

  it('projects Chara-owned Storyline, Room/run and memory provenance references', async () => {
    const reader = new CharaOwnedCharacterVersionReferenceReader({
      catalog: {
        readCatalog: async () => ({ ...catalog, versions: [version(versionId)] }),
      },
      lineage: { readLineage: async () => undefined, saveLineage: async () => undefined },
    });
    const references = await reader.readReferences([versionId]);
    expect(references.map((item) => `${item.referenceKind}:${item.referenceId}`)).toEqual([
      'storyline-draft:storyline-a',
      'storyline-version:storyline-version-a',
      'character-run:run-a',
      'room-template-participant:room-a:template-a',
      'room-run-participant:room-run-a:participant-a',
      'relationship-memory-candidate:relationship-candidate-a',
      'relationship-memory:relationship-memory-a',
      'companion-memory-candidate:companion-candidate-a',
      'companion-memory:companion-memory-a',
    ]);
  });

  it('projects working-draft basis and derived-version references from Chara authority', async () => {
    const reader = new CharaOwnedCharacterVersionReferenceReader({
      catalog: {
        readCatalog: async () => ({
          ...catalog,
          projects: [project(versionId)],
          versions: [version(versionId), version('version-child')],
        }),
      },
      lineage: {
        readLineage: async () => ({
          characterProjectId: 'character-project-a',
          relations: [
            { characterVersionId: versionId, parentCharacterVersionIds: [] },
            { characterVersionId: 'version-child', parentCharacterVersionIds: [versionId] },
          ],
        }),
        saveLineage: async () => undefined,
      },
    });

    const references = await reader.readReferences([versionId]);

    expect(references.slice(0, 2)).toEqual([
      {
        ownerKind: 'chara',
        referenceKind: 'working-draft-basis',
        referenceId: 'character-project-a',
        characterVersionId: versionId,
      },
      {
        ownerKind: 'chara',
        referenceKind: 'lineage-child',
        referenceId: 'version-child',
        characterVersionId: versionId,
      },
    ]);
  });

  it('includes project-local Storyline references without duplicating catalog-owned facts', async () => {
    const reader = new CharaOwnedCharacterVersionReferenceReader({
      catalog: {
        readCatalog: async () => ({
          ...catalog,
          versions: [version(versionId)],
        }),
      },
      lineage: { readLineage: async () => undefined, saveLineage: async () => undefined },
      storylines: {
        readCatalog: async () => [
          {
            draft: {
              characterStorylineId: 'storyline-a',
              characterVersionId: versionId,
            },
            versions: [
              {
                characterStorylineVersionId: 'storyline-version-a',
                characterVersionId: versionId,
              },
              {
                characterStorylineVersionId: 'storyline-version-local',
                characterVersionId: versionId,
              },
            ],
          },
        ],
      },
    });

    const references = await reader.readReferences([versionId]);

    expect(
      references
        .filter((item) => item.referenceKind.startsWith('storyline-'))
        .map((item) => `${item.referenceKind}:${item.referenceId}`),
    ).toEqual([
      'storyline-draft:storyline-a',
      'storyline-version:storyline-version-a',
      'storyline-version:storyline-version-local',
    ]);
  });
});

function reader(
  ownerKind: CharacterVersionReferenceReader['ownerKind'],
  referenceKind: 'character-run' | 'conversation' | 'project-dependency',
  referenceId: string,
): CharacterVersionReferenceReader {
  return {
    ownerKind,
    readReferences: async () => [reference(ownerKind, referenceKind, referenceId)],
  };
}

function reference(
  ownerKind: CharacterVersionReferenceReader['ownerKind'],
  referenceKind: 'character-run' | 'conversation' | 'project-dependency',
  referenceId: string,
) {
  return { ownerKind, referenceKind, referenceId, characterVersionId: versionId } as const;
}

const catalog: CharacterDurableCatalog = {
  projects: [],
  versions: [],
  diagnostics: [],
  dialogueRuns: [],
  presentationConfigurations: [],
  storylines: [],
  storylineDrafts: [
    {
      characterStorylineId: 'storyline-a',
      characterVersionId: versionId,
      premise: '',
      constraints: [],
      nodeOrder: [],
      nodes: [],
      edges: [],
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  storylineVersions: [
    {
      characterStorylineVersionId: 'storyline-version-a',
      characterStorylineId: 'storyline-a',
      characterVersionId: versionId,
      label: 'A',
      premise: '',
      constraints: [],
      nodeOrder: [],
      nodes: [],
      edges: [],
      publishedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  characterRuns: [
    {
      characterRunId: 'run-a',
      characterVersionId: versionId,
      participantId: 'participant-a',
      controller: { kind: 'agent', primaryAgentSessionId: 'session-a' },
      runtimeBinding: { kind: 'narrative' },
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  rooms: [
    {
      characterRoomId: 'room-a',
      title: 'Room',
      participantTemplates: [
        {
          participantTemplateId: 'template-a',
          displayName: 'A',
          controllerKind: 'agent',
          characterVersionId: versionId,
        },
      ],
      schedulingPolicy: { kind: 'mentioned' },
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  roomRuns: [
    {
      topology: 'chatroom',
      roomRunId: 'room-run-a',
      characterRoomId: 'room-a',
      roomRevision: 0,
      participants: [
        {
          participantId: 'participant-a',
          displayName: 'A',
          characterVersionId: versionId,
          controller: {
            kind: 'agent',
            characterRunId: 'run-a',
            primaryAgentSessionId: 'session-a',
          },
        },
      ],
      schedulingPolicy: { kind: 'mentioned' },
      events: [],
      mode: 'narrative',
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  relationships: [
    {
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterProjectId: 'character-a',
      relationshipRevision: 0,
      candidates: [
        {
          candidateId: 'relationship-candidate-a',
          relationshipId: 'relationship-a',
          sourceCharacterVersionId: versionId,
          provenance: {
            kind: 'conversation-turn',
            conversationId: 'conversation-a',
            turnId: 'turn-a',
          },
          content: 'Memory',
          expectedRelationshipRevision: 0,
          status: 'pending',
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      memories: [
        {
          memoryId: 'relationship-memory-a',
          sourceCandidateId: 'relationship-candidate-a',
          sourceCharacterVersionId: versionId,
          provenance: {
            kind: 'conversation-turn',
            conversationId: 'conversation-a',
            turnId: 'turn-a',
          },
          content: 'Memory',
          status: 'active',
          acceptedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  companionContinuities: [
    {
      companionContinuityId: 'continuity-a',
      userId: 'user-a',
      characterProjectId: 'character-a',
      continuityRevision: 0,
      candidates: [
        {
          companionMemoryCandidateId: 'companion-candidate-a',
          companionContinuityId: 'continuity-a',
          sourceCharacterVersionId: versionId,
          provenance: {
            kind: 'conversation-turn',
            conversationId: 'conversation-a',
            turnId: 'turn-a',
          },
          content: 'Memory',
          compatibility: {
            requiredCanonFacts: [],
            prohibitedKnowledgeBoundaries: [],
            requiredBehaviorPolicies: [],
          },
          sensitivityTraits: [],
          retentionTraits: [],
          expectedContinuityRevision: 0,
          status: 'pending',
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      entries: [
        {
          companionMemoryEntryId: 'companion-memory-a',
          companionContinuityId: 'continuity-a',
          sourceCandidateId: 'companion-candidate-a',
          sourceCharacterVersionId: versionId,
          provenance: {
            kind: 'conversation-turn',
            conversationId: 'conversation-a',
            turnId: 'turn-a',
          },
          content: 'Memory',
          compatibility: {
            requiredCanonFacts: [],
            prohibitedKnowledgeBoundaries: [],
            requiredBehaviorPolicies: [],
          },
          sensitivityTraits: [],
          retentionTraits: [],
          status: 'active',
          acceptedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
};

function definition() {
  return {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

function version(characterVersionId: string) {
  return parseCharacterVersion({
    characterVersionId,
    characterProjectId: 'character-project-a',
    label: characterVersionId,
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
}

function project(draftBasisCharacterVersionId: string) {
  return parseCharacterProject({
    characterProjectId: 'character-project-a',
    displayName: 'A',
    draft: definition(),
    draftBasisCharacterVersionId,
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  });
}
