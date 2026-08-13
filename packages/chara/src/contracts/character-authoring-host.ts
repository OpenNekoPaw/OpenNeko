import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterVersion,
  type CharacterAuthoringTestSnapshot,
  type CharacterProject,
  type CharacterVersion,
} from './character';
import {
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
} from './character-storyline';
import {
  parseCharacterFoundationCommandHostRequest,
  type CharacterFoundationCommand,
} from './character-foundation-host';
import {
  parseCharacterVersionLineage,
  type CharacterVersionLineage,
} from './character-version-lineage';
import {
  parseCharacterVersionReferenceInventory,
  type CharacterVersionReferenceInventory,
} from './character-version-reference';

export const CHARACTER_AUTHORING_HOST_CHANNEL = 'neko:character:authoring' as const;

type CharacterAuthoringFoundationCommand = Extract<
  CharacterFoundationCommand,
  {
    readonly operation:
      | 'character-project-update-draft'
      | 'character-project-set-review'
      | 'character-version-publish'
      | 'character-storyline-create'
      | 'character-storyline-update-draft'
      | 'character-storyline-restore-as-draft'
      | 'character-storyline-delete'
      | 'character-storyline-publish';
  }
>;

export type CharacterAuthoringCommand =
  | CharacterAuthoringFoundationCommand
  | {
      readonly operation: 'character-version-continue';
      readonly input: {
        readonly characterProjectId: string;
        readonly characterVersionId: string;
        readonly replaceWorkingDraft: true;
      };
    }
  | {
      readonly operation: 'character-version-delete';
      readonly input: {
        readonly characterProjectId: string;
        readonly characterVersionId: string;
      };
    }
  | {
      readonly operation: 'character-authoring-test-capture';
      readonly input: {
        readonly characterProjectId: string;
        readonly authoringTestSnapshotId: string;
      };
    };

export type CharacterAuthoringAuthority =
  | { readonly kind: 'standalone-library' }
  | { readonly kind: 'content-project'; readonly contentProjectId: string };

export interface CharacterAuthoringBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: CharacterAuthoringAuthority;
  readonly characterProjectId: string;
}

export type CharacterAuthoringHostRequest =
  | (CharacterAuthoringBinding & {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'authoring-snapshot-get';
    })
  | (CharacterAuthoringBinding &
      CharacterAuthoringCommand & {
        readonly requestId: string;
        readonly rendererSessionId: string;
        readonly windowId: string;
      });

export interface CharacterAuthoringDiagnostic {
  readonly owner: 'character';
  readonly recordKind:
    | 'character-project'
    | 'character-version'
    | 'authoring-test-snapshot'
    | 'character-storyline'
    | 'character-storyline-draft'
    | 'character-storyline-version'
    | 'character-version-lineage';
  readonly recordId: string;
  readonly message: string;
}

export interface CharacterAuthoringSnapshot {
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
  readonly authoringTestSnapshots: readonly CharacterAuthoringTestSnapshot[];
  readonly storylines: readonly CharacterStoryline[];
  readonly storylineDrafts: readonly CharacterStorylineDraft[];
  readonly storylineVersions: readonly CharacterStorylineVersion[];
  readonly lineage: CharacterVersionLineage | null;
  readonly referenceInventories: readonly CharacterVersionReferenceInventory[];
  readonly diagnostics: readonly CharacterAuthoringDiagnostic[];
}

export interface CharacterAuthoringHostResult extends CharacterAuthoringBinding {
  readonly requestId: string;
  readonly snapshot: CharacterAuthoringSnapshot;
}

export interface OpenNekoDesktopCharacterAuthoringBridge {
  readonly characterAuthoring: {
    getSnapshot(
      windowId: string,
      binding: CharacterAuthoringBinding,
    ): Promise<CharacterAuthoringSnapshot>;
    execute(
      windowId: string,
      binding: CharacterAuthoringBinding,
      command: CharacterAuthoringCommand,
    ): Promise<CharacterAuthoringSnapshot>;
  };
}

export function createCharacterAuthoringSnapshotRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: CharacterAuthoringBinding;
}): CharacterAuthoringHostRequest {
  return parseCharacterAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    ...input.binding,
    operation: 'authoring-snapshot-get',
  });
}

export function createCharacterAuthoringCommandRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: CharacterAuthoringBinding;
  readonly command: CharacterAuthoringCommand;
}): CharacterAuthoringHostRequest {
  return parseCharacterAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    ...input.binding,
    ...input.command,
  });
}

export function parseCharacterAuthoringHostRequest(value: unknown): CharacterAuthoringHostRequest {
  const record = requireRecord(value, 'Character authoring request');
  const operation = record['operation'];
  const base = parseBase(record);
  if (operation === 'authoring-snapshot-get') {
    requireExactKeys(record, [...BASE_KEYS, 'operation']);
    return { ...base, operation };
  }
  requireExactKeys(record, [...BASE_KEYS, 'operation', 'input']);
  if (operation === 'character-authoring-test-capture') {
    const input = requireRecord(record['input'], 'Character authoring-test input');
    requireExactKeys(input, ['characterProjectId', 'authoringTestSnapshotId']);
    const command: CharacterAuthoringCommand = {
      operation,
      input: {
        characterProjectId: requireIdentity(
          input['characterProjectId'],
          'Character authoring-test CharacterProject',
        ),
        authoringTestSnapshotId: requireIdentity(
          input['authoringTestSnapshotId'],
          'Character authoring-test snapshot',
        ),
      },
    };
    if (characterCommandProjectId(command) !== base.characterProjectId) {
      throw new Error('Character authoring command targets another CharacterProject.');
    }
    return { ...base, ...command };
  }
  if (operation === 'character-version-continue' || operation === 'character-version-delete') {
    const input = requireRecord(record['input'], 'Character version operation input');
    requireExactKeys(
      input,
      operation === 'character-version-continue'
        ? ['characterProjectId', 'characterVersionId', 'replaceWorkingDraft']
        : ['characterProjectId', 'characterVersionId'],
    );
    const command: CharacterAuthoringCommand =
      operation === 'character-version-continue'
        ? {
            operation,
            input: {
              characterProjectId: requireIdentity(
                input['characterProjectId'],
                'Character version operation CharacterProject',
              ),
              characterVersionId: requireIdentity(
                input['characterVersionId'],
                'Character version operation CharacterVersion',
              ),
              replaceWorkingDraft: requireLiteralTrue(
                input['replaceWorkingDraft'],
                'Character version continue working-draft replacement',
              ),
            },
          }
        : {
            operation,
            input: {
              characterProjectId: requireIdentity(
                input['characterProjectId'],
                'Character version operation CharacterProject',
              ),
              characterVersionId: requireIdentity(
                input['characterVersionId'],
                'Character version operation CharacterVersion',
              ),
            },
          };
    if (characterCommandProjectId(command) !== base.characterProjectId) {
      throw new Error('Character authoring command targets another CharacterProject.');
    }
    return { ...base, ...command };
  }
  const parsed = parseCharacterFoundationCommandHostRequest({
    requestId: base.requestId,
    operation,
    input: record['input'],
  });
  if (!isCharacterAuthoringCommand(parsed)) {
    throw new Error(`Character authoring operation '${String(operation)}' is not permitted.`);
  }
  const commandProjectId = characterCommandProjectId(parsed);
  if (commandProjectId !== undefined && commandProjectId !== base.characterProjectId) {
    throw new Error('Character authoring command targets another CharacterProject.');
  }
  switch (parsed.operation) {
    case 'character-project-update-draft':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-project-set-review':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-version-publish':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-storyline-create':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-storyline-update-draft':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-storyline-restore-as-draft':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-storyline-delete':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-storyline-publish':
      return { ...base, operation: parsed.operation, input: parsed.input };
  }
}

export function parseCharacterAuthoringHostResult(
  value: unknown,
  expectedRequestId: string,
  expectedBinding: CharacterAuthoringBinding,
): CharacterAuthoringHostResult {
  const record = requireRecord(value, 'Character authoring result');
  requireExactKeys(record, [...RESULT_KEYS, 'snapshot']);
  const base = parseResultBase(record);
  if (base.requestId !== expectedRequestId) {
    throw new Error('Character authoring response request identity mismatch.');
  }
  assertBinding(base, expectedBinding);
  return { ...base, snapshot: parseCharacterAuthoringSnapshot(record['snapshot']) };
}

