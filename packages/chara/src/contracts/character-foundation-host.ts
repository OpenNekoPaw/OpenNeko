import {
  parseCharacterConversationLaunchCatalog,
  type CharacterConversationLaunchCatalog,
} from './character-conversation-launch';
import {
  parseCharacterRun,
  parseUserCharacterRelationship,
  type CharacterRun,
  type UserCharacterRelationship,
} from './character';
import {
  parseCharacterCompanionContinuity,
  parseCompanionMemoryCandidate,
  parseCompanionMemoryProvenance,
  type CharacterCompanionContinuity,
  type CompanionMemoryConstraints,
  type CompanionMemoryProvenance,
} from './character-companion-continuity';
import {
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
} from './character-storyline';
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
import {
  parseGlobalCharacter,
  parseGlobalCharacterVersion,
  type GlobalCharacter,
  type GlobalCharacterVersion,
} from './character-global-catalog';
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
  readonly mode: 'companion';
  readonly relationshipId: string;
};

export type CharacterFoundationCommand =
  | {
      readonly operation: 'relationship-create';
      readonly input: {
        readonly relationshipId: string;
        readonly userId: string;
        readonly characterProjectId: string;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-propose';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly sourceCharacterVersionId: string;
        readonly provenance: CompanionMemoryProvenance;
        readonly content: string;
        readonly expectedRelationshipRevision: number;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-accept';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly memoryId: string;
        readonly expectedRelationshipRevision: number;
      };
    }
  | {
      readonly operation: 'relationship-memory-candidate-reject';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly expectedRelationshipRevision: number;
      };
    }
  | {
      readonly operation: 'relationship-memory-correct';
      readonly input: {
        readonly relationshipId: string;
        readonly candidateId: string;
        readonly correctedMemoryId: string;
        readonly replacementMemoryId: string;
        readonly expectedRelationshipRevision: number;
      };
    }
  | {
      readonly operation: 'relationship-memory-delete';
      readonly input: {
        readonly relationshipId: string;
        readonly memoryId: string;
        readonly expectedRelationshipRevision: number;
      };
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
      readonly operation: 'companion-memory-candidate-propose';
      readonly input: {
        readonly companionContinuityId: string;
        readonly companionMemoryCandidateId: string;
        readonly sourceCharacterVersionId: string;
        readonly provenance: CompanionMemoryProvenance;
        readonly content: string;
        readonly constraints: CompanionMemoryConstraints;
        readonly sensitivityTraits: readonly string[];
        readonly retentionTraits: readonly string[];
        readonly expectedContinuityRevision: number;
      };
    }
  | {
      readonly operation: 'companion-memory-candidate-accept';
      readonly input: {
        readonly companionContinuityId: string;
        readonly companionMemoryCandidateId: string;
        readonly companionMemoryEntryId: string;
        readonly expectedContinuityRevision: number;
      };
    }
  | {
      readonly operation: 'companion-memory-candidate-reject';
      readonly input: {
        readonly companionContinuityId: string;
        readonly companionMemoryCandidateId: string;
        readonly expectedContinuityRevision: number;
      };
    }
  | {
      readonly operation: 'companion-memory-candidate-correct';
      readonly input: {
        readonly companionContinuityId: string;
        readonly companionMemoryCandidateId: string;
        readonly correctedMemoryEntryId: string;
        readonly replacementMemoryEntryId: string;
        readonly expectedContinuityRevision: number;
      };
    }
  | {
      readonly operation: 'companion-memory-entry-delete';
      readonly input: {
        readonly companionContinuityId: string;
        readonly companionMemoryEntryId: string;
        readonly expectedContinuityRevision: number;
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
    readonly globalCharacters: readonly GlobalCharacter[];
    readonly versions: readonly GlobalCharacterVersion[];
    readonly relationships: readonly UserCharacterRelationship[];
    readonly characterRuns: readonly CharacterRun[];
    readonly dialogueRuns: readonly DialogueRun[];
    readonly rooms: readonly CharacterRoom[];
    readonly roomRuns: readonly RoomRun[];
    readonly storylines: readonly CharacterStoryline[];
    readonly storylineDrafts: readonly CharacterStorylineDraft[];
    readonly storylineVersions: readonly CharacterStorylineVersion[];
    readonly companionContinuities: readonly CharacterCompanionContinuity[];
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
    case 'relationship-create': {
      const input = exactRecord(
        record['input'],
        ['relationshipId', 'userId', 'characterProjectId'],
        'Relationship create input',
      );
      return {
        requestId,
        operation,
        input: {
          relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
          userId: requireIdentity(input['userId'], 'user'),
          characterProjectId: requireIdentity(input['characterProjectId'], 'CharacterProject'),
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
    case 'companion-memory-candidate-propose':
      return { requestId, operation, input: parseMemoryCandidateProposeInput(record['input']) };
    case 'companion-memory-candidate-accept':
      return { requestId, operation, input: parseMemoryCandidateAcceptInput(record['input']) };
    case 'companion-memory-candidate-reject':
      return { requestId, operation, input: parseMemoryCandidateRejectInput(record['input']) };
    case 'companion-memory-candidate-correct':
      return { requestId, operation, input: parseMemoryCandidateCorrectInput(record['input']) };
    case 'companion-memory-entry-delete':
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
      'globalCharacters',
      'versions',
      'relationships',
      'characterRuns',
      'dialogueRuns',
      'rooms',
      'roomRuns',
      'storylines',
      'storylineDrafts',
      'storylineVersions',
      'companionContinuities',
      'presentationConfigurations',
    ],
    'Character catalog',
  );
  return Object.freeze({
    character: Object.freeze({
      globalCharacters: parseArray(
        character['globalCharacters'],
        parseGlobalCharacter,
        'Global Characters',
      ),
      versions: parseArray(
        character['versions'],
        parseGlobalCharacterVersion,
        'Global Character versions',
      ),
      relationships: parseArray(
        character['relationships'],
        parseUserCharacterRelationship,
        'Character relationships',
      ),
      characterRuns: parseArray(character['characterRuns'], parseCharacterRun, 'Character runs'),
      dialogueRuns: parseArray(character['dialogueRuns'], parseDialogueRun, 'Dialogue runs'),
      rooms: parseArray(character['rooms'], parseCharacterRoom, 'Character rooms'),
      roomRuns: parseArray(character['roomRuns'], parseRoomRun, 'Room runs'),
      storylines: parseArray(
        character['storylines'],
        parseCharacterStoryline,
        'Character storylines',
      ),
      storylineDrafts: parseArray(
        character['storylineDrafts'],
        parseCharacterStorylineDraft,
        'Character storyline drafts',
      ),
      storylineVersions: parseArray(
        character['storylineVersions'],
        parseCharacterStorylineVersion,
        'Character storyline versions',
      ),
      companionContinuities: parseArray(
        character['companionContinuities'],
        parseCharacterCompanionContinuity,
        'Character Companion continuities',
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
      'mode',
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
    mode: input['mode'],
    relationshipIds: [requireIdentity(input['relationshipId'], 'relationship')],
    createdAt: '2000-01-01T00:00:00.000Z',
  });
  if (parsedBinding.mode !== 'companion') {
    throw new Error('Dialogue create command supports Companion mode only.');
  }
  return {
    ...base,
    mode: 'companion',
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
    [
      'relationshipId',
      'candidateId',
      'sourceCharacterVersionId',
      'provenance',
      'content',
      'expectedRelationshipRevision',
    ],
    'Relationship memory candidate propose input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    sourceCharacterVersionId: requireIdentity(
      input['sourceCharacterVersionId'],
      'relationship memory source CharacterVersion',
    ),
    provenance: parseCompanionMemoryProvenance(input['provenance']),
    content: requireIdentity(input['content'], 'relationship memory content'),
    expectedRelationshipRevision: requireExpectedPosition(
      input['expectedRelationshipRevision'],
      'relationship',
    ),
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
    ['relationshipId', 'candidateId', 'memoryId', 'expectedRelationshipRevision'],
    'Relationship memory candidate accept input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    memoryId: requireIdentity(input['memoryId'], 'relationship memory'),
    expectedRelationshipRevision: requireExpectedPosition(
      input['expectedRelationshipRevision'],
      'relationship',
    ),
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
    ['relationshipId', 'candidateId', 'expectedRelationshipRevision'],
    'Relationship memory candidate reject input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    expectedRelationshipRevision: requireExpectedPosition(
      input['expectedRelationshipRevision'],
      'relationship',
    ),
  };
}

function parseRelationshipMemoryCorrectInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'relationship-memory-correct' }>['input'] {
  const input = exactRecord(
    value,
    [
      'relationshipId',
      'candidateId',
      'correctedMemoryId',
      'replacementMemoryId',
      'expectedRelationshipRevision',
    ],
    'Relationship memory correction input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    candidateId: requireIdentity(input['candidateId'], 'relationship memory candidate'),
    correctedMemoryId: requireIdentity(input['correctedMemoryId'], 'corrected relationship memory'),
    replacementMemoryId: requireIdentity(
      input['replacementMemoryId'],
      'replacement relationship memory',
    ),
    expectedRelationshipRevision: requireExpectedPosition(
      input['expectedRelationshipRevision'],
      'relationship',
    ),
  };
}

function parseRelationshipMemoryDeleteInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'relationship-memory-delete' }>['input'] {
  const input = exactRecord(
    value,
    ['relationshipId', 'memoryId', 'expectedRelationshipRevision'],
    'Relationship memory delete input',
  );
  return {
    relationshipId: requireIdentity(input['relationshipId'], 'relationship'),
    memoryId: requireIdentity(input['memoryId'], 'relationship memory'),
    expectedRelationshipRevision: requireExpectedPosition(
      input['expectedRelationshipRevision'],
      'relationship',
    ),
  };
}

function parseMemoryCandidateProposeInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'companion-memory-candidate-propose' }
>['input'] {
  const candidate = parseCompanionMemoryCandidate({
    ...recordValue(value, 'Character memory candidate propose input'),
    status: 'pending',
    createdAt: '2000-01-01T00:00:00.000Z',
  });
  const {
    companionMemoryCandidateId,
    status: _status,
    createdAt: _createdAt,
    ...input
  } = candidate;
  return { companionMemoryCandidateId, ...input };
}

function parseMemoryCandidateAcceptInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'companion-memory-candidate-accept' }
>['input'] {
  const input = exactRecord(
    value,
    [
      'companionContinuityId',
      'companionMemoryCandidateId',
      'companionMemoryEntryId',
      'expectedContinuityRevision',
    ],
    'Character memory candidate accept input',
  );
  return {
    companionContinuityId: requireIdentity(
      input['companionContinuityId'],
      'CharacterCompanionContinuity',
    ),
    companionMemoryCandidateId: requireIdentity(
      input['companionMemoryCandidateId'],
      'CompanionMemoryCandidate',
    ),
    companionMemoryEntryId: requireIdentity(
      input['companionMemoryEntryId'],
      'CompanionMemoryEntry',
    ),
    expectedContinuityRevision: requireExpectedPosition(
      input['expectedContinuityRevision'],
      'continuity',
    ),
  };
}

function parseMemoryCandidateRejectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'companion-memory-candidate-reject' }
>['input'] {
  const input = exactRecord(
    value,
    ['companionContinuityId', 'companionMemoryCandidateId', 'expectedContinuityRevision'],
    'Character memory candidate reject input',
  );
  return {
    companionContinuityId: requireIdentity(
      input['companionContinuityId'],
      'CharacterCompanionContinuity',
    ),
    companionMemoryCandidateId: requireIdentity(
      input['companionMemoryCandidateId'],
      'CompanionMemoryCandidate',
    ),
    expectedContinuityRevision: requireExpectedPosition(
      input['expectedContinuityRevision'],
      'continuity',
    ),
  };
}

