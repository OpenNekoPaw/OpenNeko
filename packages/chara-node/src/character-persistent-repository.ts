import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterCompanionContinuity,
  parseCharacterNarrativeTurnReceipt,
  parseCharacterRunPresentationConfiguration,
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
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
  CharacterPublicationReader,
  CharacterConversationLaunchAggregate,
  CharacterConversationLaunchRepository,
  CharacterDurableCatalogPort,
  CharacterRuntimeCatalogPort,
  CharacterInteractionRepository,
  CharacterCompanionContinuityRepository,
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
    CharacterCompanionContinuityRepository,
    CharacterPresentationRepository,
    CharacterRoomRepository,
    CharacterStorylineRepository,
    UserCharacterRelationshipRepository,
    CharacterDurableCatalogPort {}

export interface CharacterRuntimeRepositories {
  readonly conversationLaunch: CharacterConversationLaunchRepository;
  readonly interaction: CharacterInteractionRepository;
  readonly companionContinuity: CharacterCompanionContinuityRepository;
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
      table('chara_storylines', 'character_storyline_id'),
      table('chara_storyline_drafts', 'character_storyline_id'),
      table('chara_storyline_versions', 'character_storyline_version_id'),
      `CREATE TABLE IF NOT EXISTS chara_storyline_runs (
        character_storyline_run_id TEXT PRIMARY KEY,
        storyline_revision INTEGER NOT NULL CHECK (storyline_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_storyline_observation_candidates', 'observation_candidate_id'),
      `CREATE TABLE IF NOT EXISTS chara_companion_continuities (
        companion_continuity_id TEXT PRIMARY KEY,
        continuity_revision INTEGER NOT NULL CHECK (continuity_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS chara_memory_scopes (
        character_memory_scope_id TEXT PRIMARY KEY,
        memory_revision INTEGER NOT NULL CHECK (memory_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_presentation_configurations', 'character_run_id'),
      table('chara_presentation_turn_receipts', 'turn_id'),
      table('chara_narrative_turn_receipts', 'turn_id'),
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
      table('chara_storylines', 'character_storyline_id'),
      table('chara_storyline_drafts', 'character_storyline_id'),
      table('chara_storyline_versions', 'character_storyline_version_id'),
      `CREATE TABLE IF NOT EXISTS chara_storyline_runs (
        character_storyline_run_id TEXT PRIMARY KEY,
        storyline_revision INTEGER NOT NULL CHECK (storyline_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_storyline_observation_candidates', 'observation_candidate_id'),
      `CREATE TABLE IF NOT EXISTS chara_companion_continuities (
        companion_continuity_id TEXT PRIMARY KEY,
        continuity_revision INTEGER NOT NULL CHECK (continuity_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS chara_memory_scopes (
        character_memory_scope_id TEXT PRIMARY KEY,
        memory_revision INTEGER NOT NULL CHECK (memory_revision >= 0),
        payload_json TEXT NOT NULL
      ) STRICT`,
      table('chara_presentation_configurations', 'character_run_id'),
      table('chara_presentation_turn_receipts', 'turn_id'),
      table('chara_narrative_turn_receipts', 'turn_id'),
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
          const storylines = await readCatalogRecords(
            sql,
            'chara_storylines',
            'character_storyline_id',
            'character-storyline',
            parseCharacterStoryline,
            (record) => record.characterStorylineId,
            diagnostics,
          );
          const storylineDrafts = await readCatalogRecords(
            sql,
            'chara_storyline_drafts',
            'character_storyline_id',
            'character-storyline-draft',
            parseCharacterStorylineDraft,
            (record) => record.characterStorylineId,
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
          await readCatalogRecords(
            sql,
            'chara_storyline_runs',
            'character_storyline_run_id',
            'character-storyline-run',
            parseObsoleteStorylineRuntimeRecord,
            () => '',
            diagnostics,
          );
          await readCatalogRecords(
            sql,
            'chara_storyline_observation_candidates',
            'observation_candidate_id',
            'character-storyline-observation-candidate',
            parseObsoleteStorylineRuntimeRecord,
            () => '',
            diagnostics,
          );
          const companionContinuities = await readCatalogRecords(
            sql,
            'chara_companion_continuities',
            'companion_continuity_id',
            'character-companion-continuity',
            parseCharacterCompanionContinuity,
            (record) => record.companionContinuityId,
            diagnostics,
          );
          await readCatalogRecords(
            sql,
            'chara_memory_scopes',
            'character_memory_scope_id',
            'character-memory-scope',
            parseObsoleteCompanionMemoryRecord,
            () => '',
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
            storylines,
            storylineDrafts,
            storylineVersions,
            companionContinuities,
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
    readCharacterProject: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-project-for-storyline',
        'chara_projects',
        'character_project_id',
        identity,
        parseCharacterProject,
        (record) => record.characterProjectId,
      );
    },
    createStoryline: (storyline, draft, signal) => {
      signal?.throwIfAborted();
      const canonicalStoryline = parseCharacterStoryline(storyline);
      const canonicalDraft = parseCharacterStorylineDraft(draft);
      if (canonicalDraft.characterStorylineId !== canonicalStoryline.characterStorylineId) {
        throw metadataError(
          'create-character-storyline',
          'CharacterStoryline and Draft identities must match.',
        );
      }
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-character-storyline' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-character-storyline',
            'chara_storylines',
            'character_storyline_id',
            canonicalStoryline.characterStorylineId,
            encode(canonicalStoryline, 'create-character-storyline'),
          );
          await insertNew(
            sql,
            'create-character-storyline',
            'chara_storyline_drafts',
            'character_storyline_id',
            canonicalDraft.characterStorylineId,
            encode(canonicalDraft, 'create-character-storyline'),
          );
        },
      );
    },
    updateStoryline: (storyline, draft, signal) => {
      signal?.throwIfAborted();
      const canonicalStoryline = parseCharacterStoryline(storyline);
      const canonicalDraft = parseCharacterStorylineDraft(draft);
      if (canonicalDraft.characterStorylineId !== canonicalStoryline.characterStorylineId) {
        throw metadataError(
          'update-character-storyline',
          'CharacterStoryline and Draft identities must match.',
        );
      }
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'update-character-storyline' },
        async ({ sql }) => {
          await requireRecord(
            sql,
            'update-character-storyline',
            'chara_storylines',
            'character_storyline_id',
            canonicalStoryline.characterStorylineId,
            parseCharacterStoryline,
            (record) => record.characterStorylineId,
          );
          const storylineResult = await sql.run(
            `UPDATE chara_storylines SET payload_json = ? WHERE character_storyline_id = ?`,
            [
              encode(canonicalStoryline, 'update-character-storyline'),
              canonicalStoryline.characterStorylineId,
            ],
          );
          const draftResult = await sql.run(
            `UPDATE chara_storyline_drafts SET payload_json = ? WHERE character_storyline_id = ?`,
            [
              encode(canonicalDraft, 'update-character-storyline'),
              canonicalDraft.characterStorylineId,
            ],
          );
          if (storylineResult.changes !== 1 || draftResult.changes !== 1) {
            throw metadataError(
              'update-character-storyline',
              `CharacterStoryline '${canonicalStoryline.characterStorylineId}' is incomplete.`,
            );
          }
        },
      );
    },
    readStoryline: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-storyline',
        'chara_storylines',
        'character_storyline_id',
        identity,
        parseCharacterStoryline,
        (record) => record.characterStorylineId,
      );
    },
    readStorylineDraft: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-storyline-draft',
        'chara_storyline_drafts',
        'character_storyline_id',
        identity,
        parseCharacterStorylineDraft,
        (record) => record.characterStorylineId,
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
    listStorylines: (characterProjectId, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'list-character-storylines' },
        async ({ sql }) => {
          const diagnostics: import('@neko/chara/application').CharacterDurableRecordDiagnostic[] =
            [];
          const records = await readCatalogRecords(
            sql,
            'chara_storylines',
            'character_storyline_id',
            'character-storyline',
            parseCharacterStoryline,
            (record) => record.characterStorylineId,
            diagnostics,
          );
          return records.filter((record) => record.characterProjectId === characterProjectId);
        },
      );
    },
    listStorylineVersions: (characterStorylineId, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'list-character-storyline-versions' },
        async ({ sql }) => {
          const diagnostics: import('@neko/chara/application').CharacterDurableRecordDiagnostic[] =
            [];
          const records = await readCatalogRecords(
            sql,
            'chara_storyline_versions',
            'character_storyline_version_id',
            'character-storyline-version',
            parseCharacterStorylineVersion,
            (record) => record.characterStorylineVersionId,
            diagnostics,
          );
          return records.filter((record) => record.characterStorylineId === characterStorylineId);
        },
      );
    },
    deleteStoryline: (characterStorylineId, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'delete-character-storyline' },
        async ({ sql }) => {
          await requireRecord(
            sql,
            'delete-character-storyline',
            'chara_storylines',
            'character_storyline_id',
            characterStorylineId,
            parseCharacterStoryline,
            (record) => record.characterStorylineId,
          );
          await sql.run(
            `DELETE FROM chara_storyline_versions
             WHERE json_extract(payload_json, '$.characterStorylineId') = ?`,
            [characterStorylineId],
          );
          await sql.run(`DELETE FROM chara_storyline_drafts WHERE character_storyline_id = ?`, [
            characterStorylineId,
          ]);
          const result = await sql.run(
            `DELETE FROM chara_storylines WHERE character_storyline_id = ?`,
            [characterStorylineId],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'delete-character-storyline',
              `CharacterStoryline '${characterStorylineId}' is missing.`,
            );
          }
        },
      );
    },
    createCompanionContinuity: (continuity, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterCompanionContinuity(continuity);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-companion-continuity' },
        async ({ sql }) => {
          await insertNew(
            sql,
            'create-companion-continuity',
            'chara_companion_continuities',
            'companion_continuity_id',
            canonical.companionContinuityId,
            encode(canonical, 'create-companion-continuity'),
            ['continuity_revision'],
            [canonical.continuityRevision],
          );
        },
      );
    },
    readCompanionContinuity: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-companion-continuity',
        'chara_companion_continuities',
        'companion_continuity_id',
        identity,
        parseCharacterCompanionContinuity,
        (record) => record.companionContinuityId,
      );
    },
    readCompanionContinuityByOwner: (userId, characterProjectId, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-companion-continuity-owner' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT payload_json FROM chara_companion_continuities
             WHERE json_extract(payload_json, '$.userId') = ?
               AND json_extract(payload_json, '$.characterProjectId') = ?`,
            [userId, characterProjectId],
          );
          if (rows.length > 1) {
            throw metadataError(
              'read-companion-continuity-owner',
              `Multiple Companion continuities bind user '${userId}' and CharacterProject '${characterProjectId}'.`,
            );
          }
          const row = rows[0];
          if (row === undefined) return undefined;
          try {
            return structuredClone(
              parseCharacterCompanionContinuity(JSON.parse(readText(row, 'payload_json'))),
            );
          } catch (error) {
            throw metadataError(
              'read-companion-continuity-owner',
              error instanceof Error ? error.message : String(error),
              error,
            );
          }
        },
      );
    },
    mutateCompanionContinuity: (identity, expectedContinuityRevision, mutation, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'mutate-companion-continuity' },
        async ({ sql }) => {
          const current = await requireRecord(
            sql,
            'mutate-companion-continuity',
            'chara_companion_continuities',
            'companion_continuity_id',
            identity,
            parseCharacterCompanionContinuity,
            (record) => record.companionContinuityId,
          );
          if (current.continuityRevision !== expectedContinuityRevision) {
            throw metadataError(
              'mutate-companion-continuity',
              `CharacterCompanionContinuity '${identity}' changed concurrently.`,
            );
          }
          const next = parseCharacterCompanionContinuity(mutation(structuredClone(current)));
          if (
            next.companionContinuityId !== current.companionContinuityId ||
            next.userId !== current.userId ||
            next.characterProjectId !== current.characterProjectId ||
            next.createdAt !== current.createdAt ||
            next.continuityRevision !== current.continuityRevision + 1
          ) {
            throw metadataError(
              'mutate-companion-continuity',
              `CharacterCompanionContinuity '${identity}' mutation must preserve authority and advance exactly one CAS step.`,
            );
          }
          const result = await sql.run(
            `UPDATE chara_companion_continuities SET continuity_revision = ?, payload_json = ?
             WHERE companion_continuity_id = ? AND continuity_revision = ?`,
            [
              next.continuityRevision,
              encode(next, 'mutate-companion-continuity'),
              identity,
              current.continuityRevision,
            ],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'mutate-companion-continuity',
              `CharacterCompanionContinuity '${identity}' changed concurrently.`,
            );
          }
          return structuredClone(next);
        },
      );
    },
    freezeNarrativeTurnReceipt: (receipt, signal) => {
      signal?.throwIfAborted();
      const canonical = parseCharacterNarrativeTurnReceipt(receipt);
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'freeze-character-narrative-turn-receipt',
        },
        async ({ sql }) => {
          await insertImmutable(
            sql,
            'freeze-character-narrative-turn-receipt',
            'chara_narrative_turn_receipts',
            'turn_id',
            canonical.turnId,
            encode(canonical, 'freeze-character-narrative-turn-receipt'),
          );
        },
      );
    },
    readNarrativeTurnReceipt: (identity, signal) => {
      signal?.throwIfAborted();
      return read(
        'read-character-narrative-turn-receipt',
        'chara_narrative_turn_receipts',
        'turn_id',
        identity,
        parseCharacterNarrativeTurnReceipt,
        (record) => record.turnId,
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
    readByOwner: (userId, characterProjectId, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-character-relationship-owner' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT payload_json FROM chara_relationships
             WHERE json_extract(payload_json, '$.userId') = ?
               AND json_extract(payload_json, '$.characterProjectId') = ?`,
            [userId, characterProjectId],
          );
          if (rows.length > 1) {
            throw metadataError(
              'read-character-relationship-owner',
              `Multiple relationships bind user '${userId}' and CharacterProject '${characterProjectId}'.`,
            );
          }
          const row = rows[0];
          return row === undefined
            ? undefined
            : parseUserCharacterRelationship(JSON.parse(readText(row, 'payload_json')));
        },
      );
    },
    mutate: (identity, expectedRelationshipRevision, mutation, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'mutate-character-relationship' },
        async ({ sql }) => {
          const current = await requireRecord(
            sql,
            'mutate-character-relationship',
            'chara_relationships',
            'relationship_id',
            identity,
            parseUserCharacterRelationship,
            (record) => record.relationshipId,
          );
          if (current.relationshipRevision !== expectedRelationshipRevision) {
            throw metadataError(
              'mutate-character-relationship',
              `UserCharacterRelationship '${identity}' changed concurrently.`,
            );
          }
          const next = parseUserCharacterRelationship(mutation(structuredClone(current)));
          if (
            next.relationshipId !== current.relationshipId ||
            next.userId !== current.userId ||
            next.characterProjectId !== current.characterProjectId ||
            next.createdAt !== current.createdAt ||
            next.relationshipRevision !== current.relationshipRevision + 1
          ) {
            throw metadataError(
              'mutate-character-relationship',
              `UserCharacterRelationship '${identity}' mutation must preserve authority and advance exactly one CAS step.`,
            );
          }
          const result = await sql.run(
            `UPDATE chara_relationships SET payload_json = ?
             WHERE relationship_id = ?
               AND json_extract(payload_json, '$.relationshipRevision') = ?`,
            [encode(next, 'mutate-character-relationship'), identity, current.relationshipRevision],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'mutate-character-relationship',
              `UserCharacterRelationship '${identity}' changed concurrently.`,
            );
          }
          return structuredClone(next);
        },
      );
    },
  };
  return Object.freeze(repository);
}

export function createPersistentCharacterRuntimeRepositories(options: {
  readonly metadataStore: LocalMetadataStore;
  readonly authoring?: Pick<CharacterAuthoringRepository, 'readProject'> &
    Pick<CharacterPublicationReader, 'readPublication'>;
}): CharacterRuntimeRepositories {
  const repository = createPersistentCharacterRepository(options);
  const storylinePersistence = pickRepository(repository, [
    'createStoryline',
    'updateStoryline',
    'readStoryline',
    'readStorylineDraft',
    'storeStorylineVersion',
    'readStorylineVersion',
    'listStorylines',
    'listStorylineVersions',
    'deleteStoryline',
  ] as const);
  return Object.freeze({
    conversationLaunch: pickRepository(repository, [
      'readPublication',
      'readRelationship',
      'readStorylineVersion',
      'readCompanionContinuity',
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
      'readStorylineVersion',
      'readCompanionContinuity',
      'freezeNarrativeTurnReceipt',
      'readNarrativeTurnReceipt',
    ] as const),
    companionContinuity: pickRepository(repository, [
      'createCompanionContinuity',
      'readCompanionContinuity',
      'readCompanionContinuityByOwner',
      'mutateCompanionContinuity',
      'readPublication',
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
      'readCompanionContinuity',
    ] as const),
    storyline: Object.freeze({
      ...storylinePersistence,
      readCharacterProject: (characterProjectId: string, signal?: AbortSignal) =>
        options.authoring?.readProject(characterProjectId, signal) ??
        repository.readCharacterProject(characterProjectId, signal),
      readCharacterVersion: (characterVersionId: string, signal?: AbortSignal) =>
        options.authoring?.readPublication(characterVersionId, signal) ??
        repository.readCharacterVersion(characterVersionId, signal),
    }),
    relationship: pickRepository(repository, [
      'create',
      'read',
      'readByOwner',
      'readPublication',
      'mutate',
    ] as const),
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
          await readCatalogRecords(
            sql,
            'chara_storyline_runs',
            'character_storyline_run_id',
            'character-storyline-run',
            parseObsoleteStorylineRuntimeRecord,
            () => '',
            diagnostics,
          );
          await readCatalogRecords(
            sql,
            'chara_storyline_observation_candidates',
            'observation_candidate_id',
            'character-storyline-observation-candidate',
            parseObsoleteStorylineRuntimeRecord,
            () => '',
            diagnostics,
          );
          const companionContinuities = await readCatalogRecords(
            sql,
            'chara_companion_continuities',
            'companion_continuity_id',
            'character-companion-continuity',
            parseCharacterCompanionContinuity,
            (record) => record.companionContinuityId,
            diagnostics,
          );
          await readCatalogRecords(
            sql,
            'chara_memory_scopes',
            'character_memory_scope_id',
            'character-memory-scope',
            parseObsoleteCompanionMemoryRecord,
            () => '',
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
            storylines: await readCatalogRecords(
              sql,
              'chara_storylines',
              'character_storyline_id',
              'character-storyline',
              parseCharacterStoryline,
              (record) => record.characterStorylineId,
              diagnostics,
            ),
            storylineDrafts: await readCatalogRecords(
              sql,
              'chara_storyline_drafts',
              'character_storyline_id',
              'character-storyline-draft',
              parseCharacterStorylineDraft,
              (record) => record.characterStorylineId,
              diagnostics,
            ),
            storylineVersions: await readCatalogRecords(
              sql,
              'chara_storyline_versions',
              'character_storyline_version_id',
              'character-storyline-version',
              parseCharacterStorylineVersion,
              (record) => record.characterStorylineVersionId,
              diagnostics,
            ),
            companionContinuities,
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
  const companionContinuities = value.companionContinuities.map((continuity) =>
    parseCharacterCompanionContinuity(continuity),
  );
  if (value.topology === 'dialogue') {
    const characterRun = parseCharacterRun(value.characterRun);
    const dialogueRun = parseDialogueRun(value.dialogueRun);
    if (dialogueRun.characterRunId !== characterRun.characterRunId) {
      throw metadataError(
        'commit-character-launch',
        'Character Dialogue launch aggregate has mismatched Run identities.',
      );
    }
    assertLaunchRuntimeOwnership([characterRun], relationships, companionContinuities);
    assertLaunchPublications([characterRun], publicationIds);
    return {
      topology: 'dialogue',
      publications,
      relationships,
      companionContinuities,
      characterRun,
      dialogueRun,
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
  assertLaunchRuntimeOwnership(characterRuns, relationships, companionContinuities);
  assertLaunchPublications(characterRuns, publicationIds);
  return {
    topology: 'chatroom',
    publications,
    relationships,
    companionContinuities,
    room,
    characterRuns,
    roomRun,
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
  relationships: readonly ReturnType<typeof parseUserCharacterRelationship>[],
  companionContinuities: readonly ReturnType<typeof parseCharacterCompanionContinuity>[],
): void {
  const continuityIds = new Set(
    companionContinuities.map((continuity) => continuity.companionContinuityId),
  );
  const relationshipIds = new Set(relationships.map((relationship) => relationship.relationshipId));
  if (
    continuityIds.size !== companionContinuities.length ||
    relationshipIds.size !== relationships.length
  ) {
    throw metadataError(
      'commit-character-launch',
      'Character launch Companion authority records contain duplicate identities.',
    );
  }
  const companionRuns = characterRuns.filter((run) => run.runtimeBinding.kind === 'companion');
  if (
    companionContinuities.some(
      (continuity) =>
        !companionRuns.some(
          (run) =>
            run.runtimeBinding.kind === 'companion' &&
            run.runtimeBinding.companionContinuityId === continuity.companionContinuityId,
        ),
    ) ||
    relationships.some(
      (relationship) =>
        !companionRuns.some(
          (run) =>
            run.runtimeBinding.kind === 'companion' &&
            run.runtimeBinding.relationshipId === relationship.relationshipId,
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
  for (const continuity of aggregate.companionContinuities) {
    await insertNew(
      sql,
      'commit-character-launch',
      'chara_companion_continuities',
      'companion_continuity_id',
      continuity.companionContinuityId,
      encode(continuity, 'commit-character-launch'),
      ['continuity_revision'],
      [continuity.continuityRevision],
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

function parseObsoleteStorylineRuntimeRecord(_value: unknown): never {
  throw new Error(
    'Obsolete Storyline runtime record is preserved for explicit inspection/export/cleanup only.',
  );
}

function parseObsoleteCompanionMemoryRecord(_value: unknown): never {
  throw new Error(
    'Obsolete CharacterRun-owned memory record is preserved for explicit inspection/export/cleanup only.',
  );
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