export function parseCharacterAuthoringSnapshot(value: unknown): CharacterAuthoringSnapshot {
  const record = requireRecord(value, 'Character authoring snapshot');
  requireExactKeys(record, [
    'project',
    'versions',
    'authoringTestSnapshots',
    'storylines',
    'storylineDrafts',
    'storylineVersions',
    'lineage',
    'referenceInventories',
    'diagnostics',
  ]);
  const project = parseCharacterProject(record['project']);
  const versions = parseArray(record['versions'], parseCharacterVersion, 'Character versions');
  if (versions.some((version) => version.characterProjectId !== project.characterProjectId)) {
    throw new Error(
      'Character authoring snapshot contains a version from another CharacterProject.',
    );
  }
  const authoringTestSnapshots = parseArray(
    record['authoringTestSnapshots'],
    parseCharacterAuthoringTestSnapshot,
    'Character authoring-test snapshots',
  );
  const storylines = parseArray(
    record['storylines'],
    parseCharacterStoryline,
    'Character storylines',
  );
  const storylineDrafts = parseArray(
    record['storylineDrafts'],
    parseCharacterStorylineDraft,
    'Character storyline drafts',
  );
  const storylineVersions = parseArray(
    record['storylineVersions'],
    parseCharacterStorylineVersion,
    'Character storyline versions',
  );
  const lineage =
    record['lineage'] === null ? null : parseCharacterVersionLineage(record['lineage']);
  if (lineage !== null && lineage.characterProjectId !== project.characterProjectId) {
    throw new Error('Character authoring snapshot contains lineage from another CharacterProject.');
  }
  const referenceInventories = parseArray(
    record['referenceInventories'],
    parseCharacterVersionReferenceInventory,
    'Character version reference inventories',
  );
  if (
    authoringTestSnapshots.some(
      (snapshot) => snapshot.characterProjectId !== project.characterProjectId,
    ) ||
    storylines.some((storyline) => storyline.characterProjectId !== project.characterProjectId)
  ) {
    throw new Error(
      'Character authoring snapshot contains a record from another CharacterProject.',
    );
  }
  const storylineIds = new Set(storylines.map((storyline) => storyline.characterStorylineId));
  const versionIds = new Set(versions.map((version) => version.characterVersionId));
  if (
    storylineDrafts.some((draft) => !storylineIds.has(draft.characterStorylineId)) ||
    storylineVersions.some((version) => !storylineIds.has(version.characterStorylineId)) ||
    storylineDrafts.some((draft) => !versionIds.has(draft.characterVersionId)) ||
    storylineVersions.some((version) => !versionIds.has(version.characterVersionId))
  ) {
    throw new Error('Character authoring snapshot contains an unowned Storyline record.');
  }
  const inventoryVersionIds = new Set(
    referenceInventories.map((inventory) => inventory.characterVersionId),
  );
  if (
    inventoryVersionIds.size !== referenceInventories.length ||
    inventoryVersionIds.size !== versionIds.size ||
    [...inventoryVersionIds].some((characterVersionId) => !versionIds.has(characterVersionId))
  ) {
    throw new Error('Character authoring snapshot reference inventory is incomplete or unowned.');
  }
  return {
    project,
    versions,
    authoringTestSnapshots,
    storylines,
    storylineDrafts,
    storylineVersions,
    lineage,
    referenceInventories,
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'Character diagnostics'),
  };
}

export function isCharacterAuthoringCommand(command: {
  readonly operation: string;
  readonly input: unknown;
}): command is CharacterAuthoringCommand {
  return (
    command.operation === 'character-project-update-draft' ||
    command.operation === 'character-project-set-review' ||
    command.operation === 'character-version-publish' ||
    command.operation === 'character-storyline-create' ||
    command.operation === 'character-storyline-update-draft' ||
    command.operation === 'character-storyline-restore-as-draft' ||
    command.operation === 'character-storyline-delete' ||
    command.operation === 'character-storyline-publish' ||
    command.operation === 'character-version-continue' ||
    command.operation === 'character-version-delete' ||
    command.operation === 'character-authoring-test-capture'
  );
}

