import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterMemoryScope,
  parseCharacterRunPresentationConfiguration,
  parseCharacterStorylineObservationCandidate,
  parseCharacterStorylineRun,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseCharacterTurnPresentationReceipt,
  parseDialogueRun,
  parseRoomRun,
  parseUserCharacterRelationship,
} from '@neko/chara/contracts';
import { isDeepStrictEqual } from 'node:util';
import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  serializeLocalMetadataJson,
  type LocalMetadataSqlExecutor,
  type LocalMetadataSqlRow,
  type LocalMetadataStore,
} from '@neko/local-metadata';
import type {
  CharacterAuthoringRepository,
  CharacterConversationLaunchAggregate,
  CharacterConversationLaunchRepository,
  CharacterDurableCatalogPort,
  CharacterRuntimeCatalogPort,
  CharacterInteractionRepository,
  CharacterMemoryRepository,
  CharacterAvatarAuthorityRepository,
  CharacterPresentationRepository,
  CharacterRoomRepository,
  CharacterRoomInteractionRepository,
  CharacterStorylineRepository,
  UserCharacterRelationshipRepository,
} from '@neko/chara/application';

export interface CharacterPersistentRepository
  extends
    CharacterAuthoringRepository,
    CharacterConversationLaunchRepository,
    CharacterInteractionRepository,
    CharacterMemoryRepository,
    CharacterPresentationRepository,
    CharacterRoomRepository,
    CharacterStorylineRepository,
    UserCharacterRelationshipRepository,
    CharacterDurableCatalogPort {}

export interface CharacterRuntimeRepositories {
  readonly conversationLaunch: CharacterConversationLaunchRepository;
  readonly interaction: CharacterInteractionRepository;
  readonly memory: CharacterMemoryRepository;
  readonly avatarAuthority: CharacterAvatarAuthorityRepository;
  readonly presentation: CharacterPresentationRepository;
  readonly room: CharacterRoomRepository;
  readonly roomInteraction: CharacterRoomInteractionRepository;
  readonly storyline: CharacterStorylineRepository;
  readonly relationship: UserCharacterRelationshipRepository;
  readonly catalog: CharacterRuntimeCatalogPort;
}

