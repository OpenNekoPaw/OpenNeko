import { validateContentLocator, type ContentLocator } from '@neko/content';
import {
  GLOBAL_LIBRARY_OWNERS,
  parseGlobalAssetItem,
  parseGlobalMediaLibraryItem,
  type GlobalLibraryCatalogSort,
  type GlobalLibraryItem,
  type GlobalLibraryOwner,
  type GlobalLibrarySortDirection,
  type GlobalLibraryViewMode,
  type GlobalMediaLibraryLocationKind,
} from '../global-library/contract';

export interface AssetCenterSessionIdentity {
  readonly assetCenterSessionId: string;
  readonly windowId: string;
}

export interface AssetCenterDirectoryContext {
  readonly libraryId: string;
  readonly libraryLabel: string;
  readonly locationKind: GlobalMediaLibraryLocationKind;
  readonly relativePath: string;
}

export interface AssetCenterFilterProjection {
  readonly catalog: GlobalLibraryOwner;
  readonly query: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly viewMode: GlobalLibraryViewMode;
  readonly directory?: AssetCenterDirectoryContext;
}

export interface AssetCenterCatalogEntry {
  readonly item: GlobalLibraryItem;
  readonly contentLocator?: ContentLocator;
}

export type AssetCenterCatalogProjection =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly owner: GlobalLibraryOwner;
      readonly entries: readonly AssetCenterCatalogEntry[];
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: AssetCenterDiagnostic;
    };

export interface AssetCenterSelectionProjection {
  readonly owner: GlobalLibraryOwner;
  readonly itemId: string;
  readonly item: GlobalLibraryItem;
  readonly contentLocator: ContentLocator;
}

export interface AssetCenterPresentationSnapshot {
  readonly filter: AssetCenterFilterProjection;
  readonly selection?: {
    readonly owner: GlobalLibraryOwner;
    readonly itemId: string;
  };
}

export interface AssetCenterDiagnostic {
  readonly code: 'asset-center-catalog-unavailable';
  readonly message: string;
}

export type AssetCenterPreviewProjection =
  | { readonly status: 'empty' }
  | { readonly status: 'loading'; readonly itemId: string }
  | {
      readonly status: 'ready';
      readonly itemId: string;
      readonly previewSessionId: string;
    }
  | {
      readonly status: 'unavailable';
      readonly itemId: string;
      readonly diagnostic: {
        readonly code: 'preview-unsupported-kind' | 'preview-source-unavailable';
        readonly message: string;
      };
    };

export interface AssetCenterSessionProjection {
  readonly identity: AssetCenterSessionIdentity;
  readonly filter: AssetCenterFilterProjection;
  readonly catalog: AssetCenterCatalogProjection;
  readonly selection?: AssetCenterSelectionProjection;
  readonly preview: AssetCenterPreviewProjection;
}

export function createAssetCenterSessionId(windowId: string): string {
  return `asset-center:${requireIdentity(windowId, 'Asset Center Window')}`;
}

export function createDefaultAssetCenterFilter(): AssetCenterFilterProjection {
  return {
    catalog: 'global-asset-library',
    query: '',
    sortBy: 'name',
    sortDirection: 'ascending',
    viewMode: 'list',
  };
}

export function parseAssetCenterSessionIdentity(value: unknown): AssetCenterSessionIdentity {
  const record = requireExactRecord(
    value,
    ['assetCenterSessionId', 'windowId'],
    'Asset Center session identity is invalid.',
  );
  return {
    assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center session'),
    windowId: requireIdentity(record['windowId'], 'Asset Center Window'),
  };
}

export function parseAssetCenterFilterProjection(value: unknown): AssetCenterFilterProjection {
  const record = requireExactRecord(
    value,
    ['catalog', 'query', 'sortBy', 'sortDirection', 'viewMode', 'directory'],
    'Asset Center filter projection is invalid.',
  );
  const catalog = requireOneOf(record['catalog'], GLOBAL_LIBRARY_OWNERS, 'catalog');
  const directory =
    record['directory'] === undefined
      ? undefined
      : parseAssetCenterDirectoryContext(record['directory']);
  if (catalog !== 'media-library' && directory) {
    throw invalid('Asset Center directory context requires the Media Library catalog.');
  }
  return {
    catalog,
    query: requireString(record['query'], 'Asset Center query must be a string.'),
    sortBy: requireOneOf(record['sortBy'], ['name', 'modifiedAt'] as const, 'sort'),
    sortDirection: requireOneOf(
      record['sortDirection'],
      ['ascending', 'descending'] as const,
      'sort direction',
    ),
    viewMode: requireOneOf(record['viewMode'], ['list', 'grid'] as const, 'view mode'),
    ...(directory ? { directory } : {}),
  };
}

