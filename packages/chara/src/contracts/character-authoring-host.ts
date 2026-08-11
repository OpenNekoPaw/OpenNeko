import {
  parseCharacterProject,
  parseCharacterVersion,
  type CharacterProject,
  type CharacterVersion,
} from './character';
import {
  parseCharacterFoundationCommandHostRequest,
  type CharacterFoundationCommand,
} from './character-foundation-host';

export const CHARACTER_AUTHORING_HOST_CHANNEL = 'neko:character:authoring' as const;

export type CharacterAuthoringCommand = Extract<
  CharacterFoundationCommand,
  {
    readonly operation:
      | 'character-project-update-draft'
      | 'character-project-set-review'
      | 'character-version-publish';
  }
>;

export interface CharacterAuthoringBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly contentProjectId: string;
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
  readonly recordKind: 'character-project' | 'character-version' | 'authoring-test-snapshot';
  readonly recordId: string;
  readonly message: string;
}

export interface CharacterAuthoringSnapshot {
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
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
  const parsed = parseCharacterFoundationCommandHostRequest({
    requestId: base.requestId,
    operation,
    input: record['input'],
  });
  if (!isCharacterAuthoringCommand(parsed)) {
    throw new Error(`Character authoring operation '${String(operation)}' is not permitted.`);
  }
  if (characterCommandProjectId(parsed) !== base.characterProjectId) {
    throw new Error('Character authoring command targets another CharacterProject.');
  }
  switch (parsed.operation) {
    case 'character-project-update-draft':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-project-set-review':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'character-version-publish':
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
  requireExactKeys(record, ['project', 'versions', 'diagnostics']);
  const project = parseCharacterProject(record['project']);
  const versions = parseArray(record['versions'], parseCharacterVersion, 'Character versions');
  if (versions.some((version) => version.characterProjectId !== project.characterProjectId)) {
    throw new Error(
      'Character authoring snapshot contains a version from another CharacterProject.',
    );
  }
  return {
    project,
    versions,
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'Character diagnostics'),
  };
}

export function isCharacterAuthoringCommand(
  command: CharacterFoundationCommand,
): command is CharacterAuthoringCommand {
  return (
    command.operation === 'character-project-update-draft' ||
    command.operation === 'character-project-set-review' ||
    command.operation === 'character-version-publish'
  );
}

const BASE_KEYS = [
  'requestId',
  'rendererSessionId',
  'windowId',
  'workspaceId',
  'workspaceGrantId',
  'contentProjectId',
  'characterProjectId',
] as const;
const RESULT_KEYS = [
  'requestId',
  'workspaceId',
  'workspaceGrantId',
  'contentProjectId',
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
    contentProjectId: requireIdentity(record['contentProjectId'], 'ContentProject'),
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
  };
}

function parseDiagnostic(value: unknown): CharacterAuthoringDiagnostic {
  const record = requireRecord(value, 'Character authoring diagnostic');
  requireExactKeys(record, ['owner', 'recordKind', 'recordId', 'message']);
  if (record['owner'] !== 'character') throw new Error('Character diagnostic owner mismatch.');
  const recordKind = record['recordKind'];
  if (
    recordKind !== 'character-project' &&
    recordKind !== 'character-version' &&
    recordKind !== 'authoring-test-snapshot'
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

function characterCommandProjectId(command: CharacterAuthoringCommand): string {
  return command.input.characterProjectId;
}

function assertBinding(
  actual: CharacterAuthoringBinding,
  expected: CharacterAuthoringBinding,
): void {
  for (const key of [
    'workspaceId',
    'workspaceGrantId',
    'contentProjectId',
    'characterProjectId',
  ] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Character authoring response ${key} mismatch.`);
    }
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
