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
  parseCharacterRoom,
  parseCreateCharacterRoomRunInput,
  parseDialogueRun,
  parseRoomRun,
  type CharacterRoom,
  type CompanionWorldBinding,
  type DialogueRun,
  type NarrativeWorldBinding,
  type CreateCharacterRoomRunInput,
  type RoomRun,
} from './room';
import {
  parseWorldProject,
  parseWorldDefinition,
  parseWorldRun,
  parseWorldSave,
  parseWorldVersion,
  type WorldProject,
  type WorldDefinition,
  type WorldRun,
  type WorldSave,
  type WorldVersion,
} from '@neko/world/contracts';
export const CHARACTER_FOUNDATION_HOST_CHANNEL = 'neko:character:foundation' as const;

export interface CharacterFoundationHostRequest {
  readonly requestId: string;
  readonly operation: 'snapshot-get';
}

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

export type CharacterFoundationDialogueCreateInput =
  | (CharacterFoundationDialogueCreateBase & {
      readonly runtimeKind: 'companion';
      readonly relationshipId: string;
      readonly worldBinding?: CompanionWorldBinding;
    })
  | (CharacterFoundationDialogueCreateBase & {
      readonly runtimeKind: 'narrative';
      readonly worldBinding: NarrativeWorldBinding;
      readonly actorId: string;
    });

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
      readonly operation: 'dialogue-create';
      readonly input: CharacterFoundationDialogueCreateInput;
    }
  | { readonly operation: 'character-room-create'; readonly input: CharacterRoom }
  | { readonly operation: 'room-run-create'; readonly input: CreateCharacterRoomRunInput }
  | {
      readonly operation: 'world-project-create';
      readonly input: {
        readonly worldProjectId: string;
        readonly title: string;
        readonly draft: WorldDefinition;
      };
    }
  | {
      readonly operation: 'world-project-update-draft';
      readonly input: { readonly worldProjectId: string; readonly draft: WorldDefinition };
    }
  | {
      readonly operation: 'world-project-set-review';
      readonly input: {
        readonly worldProjectId: string;
        readonly reviewStatus: 'draft' | 'ready' | 'blocked';
      };
    }
  | {
      readonly operation: 'world-version-publish';
      readonly input: {
        readonly worldProjectId: string;
        readonly worldVersionId: string;
        readonly label: string;
      };
    }
  | {
      readonly operation: 'world-run-create';
      readonly input: {
        readonly worldVersionId: string;
        readonly worldRunId: string;
        readonly worldSaveId: string;
        readonly branchId: string;
        readonly saveLabel: string;
      };
    };

export type CharacterFoundationCommandHostRequest = CharacterFoundationCommand & {
  readonly requestId: string;
};

export type CharacterFoundationAnyHostRequest =
  CharacterFoundationHostRequest | CharacterFoundationCommandHostRequest;

export interface CharacterFoundationDiagnostic {
  readonly owner: 'character' | 'world';
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
  };
  readonly world: {
    readonly projects: readonly WorldProject[];
    readonly versions: readonly WorldVersion[];
    readonly runtimes: readonly { readonly run: WorldRun; readonly save: WorldSave }[];
  };
  readonly diagnostics: readonly CharacterFoundationDiagnostic[];
}

export interface CharacterFoundationHostResult {
  readonly requestId: string;
  readonly snapshot: CharacterFoundationSnapshot;
}

export interface OpenNekoDesktopCharacterBridge {
  readonly characterFoundation: {
    getSnapshot(): Promise<CharacterFoundationSnapshot>;
    execute(command: CharacterFoundationCommand): Promise<CharacterFoundationSnapshot>;
  };
}

export function createCharacterFoundationHostRequest(
  requestId: string,
): CharacterFoundationHostRequest {
  return { requestId: requireIdentity(requestId, 'request'), operation: 'snapshot-get' };
}

export function parseCharacterFoundationHostRequest(
  value: unknown,
): CharacterFoundationHostRequest {
  const record = exactRecord(value, ['requestId', 'operation'], 'Character Foundation request');
  if (record['operation'] !== 'snapshot-get') {
    throw new Error(`Unknown Character Foundation operation '${String(record['operation'])}'.`);
  }
  return {
    requestId: requireIdentity(record['requestId'], 'request'),
    operation: 'snapshot-get',
  };
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
  return record['operation'] === 'snapshot-get'
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
      const input = parsePublicationInput(record['input'], 'Character');
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
    case 'dialogue-create':
      return { requestId, operation, input: parseDialogueCreateInput(record['input']) };
    case 'character-room-create':
      return { requestId, operation, input: parseCharacterRoom(record['input']) };
    case 'room-run-create':
      return { requestId, operation, input: parseCreateCharacterRoomRunInput(record['input']) };
    case 'world-project-create': {
      const input = exactRecord(
        record['input'],
        ['worldProjectId', 'title', 'draft'],
        'World project create input',
      );
      return {
        requestId,
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          title: requireIdentity(input['title'], 'World title'),
          draft: parseWorldDefinition(input['draft']),
        },
      };
    }
    case 'world-project-update-draft': {
      const input = exactRecord(
        record['input'],
        ['worldProjectId', 'draft'],
        'World project draft input',
      );
      return {
        requestId,
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          draft: parseWorldDefinition(input['draft']),
        },
      };
    }
    case 'world-project-set-review': {
      const input = exactRecord(
        record['input'],
        ['worldProjectId', 'reviewStatus'],
        'World project review input',
      );
      return {
        requestId,
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          reviewStatus: parseReviewStatus(input['reviewStatus'], 'World'),
        },
      };
    }
    case 'world-version-publish': {
      const input = parsePublicationInput(record['input'], 'World');
      return {
        requestId,
        operation,
        input: {
          worldProjectId: input.projectId,
          worldVersionId: input.versionId,
          label: input.label,
        },
      };
    }
    case 'world-run-create': {
      const input = exactRecord(
        record['input'],
        ['worldVersionId', 'worldRunId', 'worldSaveId', 'branchId', 'saveLabel'],
        'World run create input',
      );
      return {
        requestId,
        operation,
        input: {
          worldVersionId: requireIdentity(input['worldVersionId'], 'WorldVersion'),
          worldRunId: requireIdentity(input['worldRunId'], 'WorldRun'),
          worldSaveId: requireIdentity(input['worldSaveId'], 'WorldSave'),
          branchId: requireIdentity(input['branchId'], 'World branch'),
          saveLabel: requireIdentity(input['saveLabel'], 'World save label'),
        },
      };
    }
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

