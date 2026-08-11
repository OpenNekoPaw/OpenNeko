import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterRoom,
  type CharacterRun,
  type RoomRun,
} from '@neko/chara/contracts';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterAuthoringService,
  CharacterConversationLaunchService,
  CharacterMemoryService,
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
  it('atomically persists launch StorylineRun and MemoryScope with their exact CharacterRun', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
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
    await storylines.publish({
      characterStorylineVersionId: 'character-storyline-version-launch',
      characterVersionId: 'character-version-launch',
      label: 'Trust arc',
      premise: 'A sealed archive opens.',
      desire: 'Protect the record.',
      conflict: 'The record must be shared.',
      growthArc: 'Learn to trust a witness.',
      stages: [{ stageId: 'stage-guarded', title: 'Guarded', description: 'Keeps distance.' }],
      turningPoints: [],
      constraints: [],
      acceptedEvidenceIds: [],
    });
    const launch = new CharacterConversationLaunchService({
      repository: fixture.repository,
      publications: fixture.repository,
      agentSessions: {
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
        runtimeKind: 'companion',
        characters: [
          {
            characterVersionId: 'character-version-launch',
            characterStorylineVersionId: 'character-storyline-version-launch',
          },
        ],
      },
    });

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(
      reopened.readCharacterRun('character-run:launch:persistent-launch:1'),
    ).resolves.toMatchObject({
      characterStorylineRunId: 'character-storyline-run:launch:persistent-launch:1',
      characterMemoryScopeId: 'character-memory-scope:launch:persistent-launch:1',
    });
    await expect(
      reopened.readStorylineRun('character-storyline-run:launch:persistent-launch:1'),
    ).resolves.toMatchObject({
      characterStorylineVersionId: 'character-storyline-version-launch',
      currentStageId: 'stage-guarded',
    });
    await expect(
      reopened.readMemoryScope('character-memory-scope:launch:persistent-launch:1'),
    ).resolves.toMatchObject({
      characterRunId: 'character-run:launch:persistent-launch:1',
      characterStorylineRunId: 'character-storyline-run:launch:persistent-launch:1',
    });
    await fixture.store.dispose();
  });

  it('reopens exact Character publication and Room timeline with repository CAS', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
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

  it('persists Storyline and Memory CAS authorities across repository reopen', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
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
    await storylines.publish({
      characterStorylineVersionId: 'storyline-version-a',
      characterVersionId: 'character-version-a',
      label: 'Trust arc',
      premise: 'Lin must share responsibility.',
      desire: 'Protect the archive alone.',
      conflict: 'One keeper cannot preserve everything.',
      growthArc: 'From control to reviewed trust.',
      stages: [
        { stageId: 'guarded', title: 'Guarded', description: 'Refuses assistance.' },
        { stageId: 'trusting', title: 'Trusting', description: 'Delegates safely.' },
      ],
      turningPoints: [],
      constraints: [],
      acceptedEvidenceIds: [],
    });
    await storylines.createRun({
      characterStorylineRunId: 'storyline-run-a',
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run-a',
      initialStageId: 'guarded',
    });
    await storylines.proposeObservation({
      observationCandidateId: 'observation-a',
      characterStorylineRunId: 'storyline-run-a',
      sourceRef: 'room-event:event-a',
      observedAt: NOW,
      fromStageId: 'guarded',
      toStageId: 'trusting',
      expectedStorylineRevision: 0,
    });
    await storylines.acceptObservation({
      observationCandidateId: 'observation-a',
      characterStorylineRunId: 'storyline-run-a',
      transitionId: 'transition-a',
      expectedStorylineRevision: 0,
    });

    const memories = new CharacterMemoryService(fixture.repository, { now: () => NOW });
    await memories.createScope({
      characterMemoryScopeId: 'memory-scope-a',
      characterRunId: 'character-run-a',
      characterStorylineRunId: 'storyline-run-a',
    });
    const proposed = await memories.propose({
      characterMemoryScopeId: 'memory-scope-a',
      characterMemoryCandidateId: 'memory-candidate-a',
      content: 'Lin remembers trusting the user.',
      sourceRef: 'room-event:event-a',
      observedAt: NOW,
      sensitivityTraits: [],
      retentionTraits: ['milestone'],
      expectedMemoryRevision: 0,
    });
    await memories.accept({
      characterMemoryScopeId: 'memory-scope-a',
      characterMemoryCandidateId: 'memory-candidate-a',
      characterMemoryEntryId: 'memory-entry-a',
      expectedMemoryRevision: proposed.memoryRevision,
    });

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(reopened.readStorylineRun('storyline-run-a')).resolves.toMatchObject({
      currentStageId: 'trusting',
      storylineRevision: 1,
    });
    await expect(reopened.readMemoryScope('memory-scope-a')).resolves.toMatchObject({
      memoryRevision: 2,
      entries: [{ characterMemoryEntryId: 'memory-entry-a', status: 'active' }],
    });
    await expect(reopened.mutateMemoryScope('memory-scope-a', 0, (scope) => scope)).rejects.toThrow(
      'changed concurrently',
    );
    await fixture.store.dispose();
  });

  it('persists immutable turn presentation receipts independently from later config updates', async () => {
    const fixture = await createFixture();
    const authoring = new CharacterAuthoringService({
      repository: fixture.repository,
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
      chat: { providerRef: 'provider:chat-a', modelRef: 'model:chat-a' },
    });
    await presentation.startTurn({ turnId: 'turn-a', characterRunId: 'character-run-a' });
    await presentation.updateConfigurations([
      { ...initial, chat: { providerRef: 'provider:chat-b', modelRef: 'model:chat-b' } },
    ]);

    const reopened = createPersistentCharacterRepository({ metadataStore: fixture.store });
    await expect(reopened.readPresentationConfiguration('character-run-a')).resolves.toMatchObject({
      chat: { modelRef: 'model:chat-b' },
    });
    await expect(reopened.readPresentationTurnReceipt('turn-a')).resolves.toMatchObject({
      chat: { modelRef: 'model:chat-a' },
      tts: { voiceRepresentationId: 'voice-a' },
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
  return { store, repository: createPersistentCharacterRepository({ metadataStore: store }) };
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
    runtimeKind: 'companion',
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
    runtimeBinding: { kind: 'companion', relationshipId: 'relationship-a' },
    createdAt: NOW,
  };
}
