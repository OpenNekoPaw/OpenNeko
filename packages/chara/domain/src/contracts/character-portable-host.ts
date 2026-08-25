import type { CharacterAuthoringAuthority } from './character-authoring-host';
import { CHARACTER_REPRESENTATION_KINDS, type CharacterRepresentationKind } from './character';

export const CHARACTER_PORTABLE_HOST_CHANNELS = {
  exportScope: 'neko:character:portable:export-scope',
  exportPackage: 'neko:character:portable:export',
  importPackage: 'neko:character:portable:import',
} as const;

export interface CharacterPortableHostBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: CharacterAuthoringAuthority;
}

export interface CharacterPortableExportSelection {
  readonly characterVersionId: string;
  readonly embeddedRepresentationIds: readonly string[];
}

export type CharacterPortableImportTarget =
  | { readonly kind: 'new'; readonly globalCharacterId: string }
  | {
      readonly kind: 'existing';
      readonly globalCharacterId: string;
      readonly expectedCurrentCharacterVersionId: string;
    };

export interface CharacterPortableExportScope {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly characterVersionIds: readonly string[];
  readonly representations: readonly {
    readonly representationId: string;
    readonly kind: CharacterRepresentationKind;
    readonly canEmbed: boolean;
    readonly ownedFileCount: number;
    readonly ownedByteLength: number;
  }[];
}

export interface CharacterPortableHostContext {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
}

export type CharacterPortableHostRequest =
  | (CharacterPortableHostContext &
      CharacterPortableHostBinding & {
        readonly operation: 'export-scope';
        readonly characterProjectId: string;
      })
  | (CharacterPortableHostContext &
      CharacterPortableHostBinding & {
        readonly operation: 'export';
        readonly characterProjectId: string;
        readonly selection: CharacterPortableExportSelection;
      })
  | (CharacterPortableHostContext & {
      readonly operation: 'import';
      readonly target?: CharacterPortableImportTarget;
    });

export type CharacterPortableHostResult =
  | { readonly requestId: string; readonly status: 'cancelled' | 'exported' }
  | {
      readonly requestId: string;
      readonly status: 'scope-ready';
      readonly scope: CharacterPortableExportScope;
    }
  | {
      readonly requestId: string;
      readonly status: 'imported';
      readonly globalCharacterId: string;
    };

export interface OpenNekoDesktopCharacterPortableBridge {
  readonly characterPortable: {
    getExportScope(
      windowId: string,
      binding: CharacterPortableHostBinding,
      characterProjectId: string,
    ): Promise<CharacterPortableHostResult>;
    exportPackage(
      windowId: string,
      binding: CharacterPortableHostBinding,
      characterProjectId: string,
      selection: CharacterPortableExportSelection,
    ): Promise<CharacterPortableHostResult>;
    importPackage(
      windowId: string,
      target?: CharacterPortableImportTarget,
    ): Promise<CharacterPortableHostResult>;
  };
}