const BASE_KEYS = [
  'requestId',
  'rendererSessionId',
  'windowId',
  'workspaceId',
  'workspaceGrantId',
  'authority',
  'characterProjectId',
] as const;
const RESULT_KEYS = [
  'requestId',
  'workspaceId',
  'workspaceGrantId',
  'authority',
  'characterProjectId',
] as const;

function parseBase(record: Readonly<Record<string, unknown>>) {
  return {
    requestId: requireIdentity(record['requestId'], 'request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'renderer session'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    ...parseBinding(record),
  };
}

function parseResultBase(record: Readonly<Record<string, unknown>>) {
  return {
    requestId: requireIdentity(record['requestId'], 'response request'),
    ...parseBinding(record),
  };
}

function parseBinding(record: Readonly<Record<string, unknown>>): CharacterAuthoringBinding {
  return {
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    authority: parseAuthority(record['authority']),
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
  };
}

function parseAuthority(value: unknown): CharacterAuthoringAuthority {
  const record = requireRecord(value, 'Character authoring authority');
  if (record['kind'] === 'standalone-library') {
    requireExactKeys(record, ['kind']);
    return { kind: 'standalone-library' };
  }
  if (record['kind'] === 'content-project') {
    requireExactKeys(record, ['kind', 'contentProjectId']);
    return {
      kind: 'content-project',
      contentProjectId: requireIdentity(
        record['contentProjectId'],
        'Character authoring ContentProject',
      ),
    };
  }
  throw new Error(`Unknown Character authoring authority '${String(record['kind'])}'.`);
}

function parseDiagnostic(value: unknown): CharacterAuthoringDiagnostic {
  const record = requireRecord(value, 'Character authoring diagnostic');
  requireExactKeys(record, ['owner', 'recordKind', 'recordId', 'message']);
  if (record['owner'] !== 'character') throw new Error('Character diagnostic owner mismatch.');
  const recordKind = record['recordKind'];
  if (
    recordKind !== 'character-project' &&
    recordKind !== 'character-version' &&
    recordKind !== 'authoring-test-snapshot' &&
    recordKind !== 'character-storyline' &&
    recordKind !== 'character-storyline-draft' &&
    recordKind !== 'character-storyline-version' &&
    recordKind !== 'character-version-lineage'
  ) {
    throw new Error(`Unknown Character authoring diagnostic kind '${String(recordKind)}'.`);
  }
  return {
    owner: 'character',
    recordKind,
    recordId: requireIdentity(record['recordId'], 'Character diagnostic record'),
    message: requireIdentity(record['message'], 'Character diagnostic message'),
  };
}

function characterCommandProjectId(command: CharacterAuthoringCommand): string | undefined {
  switch (command.operation) {
    case 'character-storyline-update-draft':
    case 'character-storyline-restore-as-draft':
    case 'character-storyline-delete':
    case 'character-storyline-publish':
      return undefined;
    default:
      return command.input.characterProjectId;
  }
}

function assertBinding(
  actual: CharacterAuthoringBinding,
  expected: CharacterAuthoringBinding,
): void {
  for (const key of ['workspaceId', 'workspaceGrantId', 'characterProjectId'] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Character authoring response ${key} mismatch.`);
    }
  }
  if (
    actual.authority.kind !== expected.authority.kind ||
    (actual.authority.kind === 'content-project' &&
      (expected.authority.kind !== 'content-project' ||
        actual.authority.contentProjectId !== expected.authority.contentProjectId))
  ) {
    throw new Error('Character authoring response authority mismatch.');
  }
}

function parseArray<T>(value: unknown, parse: (item: unknown) => T, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map(parse);
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) {
    throw new Error('Character authoring contract has unknown or missing fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity must be a non-empty string.`);
  }
  return value;
}

function requireLiteralTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must be explicitly true.`);
  return true;
}
