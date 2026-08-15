import {
  parseWorldDefinition,
  parseWorldProject,
  parseWorldVersion,
  type WorldDefinition,
  type WorldProject,
  type WorldReviewStatus,
  type WorldVersion,
} from './world';

export const WORLD_AUTHORING_HOST_CHANNEL = 'neko:world:authoring' as const;

export interface WorldAuthoringAuthority {
  readonly kind: 'project';
  readonly projectId: string;
}

export type WorldAuthoringCommand =
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
      readonly input: {
        readonly worldProjectId: string;
        readonly draft: WorldDefinition;
      };
    }
  | {
      readonly operation: 'world-project-set-review';
      readonly input: {
        readonly worldProjectId: string;
        readonly reviewStatus: WorldReviewStatus;
      };
    }
  | {
      readonly operation: 'world-version-publish';
      readonly input: {
        readonly worldProjectId: string;
        readonly worldVersionId: string;
        readonly label: string;
      };
    };

export interface WorldAuthoringBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: WorldAuthoringAuthority;
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
  const parsed = parseWorldAuthoringCommand({ operation, input: record['input'] });
  if (parsed.input.worldProjectId !== base.worldProjectId) {
    throw new Error('World authoring command targets another WorldProject.');
  }
  switch (parsed.operation) {
    case 'world-project-create':
      return { ...base, operation: parsed.operation, input: parsed.input };
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

const BASE_KEYS = [
  'requestId',
  'rendererSessionId',
  'windowId',
  'workspaceId',
  'workspaceGrantId',
  'authority',
  'worldProjectId',
] as const;
const RESULT_KEYS = [
  'requestId',
  'workspaceId',
  'workspaceGrantId',
  'authority',
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
    authority: parseWorldAuthoringAuthority(record['authority']),
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

export function parseWorldAuthoringCommand(value: unknown): WorldAuthoringCommand {
  const command = requireRecord(value, 'World authoring command');
  requireExactKeys(command, ['operation', 'input']);
  const operation = command['operation'];
  const input = requireRecord(command['input'], 'World authoring input');
  switch (operation) {
    case 'world-project-create':
      requireExactKeys(input, ['worldProjectId', 'title', 'draft']);
      return {
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          title: requireIdentity(input['title'], 'World title'),
          draft: parseWorldDefinition(input['draft']),
        },
      };
    case 'world-project-update-draft':
      requireExactKeys(input, ['worldProjectId', 'draft']);
      return {
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          draft: parseWorldDefinition(input['draft']),
        },
      };
    case 'world-project-set-review': {
      requireExactKeys(input, ['worldProjectId', 'reviewStatus']);
      const reviewStatus = input['reviewStatus'];
      if (reviewStatus !== 'draft' && reviewStatus !== 'ready' && reviewStatus !== 'blocked') {
        throw new Error(`Unknown World review status '${String(reviewStatus)}'.`);
      }
      return {
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          reviewStatus,
        },
      };
    }
    case 'world-version-publish':
      requireExactKeys(input, ['worldProjectId', 'worldVersionId', 'label']);
      return {
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          worldVersionId: requireIdentity(input['worldVersionId'], 'WorldVersion'),
          label: requireIdentity(input['label'], 'World version label'),
        },
      };
    default:
      throw new Error(`World authoring operation '${String(operation)}' is not permitted.`);
  }
}

function assertBinding(actual: WorldAuthoringBinding, expected: WorldAuthoringBinding): void {
  for (const key of ['workspaceId', 'workspaceGrantId', 'worldProjectId'] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`World authoring response ${key} mismatch.`);
    }
  }
  if (
    actual.authority.kind !== expected.authority.kind ||
    actual.authority.projectId !== expected.authority.projectId
  ) {
    throw new Error('World authoring response authority mismatch.');
  }
}

export function parseWorldAuthoringAuthority(value: unknown): WorldAuthoringAuthority {
  const record = requireRecord(value, 'World authoring authority');
  requireExactKeys(record, ['kind', 'projectId']);
  if (record['kind'] !== 'project') {
    throw new Error(`Unknown World authoring authority '${String(record['kind'])}'.`);
  }
  return {
    kind: 'project',
    projectId: requireIdentity(record['projectId'], 'World authoring Project'),
  };
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