function parseMemoryCandidateCorrectInput(
  value: unknown,
): Extract<
  CharacterFoundationCommand,
  { operation: 'companion-memory-candidate-correct' }
>['input'] {
  const input = exactRecord(
    value,
    [
      'companionContinuityId',
      'companionMemoryCandidateId',
      'correctedMemoryEntryId',
      'replacementMemoryEntryId',
      'expectedContinuityRevision',
    ],
    'Character memory candidate correct input',
  );
  return {
    companionContinuityId: requireIdentity(
      input['companionContinuityId'],
      'CharacterCompanionContinuity',
    ),
    companionMemoryCandidateId: requireIdentity(
      input['companionMemoryCandidateId'],
      'CompanionMemoryCandidate',
    ),
    correctedMemoryEntryId: requireIdentity(
      input['correctedMemoryEntryId'],
      'corrected CharacterMemoryEntry',
    ),
    replacementMemoryEntryId: requireIdentity(
      input['replacementMemoryEntryId'],
      'replacement CharacterMemoryEntry',
    ),
    expectedContinuityRevision: requireExpectedPosition(
      input['expectedContinuityRevision'],
      'continuity',
    ),
  };
}

function parseMemoryEntryDeleteInput(
  value: unknown,
): Extract<CharacterFoundationCommand, { operation: 'companion-memory-entry-delete' }>['input'] {
  const input = exactRecord(
    value,
    ['companionContinuityId', 'companionMemoryEntryId', 'expectedContinuityRevision'],
    'Character memory entry delete input',
  );
  return {
    companionContinuityId: requireIdentity(
      input['companionContinuityId'],
      'CharacterCompanionContinuity',
    ),
    companionMemoryEntryId: requireIdentity(
      input['companionMemoryEntryId'],
      'CompanionMemoryEntry',
    ),
    expectedContinuityRevision: requireExpectedPosition(
      input['expectedContinuityRevision'],
      'continuity',
    ),
  };
}

function requireExpectedPosition(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Character Foundation ${label} revision must be a non-negative integer.`);
  }
  return value;
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
