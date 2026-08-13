import type { CharacterAuthoringAuthority } from './character-authoring-host';
import {
  parseCharacterPortablePackagePreview,
  type CharacterPortablePackagePreview,
} from './character-portable-package';
import { CHARACTER_REPRESENTATION_KINDS, type CharacterRepresentationKind } from './character';

export const CHARACTER_PORTABLE_HOST_CHANNELS = {
  exportScope: 'neko:character:portable:export-scope',
  exportPackage: 'neko:character:portable:export',
  previewImport: 'neko:character:portable:import-preview',
  commitImport: 'neko:character:portable:import-commit',
  cancelImport: 'neko:character:portable:import-cancel',
} as const;

export interface CharacterPortableHostBinding {
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: CharacterAuthoringAuthority;
}

export interface CharacterPortableExportSelection {
  readonly characterStorylineIds: readonly string[];
  readonly authoringTestSnapshotIds: readonly string[];
  readonly embeddedRepresentationIds: readonly string[];
}

export interface CharacterPortableExportScope {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly characterVersionIds: readonly string[];
  readonly branchHeadCharacterVersionIds: readonly string[];
  readonly unlinkedCharacterVersionIds: readonly string[];
  readonly characterStorylines: readonly {
    readonly characterStorylineId: string;
    readonly displayName: string;
  }[];
  readonly authoringTestSnapshotIds: readonly string[];
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
  | (CharacterPortableHostContext &
      CharacterPortableHostBinding & { readonly operation: 'import-preview' })
  | (CharacterPortableHostContext &
      CharacterPortableHostBinding & {
        readonly operation: 'import-commit' | 'import-cancel';
        readonly importReceiptId: string;
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
      readonly status: 'preview-ready';
      readonly importReceiptId: string;
      readonly preview: CharacterPortablePackagePreview;
    }
  | {
      readonly requestId: string;
      readonly status: 'installed';
      readonly characterProjectId: string;
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
    previewImport(
      windowId: string,
      binding: CharacterPortableHostBinding,
    ): Promise<CharacterPortableHostResult>;
    commitImport(
      windowId: string,
      binding: CharacterPortableHostBinding,
      importReceiptId: string,
    ): Promise<CharacterPortableHostResult>;
    cancelImport(
      windowId: string,
      binding: CharacterPortableHostBinding,
      importReceiptId: string,
    ): Promise<CharacterPortableHostResult>;
  };
}

export function parseCharacterPortableHostRequest(value: unknown): CharacterPortableHostRequest {
  const record = requireRecord(value, 'Character portable Host request');
  const operation = record['operation'];
  const base = parseBase(record);
  if (operation === 'export-scope') {
    requireExactKeys(record, [...BASE_KEYS, 'operation', 'characterProjectId']);
    return {
      ...base,
      operation,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (operation === 'export') {
    requireExactKeys(record, [...BASE_KEYS, 'operation', 'characterProjectId', 'selection']);
    return {
      ...base,
      operation,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
      selection: parseExportSelection(record['selection']),
    };
  }
  if (operation === 'import-preview') {
    requireExactKeys(record, [...BASE_KEYS, 'operation']);
    return { ...base, operation };
  }
  if (operation === 'import-commit' || operation === 'import-cancel') {
    requireExactKeys(record, [...BASE_KEYS, 'operation', 'importReceiptId']);
    return {
      ...base,
      operation,
      importReceiptId: requireIdentity(record['importReceiptId'], 'Character import receipt'),
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
  if (status === 'preview-ready') {
    requireExactKeys(record, ['requestId', 'status', 'importReceiptId', 'preview']);
    return {
      requestId,
      status,
      importReceiptId: requireIdentity(record['importReceiptId'], 'Character import receipt'),
      preview: parseCharacterPortablePackagePreview(record['preview']),
    };
  }
  if (status === 'installed') {
    requireExactKeys(record, ['requestId', 'status', 'characterProjectId']);
    return {
      requestId,
      status,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  throw new Error(`Unknown Character portable Host result '${String(status)}'.`);
}

export function createCharacterPortableHostRequest(
  context: CharacterPortableHostContext,
  binding: CharacterPortableHostBinding,
  operation:
    | { readonly kind: 'export-scope'; readonly characterProjectId: string }
    | {
        readonly kind: 'export';
        readonly characterProjectId: string;
        readonly selection: CharacterPortableExportSelection;
      }
    | { readonly kind: 'import-preview' }
    | { readonly kind: 'import-commit' | 'import-cancel'; readonly importReceiptId: string },
): CharacterPortableHostRequest {
  return parseCharacterPortableHostRequest({
    ...context,
    ...binding,
    operation: operation.kind,
    ...(operation.kind === 'export-scope'
      ? { characterProjectId: operation.characterProjectId }
      : operation.kind === 'export'
        ? { characterProjectId: operation.characterProjectId, selection: operation.selection }
        : operation.kind === 'import-preview'
          ? {}
          : { importReceiptId: operation.importReceiptId }),
  });
}

export function parseCharacterPortableExportScope(value: unknown): CharacterPortableExportScope {
  const record = requireRecord(value, 'Character portable export scope');
  requireExactKeys(record, [
    'characterProjectId',
    'displayName',
    'characterVersionIds',
    'branchHeadCharacterVersionIds',
    'unlinkedCharacterVersionIds',
    'characterStorylines',
    'authoringTestSnapshotIds',
    'representations',
  ]);
  const characterVersionIds = identityList(record['characterVersionIds']);
  const branchHeadCharacterVersionIds = identityList(record['branchHeadCharacterVersionIds']);
  const unlinkedCharacterVersionIds = identityList(record['unlinkedCharacterVersionIds']);
  const versionIds = new Set(characterVersionIds);
  if (
    [...branchHeadCharacterVersionIds, ...unlinkedCharacterVersionIds].some(
      (identity) => !versionIds.has(identity),
    )
  ) {
    throw new Error('Character portable export scope references an unavailable CharacterVersion.');
  }
  if (
    branchHeadCharacterVersionIds.some((identity) => unlinkedCharacterVersionIds.includes(identity))
  ) {
    throw new Error('Character portable branch heads and unlinked versions must be disjoint.');
  }
  const characterStorylines = requireUnique(
    requireArray(record['characterStorylines'], (value) => {
      const storyline = requireRecord(value, 'Character portable Storyline scope');
      requireExactKeys(storyline, ['characterStorylineId', 'displayName']);
      return {
        characterStorylineId: requireIdentity(
          storyline['characterStorylineId'],
          'CharacterStoryline',
        ),
        displayName: requireIdentity(storyline['displayName'], 'CharacterStoryline display name'),
      };
    }),
    (storyline) => storyline.characterStorylineId,
  );
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
    branchHeadCharacterVersionIds,
    unlinkedCharacterVersionIds,
    characterStorylines,
    authoringTestSnapshotIds: identityList(record['authoringTestSnapshotIds']),
    representations,
  };
}

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
  if (kind === 'standalone-library') requireExactKeys(authority, ['kind']);
  else if (kind === 'content-project') requireExactKeys(authority, ['kind', 'contentProjectId']);
  else throw new Error(`Unknown Character portable authority '${String(kind)}'.`);
  return {
    requestId: requireIdentity(record['requestId'], 'Character portable request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
    authority:
      kind === 'standalone-library'
        ? { kind }
        : {
            kind,
            contentProjectId: requireIdentity(authority['contentProjectId'], 'Content Project'),
          },
  };
}

function parseExportSelection(value: unknown): CharacterPortableExportSelection {
  const record = requireRecord(value, 'Character portable export selection');
  requireExactKeys(record, [
    'characterStorylineIds',
    'authoringTestSnapshotIds',
    'embeddedRepresentationIds',
  ]);
  return {
    characterStorylineIds: identityList(record['characterStorylineIds']),
    authoringTestSnapshotIds: identityList(record['authoringTestSnapshotIds']),
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
