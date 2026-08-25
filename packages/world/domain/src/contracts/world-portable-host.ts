import {
  parseWorldPortableExportSelection,
  parseWorldPortableOperationResult,
  type WorldPortableExportSelection,
  type WorldPortableOperationResult,
} from './world-portable-package';
import { parseWorldAuthoringAuthority, type WorldAuthoringAuthority } from './world-authoring-host';
import { requireExactRecord, requireIdentity } from './codec';

export const WORLD_PORTABLE_HOST_CHANNELS = {
  exportPackage: 'neko:world:portable:export-package',
  importPackage: 'neko:world:portable:import',
} as const;

export interface WorldPortableHostBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: WorldAuthoringAuthority;
}

export type WorldPortableImportTarget =
  | { readonly kind: 'new'; readonly globalWorldId: string }
  | {
      readonly kind: 'existing';
      readonly globalWorldId: string;
      readonly expectedCurrentWorldVersionId: string;
    };

export type WorldPortableHostRequest =
  | {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'export';
      readonly binding: WorldPortableHostBinding;
      readonly selection: WorldPortableExportSelection;
    }
  | {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'import';
      readonly target?: WorldPortableImportTarget;
    };

export type WorldPortableHostResult =
  | { readonly requestId: string; readonly status: 'cancelled' }
  | {
      readonly requestId: string;
      readonly status: 'completed';
      readonly result: WorldPortableOperationResult;
    };

export interface OpenNekoDesktopWorldPortableBridge {
  readonly worldPortable: {
    exportPackage(
      windowId: string,
      binding: WorldPortableHostBinding,
      selection: WorldPortableExportSelection,
    ): Promise<WorldPortableHostResult>;
    importPackage(
      windowId: string,
      target?: WorldPortableImportTarget,
    ): Promise<WorldPortableHostResult>;
  };
}

export function createWorldPortableHostRequest(
  value: WorldPortableHostRequest,
): WorldPortableHostRequest {
  return parseWorldPortableHostRequest(value);
}

export function parseWorldPortableHostRequest(value: unknown): WorldPortableHostRequest {
  const record = requireExactRecord(
    value,
    ['requestId', 'rendererSessionId', 'windowId', 'operation', 'binding', 'selection', 'target'],
    'World portable Host request',
  );
  const context = {
    requestId: requireIdentity(record['requestId'], 'World portable request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Window'),
  };
  if (record['operation'] === 'export') {
    rejectFields(record, ['target'], 'World portable export');
    return {
      ...context,
      operation: 'export',
      binding: parseWorldPortableHostBinding(record['binding']),
      selection: parseWorldPortableExportSelection(record['selection']),
    };
  }
  if (record['operation'] === 'import') {
    rejectFields(record, ['binding', 'selection'], 'World portable import');
    return {
      ...context,
      operation: 'import',
      ...(!Object.prototype.hasOwnProperty.call(record, 'target')
        ? {}
        : { target: parseWorldPortableImportTarget(record['target']) }),
    };
  }
  throw new Error(`Unknown World portable operation '${String(record['operation'])}'.`);
}

export function parseWorldPortableHostResult(
  value: unknown,
  expectedRequestId: string,
): WorldPortableHostResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'status', 'result'],
    'World portable Host result',
  );
  const requestId = requireIdentity(record['requestId'], 'World portable response request');
  if (requestId !== expectedRequestId) throw new Error('World portable response request mismatch.');
  if (record['status'] === 'cancelled') {
    return { requestId, status: 'cancelled' };
  }
  if (record['status'] === 'completed') {
    rejectFields(record, ['target'], 'World portable completed result');
    return {
      requestId,
      status: 'completed',
      result: parseWorldPortableOperationResult(record['result']),
    };
  }
  throw new Error(`Unknown World portable result status '${String(record['status'])}'.`);
}

function parseWorldPortableImportTarget(value: unknown): WorldPortableImportTarget {
  const record = requireExactRecord(
    value,
    ['kind', 'globalWorldId', 'expectedCurrentWorldVersionId'],
    'World portable import target',
  );
  if (record['kind'] === 'new') {
    if (record['expectedCurrentWorldVersionId'] !== undefined) {
      throw new Error('New World portable import target cannot carry a current version.');
    }
    return {
      kind: 'new',
      globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld'),
    };
  }
  if (record['kind'] === 'existing') {
    return {
      kind: 'existing',
      globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld'),
      expectedCurrentWorldVersionId: requireIdentity(
        record['expectedCurrentWorldVersionId'],
        'GlobalWorld current WorldVersion',
      ),
    };
  }
  throw new Error('World portable import target kind is unsupported.');
}

export function parseWorldPortableHostBinding(value: unknown): WorldPortableHostBinding {
  const record = requireExactRecord(
    value,
    ['workspaceId', 'workspaceGrantId', 'authority'],
    'World portable Host binding',
  );
  return {
    workspaceId: requireIdentity(record['workspaceId'], 'World portable Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'World portable Workspace grant'),
    authority: parseWorldAuthoringAuthority(record['authority']),
  };
}

function rejectFields(
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  label: string,
): void {
  const present = fields.filter((field) => record[field] !== undefined);
  if (present.length > 0) throw new Error(`${label} cannot carry ${present.join(', ')}.`);
}
