import {
  parseCharacterConversationLaunchCatalog,
  type CharacterConversationLaunchCatalog,
} from './character-conversation-launch';
import {
  parseCharacterProject,
  parseCharacterDefinition,
  parseCharacterRun,
  parseCharacterVersion,
  parseUserCharacterRelationship,
  type CharacterProject,
  type CharacterDefinition,
  type CharacterRun,
  type CharacterVersion,
  type UserCharacterRelationship,
} from './character';
import {
  parseCharacterMemoryCandidate,
  parseCharacterMemoryScope,
  parseCharacterStorylineObservationCandidate,
  parseCharacterStorylineRun,
  parseCharacterStorylineVersion,
  type CharacterMemoryScope,
  type CharacterStorylineObservationCandidate,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
} from './character-lore-storyline-memory';
import {
  parseCharacterRunPresentationConfiguration,
  type CharacterRunPresentationConfiguration,
} from './character-presentation';
import {
  parseCharacterRoom,
  parseCreateCharacterRoomRunInput,
  parseDialogueRun,
  parseRoomRun,
  type CharacterRoom,
  type DialogueRun,
  type CreateCharacterRoomRunInput,
  type RoomRun,
} from './room';
export const CHARACTER_FOUNDATION_HOST_CHANNEL = 'neko:character:foundation' as const;

export type CharacterFoundationHostRequest =
  | { readonly requestId: string; readonly operation: 'snapshot-get' }
  | { readonly requestId: string; readonly operation: 'conversation-launch-catalog-get' };

type CharacterFoundationDialogueController =
  { readonly kind: 'agent' } | { readonly kind: 'human'; readonly userId: string };

type CharacterFoundationDialogueCreateBase = {
  readonly dialogueRunId: string;
  readonly characterRunId: string;
  readonly characterVersionId: string;
  readonly userParticipantId: string;
  readonly characterParticipantId: string;
  readonly controller: CharacterFoundationDialogueController;
};

export type CharacterFoundationDialogueCreateInput = CharacterFoundationDialogueCreateBase & {
  readonly runtimeKind: 'companion';
  readonly relationshipId: string;
};