export function parseCharacterPortableHostRequest(value: unknown): CharacterPortableHostRequest {
  const record = requireRecord(value, 'Character portable Host request');
  const operation = record['operation'];
  if (operation === 'export-scope') {
    const base = parseBase(record);
    requireExactKeys(record, [...BASE_KEYS, 'operation', 'characterProjectId']);
    return {
      ...base,
      operation,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (operation === 'export') {
    const base = parseBase(record);
    requireExactKeys(record, [...BASE_KEYS, 'operation', 'characterProjectId', 'selection']);
    return {
      ...base,
      operation,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
      selection: parseExportSelection(record['selection']),
    };
  }
  if (operation === 'import') {
    const context = parseContext(record);
    requireExactKeys(
      record,
      !Object.prototype.hasOwnProperty.call(record, 'target')
        ? [...CONTEXT_KEYS, 'operation']
        : [...CONTEXT_KEYS, 'operation', 'target'],
    );
    return {
      ...context,
      operation,
      ...(record['target'] === undefined
        ? {}
        : { target: parseCharacterPortableImportTarget(record['target']) }),
    };
  }
  throw new Error(`Unknown Character portable Host operation '${String(operation)}'.`);
}

export function parseCharacterPortableHostResult(
  value: unknown,
  requestId: string,
): CharacterPortableHostResult {
  const record = requireRecord(value, 'Character portable Host result');
  if (record['requestId'] !== requestId) {
    throw new Error('Character portable Host response does not match its request.');
  }
  const status = record['status'];
  if (status === 'cancelled' || status === 'exported') {
    requireExactKeys(record, ['requestId', 'status']);
    return { requestId, status };
  }
  if (status === 'scope-ready') {
    requireExactKeys(record, ['requestId', 'status', 'scope']);
    return { requestId, status, scope: parseCharacterPortableExportScope(record['scope']) };
  }
  if (status === 'imported') {
    requireExactKeys(record, ['requestId', 'status', 'globalCharacterId']);
    return {
      requestId,
      status,
      globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter'),
    };
  }
  throw new Error(`Unknown Character portable Host result '${String(status)}'.`);
}

export function createCharacterPortableHostRequest(
  context: CharacterPortableHostContext,
  binding: CharacterPortableHostBinding | undefined,
  operation:
    | { readonly kind: 'export-scope'; readonly characterProjectId: string }
    | {
        readonly kind: 'export';
        readonly characterProjectId: string;
        readonly selection: CharacterPortableExportSelection;
      }
    | { readonly kind: 'import'; readonly target?: CharacterPortableImportTarget },
): CharacterPortableHostRequest {
  return parseCharacterPortableHostRequest({
    ...context,
    ...(binding ?? {}),
    operation: operation.kind,
    ...(operation.kind === 'export-scope'
      ? { characterProjectId: operation.characterProjectId }
      : operation.kind === 'export'
        ? { characterProjectId: operation.characterProjectId, selection: operation.selection }
        : operation.target === undefined
          ? {}
          : { target: operation.target }),
  });
}

function parseCharacterPortableImportTarget(value: unknown): CharacterPortableImportTarget {
  const record = requireRecord(value, 'Character portable import target');
  const kind = record['kind'];
  if (kind === 'new') {
    requireExactKeys(record, ['kind', 'globalCharacterId']);
    return {
      kind,
      globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter'),
    };
  }
  if (kind === 'existing') {
    requireExactKeys(record, ['kind', 'globalCharacterId', 'expectedCurrentCharacterVersionId']);
    return {
      kind,
      globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter'),
      expectedCurrentCharacterVersionId: requireIdentity(
        record['expectedCurrentCharacterVersionId'],
        'GlobalCharacter current CharacterVersion',
      ),
    };
  }
  throw new Error('Character portable import target kind is unsupported.');
}

export function parseCharacterPortableExportScope(value: unknown): CharacterPortableExportScope {
  const record = requireRecord(value, 'Character portable export scope');
  requireExactKeys(record, [
    'characterProjectId',
    'displayName',
    'characterVersionIds',
    'representations',
  ]);
  const characterVersionIds = identityList(record['characterVersionIds']);
  const representations = requireUnique(
    requireArray(record['representations'], (value) => {
      const representation = requireRecord(value, 'Character portable representation scope');
      requireExactKeys(representation, [
        'representationId',
        'kind',
        'canEmbed',
        'ownedFileCount',
        'ownedByteLength',
      ]);
      const kind = representation['kind'];
      if (
        typeof kind !== 'string' ||
        !CHARACTER_REPRESENTATION_KINDS.includes(kind as CharacterRepresentationKind)
      ) {
        throw new Error('Character portable representation kind is unsupported.');
      }
      const canEmbed = requireBoolean(representation['canEmbed']);
      const ownedFileCount = requireNonNegativeInteger(representation['ownedFileCount']);
      const ownedByteLength = requireNonNegativeInteger(representation['ownedByteLength']);
      if (canEmbed !== ownedFileCount > 0) {
        throw new Error('Character portable embedding availability must match owned files.');
      }
      return {
        representationId: requireIdentity(
          representation['representationId'],
          'Character representation',
        ),
        kind: kind as CharacterRepresentationKind,
        canEmbed,
        ownedFileCount,
        ownedByteLength,
      };
    }),
    (representation) => representation.representationId,
  );
  return {
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    displayName: requireIdentity(record['displayName'], 'Character display name'),
    characterVersionIds,
    representations,
  };
}

const CONTEXT_KEYS = ['requestId', 'rendererSessionId', 'windowId'] as const;

const BASE_KEYS = [
  'requestId',
  'rendererSessionId',
  'windowId',
  'workspaceId',
  'workspaceGrantId',
  'authority',
] as const;

function parseBase(
  record: Readonly<Record<string, unknown>>,
): CharacterPortableHostContext & CharacterPortableHostBinding {
  const authority = requireRecord(record['authority'], 'Character portable authority');
  const kind = authority['kind'];
  requireExactKeys(authority, ['kind', 'projectId']);
  if (kind !== 'project') {
    throw new Error(`Unknown Character portable authority '${String(kind)}'.`);
  }
  return {
    ...parseContext(record),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    authority: {
      kind,
      projectId: requireIdentity(authority['projectId'], 'Project'),
    },
  };
}

function parseContext(record: Readonly<Record<string, unknown>>): CharacterPortableHostContext {
  return {
    requestId: requireIdentity(record['requestId'], 'Character portable request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Window'),
  };
}

function parseExportSelection(value: unknown): CharacterPortableExportSelection {
  const record = requireRecord(value, 'Character portable export selection');
  requireExactKeys(record, ['characterVersionId', 'embeddedRepresentationIds']);
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character portable CharacterVersion selection',
    ),
    embeddedRepresentationIds: identityList(record['embeddedRepresentationIds']),
  };
}

function identityList(value: unknown): readonly string[] {
  if (!Array.isArray(value))
    throw new Error('Character portable identity selection must be an array.');
  const identities = value.map((item) => requireIdentity(item, 'Character portable selection'));
  if (new Set(identities).size !== identities.length) {
    throw new Error('Character portable identity selection must be unique.');
  }
  return identities;
}

function requireArray<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error('Character portable payload field must be an array.');
  return value.map(parse);
}

function requireUnique<T>(items: readonly T[], identity: (item: T) => string): readonly T[] {
  if (new Set(items.map(identity)).size !== items.length) {
    throw new Error('Character portable export scope identities must be unique.');
  }
  return items;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Character portable boolean field is invalid.');
  return value;
}

function requireNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Character portable numeric field must be a non-negative integer.');
  }
  return value;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const supported = new Set(keys);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !supported.has(key))
  ) {
    throw new Error('Character portable payload contains unsupported or missing fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} identity is required.`);
  return value;
}