export function parseAssetCenterPresentationSnapshot(
  value: unknown,
): AssetCenterPresentationSnapshot {
  const record = requireExactRecord(
    value,
    ['filter', 'selection'],
    'Asset Center presentation snapshot is invalid.',
  );
  const selectionRecord =
    record['selection'] === undefined
      ? undefined
      : requireExactRecord(
          record['selection'],
          ['owner', 'itemId'],
          'Asset Center presentation selection is invalid.',
        );
  return {
    filter: parseAssetCenterFilterProjection(record['filter']),
    ...(selectionRecord
      ? {
          selection: {
            owner: requireOneOf(
              selectionRecord['owner'],
              GLOBAL_LIBRARY_OWNERS,
              'presentation selection owner',
            ),
            itemId: requireIdentity(
              selectionRecord['itemId'],
              'Asset Center presentation selected item',
            ),
          },
        }
      : {}),
  };
}

export function parseAssetCenterCatalogEntry(value: unknown): AssetCenterCatalogEntry {
  const record = requireExactRecord(
    value,
    ['item', 'contentLocator'],
    'Asset Center catalog entry is invalid.',
  );
  const item = parseGlobalLibraryItem(record['item']);
  if (record['contentLocator'] === undefined) return { item };
  const result = validateContentLocator(record['contentLocator']);
  if (!result.ok) {
    throw invalid(
      `Asset Center catalog ContentLocator is invalid: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
  return { item, contentLocator: result.locator };
}

export function parseAssetCenterSessionProjection(value: unknown): AssetCenterSessionProjection {
  const record = requireExactRecord(
    value,
    ['identity', 'filter', 'catalog', 'selection', 'preview'],
    'Asset Center session projection is invalid.',
  );
  const filter = parseAssetCenterFilterProjection(record['filter']);
  const catalog = parseAssetCenterCatalogProjection(record['catalog']);
  const selection =
    record['selection'] === undefined
      ? undefined
      : parseAssetCenterSelectionProjection(record['selection']);
  if (catalog.status === 'ready' && catalog.owner !== filter.catalog) {
    throw invalid('Asset Center catalog owner does not match the active filter.');
  }
  return {
    identity: parseAssetCenterSessionIdentity(record['identity']),
    filter,
    catalog,
    ...(selection ? { selection } : {}),
    preview: parseAssetCenterPreviewProjection(record['preview']),
  };
}

export class AssetCenterContractError extends Error {
  readonly code:
    | 'invalid-asset-center-payload'
    | 'asset-center-stale-identity'
    | 'asset-center-item-unavailable'
    | 'asset-center-session-disposed';

  constructor(code: AssetCenterContractError['code'], message: string) {
    super(message);
    this.name = 'AssetCenterContractError';
    this.code = code;
  }
}

function parseAssetCenterDirectoryContext(value: unknown): AssetCenterDirectoryContext {
  const record = requireExactRecord(
    value,
    ['libraryId', 'libraryLabel', 'locationKind', 'relativePath'],
    'Asset Center directory context is invalid.',
  );
  return {
    libraryId: requireIdentity(record['libraryId'], 'Asset Center Media Library'),
    libraryLabel: requireIdentity(record['libraryLabel'], 'Asset Center Media Library label'),
    locationKind: requireOneOf(
      record['locationKind'],
      ['local', 'nas', 'cloud'] as const,
      'location kind',
    ),
    relativePath: requireString(
      record['relativePath'],
      'Asset Center directory relativePath must be a string.',
    ),
  };
}

function parseAssetCenterCatalogProjection(value: unknown): AssetCenterCatalogProjection {
  const record = requireRecord(value, 'Asset Center catalog projection is invalid.');
  if (record['status'] === 'loading') {
    requireExactKeys(record, ['status'], 'Asset Center loading catalog');
    return { status: 'loading' };
  }
  if (record['status'] === 'unavailable') {
    requireExactKeys(record, ['status', 'diagnostic'], 'Asset Center unavailable catalog');
    const diagnostic = requireExactRecord(
      record['diagnostic'],
      ['code', 'message'],
      'Asset Center catalog diagnostic is invalid.',
    );
    if (diagnostic['code'] !== 'asset-center-catalog-unavailable') {
      throw invalid('Asset Center catalog diagnostic code is invalid.');
    }
    return {
      status: 'unavailable',
      diagnostic: {
        code: diagnostic['code'],
        message: requireIdentity(diagnostic['message'], 'Asset Center diagnostic message'),
      },
    };
  }
  if (record['status'] !== 'ready') {
    throw invalid(`Unknown Asset Center catalog status '${String(record['status'])}'.`);
  }
  requireExactKeys(record, ['status', 'owner', 'entries'], 'Asset Center ready catalog');
  const owner = requireOneOf(record['owner'], GLOBAL_LIBRARY_OWNERS, 'catalog owner');
  if (!Array.isArray(record['entries'])) {
    throw invalid('Asset Center catalog entries must be an array.');
  }
  const entries = record['entries'].map(parseAssetCenterCatalogEntry);
  if (entries.some((entry) => entry.item.owner !== owner)) {
    throw invalid('Asset Center catalog entry owner does not match its catalog.');
  }
  const identities = new Set(entries.map((entry) => entry.item.id));
  if (identities.size !== entries.length) {
    throw invalid('Asset Center catalog contains duplicate item identities.');
  }
  return {
    status: 'ready',
    owner,
    entries,
  };
}

function parseAssetCenterSelectionProjection(value: unknown): AssetCenterSelectionProjection {
  const record = requireExactRecord(
    value,
    ['owner', 'itemId', 'item', 'contentLocator'],
    'Asset Center selection projection is invalid.',
  );
  const entry = parseAssetCenterCatalogEntry({
    item: record['item'],
    contentLocator: record['contentLocator'],
  });
  const owner = requireOneOf(record['owner'], GLOBAL_LIBRARY_OWNERS, 'selection owner');
  const itemId = requireIdentity(record['itemId'], 'Asset Center selected item');
  if (!entry.contentLocator || entry.item.owner !== owner || entry.item.id !== itemId) {
    throw invalid('Asset Center selection identity does not match its selected resource.');
  }
  return { owner, itemId, item: entry.item, contentLocator: entry.contentLocator };
}

function parseAssetCenterPreviewProjection(value: unknown): AssetCenterPreviewProjection {
  const record = requireRecord(value, 'Asset Center Preview projection is invalid.');
  if (record['status'] === 'empty') {
    requireExactKeys(record, ['status'], 'Asset Center empty Preview');
    return { status: 'empty' };
  }
  if (record['status'] === 'loading') {
    requireExactKeys(record, ['status', 'itemId'], 'Asset Center loading Preview');
    return {
      status: 'loading',
      itemId: requireIdentity(record['itemId'], 'Asset Center Preview item'),
    };
  }
  if (record['status'] === 'ready') {
    requireExactKeys(
      record,
      ['status', 'itemId', 'previewSessionId'],
      'Asset Center ready Preview',
    );
    return {
      status: 'ready',
      itemId: requireIdentity(record['itemId'], 'Asset Center Preview item'),
      previewSessionId: requireIdentity(record['previewSessionId'], 'Asset Center Preview session'),
    };
  }
  if (record['status'] !== 'unavailable') {
    throw invalid(`Unknown Asset Center Preview status '${String(record['status'])}'.`);
  }
  requireExactKeys(record, ['status', 'itemId', 'diagnostic'], 'Asset Center unavailable Preview');
  const diagnostic = requireExactRecord(
    record['diagnostic'],
    ['code', 'message'],
    'Asset Center Preview diagnostic is invalid.',
  );
  if (
    diagnostic['code'] !== 'preview-unsupported-kind' &&
    diagnostic['code'] !== 'preview-source-unavailable'
  ) {
    throw invalid('Asset Center Preview diagnostic code is invalid.');
  }
  return {
    status: 'unavailable',
    itemId: requireIdentity(record['itemId'], 'Asset Center Preview item'),
    diagnostic: {
      code: diagnostic['code'],
      message: requireIdentity(diagnostic['message'], 'Asset Center Preview diagnostic message'),
    },
  };
}

function parseGlobalLibraryItem(value: unknown): GlobalLibraryItem {
  const record = requireRecord(value, 'Asset Center item must be an object.');
  if (record['owner'] === 'global-asset-library') return parseGlobalAssetItem(value);
  if (record['owner'] === 'media-library') return parseGlobalMediaLibraryItem(value);
  throw invalid(`Unknown Asset Center item owner '${String(record['owner'])}'.`);
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Readonly<Record<string, unknown>> {
  const record = requireRecord(value, message);
  requireExactKeys(record, keys, message);
  return record;
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  owner: string,
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw invalid(`${owner} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`${owner} identity is required.`);
  }
  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw invalid(message);
  return value;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  const result = allowed.find((candidate) => candidate === value);
  if (!result) throw invalid(`Asset Center ${field} is invalid.`);
  return result;
}

function invalid(message: string): AssetCenterContractError {
  return new AssetCenterContractError('invalid-asset-center-payload', message);
}