export type CharacterFoundationCommand =
  | {
      readonly operation: 'character-project-create';
      readonly input: {
        readonly characterProjectId: string;
        readonly displayName: string;
        readonly draft: CharacterDefinition;
      };
    }
  | {
      readonly operation: 'character-project-update-draft';
      readonly input: { readonly characterProjectId: string; readonly draft: CharacterDefinition };
    }
  | {
      readonly operation: 'character-project-set-review';
      readonly input: {
        readonly characterProjectId: string;
        readonly reviewStatus: 'draft' | 'ready' | 'blocked';
      };
    }
  | {
      readonly operation: 'character-version-publish';
      readonly input: {
        readonly characterProjectId: string;
        readonly characterVersionId: string;
        readonly label: string;
      };
    }
  | {
      readonly operation: 'relationship-create';
      readonly input: {
        readonly relationshipId: string;
        readonly userId: string;
        readonly characterVersionId: string;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-propose';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly content: string;
        readonly sourceRef: string;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-accept';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly memoryId: string;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-reject';
      readonly input: { readonly relationshipId: string; readonly candidateId: string };
    }
  | {
      readonly operation: 'relationship-memory-correct';
      readonly input: {
        readonly relationshipId: string;
        readonly memoryId: string;
        readonly content: string;
      };
    }
  | {
      readonly operation: 'relationship-memory-delete';
      readonly input: { readonly relationshipId: string; readonly memoryId: string };
    }
  | {
      readonly operation: 'dialogue-create';
      readonly input: CharacterFoundationDialogueCreateInput;
    }
  | { readonly operation: 'character-room-create'; readonly input: CharacterRoom }
  | { readonly operation: 'room-run-create'; readonly input: CreateCharacterRoomRunInput }
  | {
      readonly operation: 'character-presentation-configure';
      readonly input: CharacterRunPresentationConfiguration;
    }
  | {
      readonly operation: 'character-storyline-publish';
      readonly input: Omit<CharacterStorylineVersion, 'publishedAt'>;
    }
  | {
      readonly operation: 'character-storyline-run-create';
      readonly input: {
        readonly characterStorylineRunId: string;
        readonly characterStorylineVersionId: string;
        readonly characterRunId: string;
        readonly initialStageId: string;
      };
    }
  | {
      readonly operation: 'character-storyline-observation-propose';
      readonly input: Omit<
        CharacterStorylineObservationCandidate,
        'status' | 'reviewedAt' | 'acceptedTransitionId'
      >;
    }
  | {
      readonly operation: 'character-storyline-observation-accept';
      readonly input: {
        readonly observationCandidateId: string;
        readonly characterStorylineRunId: string;
        readonly transitionId: string;
        readonly expectedStorylineRevision: number;
      };
    }
  | {
      readonly operation: 'character-storyline-observation-reject';
      readonly input: {
        readonly observationCandidateId: string;
        readonly characterStorylineRunId: string;
        readonly expectedStorylineRevision: number;
      };
    }
  | {
      readonly operation: 'character-memory-scope-create';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterRunId: string;
        readonly characterStorylineRunId?: string;
      };
    }
  | {
      readonly operation: 'character-memory-candidate-propose';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterMemoryCandidateId: string;
        readonly content: string;
        readonly sourceRef: string;
        readonly observerParticipantId?: string;
        readonly observedAt: string;
        readonly sensitivityTraits: readonly string[];
        readonly retentionTraits: readonly string[];
        readonly expectedMemoryRevision: number;
      };
    }
  | {
      readonly operation: 'character-memory-candidate-accept';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterMemoryCandidateId: string;
        readonly characterMemoryEntryId: string;
        readonly expectedMemoryRevision: number;
      };
    }
  | {
      readonly operation: 'character-memory-candidate-reject';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterMemoryCandidateId: string;
        readonly expectedMemoryRevision: number;
      };
    }
  | {
      readonly operation: 'character-memory-candidate-correct';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterMemoryCandidateId: string;
        readonly correctedMemoryEntryId: string;
        readonly replacementMemoryEntryId: string;
        readonly expectedMemoryRevision: number;
      };
    }
  | {
      readonly operation: 'character-memory-entry-delete';
      readonly input: {
        readonly characterMemoryScopeId: string;
        readonly characterMemoryEntryId: string;
        readonly expectedMemoryRevision: number;
      };
    };

export type CharacterFoundationCommandHostRequest = CharacterFoundationCommand & {
  readonly requestId: string;
};

export type CharacterFoundationAnyHostRequest =
  CharacterFoundationHostRequest | CharacterFoundationCommandHostRequest;

export interface CharacterFoundationDiagnostic {
  readonly owner: 'character';
  readonly recordKind: string;
  readonly recordId: string;
  readonly message: string;
}

export interface CharacterFoundationSnapshot {
  readonly character: {
    readonly projects: readonly CharacterProject[];
    readonly versions: readonly CharacterVersion[];
    readonly relationships: readonly UserCharacterRelationship[];
    readonly characterRuns: readonly CharacterRun[];
    readonly dialogueRuns: readonly DialogueRun[];
    readonly rooms: readonly CharacterRoom[];
    readonly roomRuns: readonly RoomRun[];
    readonly storylineVersions: readonly CharacterStorylineVersion[];
    readonly storylineRuns: readonly CharacterStorylineRun[];
    readonly storylineObservationCandidates: readonly CharacterStorylineObservationCandidate[];
    readonly memoryScopes: readonly CharacterMemoryScope[];
    readonly presentationConfigurations: readonly CharacterRunPresentationConfiguration[];
  };
  readonly diagnostics: readonly CharacterFoundationDiagnostic[];
}