export function initializeCharacterRuntimePersistenceTables(
  store: LocalMetadataStore,
): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-character-runtime-persistence-tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS chara_versions (
        character_version_id TEXT PRIMARY KEY,
        character_project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_relationships', 'relationship_id'),
      table('chara_character_runs', 'character_run_id'),
      table('chara_dialogue_runs', 'dialogue_run_id'),
      table('chara_rooms', 'character_room_id'),
      table('chara_storyline_versions', 'character_storyline_version_id'),
      `CREATE TABLE IF NOT EXISTS chara_storyline_runs (
        character_storyline_run_id TEXT PRIMARY KEY,
        storyline_revision INTEGER NOT NULL CHECK (storyline_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_storyline_observation_candidates', 'observation_candidate_id'),
      `CREATE TABLE IF NOT EXISTS chara_memory_scopes (
        character_memory_scope_id TEXT PRIMARY KEY,
        memory_revision INTEGER NOT NULL CHECK (memory_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_presentation_configurations', 'character_run_id'),
      table('chara_presentation_turn_receipts', 'turn_id'),
      `CREATE TABLE IF NOT EXISTS chara_room_runs (
        room_run_id TEXT PRIMARY KEY,
        room_revision INTEGER NOT NULL CHECK (room_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
    ],
  });
}

export function initializeCharacterPersistenceTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-character-persistence-tables',
    statements: [
      table('chara_projects', 'character_project_id'),
      `CREATE TABLE IF NOT EXISTS chara_versions (
        character_version_id TEXT PRIMARY KEY,
        character_project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_authoring_test_snapshots', 'authoring_test_snapshot_id'),
      table('chara_relationships', 'relationship_id'),
      table('chara_character_runs', 'character_run_id'),
      table('chara_dialogue_runs', 'dialogue_run_id'),
      table('chara_rooms', 'character_room_id'),
      table('chara_storyline_versions', 'character_storyline_version_id'),
      `CREATE TABLE IF NOT EXISTS chara_storyline_runs (
        character_storyline_run_id TEXT PRIMARY KEY,
        storyline_revision INTEGER NOT NULL CHECK (storyline_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_storyline_observation_candidates', 'observation_candidate_id'),
      `CREATE TABLE IF NOT EXISTS chara_memory_scopes (
        character_memory_scope_id TEXT PRIMARY KEY,
        memory_revision INTEGER NOT NULL CHECK (memory_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_presentation_configurations', 'character_run_id'),
      table('chara_presentation_turn_receipts', 'turn_id'),
      `CREATE TABLE IF NOT EXISTS chara_room_runs (
        room_run_id TEXT PRIMARY KEY,
        room_revision INTEGER NOT NULL CHECK (room_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
    ],
  });
}

export function createPersistentCharacterRepository(options: {
  readonly metadataStore: LocalMetadataStore;
}): CharacterPersistentRepository {
  const read = <T>(
    operation: string,
    tableName: string,
    idColumn: string,
    identity: string,
    parse: (value: unknown) => T,
    readIdentity: (value: T) => string,
  ): Promise<T | undefined> =>
    options.metadataStore.transaction(
      { mode: 'read', ownership: 'state', operation },
      async ({ sql }) =>
        readRecord(sql, operation, tableName, idColumn, identity, parse, readIdentity),
    );

  const repository: CharacterPersistentRepository = {
    readCatalog: (signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-character-catalog' },
        async ({ sql }) => {
          const diagnostics: import('@neko/chara/application').CharacterDurableRecordDiagnostic[] =
            [];
          const projects = await readCatalogRecords(
            sql,
            'chara_projects',
            'character_project_id',
            'character-project',
            parseCharacterProject,
            (record) => record.characterProjectId,
            diagnostics,
          );
          const versions = await readCatalogRecords(
            sql,
            'chara_versions',
            'character_version_id',
            'character-version',
            parseCharacterVersion,
            (record) => record.characterVersionId,
            diagnostics,
          );
          const relationships = await readCatalogRecords(
            sql,
            'chara_relationships',
            'relationship_id',
            'relationship',
            parseUserCharacterRelationship,
            (record) => record.relationshipId,
            diagnostics,
          );
          const characterRuns = await readCatalogRecords(
            sql,
            'chara_character_runs',
            'character_run_id',
            'character-run',
            parseCharacterRun,
            (record) => record.characterRunId,
            diagnostics,
          );
          const dialogueRuns = await readCatalogRecords(
            sql,
            'chara_dialogue_runs',
            'dialogue_run_id',
            'dialogue-run',
            parseDialogueRun,
            (record) => record.dialogueRunId,
            diagnostics,
          );
          const rooms = await readCatalogRecords(
            sql,
            'chara_rooms',
            'character_room_id',
            'character-room',
            parseCharacterRoom,
            (record) => record.characterRoomId,
            diagnostics,
          );
          const roomRuns = await readCatalogRecords(
            sql,
            'chara_room_runs',
            'room_run_id',
            'room-run',
            parseRoomRun,
            (record) => record.roomRunId,
            diagnostics,
          );
          const storylineVersions = await readCatalogRecords(
            sql,
            'chara_storyline_versions',
            'character_storyline_version_id',
            'character-storyline-version',
            parseCharacterStorylineVersion,
            (record) => record.characterStorylineVersionId,
            diagnostics,
          );
          const storylineRuns = await readCatalogRecords(
            sql,
            'chara_storyline_runs',
            'character_storyline_run_id',
            'character-storyline-run',
            parseCharacterStorylineRun,
            (record) => record.characterStorylineRunId,
            diagnostics,
          );
          const storylineObservationCandidates = await readCatalogRecords(
            sql,
            'chara_storyline_observation_candidates',
            'observation_candidate_id',
            'character-storyline-observation-candidate',
            parseCharacterStorylineObservationCandidate,
            (record) => record.observationCandidateId,
            diagnostics,
          );
          const memoryScopes = await readCatalogRecords(
            sql,
            'chara_memory_scopes',
            'character_memory_scope_id',
            'character-memory-scope',
            parseCharacterMemoryScope,
            (record) => record.characterMemoryScopeId,
            diagnostics,
          );
          const presentationConfigurations = await readCatalogRecords(
            sql,
            'chara_presentation_configurations',
            'character_run_id',
            'character-presentation-configuration',
            parseCharacterRunPresentationConfiguration,
            (record) => record.characterRunId,
            diagnostics,
          );
          return {
            projects,
            versions,
            relationships,
            characterRuns,
            dialogueRuns,
            rooms,
            roomRuns,
            storylineVersions,
            storylineRuns,
            storylineObservationCandidates,
            memoryScopes,
            presentationConfigurations,
            diagnostics,
          };
        },
      );
    },
    readProject: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-project',
        'chara_projects',
        'character_project_id',
        identity,
        parseCharacterProject,
        (record) => record.characterProjectId,
      );
    },
    saveProject: (project, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterProject(project);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'save-character-project' },
        async ({ sql }) => {
          await sql.run(
            `INSERT INTO chara_projects(character_project_id, payload_json) VALUES (?, ?)
             ON CONFLICT(character_project_id) DO UPDATE SET payload_json = excluded.payload_json`,
            [canonical.characterProjectId, encode(canonical, 'save-character-project')],
          );
        },
      );
    },
    storePublication: (publication, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterVersion(publication);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'store-character-version' },
        async ({ sql }) => {
          await insertImmutable(
            sql,
            'store-character-version',
            'chara_versions',
            'character_version_id',
            canonical.characterVersionId,
            encode(canonical, 'store-character-version'),
            ['character_project_id'],
            [canonical.characterProjectId],
          );
        },
      );
    },
    saveAuthoringTestSnapshot: (snapshot, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterAuthoringTestSnapshot(snapshot);
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'store-character-authoring-test-snapshot',
        },
        async ({ sql }) => {
          await insertImmutable(
            sql,
            'store-character-authoring-test-snapshot',
            'chara_authoring_test_snapshots',
            'authoring_test_snapshot_id',
            canonical.authoringTestSnapshotId,
            encode(canonical, 'store-character-authoring-test-snapshot'),
          );
        },
      );
    },
    readPublication: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-version',
        'chara_versions',
        'character_version_id',
        identity,
        parseCharacterVersion,
        (record) => record.characterVersionId,
      );
    },
    readRelationship: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-relationship',
        'chara_relationships',
        'relationship_id',
        identity,
        parseUserCharacterRelationship,
        (record) => record.relationshipId,
      );
    },
    createDialogue: (input, signal) => {
      signal?.throwIfAborted();
      const characterRun = parseCharacterRun(input.characterRun);
      const dialogueRun = parseDialogueRun(input.dialogueRun);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-character-dialogue' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-character-dialogue',
            'chara_character_runs',
            'character_run_id',
            characterRun.characterRunId,
            encode(characterRun, 'create-character-dialogue'),
          );
          await insertNew(
            sql,
            'create-character-dialogue',
            'chara_dialogue_runs',
            'dialogue_run_id',
            dialogueRun.dialogueRunId,
            encode(dialogueRun, 'create-character-dialogue'),
          );
        },
      );
    },
    readCharacterRun: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-run',
        'chara_character_runs',
        'character_run_id',
        identity,
        parseCharacterRun,
        (record) => record.characterRunId,
      );
    },
    readDialogueRun: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-dialogue-run',
        'chara_dialogue_runs',
        'dialogue_run_id',
        identity,
        parseDialogueRun,
        (record) => record.dialogueRunId,
      );
    },
    readRoomRun: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-room-run',
        'chara_room_runs',
        'room_run_id',
        identity,
        parseRoomRun,
        (record) => record.roomRunId,
      );
    },
    createRoom: (room, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterRoom(room);
      return writeNew(options.metadataStore, {
        operation: 'create-character-room',
        tableName: 'chara_rooms',
        idColumn: 'character_room_id',
        identity: canonical.characterRoomId,
        payload: encode(canonical, 'create-character-room'),
      });
    },
    readRoom: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-room',
        'chara_rooms',
        'character_room_id',
        identity,
        parseCharacterRoom,
        (record) => record.characterRoomId,
      );
    },
    commitLaunch: (aggregateValue, signal) => {
      signal?.throwIfAborted();
      const aggregate = parseLaunchAggregate(aggregateValue);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'commit-character-launch' },
        async ({ sql }) => {
          for (const publication of aggregate.publications) {
            await insertImmutable(
              sql,
              'commit-character-launch',
              'chara_versions',
              'character_version_id',
              publication.characterVersionId,
              encode(publication, 'commit-character-launch'),
              ['character_project_id'],
              [publication.characterProjectId],
            );
          }
          for (const relationship of aggregate.relationships) {
            await insertImmutable(
              sql,
              'commit-character-launch',
              'chara_relationships',
              'relationship_id',
              relationship.relationshipId,
              encode(relationship, 'commit-character-launch'),
            );
          }
          if (aggregate.topology === 'dialogue') {
            await insertNew(
              sql,
              'commit-character-launch',
              'chara_character_runs',
              'character_run_id',
              aggregate.characterRun.characterRunId,
              encode(aggregate.characterRun, 'commit-character-launch'),
            );
            await insertLaunchRuntimeRecords(sql, aggregate);
            await insertNew(
              sql,
              'commit-character-launch',
              'chara_dialogue_runs',
              'dialogue_run_id',
              aggregate.dialogueRun.dialogueRunId,
              encode(aggregate.dialogueRun, 'commit-character-launch'),
            );
            return;
          }
          await insertNew(
            sql,
            'commit-character-launch',
            'chara_rooms',
            'character_room_id',
            aggregate.room.characterRoomId,
            encode(aggregate.room, 'commit-character-launch'),
          );
          for (const characterRun of aggregate.characterRuns) {
            await insertNew(
              sql,
              'commit-character-launch',
              'chara_character_runs',
              'character_run_id',
              characterRun.characterRunId,
              encode(characterRun, 'commit-character-launch'),
            );
          }
          await insertLaunchRuntimeRecords(sql, aggregate);
          await insertNew(
            sql,
            'commit-character-launch',
            'chara_room_runs',
            'room_run_id',
            aggregate.roomRun.roomRunId,
            encode(aggregate.roomRun, 'commit-character-launch'),
            ['room_revision'],
            [aggregate.roomRun.roomRevision],
          );
        },
      );
    },
    createRun: (run, signal) => {
      signal?.throwIfAborted();
      const canonical = parseRoomRun(run);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-room-run' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-room-run',
            'chara_room_runs',
            'room_run_id',
            canonical.roomRunId,
            encode(canonical, 'create-room-run'),
            ['room_revision'],
            [canonical.roomRevision],
          );
        },
      );
    },
    createRunAggregate: (input, signal) => {
      signal?.throwIfAborted();
      const run = parseRoomRun(input.run);
      const characterRuns = input.characterRuns.map((record) => parseCharacterRun(record));
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-room-run-aggregate' },
        async ({ sql }) => {
          for (const characterRun of characterRuns) {
            await insertNew(
              sql,
              'create-room-run-aggregate',
              'chara_character_runs',
              'character_run_id',
              characterRun.characterRunId,
              encode(characterRun, 'create-room-run-aggregate'),
            );
          }
          await insertNew(
            sql,
            'create-room-run-aggregate',
            'chara_room_runs',
            'room_run_id',
            run.roomRunId,
            encode(run, 'create-room-run-aggregate'),
            ['room_revision'],
            [run.roomRevision],
          );
        },
      );
    },
    readRun: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-room-run',
        'chara_room_runs',
        'room_run_id',
        identity,
        parseRoomRun,
        (record) => record.roomRunId,
      );
    },
    mutateRun: (identity, mutation, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'mutate-room-run' },
        async ({ sql }) => {
          const current = await requireRecord(
            sql,
            'mutate-room-run',
            'chara_room_runs',
            'room_run_id',
            identity,
            parseRoomRun,
            (record) => record.roomRunId,
          );
          const next = parseRoomRun(mutation(structuredClone(current)));
          const retainedEvents = next.events.slice(0, current.events.length);
          if (
            next.roomRunId !== current.roomRunId ||
            next.roomRevision <= current.roomRevision ||
            !isDeepStrictEqual(retainedEvents, current.events)
          ) {
            throw metadataError(
              'mutate-room-run',
              `RoomRun '${identity}' mutation must preserve identity and its committed event prefix while appending events.`,
            );
          }
          const result = await sql.run(
            `UPDATE chara_room_runs SET room_revision = ?, payload_json = ?
             WHERE room_run_id = ? AND room_revision = ?`,
            [next.roomRevision, encode(next, 'mutate-room-run'), identity, current.roomRevision],
          );
          if (result.changes !== 1) {
            throw metadataError('mutate-room-run', `RoomRun '${identity}' changed concurrently.`);
          }
          return structuredClone(next);
        },
      );
    },
    readCharacterVersion: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-version-for-storyline',
        'chara_versions',
        'character_version_id',
        identity,
        parseCharacterVersion,
        (record) => record.characterVersionId,
      );
    },
    storeStorylineVersion: (version, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterStorylineVersion(version);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'store-character-storyline-version' },
        async ({ sql }) => {
          await insertImmutable(
            sql,
            'store-character-storyline-version',
            'chara_storyline_versions',
            'character_storyline_version_id',
            canonical.characterStorylineVersionId,
            encode(canonical, 'store-character-storyline-version'),
          );
        },
      );
    },
    readStorylineVersion: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-storyline-version',
        'chara_storyline_versions',
        'character_storyline_version_id',
        identity,
        parseCharacterStorylineVersion,
        (record) => record.characterStorylineVersionId,
      );
    },
    createStorylineRun: (run, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterStorylineRun(run);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-character-storyline-run' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-character-storyline-run',
            'chara_storyline_runs',
            'character_storyline_run_id',
            canonical.characterStorylineRunId,
            encode(canonical, 'create-character-storyline-run'),
            ['storyline_revision'],
            [canonical.storylineRevision],
          );
        },
      );
    },
    readStorylineRun: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-storyline-run',
        'chara_storyline_runs',
        'character_storyline_run_id',
        identity,
        parseCharacterStorylineRun,
        (record) => record.characterStorylineRunId,
      );
    },
    createStorylineObservationCandidate: (candidate, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterStorylineObservationCandidate(candidate);
      return writeNew(options.metadataStore, {
        operation: 'create-character-storyline-observation-candidate',
        tableName: 'chara_storyline_observation_candidates',
        idColumn: 'observation_candidate_id',
        identity: canonical.observationCandidateId,
        payload: encode(canonical, 'create-character-storyline-observation-candidate'),
      });
    },
    readStorylineObservationCandidate: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-storyline-observation-candidate',
        'chara_storyline_observation_candidates',
        'observation_candidate_id',
        identity,
        parseCharacterStorylineObservationCandidate,
        (record) => record.observationCandidateId,
      );
    },
    commitStorylineObservationReview: (input, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'commit-character-storyline-observation-review',
        },
        async ({ sql }) => {
          const currentRun = await requireRecord(
            sql,
            'commit-character-storyline-observation-review',
            'chara_storyline_runs',
            'character_storyline_run_id',
            input.characterStorylineRunId,
            parseCharacterStorylineRun,
            (record) => record.characterStorylineRunId,
          );
          const currentCandidate = await requireRecord(
            sql,
            'commit-character-storyline-observation-review',
            'chara_storyline_observation_candidates',
            'observation_candidate_id',
            input.observationCandidateId,
            parseCharacterStorylineObservationCandidate,
            (record) => record.observationCandidateId,
          );
          if (
            currentRun.storylineRevision !== input.expectedStorylineRevision ||
            currentCandidate.status !== 'pending' ||
            currentCandidate.characterStorylineRunId !== currentRun.characterStorylineRunId
          ) {
            throw metadataError(
              'commit-character-storyline-observation-review',
              `Character storyline observation '${input.observationCandidateId}' changed concurrently or belongs to another Run.`,
            );
          }
          const nextCandidate = parseCharacterStorylineObservationCandidate(input.nextCandidate);
          if (
            nextCandidate.observationCandidateId !== currentCandidate.observationCandidateId ||
            nextCandidate.characterStorylineRunId !== currentRun.characterStorylineRunId ||
            nextCandidate.status === 'pending'
          ) {
            throw metadataError(
              'commit-character-storyline-observation-review',
              'Character storyline review must preserve identities and finish the pending candidate.',
            );
          }
          if (input.nextRun !== undefined) {
            const nextRun = parseCharacterStorylineRun(input.nextRun);
            if (
              nextRun.characterStorylineRunId !== currentRun.characterStorylineRunId ||
              nextRun.characterStorylineVersionId !== currentRun.characterStorylineVersionId ||
              nextRun.characterRunId !== currentRun.characterRunId ||
              nextRun.storylineRevision !== currentRun.storylineRevision + 1 ||
              !isDeepStrictEqual(
                nextRun.acceptedTransitions.slice(0, currentRun.acceptedTransitions.length),
                currentRun.acceptedTransitions,
              )
            ) {
              throw metadataError(
                'commit-character-storyline-observation-review',
                'Character storyline acceptance must preserve authority and append exactly one CAS step.',
              );
            }
            const runResult = await sql.run(
              `UPDATE chara_storyline_runs SET storyline_revision = ?, payload_json = ?
               WHERE character_storyline_run_id = ? AND storyline_revision = ?`,
              [
                nextRun.storylineRevision,
                encode(nextRun, 'commit-character-storyline-observation-review'),
                currentRun.characterStorylineRunId,
                currentRun.storylineRevision,
              ],
            );
            if (runResult.changes !== 1) {
              throw metadataError(
                'commit-character-storyline-observation-review',
                `CharacterStorylineRun '${currentRun.characterStorylineRunId}' changed concurrently.`,
              );
            }
          } else if (nextCandidate.status !== 'rejected') {
            throw metadataError(
              'commit-character-storyline-observation-review',
              'A Character storyline acceptance must advance its owning Run.',
            );
          }
          const candidateResult = await sql.run(
            `UPDATE chara_storyline_observation_candidates SET payload_json = ?
             WHERE observation_candidate_id = ?`,
            [
              encode(nextCandidate, 'commit-character-storyline-observation-review'),
              currentCandidate.observationCandidateId,
            ],
          );
          if (candidateResult.changes !== 1) {
            throw metadataError(
              'commit-character-storyline-observation-review',
              `Character storyline observation '${currentCandidate.observationCandidateId}' is missing.`,
            );
          }
        },
      );
    },
    createMemoryScope: (scope, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterMemoryScope(scope);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-character-memory-scope' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-character-memory-scope',
            'chara_memory_scopes',
            'character_memory_scope_id',
            canonical.characterMemoryScopeId,
            encode(canonical, 'create-character-memory-scope'),
            ['memory_revision'],
            [canonical.memoryRevision],
          );
        },
      );
    },
    readMemoryScope: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-memory-scope',
        'chara_memory_scopes',
        'character_memory_scope_id',
        identity,
        parseCharacterMemoryScope,
        (record) => record.characterMemoryScopeId,
      );
    },
    mutateMemoryScope: (identity, expectedMemoryRevision, mutation, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'mutate-character-memory-scope' },
        async ({ sql }) => {
          const current = await requireRecord(
            sql,
            'mutate-character-memory-scope',
            'chara_memory_scopes',
            'character_memory_scope_id',
            identity,
            parseCharacterMemoryScope,
            (record) => record.characterMemoryScopeId,
          );
          if (current.memoryRevision !== expectedMemoryRevision) {
            throw metadataError(
              'mutate-character-memory-scope',
              `CharacterMemoryScope '${identity}' changed concurrently.`,
            );
          }
          const next = parseCharacterMemoryScope(mutation(structuredClone(current)));
          if (
            next.characterMemoryScopeId !== current.characterMemoryScopeId ||
            next.characterRunId !== current.characterRunId ||
            next.characterStorylineRunId !== current.characterStorylineRunId ||
            next.createdAt !== current.createdAt ||
            next.memoryRevision !== current.memoryRevision + 1
          ) {
            throw metadataError(
              'mutate-character-memory-scope',
              `CharacterMemoryScope '${identity}' mutation must preserve authority and advance exactly one CAS step.`,
            );
          }
          const result = await sql.run(
            `UPDATE chara_memory_scopes SET memory_revision = ?, payload_json = ?
             WHERE character_memory_scope_id = ? AND memory_revision = ?`,
            [
              next.memoryRevision,
              encode(next, 'mutate-character-memory-scope'),
              identity,
              current.memoryRevision,
            ],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'mutate-character-memory-scope',
              `CharacterMemoryScope '${identity}' changed concurrently.`,
            );
          }
          return structuredClone(next);
        },
      );
    },
    readPresentationConfiguration: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-presentation-configuration',
        'chara_presentation_configurations',
        'character_run_id',
        identity,
        parseCharacterRunPresentationConfiguration,
        (record) => record.characterRunId,
      );
    },
    storePresentationConfigurations: (configurations, signal) => {
      signal?.throwIfAborted();
      const canonical = configurations.map(parseCharacterRunPresentationConfiguration);
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'store-character-presentation-configurations',
        },
        async ({ sql }) => {
          for (const configuration of canonical) {
            await sql.run(
              `INSERT INTO chara_presentation_configurations(character_run_id, payload_json)
               VALUES (?, ?)
               ON CONFLICT(character_run_id) DO UPDATE SET payload_json = excluded.payload_json`,
              [
                configuration.characterRunId,
                encode(configuration, 'store-character-presentation-configurations'),
              ],
            );
          }
        },
      );
    },
    freezePresentationTurn: (input, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'freeze-character-presentation-turn',
        },
        async ({ sql }) => {
          const configuration = parseCharacterRunPresentationConfiguration(input.configuration);
          const receipt = parseCharacterTurnPresentationReceipt({
            turnId: input.turnId,
            characterRunId: configuration.characterRunId,
            participantId: configuration.participantId,
            chat: configuration.chat,
            tts: configuration.tts,
            startedAt: input.startedAt,
          });
          await insertImmutable(
            sql,
            'freeze-character-presentation-turn',
            'chara_presentation_turn_receipts',
            'turn_id',
            receipt.turnId,
            encode(receipt, 'freeze-character-presentation-turn'),
          );
          return structuredClone(receipt);
        },
      );
    },
    readPresentationTurnReceipt: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-presentation-turn-receipt',
        'chara_presentation_turn_receipts',
        'turn_id',
        identity,
        parseCharacterTurnPresentationReceipt,
        (record) => record.turnId,
      );
    },
    create: (relationship, signal) => {
      signal?.throwIfAborted();
      const canonical = parseUserCharacterRelationship(relationship);
      return writeNew(options.metadataStore, {
        operation: 'create-character-relationship',
        tableName: 'chara_relationships',
        idColumn: 'relationship_id',
        identity: canonical.relationshipId,
        payload: encode(canonical, 'create-character-relationship'),
      });
    },
    read: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-relationship',
        'chara_relationships',
        'relationship_id',
        identity,
        parseUserCharacterRelationship,
        (record) => record.relationshipId,
      );
    },
    mutate: (identity, mutation, signal) => {
      signal?.throwIfAborted();
      return mutateRecord(
        options.metadataStore,
        'mutate-character-relationship',
        'chara_relationships',
        'relationship_id',
        identity,
        parseUserCharacterRelationship,
        (record) => record.relationshipId,
        mutation,
      );
    },
  };
  return Object.freeze(repository);
}

export function createPersistentCharacterRuntimeRepositories(options: {
  readonly metadataStore: LocalMetadataStore;
}): CharacterRuntimeRepositories {
  const repository = createPersistentCharacterRepository(options);
  return Object.freeze({
    conversationLaunch: pickRepository(repository, [
      'readPublication',
      'readRelationship',
      'readStorylineVersion',
      'readStorylineRun',
      'readMemoryScope',
      'readCharacterRun',
      'readDialogueRun',
      'readRoom',
      'readRun',
      'commitLaunch',
    ] as const),
    interaction: pickRepository(repository, [
      'readPublication',
      'readRelationship',
      'createDialogue',
      'readCharacterRun',
      'readDialogueRun',
      'readRoomRun',
      'readStorylineRun',
      'readStorylineVersion',
      'readMemoryScope',
    ] as const),
    memory: pickRepository(repository, [
      'readCharacterRun',
      'readStorylineRun',
      'createMemoryScope',
      'readMemoryScope',
      'mutateMemoryScope',
    ] as const),
    avatarAuthority: pickRepository(repository, [
      'readCharacterRun',
      'readPublication',
      'readRoomRun',
    ] as const),
    presentation: pickRepository(repository, [
      'readCharacterRun',
      'readPublication',
      'readPresentationConfiguration',
      'storePresentationConfigurations',
      'freezePresentationTurn',
      'readPresentationTurnReceipt',
    ] as const),
    room: pickRepository(repository, [
      'createRoom',
      'readRoom',
      'createRun',
      'createRunAggregate',
      'readRun',
      'mutateRun',
    ] as const),
    roomInteraction: pickRepository(repository, [
      'readRoom',
      'readPublication',
      'readRelationship',
    ] as const),
    storyline: pickRepository(repository, [
      'readCharacterVersion',
      'readCharacterRun',
      'storeStorylineVersion',
      'readStorylineVersion',
      'createStorylineRun',
      'readStorylineRun',
      'createStorylineObservationCandidate',
      'readStorylineObservationCandidate',
      'commitStorylineObservationReview',
    ] as const),
    relationship: pickRepository(repository, ['create', 'read', 'mutate'] as const),
    catalog: createCharacterRuntimeCatalogPort(options),
  });
}

function createCharacterRuntimeCatalogPort(options: {
  readonly metadataStore: LocalMetadataStore;
}): CharacterRuntimeCatalogPort {
  return Object.freeze({
    readRuntimeCatalog(signal?: AbortSignal) {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-character-runtime-catalog' },
        async ({ sql }) => {
          const diagnostics: import('@neko/chara/application').CharacterDurableRecordDiagnostic[] =
            [];
          const relationships = await readCatalogRecords(
            sql,
            'chara_relationships',
            'relationship_id',
            'relationship',
            parseUserCharacterRelationship,
            (record) => record.relationshipId,
            diagnostics,
          );
          const characterRuns = await readCatalogRecords(
            sql,
            'chara_character_runs',
            'character_run_id',
            'character-run',
            parseCharacterRun,
            (record) => record.characterRunId,
            diagnostics,
          );
          const dialogueRuns = await readCatalogRecords(
            sql,
            'chara_dialogue_runs',
            'dialogue_run_id',
            'dialogue-run',
            parseDialogueRun,
            (record) => record.dialogueRunId,
            diagnostics,
          );
          const rooms = await readCatalogRecords(
            sql,
            'chara_rooms',
            'character_room_id',
            'character-room',
            parseCharacterRoom,
            (record) => record.characterRoomId,
            diagnostics,
          );
          const roomRuns = await readCatalogRecords(
            sql,
            'chara_room_runs',
            'room_run_id',
            'room-run',
            parseRoomRun,
            (record) => record.roomRunId,
            diagnostics,
          );
          const storylineVersions = await readCatalogRecords(
            sql,
            'chara_storyline_versions',
            'character_storyline_version_id',
            'character-storyline-version',
            parseCharacterStorylineVersion,
            (record) => record.characterStorylineVersionId,
            diagnostics,
          );
          const storylineRuns = await readCatalogRecords(
            sql,
            'chara_storyline_runs',
            'character_storyline_run_id',
            'character-storyline-run',
            parseCharacterStorylineRun,
            (record) => record.characterStorylineRunId,
            diagnostics,
          );
          const storylineObservationCandidates = await readCatalogRecords(
            sql,
            'chara_storyline_observation_candidates',
            'observation_candidate_id',
            'character-storyline-observation-candidate',
            parseCharacterStorylineObservationCandidate,
            (record) => record.observationCandidateId,
            diagnostics,
          );
          const memoryScopes = await readCatalogRecords(
            sql,
            'chara_memory_scopes',
            'character_memory_scope_id',
            'character-memory-scope',
            parseCharacterMemoryScope,
            (record) => record.characterMemoryScopeId,
            diagnostics,
          );
          const presentationConfigurations = await readCatalogRecords(
            sql,
            'chara_presentation_configurations',
            'character_run_id',
            'character-presentation-configuration',
            parseCharacterRunPresentationConfiguration,
            (record) => record.characterRunId,
            diagnostics,
          );
          return {
            relationships,
            characterRuns,
            dialogueRuns,
            rooms,
            roomRuns,
            storylineVersions,
            storylineRuns,
            storylineObservationCandidates,
            memoryScopes,
            presentationConfigurations,
            diagnostics,
          };
        },
      );
    },
  });
}

function pickRepository<TSource extends object, const TKeys extends readonly (keyof TSource)[]>(
  source: TSource,
  keys: TKeys,
): Pick<TSource, TKeys[number]> {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, source[key]]))) as Pick<
    TSource,
    TKeys[number]
  >;
}

function parseLaunchAggregate(
  value: CharacterConversationLaunchAggregate,
): CharacterConversationLaunchAggregate {
  const publications = value.publications.map((publication) => parseCharacterVersion(publication));
  const publicationIds = new Set(publications.map((publication) => publication.characterVersionId));
  if (publicationIds.size !== publications.length) {
    throw metadataError(
      'commit-character-launch',
      'Character launch aggregate contains duplicate CharacterVersion identities.',
    );
  }
  const relationships = value.relationships.map((relationship) =>
    parseUserCharacterRelationship(relationship),
  );
  const storylineRuns = value.storylineRuns.map((run) => parseCharacterStorylineRun(run));
  const memoryScopes = value.memoryScopes.map((scope) => parseCharacterMemoryScope(scope));
  if (value.topology === 'dialogue') {
    const characterRun = parseCharacterRun(value.characterRun);
    const dialogueRun = parseDialogueRun(value.dialogueRun);
    if (dialogueRun.characterRunId !== characterRun.characterRunId) {
      throw metadataError(
        'commit-character-launch',
        'Character Dialogue launch aggregate has mismatched Run identities.',
      );
    }
    assertLaunchRuntimeOwnership([characterRun], storylineRuns, memoryScopes);
    assertLaunchPublications([characterRun], publicationIds);
    return {
      topology: 'dialogue',
      publications,
      relationships,
      characterRun,
      dialogueRun,
      storylineRuns,
      memoryScopes,
    };
  }
  const room = parseCharacterRoom(value.room);
  const roomRun = parseRoomRun(value.roomRun);
  const characterRuns = value.characterRuns.map((run) => parseCharacterRun(run));
  if (roomRun.characterRoomId !== room.characterRoomId) {
    throw metadataError(
      'commit-character-launch',
      'Character Room launch aggregate has mismatched Room identities.',
    );
  }
  const runIds = new Set(characterRuns.map((run) => run.characterRunId));
  const participantRunIds = roomRun.participants.flatMap((participant) =>
    participant.controller.kind === 'agent' ? [participant.controller.characterRunId] : [],
  );
  if (
    runIds.size !== characterRuns.length ||
    participantRunIds.length !== characterRuns.length ||
    participantRunIds.some((runId) => !runIds.has(runId))
  ) {
    throw metadataError(
      'commit-character-launch',
      'Character Room launch aggregate does not own exactly its participant CharacterRuns.',
    );
  }
  assertLaunchRuntimeOwnership(characterRuns, storylineRuns, memoryScopes);
  assertLaunchPublications(characterRuns, publicationIds);
  return {
    topology: 'chatroom',
    publications,
    relationships,
    room,
    characterRuns,
    roomRun,
    storylineRuns,
    memoryScopes,
  };
}

function assertLaunchPublications(
  characterRuns: readonly import('@neko/chara/contracts').CharacterRun[],
  publicationIds: ReadonlySet<string>,
): void {
  if (
    publicationIds.size !== characterRuns.length ||
    characterRuns.some((run) => !publicationIds.has(run.characterVersionId))
  ) {
    throw metadataError(
      'commit-character-launch',
      'Character launch publications do not exactly match CharacterRun authorities.',
    );
  }
}

function assertLaunchRuntimeOwnership(
  characterRuns: readonly ReturnType<typeof parseCharacterRun>[],
  storylineRuns: readonly ReturnType<typeof parseCharacterStorylineRun>[],
  memoryScopes: readonly ReturnType<typeof parseCharacterMemoryScope>[],
): void {
  const storylineById = new Map(
    storylineRuns.map((run) => [run.characterStorylineRunId, run] as const),
  );
  const memoryById = new Map(
    memoryScopes.map((scope) => [scope.characterMemoryScopeId, scope] as const),
  );
  if (storylineById.size !== storylineRuns.length || memoryById.size !== memoryScopes.length) {
    throw metadataError(
      'commit-character-launch',
      'Character launch runtime records contain duplicate identities.',
    );
  }
  for (const characterRun of characterRuns) {
    const memoryScope = characterRun.characterMemoryScopeId
      ? memoryById.get(characterRun.characterMemoryScopeId)
      : undefined;
    if (!memoryScope || memoryScope.characterRunId !== characterRun.characterRunId) {
      throw metadataError(
        'commit-character-launch',
        `CharacterRun '${characterRun.characterRunId}' does not own one exact launch MemoryScope.`,
      );
    }
    if (characterRun.characterStorylineRunId === undefined) {
      if (memoryScope.characterStorylineRunId !== undefined) {
        throw metadataError(
          'commit-character-launch',
          `CharacterRun '${characterRun.characterRunId}' MemoryScope binds an unexpected StorylineRun.`,
        );
      }
      continue;
    }
    const storylineRun = storylineById.get(characterRun.characterStorylineRunId);
    if (
      !storylineRun ||
      storylineRun.characterRunId !== characterRun.characterRunId ||
      memoryScope.characterStorylineRunId !== storylineRun.characterStorylineRunId
    ) {
      throw metadataError(
        'commit-character-launch',
        `CharacterRun '${characterRun.characterRunId}' launch StorylineRun binding is invalid.`,
      );
    }
  }
  if (
    memoryScopes.length !== characterRuns.length ||
    storylineRuns.some(
      (storylineRun) =>
        !characterRuns.some(
          (characterRun) =>
            characterRun.characterStorylineRunId === storylineRun.characterStorylineRunId,
        ),
    )
  ) {
    throw metadataError(
      'commit-character-launch',
      'Character launch contains unowned runtime records.',
    );
  }
}

async function insertLaunchRuntimeRecords(
  sql: LocalMetadataSqlExecutor,
  aggregate: CharacterConversationLaunchAggregate,
): Promise<void> {
  for (const storylineRun of aggregate.storylineRuns) {
    await insertNew(
      sql,
      'commit-character-launch',
      'chara_storyline_runs',
      'character_storyline_run_id',
      storylineRun.characterStorylineRunId,
      encode(storylineRun, 'commit-character-launch'),
      ['storyline_revision'],
      [storylineRun.storylineRevision],
    );
  }
  for (const memoryScope of aggregate.memoryScopes) {
    await insertNew(
      sql,
      'commit-character-launch',
      'chara_memory_scopes',
      'character_memory_scope_id',
      memoryScope.characterMemoryScopeId,
      encode(memoryScope, 'commit-character-launch'),
      ['memory_revision'],
      [memoryScope.memoryRevision],
    );
  }
}

async function readCatalogRecords<T>(
  sql: LocalMetadataSqlExecutor,
  tableName: string,
  idColumn: string,
  recordKind: import('@neko/chara/application').CharacterDurableRecordDiagnostic['recordKind'],
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
  diagnostics: import('@neko/chara/application').CharacterDurableRecordDiagnostic[],
): Promise<T[]> {
  const rows = await sql.all(
    `SELECT ${idColumn}, payload_json FROM ${tableName} ORDER BY ${idColumn}`,
  );
  const records: T[] = [];
  for (const row of rows) {
    const recordId = diagnosticText(row[idColumn]);
    try {
      const record = parse(JSON.parse(readText(row, 'payload_json')));
      if (readIdentity(record) !== recordId)
        throw new Error('Row identity does not match its payload.');
      records.push(structuredClone(record));
    } catch (error) {
      diagnostics.push({
        recordKind,
        recordId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return records;
}

function diagnosticText(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : '<invalid-identity>';
}

function table(tableName: string, idColumn: string): string {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
    ${idColumn} TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL
  ) STRICT`;
}

async function writeNew(
  store: LocalMetadataStore,
  input: {
    readonly operation: string;
    readonly tableName: string;
    readonly idColumn: string;
    readonly identity: string;
    readonly payload: string;
  },
): Promise<void> {
  await store.transaction(
    { mode: 'state-write', ownership: 'state', operation: input.operation },
    ({ sql }) =>
      insertNew(
        sql,
        input.operation,
        input.tableName,
        input.idColumn,
        input.identity,
        input.payload,
      ),
  );
}

async function mutateRecord<T>(
  store: LocalMetadataStore,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
  mutation: (current: T) => T,
): Promise<T> {
  return store.transaction(
    { mode: 'state-write', ownership: 'state', operation },
    async ({ sql }) => {
      const current = await requireRecord(
        sql,
        operation,
        tableName,
        idColumn,
        identity,
        parse,
        readIdentity,
      );
      const next = parse(mutation(structuredClone(current)));
      if (readIdentity(next) !== identity) {
        throw metadataError(operation, `Record '${identity}' mutation changed its identity.`);
      }
      const result = await sql.run(
        `UPDATE ${tableName} SET payload_json = ? WHERE ${idColumn} = ?`,
        [encode(next, operation), identity],
      );
      if (result.changes !== 1) throw metadataError(operation, `Record '${identity}' is missing.`);
      return structuredClone(next);
    },
  );
}

async function insertNew(
  sql: LocalMetadataSqlExecutor,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  payload: string,
  extraColumns: readonly string[] = [],
  extraValues: readonly (string | number)[] = [],
): Promise<void> {
  const columns = [idColumn, ...extraColumns, 'payload_json'];
  const result = await sql.run(
    `INSERT INTO ${tableName}(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(${idColumn}) DO NOTHING`,
    [identity, ...extraValues, payload],
  );
  if (result.changes !== 1) {
    throw metadataError(operation, `Record '${identity}' already exists.`);
  }
}

async function insertImmutable(
  sql: LocalMetadataSqlExecutor,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  payload: string,
  extraColumns: readonly string[] = [],
  extraValues: readonly string[] = [],
): Promise<void> {
  const columns = [idColumn, ...extraColumns, 'payload_json'];
  await sql.run(
    `INSERT INTO ${tableName}(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(${idColumn}) DO NOTHING`,
    [identity, ...extraValues, payload],
  );
  const rows = await sql.all(`SELECT payload_json FROM ${tableName} WHERE ${idColumn} = ?`, [
    identity,
  ]);
  if (rows.length !== 1 || readText(rows[0]!, 'payload_json') !== payload) {
    throw metadataError(
      operation,
      `Immutable record '${identity}' already exists with other content.`,
    );
  }
}

async function requireRecord<T>(
  sql: LocalMetadataSqlExecutor,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
): Promise<T> {
  const record = await readRecord(
    sql,
    operation,
    tableName,
    idColumn,
    identity,
    parse,
    readIdentity,
  );
  if (!record) throw metadataError(operation, `Record '${identity}' is not present.`);
  return record;
}

async function readRecord<T>(
  sql: LocalMetadataSqlExecutor,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
): Promise<T | undefined> {
  const rows = await sql.all(
    `SELECT ${idColumn}, payload_json FROM ${tableName} WHERE ${idColumn} = ?`,
    [requireIdentity(identity, operation)],
  );
  if (rows.length > 1) throw metadataError(operation, `Record '${identity}' is not unique.`);
  if (rows.length === 0) return undefined;
  try {
    const canonical = parse(JSON.parse(readText(rows[0]!, 'payload_json')));
    if (readIdentity(canonical) !== readText(rows[0]!, idColumn)) {
      throw new Error(`Record '${identity}' row identity does not match its payload.`);
    }
    return structuredClone(canonical);
  } catch (error) {
    if (error instanceof LocalMetadataError) throw error;
    throw metadataError(operation, error instanceof Error ? error.message : String(error), error);
  }
}

function encode(value: unknown, operation: string): string {
  return serializeLocalMetadataJson(value, operation);
}

function readText(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string' || value.length === 0) {
    throw metadataError('decode-character-record', `Character column '${column}' is invalid.`);
  }
  return value;
}

function requireIdentity(value: string, operation: string): string {
  if (value.trim().length === 0) throw metadataError(operation, 'Character identity is required.');
  return value;
}

function metadataError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
