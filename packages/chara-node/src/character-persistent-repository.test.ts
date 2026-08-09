import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterRoom, CharacterRun, RoomRun } from '@neko/chara/contracts';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';
import { CharacterAuthoringService, CharacterRoomService } from '@neko/chara/application';
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
    defaultRuntimeKind: 'companion',
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