export interface CharacterFoundationHostResult {
  readonly requestId: string;
  readonly snapshot: CharacterFoundationSnapshot;
}

export interface CharacterConversationLaunchCatalogHostResult {
  readonly requestId: string;
  readonly catalog: CharacterConversationLaunchCatalog;
}

export interface OpenNekoDesktopCharacterBridge {
  readonly characterFoundation: {
    getSnapshot(): Promise<CharacterFoundationSnapshot>;
    getConversationLaunchCatalog(): Promise<CharacterConversationLaunchCatalog>;
    execute(command: CharacterFoundationCommand): Promise<CharacterFoundationSnapshot>;
  };
}

export function createCharacterFoundationHostRequest(
  requestId: string,
  operation: CharacterFoundationHostRequest['operation'] = 'snapshot-get',
): CharacterFoundationHostRequest {
  const canonicalRequestId = requireIdentity(requestId, 'request');
  return operation === 'snapshot-get'
    ? { requestId: canonicalRequestId, operation: 'snapshot-get' }
    : { requestId: canonicalRequestId, operation: 'conversation-launch-catalog-get' };
}

export function parseCharacterFoundationHostRequest(
  value: unknown,
): CharacterFoundationHostRequest {
  const record = exactRecord(value, ['requestId', 'operation'], 'Character Foundation request');
  if (
    record['operation'] !== 'snapshot-get' &&
    record['operation'] !== 'conversation-launch-catalog-get'
  ) {
    throw new Error(`Unknown Character Foundation operation '${String(record['operation'])}'.`);
  }
  const requestId = requireIdentity(record['requestId'], 'request');
  return record['operation'] === 'snapshot-get'
    ? { requestId, operation: 'snapshot-get' }
    : { requestId, operation: 'conversation-launch-catalog-get' };
}

export function createCharacterFoundationCommandHostRequest(
  requestId: string,
  command: CharacterFoundationCommand,
): CharacterFoundationCommandHostRequest {
  return parseCharacterFoundationCommandHostRequest({
    ...command,
    requestId: requireIdentity(requestId, 'request'),
  });
}

export function parseCharacterFoundationAnyHostRequest(
  value: unknown,
): CharacterFoundationAnyHostRequest {
  const record = recordValue(value, 'Character Foundation request');
  return record['operation'] === 'snapshot-get' ||
    record['operation'] === 'conversation-launch-catalog-get'
    ? parseCharacterFoundationHostRequest(value)
    : parseCharacterFoundationCommandHostRequest(value);
}