export function parseCharacterFoundationSnapshot(value: unknown): CharacterFoundationSnapshot {
  const record = exactRecord(
    value,
    ['character', 'world', 'diagnostics'],
    'Character Foundation snapshot',
  );
  const character = exactRecord(
    record['character'],
    ['projects', 'versions', 'relationships', 'characterRuns', 'dialogueRuns', 'rooms', 'roomRuns'],
    'Character catalog',
  );
  const world = exactRecord(record['world'], ['projects', 'versions', 'runtimes'], 'World catalog');
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
    }),
    world: Object.freeze({
      projects: parseArray(world['projects'], parseWorldProject, 'World projects'),
      versions: parseArray(world['versions'], parseWorldVersion, 'World versions'),
      runtimes: parseArray(world['runtimes'], parseWorldRuntimeProjection, 'World runtimes'),
    }),
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'Foundation diagnostics'),
  });
}

function parseWorldRuntimeProjection(value: unknown): {
  readonly run: WorldRun;
  readonly save: WorldSave;
} {
  const record = exactRecord(value, ['run', 'save'], 'World runtime projection');
  const run = parseWorldRun(record['run']);
  const save = parseWorldSave(record['save']);
  if (run.worldRunId !== save.worldRunId || run.worldSaveId !== save.worldSaveId) {
    throw new Error('World runtime projection authority does not match.');
  }
  return Object.freeze({ run, save });
}

function parseDiagnostic(value: unknown): CharacterFoundationDiagnostic {
  const record = exactRecord(
    value,
    ['owner', 'recordKind', 'recordId', 'message'],
    'Character Foundation diagnostic',
  );
  const owner = record['owner'];
  if (owner !== 'character' && owner !== 'world') {
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

function parsePublicationInput(
  value: unknown,
  owner: 'Character' | 'World',
): { readonly projectId: string; readonly versionId: string; readonly label: string } {
  const projectKey = owner === 'Character' ? 'characterProjectId' : 'worldProjectId';
  const versionKey = owner === 'Character' ? 'characterVersionId' : 'worldVersionId';
  const input = exactRecord(value, [projectKey, versionKey, 'label'], `${owner} publication input`);
  return {
    projectId: requireIdentity(input[projectKey], `${owner}Project`),
    versionId: requireIdentity(input[versionKey], `${owner}Version`),
    label: requireIdentity(input['label'], `${owner} version label`),
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
    ['relationshipId', 'worldBinding', 'actorId'],
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
  const runtimeKind = input['runtimeKind'];
  const parsedBinding = parseDialogueRun({
    topology: 'dialogue',
    dialogueRunId: base.dialogueRunId,
    userParticipantId: base.userParticipantId,
    characterParticipantId: base.characterParticipantId,
    characterRunId: base.characterRunId,
    runtimeKind,
    ...(runtimeKind === 'companion'
      ? {
          relationshipIds: [requireIdentity(input['relationshipId'], 'relationship')],
          ...(input['worldBinding'] === undefined ? {} : { worldBinding: input['worldBinding'] }),
        }
      : {
          worldBinding: input['worldBinding'],
        }),
    createdAt: '2000-01-01T00:00:00.000Z',
  });
  if (parsedBinding.runtimeKind === 'companion') {
    if (input['actorId'] !== undefined) {
      throw new Error('Companion Dialogue input cannot declare a narrative actor.');
    }
    return {
      ...base,
      runtimeKind: 'companion',
      relationshipId: parsedBinding.relationshipIds[0]!,
      ...(parsedBinding.worldBinding === undefined
        ? {}
        : { worldBinding: parsedBinding.worldBinding }),
    };
  }
  if (input['relationshipId'] !== undefined) {
    throw new Error('Narrative Dialogue input cannot declare relationship memory.');
  }
  return {
    ...base,
    runtimeKind: 'narrative',
    worldBinding: parsedBinding.worldBinding,
    actorId: requireIdentity(input['actorId'], 'narrative actor'),
  };
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
