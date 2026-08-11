import {
  parseWorldDefinition,
  parseWorldProject,
  parseWorldRun,
  parseWorldSave,
  parseWorldVersion,
  type WorldDefinition,
  type WorldProject,
  type WorldRun,
  type WorldSave,
  type WorldVersion,
} from './world';
import {
  parseWorldTransformationCandidate,
  type WorldTransformationCandidate,
} from './world-transformation';
import { requireIdentity, requireNonNegativeInteger, requireOneOf } from './codec';

export const WORLD_FOUNDATION_HOST_CHANNEL = 'neko:world:foundation' as const;

export interface WorldFoundationHostRequest {
  readonly requestId: string;
  readonly operation: 'snapshot-get';
}

export type WorldFoundationCommand =
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
      readonly operation: 'world-preview-run-create';
      readonly input: {
        readonly worldVersionId: string;
        readonly worldRunId: string;
        readonly worldSaveId: string;
        readonly branchId: string;
        readonly saveLabel: string;
      };
    }
  | {
      readonly operation: 'world-transformation-state-commit';
      readonly input: WorldTransformationCandidate;
    }
  | {
      readonly operation: 'world-preview-branch-fork';
      readonly input: {
        readonly worldRunId: string;
        readonly worldSaveId: string;
        readonly parentBranchId: string;
        readonly forkedFromWorldEventId: string;
        readonly branchId: string;
        readonly expectedWorldStateRevision: number;
      };
    }
  | {
      readonly operation: 'world-preview-branch-activate';
      readonly input: {
        readonly worldRunId: string;
        readonly worldSaveId: string;
        readonly branchId: string;
      };
    };

export type WorldFoundationCommandHostRequest = WorldFoundationCommand & {
  readonly requestId: string;
};

export type WorldFoundationAnyHostRequest =
  WorldFoundationHostRequest | WorldFoundationCommandHostRequest;

export interface WorldFoundationDiagnostic {
  readonly owner: 'world';
  readonly recordKind: 'world-project' | 'world-version' | 'world-runtime';
  readonly recordId: string;
  readonly message: string;
}

export interface WorldFoundationSnapshot {
  readonly world: {
    readonly projects: readonly WorldProject[];
    readonly versions: readonly WorldVersion[];
    readonly runtimes: readonly { readonly run: WorldRun; readonly save: WorldSave }[];
  };
  readonly diagnostics: readonly WorldFoundationDiagnostic[];
}

export interface WorldFoundationHostResult {
  readonly requestId: string;
  readonly snapshot: WorldFoundationSnapshot;
}

export interface OpenNekoDesktopWorldBridge {
  readonly worldFoundation: {
    getSnapshot(): Promise<WorldFoundationSnapshot>;
    execute(command: WorldFoundationCommand): Promise<WorldFoundationSnapshot>;
  };
}

export function createWorldFoundationHostRequest(requestId: string): WorldFoundationHostRequest {
  return { requestId: requireIdentity(requestId, 'request'), operation: 'snapshot-get' };
}

export function createWorldFoundationCommandHostRequest(
  requestId: string,
  command: WorldFoundationCommand,
): WorldFoundationCommandHostRequest {
  return parseWorldFoundationCommandHostRequest({ ...command, requestId });
}

export function parseWorldFoundationAnyHostRequest(value: unknown): WorldFoundationAnyHostRequest {
  const record = recordValue(value, 'World Foundation request');
  return record['operation'] === 'snapshot-get'
    ? parseWorldFoundationHostRequest(value)
    : parseWorldFoundationCommandHostRequest(value);
}

export function parseWorldFoundationHostRequest(value: unknown): WorldFoundationHostRequest {
  const record = exactRecord(value, ['requestId', 'operation'], 'World Foundation request');
  if (record['operation'] !== 'snapshot-get') {
    throw new Error(`Unknown World Foundation operation '${String(record['operation'])}'.`);
  }
  return { requestId: requireIdentity(record['requestId'], 'request'), operation: 'snapshot-get' };
}