export function parseCharacterFoundationCommandHostRequest(
  value: unknown,
): CharacterFoundationCommandHostRequest {
  const record = exactRecord(value, ['requestId', 'operation', 'input'], 'Character command');
  const requestId = requireIdentity(record['requestId'], 'request');
  const operation = record['operation'];
  switch (operation) {
    case 'character-project-create': {
      const input = exactRecord(
        record['input'],
        ['characterProjectId', 'displayName', 'draft'],
        'Character project create input',
      );
      return {
        requestId,
        operation,
        input: {
          characterProjectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
          displayName: requireIdentity(input['displayName'], 'Character display name'),
          draft: parseCharacterDefinition(input['draft']),
        },
      };
    }
    case 'character-project-update-draft': {
      const input = exactRecord(
        record['input'],
        ['characterProjectId', 'draft'],
        'Character project draft input',
      );
      return {
        requestId,
        operation,
        input: {
          characterProjectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
          draft: parseCharacterDefinition(input['draft']),
        },
      };
    }
    case 'character-project-set-review': {
      const input = exactRecord(
        record['input'],
        ['characterProjectId', 'reviewStatus'],
        'Character project review input',
      );
      return {
        requestId,
        operation,
        input: {
          characterProjectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
          reviewStatus: parseReviewStatus(input['reviewStatus'], 'Character'),
        },
      };
    }
    case 'character-version-publish': {
      const input = parsePublicationInput(record['input']);
      return {
        requestId,
        operation,
        input: {
          characterProjectId: input.projectId,
          characterVersionId: input.versionId,
          label: input.label,
        },
      };
    }
    case 'relationship-create': {
      const input = exactRecord(
        record['input'],
        ['relationshipId', 'userId', 'characterVersionId'],
        'Relationship create input',
      );
      return {
        requestId,
        operation,
        input: {
          relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
          userId: requireIdentity(input['userId'], 'user'),
          characterVersionId: requireIdentity(input['characterVersionId'], 'CharacterVersion'),
        },
      };
    }
    case 'relationship-memory-candidate-propose':
      return { requestId, operation, input: parseRelationshipMemoryProposeInput(record['input']) };
    case 'relationship-memory-candidate-accept':
      return { requestId, operation, input: parseRelationshipMemoryAcceptInput(record['input']) };
    case 'relationship-memory-candidate-reject':
      return { requestId, operation, input: parseRelationshipMemoryRejectInput(record['input']) };
    case 'relationship-memory-correct':
      return { requestId, operation, input: parseRelationshipMemoryCorrectInput(record['input']) };
    case 'relationship-memory-delete':
      return { requestId, operation, input: parseRelationshipMemoryDeleteInput(record['input']) };
    case 'dialogue-create':
      return { requestId, operation, input: parseDialogueCreateInput(record['input']) };
    case 'character-room-create':
      return { requestId, operation, input: parseCharacterRoom(record['input']) };
    case 'room-run-create':
      return { requestId, operation, input: parseCreateCharacterRoomRunInput(record['input']) };
    case 'character-presentation-configure':
      return {
        requestId,
        operation,
        input: parseCharacterRunPresentationConfiguration(record['input']),
      };
    case 'character-storyline-publish':
      return { requestId, operation, input: parseStorylinePublishInput(record['input']) };
    case 'character-storyline-run-create':
      return { requestId, operation, input: parseStorylineRunCreateInput(record['input']) };
    case 'character-storyline-observation-propose':
      return {
        requestId,
        operation,
        input: parseStorylineObservationProposeInput(record['input']),
      };
    case 'character-storyline-observation-accept':
      return { requestId, operation, input: parseStorylineObservationAcceptInput(record['input']) };
    case 'character-storyline-observation-reject':
      return { requestId, operation, input: parseStorylineObservationRejectInput(record['input']) };
    case 'character-memory-scope-create':
      return { requestId, operation, input: parseMemoryScopeCreateInput(record['input']) };
    case 'character-memory-candidate-propose':
      return { requestId, operation, input: parseMemoryCandidateProposeInput(record['input']) };
    case 'character-memory-candidate-accept':
      return { requestId, operation, input: parseMemoryCandidateAcceptInput(record['input']) };
    case 'character-memory-candidate-reject':
      return { requestId, operation, input: parseMemoryCandidateRejectInput(record['input']) };
    case 'character-memory-candidate-correct':
      return { requestId, operation, input: parseMemoryCandidateCorrectInput(record['input']) };
    case 'character-memory-entry-delete':
      return { requestId, operation, input: parseMemoryEntryDeleteInput(record['input']) };
    default:
      throw new Error(`Unknown Character Foundation operation '${String(operation)}'.`);
  }
}

export function parseCharacterFoundationHostResult(
  value: unknown,
  expectedRequestId: string,
): CharacterFoundationHostResult {
  const record = exactRecord(value, ['requestId', 'snapshot'], 'Character Foundation result');
  const requestId = requireIdentity(record['requestId'], 'response request');
  if (requestId !== expectedRequestId) {
    throw new Error('Character Foundation response request identity mismatch.');
  }
  return { requestId, snapshot: parseCharacterFoundationSnapshot(record['snapshot']) };
}

