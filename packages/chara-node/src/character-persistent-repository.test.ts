import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterRoom,
  type CharacterRun,
  type CharacterVersionLineage,
  type RoomRun,
} from '@neko/chara/contracts';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterAuthoringService,
  CharacterConversationLaunchService,
  CharacterCompanionContinuityService,
  CharacterPresentationService,
  CharacterRoomService,
  CharacterStorylineService,
} from '@neko/chara/application';
import {
  createPersistentCharacterRepository,
  initializeCharacterPersistenceTables,
} from './character-persistent-repository';

const NOW = '2026-08-09T10:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent Character repository', () => {
  it('atomically persists an exact Narrative Storyline selection without runtime progress or memory', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    await authoring.createProject({
      characterProjectId: 'character-project-launch',
      displayName: 'Lin',
      draft: definition(),
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-launch',
      reviewStatus: 'ready',
    });
    await authoring.publish({
      characterProjectId: 'character-project-launch',
      characterVersionId: 'character-version-launch',
      label: 'Published Lin',
    });
    const storylines = new CharacterStorylineService(fixture.repository, { now: () => NOW });
    await storylines.create({
      characterStorylineId: 'character-storyline-launch',
      characterProjectId: 'character-project-launch',
      displayName: 'Trust arc',
      draft: storylineDraft('character-version-launch'),
    });
    await storylines.publish({
      characterStorylineId: 'character-storyline-launch',
      characterStorylineVersionId: 'character-storyline-version-launch',
      label: 'Trust arc',
    });
    const launch = new CharacterConversationLaunchService({
      repository: fixture.repository,
      publications: fixture.repository,
      agentConversations: {
        createPrimarySession: vi.fn(async ({ characterRunId }) => ({
          primaryAgentSessionId: `conversation:character:${characterRunId}`,
        })),
        releaseUnboundSession: vi.fn(async () => undefined),
        submitTurn: vi.fn(async () => ({ turnId: 'unused', content: 'unused' })),
      },
      now: () => NOW,
    });
    await launch.launch({
      requestId: 'persistent-launch',
      userId: 'user:local',
      userDisplayName: 'User',
      selection: {
        mode: 'narrative',
        characters: [
          {
            characterVersionId: 'character-version-launch',
            storyline: {
              characterStorylineId: 'character-storyline-launch',
              characterStorylineVersionId: 'character-storyline-version-launch',
              storylineNodeId: 'storyline-node-arrival',
            },
          },
        ],
      },
    });
    await fixture.repository.freezeNarrativeTurnReceipt({
      turnId: 'turn-narrative-a',
      primaryAgentSessionId: 'conversation:character:character-run:launch:persistent-launch:1',
      characterRunId: 'character-run:launch:persistent-launch:1',
      characterVersionId: 'character-version-launch',
      conversation: {
        topology: 'dialogue',
        dialogueRunId: 'dialogue-run:launch:persistent-launch',
      },
      storyline: {
        characterStorylineId: 'character-storyline-launch',
        characterStorylineVersionId: 'character-storyline-version-launch',
        storylineNodeId: 'storyline-node-arrival',
      },
      startedAt: NOW,
    });

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(
      reopened.readCharacterRun('character-run:launch:persistent-launch:1'),
    ).resolves.toMatchObject({
      runtimeBinding: {
        kind: 'narrative',
        storyline: {
          characterStorylineId: 'character-storyline-launch',
          characterStorylineVersionId: 'character-storyline-version-launch',
          storylineNodeId: 'storyline-node-arrival',
        },
      },
    });
    await expect(
      reopened.readCompanionContinuity(
        'companion-continuity:user%3Alocal:character-project-launch',
      ),
    ).resolves.toBeUndefined();
    await expect(reopened.readNarrativeTurnReceipt('turn-narrative-a')).resolves.toEqual({
      turnId: 'turn-narrative-a',
      primaryAgentSessionId: 'conversation:character:character-run:launch:persistent-launch:1',
      characterRunId: 'character-run:launch:persistent-launch:1',
      characterVersionId: 'character-version-launch',
      conversation: {
        topology: 'dialogue',
        dialogueRunId: 'dialogue-run:launch:persistent-launch',
      },
      storyline: {
        characterStorylineId: 'character-storyline-launch',
        characterStorylineVersionId: 'character-storyline-version-launch',
        storylineNodeId: 'storyline-node-arrival',
      },
      startedAt: NOW,
    });
    await fixture.store.dispose();
  });

  it('reopens exact Character publication and Room timeline with repository CAS', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    await authoring.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-a',
      reviewStatus: 'ready',
    });
    const publication = await authoring.publish({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      label: 'Published Lin',
    });
    const rooms = new CharacterRoomService(fixture.repository, { now: () => NOW });
    await rooms.createRoom(room());
    await rooms.createPreparedRun({ run: roomRun(), characterRuns: [characterRun()] });
    await rooms.commitUserMessageAndScheduling({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 0,
      messageEvent: {
        kind: 'message',
        roomEventId: 'room-event-a',
        visibility: { kind: 'public' },
        authorParticipantId: 'participant-user',
        content: 'Hello Lin.',
        mentionedParticipantIds: ['participant-lin'],
      },
      schedulingEventId: 'room-scheduling-a',
    });

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(reopened.readPublication(publication.characterVersionId)).resolves.toEqual(
      publication,
    );
    await expect(reopened.readRun('room-run-a')).resolves.toMatchObject({
      roomRevision: 2,
      events: [
        { roomEventId: 'room-event-a', sequence: 1 },
        { roomEventId: 'room-scheduling-a', sequence: 2 },
      ],
    });
    await expect(reopened.readCharacterRun('character-run-a')).resolves.toMatchObject({
      characterVersionId: 'character-version-a',
      participantId: 'participant-lin',
      controller: {
        kind: 'agent',
        primaryAgentSessionId: 'conversation:character:character-run-a',
      },
    });
    await expect(
      reopened.mutateRun('room-run-a', (current) => {
        const first = current.events[0];
        if (!first || first.kind !== 'message') throw new Error('Expected the first Room message.');
        return {
          ...current,
          roomRevision: current.roomRevision + 1,
          events: [
            { ...first, content: 'Rewritten history.' },
            ...current.events.slice(1),
            {
              kind: 'message',
              roomEventId: 'room-event-illegal-rewrite',
              roomRunId: current.roomRunId,
              sequence: current.events.length + 1,
              createdAt: NOW,
              visibility: { kind: 'public' },
              authorParticipantId: 'participant-lin',
              content: 'New tail.',
              mentionedParticipantIds: [],
            },
          ],
        };
      }),
    ).rejects.toThrow('preserve identity and its committed event prefix');
    await expect(
      rooms.commitEvent({
        roomRunId: 'room-run-a',
        expectedRoomRevision: 0,
        event: {
          kind: 'message',
          roomEventId: 'room-event-stale',
          visibility: { kind: 'public' },
          authorParticipantId: 'participant-lin',
          content: 'Stale.',
          mentionedParticipantIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'stale-room-revision' });
    await fixture.store.dispose();
  });

  it('isolates one invalid Character record while valid siblings remain readable', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    for (const suffix of ['valid', 'invalid']) {
      await authoring.createProject({
        characterProjectId: `character-project-${suffix}`,
        displayName: suffix,
        draft: definition(),
      });
    }
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'corrupt-character-fixture' },
      async ({ sql }) => {
        await sql.run(`UPDATE chara_projects SET payload_json = ? WHERE character_project_id = ?`, [
          JSON.stringify({ characterProjectId: 'character-project-invalid' }),
          'character-project-invalid',
        ]);
      },
    );

    const catalog = await fixture.repository.readCatalog();

    expect(catalog.projects).toEqual([
      expect.objectContaining({
        characterProjectId: 'character-project-valid',
        displayName: 'valid',
      }),
    ]);
    expect(catalog.diagnostics).toEqual([
      expect.objectContaining({
        recordKind: 'character-project',
        recordId: 'character-project-invalid',
      }),
    ]);
    await fixture.store.dispose();
  });

  it('isolates corrupt Storyline, continuity, receipt and Presentation siblings without repair or latest substitution', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    await authoring.createProject({
      characterProjectId: 'character-project-isolation',
      displayName: 'Isolation character',
      draft: definition(),
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-isolation',
      reviewStatus: 'ready',
    });
    await authoring.publish({
      characterProjectId: 'character-project-isolation',
      characterVersionId: 'character-version-isolation',
      label: 'Isolation publication',
    });
    const storylines = new CharacterStorylineService(fixture.repository, { now: () => NOW });
    await storylines.create({
      characterStorylineId: 'storyline-isolation',
      characterProjectId: 'character-project-isolation',
      displayName: 'Isolation arc',
      draft: storylineDraft('character-version-isolation'),
    });
    await storylines.publish({
      characterStorylineId: 'storyline-isolation',
      characterStorylineVersionId: 'storyline-version-valid',
      label: 'Valid publication',
    });
    const continuity = new CharacterCompanionContinuityService(fixture.repository, {
      now: () => NOW,
    });
    await continuity.create({
      companionContinuityId: 'continuity-valid',
      userId: 'user-isolation',
      characterProjectId: 'character-project-isolation',
    });
    await fixture.repository.storePresentationConfigurations([
      {
        characterRunId: 'character-run-presentation-valid',
        participantId: 'participant-valid',
        tts: {
          providerRef: 'provider:tts-valid',
          voiceRepresentationId: 'voice-valid',
          speed: 1,
          autoRead: false,
        },
        updatedAt: NOW,
      },
    ]);
    await fixture.repository.freezeNarrativeTurnReceipt({
      turnId: 'turn-receipt-valid',
      primaryAgentSessionId: 'agent-session-valid',
      characterRunId: 'character-run-valid',
      characterVersionId: 'character-version-isolation',
      conversation: { topology: 'dialogue', dialogueRunId: 'dialogue-valid' },
      startedAt: NOW,
    });
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'insert-corrupt-character-siblings' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO chara_storyline_versions(character_storyline_version_id, payload_json) VALUES (?, ?)`,
          [
            'storyline-version-invalid',
            '{"characterStorylineVersionId":"storyline-version-invalid"}',
          ],
        );
        await sql.run(
          `INSERT INTO chara_companion_continuities(companion_continuity_id, continuity_revision, payload_json) VALUES (?, 0, ?)`,
          ['continuity-invalid', '{"companionContinuityId":"continuity-invalid"}'],
        );
        await sql.run(
          `INSERT INTO chara_narrative_turn_receipts(turn_id, payload_json) VALUES (?, ?)`,
          ['turn-receipt-invalid', '{"turnId":"turn-receipt-invalid"}'],
        );
        await sql.run(
          `INSERT INTO chara_presentation_configurations(character_run_id, payload_json) VALUES (?, ?)`,
          [
            'character-run-presentation-invalid',
            '{"characterRunId":"character-run-presentation-invalid"}',
          ],
        );
      },
    );

    const catalog = await fixture.repository.readCatalog();
    expect(catalog.storylineVersions).toEqual([
      expect.objectContaining({ characterStorylineVersionId: 'storyline-version-valid' }),
    ]);
    expect(catalog.companionContinuities).toEqual([
      expect.objectContaining({ companionContinuityId: 'continuity-valid' }),
    ]);
    expect(catalog.presentationConfigurations).toEqual([
      expect.objectContaining({ characterRunId: 'character-run-presentation-valid' }),
    ]);
    expect(catalog.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordKind: 'character-storyline-version',
          recordId: 'storyline-version-invalid',
        }),
        expect.objectContaining({
          recordKind: 'character-companion-continuity',
          recordId: 'continuity-invalid',
        }),
        expect.objectContaining({
          recordKind: 'character-presentation-configuration',
          recordId: 'character-run-presentation-invalid',
        }),
      ]),
    );
    await expect(
      fixture.repository.readNarrativeTurnReceipt('turn-receipt-valid'),
    ).resolves.toMatchObject({ turnId: 'turn-receipt-valid' });
    await expect(
      fixture.repository.readNarrativeTurnReceipt('turn-receipt-invalid'),
    ).rejects.toThrow();
    await expect(
      fixture.repository.readStorylineVersion('storyline-version-missing'),
    ).resolves.toBeUndefined();
    const reread = await fixture.repository.readCatalog();
    expect(reread.diagnostics).toEqual(catalog.diagnostics);
    await fixture.store.dispose();
  });

  it('persists immutable Storyline publications and Memory CAS independently across reopen', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    await authoring.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: definition(),
    });
    await authoring.addEvidence({
      characterProjectId: 'character-project-a',
      evidence: {
        evidenceId: 'evidence-a',
        sourceRef: 'document:lin-notes',
        observedAt: NOW,
      },
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-a',
      reviewStatus: 'ready',
    });
    await authoring.publish({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      label: 'Published Lin',
    });
    const rooms = new CharacterRoomService(fixture.repository, { now: () => NOW });
    await rooms.createRoom(room());
    await rooms.createPreparedRun({ run: roomRun(), characterRuns: [characterRun()] });

    const storylines = new CharacterStorylineService(fixture.repository, { now: () => NOW });
    await storylines.create({
      characterStorylineId: 'storyline-a',
      characterProjectId: 'character-project-a',
      displayName: 'Trust arc',
      draft: storylineDraft('character-version-a'),
    });
    await storylines.publish({
      characterStorylineId: 'storyline-a',
      characterStorylineVersionId: 'storyline-version-a',
      label: 'Trust arc',
    });
    await storylines.updateDraft({
      characterStorylineId: 'storyline-a',
      draft: {
        ...storylineDraft('character-version-a'),
        nodes: [storylineNode('Revised situation.')],
      },
    });
    await storylines.publish({
      characterStorylineId: 'storyline-a',
      characterStorylineVersionId: 'storyline-version-b',
      label: 'Trust arc revised',
    });

    const memories = new CharacterCompanionContinuityService(fixture.repository, {
      now: () => NOW,
    });
    await memories.create({
      companionContinuityId: 'continuity-a',
      userId: 'user-a',
      characterProjectId: 'character-project-a',
    });
    const proposed = await memories.propose({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'memory-candidate-a',
      sourceCharacterVersionId: 'character-version-a',
      provenance: { kind: 'room-event', roomRunId: 'room-run-a', roomEventId: 'event-a' },
      content: 'Lin remembers trusting the user.',
      compatibility: {
        requiredCanonFacts: [],
        prohibitedKnowledgeBoundaries: [],
        requiredBehaviorPolicies: [],
      },
      sensitivityTraits: [],
      retentionTraits: ['milestone'],
      expectedContinuityRevision: 0,
    });
    await memories.accept({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'memory-candidate-a',
      companionMemoryEntryId: 'memory-entry-a',
      expectedContinuityRevision: proposed.continuityRevision,
    });
    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(reopened.readStorylineVersion('storyline-version-a')).resolves.toMatchObject({
      characterStorylineId: 'storyline-a',
      nodes: [{ context: { situation: 'The old gate opens.' } }],
    });
    await expect(reopened.readStorylineVersion('storyline-version-b')).resolves.toMatchObject({
      nodes: [{ context: { situation: 'Revised situation.' } }],
    });
    await expect(reopened.readCompanionContinuity('continuity-a')).resolves.toMatchObject({
      continuityRevision: 2,
      entries: [{ companionMemoryEntryId: 'memory-entry-a', status: 'active' }],
    });
    await expect(
      reopened.mutateCompanionContinuity('continuity-a', 0, (continuity) => continuity),
    ).rejects.toThrow('changed concurrently');
    await fixture.store.dispose();
  });

  it('persists immutable turn presentation receipts independently from later config updates', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
      lineage: fixture.lineage,
      now: () => NOW,
    });
    await authoring.createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Lin',
      draft: {
        ...definition(),
        representationRefs: [
          { representationId: 'voice-a', kind: 'voice', resourceRef: 'voice:lin' },
        ],
        voiceDefaults: {
          providerRef: 'provider:tts-a',
          voiceRepresentationId: 'voice-a',
          speed: 1,
          autoRead: true,
        },
      },
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-a',
      reviewStatus: 'ready',
    });
    await authoring.publish({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      label: 'Published Lin',
    });
    const rooms = new CharacterRoomService(fixture.repository, { now: () => NOW });
    await rooms.createRoom(room());
    await rooms.createPreparedRun({ run: roomRun(), characterRuns: [characterRun()] });
    const presentation = new CharacterPresentationService(fixture.repository, {
      now: () => NOW,
    });
    const initial = await presentation.initializeConfiguration({
      characterRunId: 'character-run-a',
      participantId: 'participant-lin',
    });
    await presentation.startTurn({ turnId: 'turn-a', characterRunId: 'character-run-a' });
    await presentation.updateConfigurations([{ ...initial, tts: { ...initial.tts, speed: 1.25 } }]);

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(reopened.readPresentationConfiguration('character-run-a')).resolves.toMatchObject({
      tts: { speed: 1.25 },
    });
    await expect(reopened.readPresentationTurnReceipt('turn-a')).resolves.toMatchObject({
      tts: { voiceRepresentationId: 'voice-a', speed: 1 },
    });
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-character-persistence-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializeCharacterPersistenceTables(store);
  const lineages = new Map<string, CharacterVersionLineage>();
  return {
    store,
    repository: createPersistentCharacterRepository({ metadataStore: store }),
    lineage: {
      readLineage: async (characterProjectId: string) => {
        const lineage = lineages.get(characterProjectId);
        return lineage === undefined ? undefined : structuredClone(lineage);
      },
      saveLineage: async (lineage: CharacterVersionLineage) => {
        lineages.set(lineage.characterProjectId, structuredClone(lineage));
      },
    },
  };
}

function definition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [],
  };
}

function room(): CharacterRoom {
  return {
    characterRoomId: 'room-a',
    title: 'Archive room',
    participantTemplates: [
      {
        participantTemplateId: 'participant-user',
        displayName: 'User',
        controllerKind: 'human',
        userId: 'user-a',
      },
      {
        participantTemplateId: 'participant-lin',
        displayName: 'Lin',
        controllerKind: 'agent',
        characterVersionId: 'character-version-a',
      },
    ],
    schedulingPolicy: { kind: 'mentioned' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function roomRun(): RoomRun {
  return {
    topology: 'chatroom',
    roomRunId: 'room-run-a',
    characterRoomId: 'room-a',
    roomRevision: 0,
    participants: [
      {
        participantId: 'participant-user',
        displayName: 'User',
        controller: { kind: 'human', userId: 'user-a' },
      },
      {
        participantId: 'participant-lin',
        displayName: 'Lin',
        characterVersionId: 'character-version-a',
        controller: {
          kind: 'agent',
          characterRunId: 'character-run-a',
          primaryAgentSessionId: 'conversation:character:character-run-a',
        },
      },
    ],
    schedulingPolicy: { kind: 'mentioned' },
    events: [],
    mode: 'companion',
    relationshipIds: ['relationship-a'],
    createdAt: NOW,
  };
}

function characterRun(): CharacterRun {
  return {
    characterRunId: 'character-run-a',
    characterVersionId: 'character-version-a',
    participantId: 'participant-lin',
    controller: {
      kind: 'agent',
      primaryAgentSessionId: 'conversation:character:character-run-a',
    },
    runtimeBinding: {
      kind: 'companion',
      companionContinuityId: 'continuity-a',
      relationshipId: 'relationship-a',
    },
    createdAt: NOW,
  };
}

function storylineDraft(characterVersionId: string) {
  return {
    characterVersionId,
    premise: 'An old promise returns.',
    constraints: ['Keep future facts hidden.'],
    nodeOrder: ['storyline-node-arrival'],
    nodes: [storylineNode('The old gate opens.')],
    edges: [],
  } as const;
}

function storylineNode(situation: string) {
  return {
    storylineNodeId: 'storyline-node-arrival',
    title: 'Arrival',
    spoilerVisibility: 'visible',
    context: {
      situation,
      allowedStoryFacts: [],
      forbiddenStoryFacts: ['A future revelation.'],
      narrativeMemories: [],
      knowledgeBoundary: [],
      behaviorConstraints: [],
      expressionConstraints: [],
      authorOnlyNotes: [],
    },
  } as const;
}