export function parseWorldFoundationCommandHostRequest(
  value: unknown,
): WorldFoundationCommandHostRequest {
  const record = exactRecord(
    value,
    ['requestId', 'operation', 'input'],
    'World Foundation command',
  );
  const requestId = requireIdentity(record['requestId'], 'request');
  const operation = record['operation'];
  switch (operation) {
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
          reviewStatus: requireOneOf(
            input['reviewStatus'],
            ['draft', 'ready', 'blocked'] as const,
            'World review status',
          ),
        },
      };
    }
    case 'world-version-publish': {
      const input = exactRecord(
        record['input'],
        ['worldProjectId', 'worldVersionId', 'label'],
        'World publication input',
      );
      return {
        requestId,
        operation,
        input: {
          worldProjectId: requireIdentity(input['worldProjectId'], 'WorldProject'),
          worldVersionId: requireIdentity(input['worldVersionId'], 'WorldVersion'),
          label: requireIdentity(input['label'], 'World version label'),
        },
      };
    }
    case 'world-preview-run-create': {
      const input = exactRecord(
        record['input'],
        ['worldVersionId', 'worldRunId', 'worldSaveId', 'branchId', 'saveLabel'],
        'World preview run input',
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
    case 'world-transformation-state-commit':
      return { requestId, operation, input: parseWorldTransformationCandidate(record['input']) };
    case 'world-preview-branch-fork': {
      const input = exactRecord(
        record['input'],
        [
          'worldRunId',
          'worldSaveId',
          'parentBranchId',
          'forkedFromWorldEventId',
          'branchId',
          'expectedWorldStateRevision',
        ],
        'World branch fork input',
      );
      return {
        requestId,
        operation,
        input: {
          worldRunId: requireIdentity(input['worldRunId'], 'WorldRun'),
          worldSaveId: requireIdentity(input['worldSaveId'], 'WorldSave'),
          parentBranchId: requireIdentity(input['parentBranchId'], 'World parent branch'),
          forkedFromWorldEventId: requireIdentity(input['forkedFromWorldEventId'], 'WorldEvent'),
          branchId: requireIdentity(input['branchId'], 'World branch'),
          expectedWorldStateRevision: requireNonNegativeInteger(
            input['expectedWorldStateRevision'],
            'World state revision',
          ),
        },
      };
    }
    case 'world-preview-branch-activate': {
      const input = exactRecord(
        record['input'],
        ['worldRunId', 'worldSaveId', 'branchId'],
        'World branch activation input',
      );
      return {
        requestId,
        operation,
        input: {
          worldRunId: requireIdentity(input['worldRunId'], 'WorldRun'),
          worldSaveId: requireIdentity(input['worldSaveId'], 'WorldSave'),
          branchId: requireIdentity(input['branchId'], 'World branch'),
        },
      };
    }
    default:
      throw new Error(`Unknown World Foundation operation '${String(operation)}'.`);
  }
}

export function parseWorldFoundationHostResult(
  value: unknown,
  expectedRequestId: string,
): WorldFoundationHostResult {
  const record = exactRecord(value, ['requestId', 'snapshot'], 'World Foundation result');
  const requestId = requireIdentity(record['requestId'], 'response request');
  if (requestId !== expectedRequestId) {
    throw new Error('World Foundation response request identity mismatch.');
  }
  return { requestId, snapshot: parseWorldFoundationSnapshot(record['snapshot']) };
}

export function parseWorldFoundationSnapshot(value: unknown): WorldFoundationSnapshot {
  const record = exactRecord(value, ['world', 'diagnostics'], 'World Foundation snapshot');
  const world = exactRecord(
    record['world'],
    ['projects', 'versions', 'runtimes'],
    'World Foundation catalog',
  );
  return Object.freeze({
    world: Object.freeze({
      projects: parseArray(world['projects'], parseWorldProject, 'World projects'),
      versions: parseArray(world['versions'], parseWorldVersion, 'World versions'),
      runtimes: parseArray(world['runtimes'], parseRuntime, 'World runtimes'),
    }),
    diagnostics: parseArray(record['diagnostics'], parseDiagnostic, 'World diagnostics'),
  });
}

function parseRuntime(value: unknown): { readonly run: WorldRun; readonly save: WorldSave } {
  const record = exactRecord(value, ['run', 'save'], 'World runtime');
  const run = parseWorldRun(record['run']);
  const save = parseWorldSave(record['save']);
  if (
    run.worldRunId !== save.worldRunId ||
    run.worldSaveId !== save.worldSaveId ||
    run.worldVersionId !== save.worldVersionId ||
    run.branchId !== save.activeBranchId
  ) {
    throw new Error('World runtime projection has mismatched authority.');
  }
  return Object.freeze({ run, save });
}

function parseDiagnostic(value: unknown): WorldFoundationDiagnostic {
  const record = exactRecord(
    value,
    ['owner', 'recordKind', 'recordId', 'message'],
    'World Foundation diagnostic',
  );
  if (record['owner'] !== 'world') throw new Error('World diagnostic owner must be world.');
  return Object.freeze({
    owner: 'world',
    recordKind: requireOneOf(
      record['recordKind'],
      ['world-project', 'world-version', 'world-runtime'] as const,
      'World diagnostic record kind',
    ),
    recordId: requireIdentity(record['recordId'], 'World diagnostic record'),
    message: requireIdentity(record['message'], 'World diagnostic message'),
  });
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return Object.freeze(value.map(parse));
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported or missing fields.`);
  }
  return record;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}