export function parseCharacterConversationLaunchCatalogHostResult(
  value: unknown,
  expectedRequestId: string,
): CharacterConversationLaunchCatalogHostResult {
  const record = exactRecord(
    value,
    ['requestId', 'catalog'],
    'Character conversation launch catalog result',
  );
  const requestId = requireIdentity(record['requestId'], 'response request');
  if (requestId !== expectedRequestId) {
    throw new Error('Character conversation launch catalog response request identity mismatch.');
  }
  return {
    requestId,
    catalog: parseCharacterConversationLaunchCatalog(record['catalog']),
  };
}

export function parseCharacterFoundationSnapshot(value: unknown): CharacterFoundationSnapshot {
  const record = exactRecord(value, ['character', 'diagnostics'], 'Character Foundation snapshot');
  const character = exactRecord(
    record['character'],
    [
      'projects',
      'versions',
      'relationships',
      'characterRuns',
      'dialogueRuns',
      'rooms',
      'roomRuns',
      'storylineVersions',
      'storylineRuns',
      'storylineObservationCandidates',
      'memoryScopes',
      'presentationConfigurations',
    ],
    'Character catalog',
  );
  return Object.freeze({
    character: Object.freeze({
      projects: parseArray(character['projects'], parseCharacterProject, 'Character projects'),
      versions: parseArray(character['versions'], parseCharacterVersion, 'Character versions'),
      relationships: parseArray(
        character['relationships'],
        parseUserCharacterRelationship,
        'Character relationships',
      ),
      characterRuns: parseArray(character['characterRuns'], parseCharacterRun, 'Character runs'),
      dialogueRuns: parseArray(character['dialogueRuns'], parseDialogueRun, 'Dialogue runs'),
      rooms: parseArray(character['rooms'], parseCharacterRoom, 'Character rooms'),
      roomRuns: parseArray(character['roomRuns'], parseRoomRun, 'Room runs'),
      storylineVersions: parseArray(
        character['storylineVersions'],
        parseCharacterStorylineVersion,
        'Character storyline versions',
      ),
      storylineRuns: parseArray(
        character['storylineRuns'],
        parseCharacterStorylineRun,
        'Character storyline runs',
      ),
      storylineObservationCandidates: parseArray(
        character['storylineObservationCandidates'],
        parseCharacterStorylineObservationCandidate,
        'Character storyline observation candidates',
      ),
      memoryScopes: parseArray(
        character['memoryScopes'],
        parseCharacterMemoryScope,
        'Character memory scopes',
      ),
      presentationConfigurations: parseArray(
        character['presentationConfigurations'],
        parseCharacterRunPresentationConfiguration,
        'Character presentation configurations',
      ),
    }),
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'Foundation diagnostics'),
  });
}

