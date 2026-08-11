import {
  parseWorldProject,
  parseWorldVersion,
  type WorldProject,
  type WorldVersion,
} from './world';
import {
  parseWorldFoundationCommandHostRequest,
  type WorldFoundationCommand,
} from './world-foundation-host';

export const WORLD_AUTHORING_HOST_CHANNEL = 'neko:world:authoring' as const;

export type WorldAuthoringCommand = Extract<
  WorldFoundationCommand,
  {
    readonly operation:
      'world-project-update-draft' | 'world-project-set-review' | 'world-version-publish';
  }
>;

export interface WorldAuthoringBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly contentProjectId: string;
  readonly worldProjectId: string;
}

export type WorldAuthoringHostRequest =
  | (WorldAuthoringBinding & {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'authoring-snapshot-get';
    })
  | (WorldAuthoringBinding &
      WorldAuthoringCommand & {
        readonly requestId: string;
        readonly rendererSessionId: string;
        readonly windowId: string;
      });

export interface WorldAuthoringDiagnostic {
  readonly owner: 'world';
  readonly recordKind: 'world-project' | 'world-version';
  readonly recordId: string;
  readonly message: string;
}

export interface WorldAuthoringSnapshot {
  readonly project: WorldProject;
  readonly versions: readonly WorldVersion[];
  readonly diagnostics: readonly WorldAuthoringDiagnostic[];
}

export interface WorldAuthoringHostResult extends WorldAuthoringBinding {
  readonly requestId: string;
  readonly snapshot: WorldAuthoringSnapshot;
}

export interface OpenNekoDesktopWorldAuthoringBridge {
  readonly worldAuthoring: {
    getSnapshot(windowId: string, binding: WorldAuthoringBinding): Promise<WorldAuthoringSnapshot>;
    execute(
      windowId: string,
      binding: WorldAuthoringBinding,
      command: WorldAuthoringCommand,
    ): Promise<WorldAuthoringSnapshot>;
  };
}

export function createWorldAuthoringSnapshotRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: WorldAuthoringBinding;
}): WorldAuthoringHostRequest {
  return parseWorldAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    ...input.binding,
    operation: 'authoring-snapshot-get',
  });
}

export function createWorldAuthoringCommandRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: WorldAuthoringBinding;
  readonly command: WorldAuthoringCommand;
}): WorldAuthoringHostRequest {
  return parseWorldAuthoringHostRequest({
    requestId: input.requestId,
    rendererSessionId: input.rendererSessionId,
    windowId: input.windowId,
    ...input.binding,
    ...input.command,
  });
}

export function parseWorldAuthoringHostRequest(value: unknown): WorldAuthoringHostRequest {
  const record = requireRecord(value, 'World authoring request');
  const operation = record['operation'];
  const base = parseBase(record);
  if (operation === 'authoring-snapshot-get') {
    requireExactKeys(record, [...BASE_KEYS, 'operation']);
    return { ...base, operation };
  }
  requireExactKeys(record, [...BASE_KEYS, 'operation', 'input']);
  const parsed = parseWorldFoundationCommandHostRequest({
    requestId: base.requestId,
    operation,
    input: record['input'],
  });
  if (!isWorldAuthoringCommand(parsed)) {
    throw new Error(`World authoring operation '${String(operation)}' is not permitted.`);
  }
  if (parsed.input.worldProjectId !== base.worldProjectId) {
    throw new Error('World authoring command targets another WorldProject.');
  }
  switch (parsed.operation) {
    case 'world-project-update-draft':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'world-project-set-review':
      return { ...base, operation: parsed.operation, input: parsed.input };
    case 'world-version-publish':
      return { ...base, operation: parsed.operation, input: parsed.input };
  }
}

export function parseWorldAuthoringHostResult(
  value: unknown,
  expectedRequestId: string,
  expectedBinding: WorldAuthoringBinding,
): WorldAuthoringHostResult {
  const record = requireRecord(value, 'World authoring result');
  requireExactKeys(record, [...RESULT_KEYS, 'snapshot']);
  const base = parseResultBase(record);
  if (base.requestId !== expectedRequestId) {
    throw new Error('World authoring response request identity mismatch.');
  }
  assertBinding(base, expectedBinding);
  return { ...base, snapshot: parseWorldAuthoringSnapshot(record['snapshot']) };
}

export function parseWorldAuthoringSnapshot(value: unknown): WorldAuthoringSnapshot {
  const record = requireRecord(value, 'World authoring snapshot');
  requireExactKeys(record, ['project', 'versions', 'diagnostics']);
  const project = parseWorldProject(record['project']);
  const versions = parseArray(record['versions'], parseWorldVersion, 'World versions');
  if (versions.some((version) => version.worldProjectId !== project.worldProjectId)) {
    throw new Error('World authoring snapshot contains a version from another WorldProject.');
  }
  return {
    project,
    versions,
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'World diagnostics'),
  };
}

export function isWorldAuthoringCommand(
  command: WorldFoundationCommand,
): command is WorldAuthoringCommand {
  return (
    command.operation === 'world-project-update-draft' ||
    command.operation === 'world-project-set-review' ||
    command.operation === 'world-version-publish'
  );
}

const BASE_KEYS = [
  'requestId',
  'rendererSessionId',
  'windowId',
  'workspaceId',
  'workspaceGrantId',
  'contentProjectId',
  'worldProjectId',
] as const;
const RESULT_KEYS = [
  'requestId',
  'workspaceId',
  'workspaceGrantId',
  'contentProjectId',
  'worldProjectId',
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

function parseBinding(record: Readonly<Record<string, unknown>>): WorldAuthoringBinding {
  return {
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    contentProjectId: requireIdentity(record['contentProjectId'], 'ContentProject'),
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
  };
}

function parseDiagnostic(value: unknown): WorldAuthoringDiagnostic {
  const record = requireRecord(value, 'World authoring diagnostic');
  requireExactKeys(record, ['owner', 'recordKind', 'recordId', 'message']);
  if (record['owner'] !== 'world') throw new Error('World diagnostic owner mismatch.');
  const recordKind = record['recordKind'];
  if (recordKind !== 'world-project' && recordKind !== 'world-version') {
    throw new Error(`Unknown World authoring diagnostic kind '${String(recordKind)}'.`);
  }
  return {
    owner: 'world',
    recordKind,
    recordId: requireIdentity(record['recordId'], 'World diagnostic record'),
    message: requireIdentity(record['message'], 'World diagnostic message'),
  };
}

function assertBinding(actual: WorldAuthoringBinding, expected: WorldAuthoringBinding): void {
  for (const key of [
    'workspaceId',
    'workspaceGrantId',
    'contentProjectId',
    'worldProjectId',
  ] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`World authoring response ${key} mismatch.`);
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
    throw new Error('World authoring contract has unknown or missing fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity must be a non-empty string.`);
  }
  return value;
}