function parseDiagnostic(value: unknown): CharacterFoundationDiagnostic {
  const record = exactRecord(
    value,
    ['owner', 'recordKind', 'recordId', 'message'],
    'Character Foundation diagnostic',
  );
  const owner = record['owner'];
  if (owner !== 'character') {
    throw new Error(`Unknown Character Foundation diagnostic owner '${String(owner)}'.`);
  }
  return Object.freeze({
    owner,
    recordKind: requireIdentity(record['recordKind'], 'diagnostic record kind'),
    recordId: requireIdentity(record['recordId'], 'diagnostic record'),
    message: requireIdentity(record['message'], 'diagnostic message'),
  });
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return Object.freeze(value.map((entry) => parse(entry)));
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
  return record;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function parseReviewStatus(value: unknown, owner: string): 'draft' | 'ready' | 'blocked' {
  if (value !== 'draft' && value !== 'ready' && value !== 'blocked') {
    throw new Error(`Unknown ${owner} review status '${String(value)}'.`);
  }
  return value;
}

function parsePublicationInput(value: unknown): {
  readonly projectId: string;
  readonly versionId: string;
  readonly label: string;
} {
  const input = exactRecord(
    value,
    ['characterProjectId', 'characterVersionId', 'label'],
    'Character publication input',
  );
  return {
    projectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
    versionId: requireIdentity(input['characterVersionId'], 'CharacterVersion'),
    label: requireIdentity(input['label'], 'Character version label'),
  };
}

function parseDialogueCreateInput(value: unknown): CharacterFoundationDialogueCreateInput {
  const input = exactRecordWithOptional(
    value,
    [
      'dialogueRunId',
      'characterRunId',
      'characterVersionId',
      'userParticipantId',
      'characterParticipantId',
      'controller',
      'runtimeKind',
    ],
    ['relationshipId'],
    'Dialogue create input',
  );
  const controllerRecord = recordValue(input['controller'], 'Dialogue controller');
  const controller = parseDialogueController(controllerRecord);
  const base = {
    dialogueRunId: requireIdentity(input['dialogueRunId'], 'DialogueRun'),
    characterRunId: requireIdentity(input['characterRunId'], 'CharacterRun'),
    characterVersionId: requireIdentity(input['characterVersionId'], 'CharacterVersion'),
    userParticipantId: requireIdentity(input['userParticipantId'], 'Dialogue user participant'),
    characterParticipantId: requireIdentity(
      input['characterParticipantId'],
      'Dialogue Character participant',
    ),
    controller,
  };
  const parsedBinding = parseDialogueRun({
    topology: 'dialogue',
    dialogueRunId: base.dialogueRunId,
    userParticipantId: base.userParticipantId,
    characterParticipantId: base.characterParticipantId,
    characterRunId: base.characterRunId,
    runtimeKind: input['runtimeKind'],
    relationshipIds: [requireIdentity(input['relationshipId'], 'relationship')],
    createdAt: '2000-01-01T00:00:00.000Z',
  });
  return {
    ...base,
    runtimeKind: 'companion',
    relationshipId: parsedBinding.relationshipIds[0]!,
  };
}

function parseRelationshipMemoryProposeInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'relationship-memory-candidate-propose' }
>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'candidateId', 'content', 'sourceRef'],
    'Relationship memory candidate propose input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    content: requireIdentity(input['content'], 'relationship memory content'),
    sourceRef: requireOpaqueCommandRef(input['sourceRef'], 'relationship memory source'),
  };
}

function parseRelationshipMemoryAcceptInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'relationship-memory-candidate-accept' }
>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'candidateId', 'memoryId'],
    'Relationship memory candidate accept input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    memoryId: requireIdentity(input['memoryId'], 'relationship memory'),
  };
}

function parseRelationshipMemoryRejectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'relationship-memory-candidate-reject' }
>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'candidateId'],
    'Relationship memory candidate reject input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
  };
}

function parseRelationshipMemoryCorrectInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'relationship-memory-correct' }>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'memoryId', 'content'],
    'Relationship memory correction input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    memoryId: requireIdentity(input['memoryId'], 'relationship memory'),
    content: requireIdentity(input['content'], 'relationship memory content'),
  };
}

function parseRelationshipMemoryDeleteInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'relationship-memory-delete' }>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'memoryId'],
    'Relationship memory delete input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    memoryId: requireIdentity(input['memoryId'], 'relationship memory'),
  };
}

function parseStorylinePublishInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'character-storyline-publish' }>['input'] {
  const publication = parseCharacterStorylineVersion({
    ...recordValue(value, 'Character storyline publication input'),
    publishedAt: '2000-01-01T00:00:00.000Z',
  });
  const { publishedAt: _publishedAt, ...input } = publication;
  return input;
}

function parseStorylineRunCreateInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'character-storyline-run-create' }>['input'] {
  const input = exactRecord(
    value,
    ['characterStorylineRunId', 'characterStorylineVersionId', 'characterRunId', 'initialStageId'],
    'Character storyline run create input',
  );
  return {
    characterStorylineRunId: requireIdentity(
      input['characterStorylineRunId'],
      'CharacterStorylineRun',
    ),
    characterStorylineVersionId: requireIdentity(
      input['characterStorylineVersionId'],
      'CharacterStorylineVersion',
    ),
    characterRunId: requireIdentity(input['characterRunId'], 'CharacterRun'),
    initialStageId: requireIdentity(input['initialStageId'], 'storyline initial stage'),
  };
}

function parseStorylineObservationProposeInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-storyline-observation-propose' }
>['input'] {
  const candidate = parseCharacterStorylineObservationCandidate({
    ...recordValue(value, 'Character storyline observation propose input'),
    status: 'pending',
  });
  const { status: _status, ...input } = candidate;
  return input;
}

function parseStorylineObservationAcceptInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-storyline-observation-accept' }
>['input'] {
  const input = exactRecord(
    value,
    [
      'observationCandidateId',
      'characterStorylineRunId',
      'transitionId',
      'expectedStorylineRevision',
    ],
    'Character storyline observation accept input',
  );
  return {
    observationCandidateId: requireIdentity(
      input['observationCandidateId'],
      'storyline observation candidate',
    ),
    characterStorylineRunId: requireIdentity(
      input['characterStorylineRunId'],
      'CharacterStorylineRun',
    ),
    transitionId: requireIdentity(input['transitionId'], 'storyline transition'),
    expectedStorylineRevision: requireExpectedPosition(
      input['expectedStorylineRevision'],
      'storyline',
    ),
  };
}

function parseStorylineObservationRejectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-storyline-observation-reject' }
>['input'] {
  const input = exactRecord(
    value,
    ['observationCandidateId', 'characterStorylineRunId', 'expectedStorylineRevision'],
    'Character storyline observation reject input',
  );
  return {
    observationCandidateId: requireIdentity(
      input['observationCandidateId'],
      'storyline observation candidate',
    ),
    characterStorylineRunId: requireIdentity(
      input['characterStorylineRunId'],
      'CharacterStorylineRun',
    ),
    expectedStorylineRevision: requireExpectedPosition(
      input['expectedStorylineRevision'],
      'storyline',
    ),
  };
}

function parseMemoryScopeCreateInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'character-memory-scope-create' }>['input'] {
  const input = exactRecordWithOptional(
    value,
    ['characterMemoryScopeId', 'characterRunId'],
    ['characterStorylineRunId'],
    'Character memory scope create input',
  );
  const characterStorylineRunId = optionalCommandIdentity(
    input['characterStorylineRunId'],
    'CharacterStorylineRun',
  );
  return {
    characterMemoryScopeId: requireIdentity(
      input['characterMemoryScopeId'],
      'CharacterMemoryScope',
    ),
    characterRunId: requireIdentity(input['characterRunId'], 'CharacterRun'),
    ...(characterStorylineRunId === undefined ? {} : { characterStorylineRunId }),
  };
}

function parseMemoryCandidateProposeInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-memory-candidate-propose' }
>['input'] {
  const candidate = parseCharacterMemoryCandidate({
    ...recordValue(value, 'Character memory candidate propose input'),
    status: 'pending',
  });
  const { characterMemoryCandidateId, status: _status, ...input } = candidate;
  return { characterMemoryCandidateId, ...input };
}

function parseMemoryCandidateAcceptInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-memory-candidate-accept' }
>['input'] {
  const input = exactRecord(
    value,
    [
      'characterMemoryScopeId',
      'characterMemoryCandidateId',
      'characterMemoryEntryId',
      'expectedMemoryRevision',
    ],
    'Character memory candidate accept input',
  );
  return {
    characterMemoryScopeId: requireIdentity(
      input['characterMemoryScopeId'],
      'CharacterMemoryScope',
    ),
    characterMemoryCandidateId: requireIdentity(
      input['characterMemoryCandidateId'],
      'CharacterMemoryCandidate',
    ),
    characterMemoryEntryId: requireIdentity(
      input['characterMemoryEntryId'],
      'CharacterMemoryEntry',
    ),
    expectedMemoryRevision: requireExpectedPosition(input['expectedMemoryRevision'], 'memory'),
  };
}

function parseMemoryCandidateRejectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-memory-candidate-reject' }
>['input'] {
  const input = exactRecord(
    value,
    ['characterMemoryScopeId', 'characterMemoryCandidateId', 'expectedMemoryRevision'],
    'Character memory candidate reject input',
  );
  return {
    characterMemoryScopeId: requireIdentity(
      input['characterMemoryScopeId'],
      'CharacterMemoryScope',
    ),
    characterMemoryCandidateId: requireIdentity(
      input['characterMemoryCandidateId'],
      'CharacterMemoryCandidate',
    ),
    expectedMemoryRevision: requireExpectedPosition(input['expectedMemoryRevision'], 'memory'),
  };
}

function parseMemoryCandidateCorrectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'character-memory-candidate-correct' }
>['input'] {
  const input = exactRecord(
    value,
    [
      'characterMemoryScopeId',
      'characterMemoryCandidateId',
      'correctedMemoryEntryId',
      'replacementMemoryEntryId',
      'expectedMemoryRevision',
    ],
    'Character memory candidate correct input',
  );
  return {
    characterMemoryScopeId: requireIdentity(
      input['characterMemoryScopeId'],
      'CharacterMemoryScope',
    ),
    characterMemoryCandidateId: requireIdentity(
      input['characterMemoryCandidateId'],
      'CharacterMemoryCandidate',
    ),
    correctedMemoryEntryId: requireIdentity(
      input['correctedMemoryEntryId'],
      'corrected CharacterMemoryEntry',
    ),
    replacementMemoryEntryId: requireIdentity(
      input['replacementMemoryEntryId'],
      'replacement CharacterMemoryEntry',
    ),
    expectedMemoryRevision: requireExpectedPosition(input['expectedMemoryRevision'], 'memory'),
  };
}

function parseMemoryEntryDeleteInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'character-memory-entry-delete' }>['input'] {
  const input = exactRecord(
    value,
    ['characterMemoryScopeId', 'characterMemoryEntryId', 'expectedMemoryRevision'],
    'Character memory entry delete input',
  );
  return {
    characterMemoryScopeId: requireIdentity(
      input['characterMemoryScopeId'],
      'CharacterMemoryScope',
    ),
    characterMemoryEntryId: requireIdentity(
      input['characterMemoryEntryId'],
      'CharacterMemoryEntry',
    ),
    expectedMemoryRevision: requireExpectedPosition(input['expectedMemoryRevision'], 'memory'),
  };
}

function optionalCommandIdentity(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireIdentity(value, label);
}

function requireExpectedPosition(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Character Foundation ${label} revision must be a non-negative integer.`);
  }
  return value;
}

function requireOpaqueCommandRef(value: unknown, label: string): string {
  const ref = requireIdentity(value, label);
  if (!/^[a-z][a-z0-9+.-]*:[^\s]+$/u.test(ref) || /^file:/u.test(ref)) {
    throw new Error(`Character Foundation ${label} must be an opaque non-file reference.`);
  }
  return ref;
}

function parseDialogueController(
  value: Readonly<Record<string, unknown>>,
): CharacterFoundationDialogueController {
  if (value['kind'] === 'agent') {
    exactRecord(value, ['kind'], 'Agent Dialogue controller');
    return { kind: 'agent' };
  }
  if (value['kind'] === 'human') {
    const controller = exactRecord(value, ['kind', 'userId'], 'Human Dialogue controller');
    return {
      kind: 'human',
      userId: requireIdentity(controller['userId'], 'Dialogue controller user'),
    };
  }
  throw new Error(`Unknown Dialogue controller '${String(value['kind'])}'.`);
}

function exactRecordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const actual = Object.keys(record);
  if (
    requiredKeys.some((key) => !actual.includes(key)) ||
    actual.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key))
  ) {
    throw new Error(`${label} contains unsupported fields.`);
  }
  return record;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character Foundation ${label} identity is required.`);
  }
  return value;
}
