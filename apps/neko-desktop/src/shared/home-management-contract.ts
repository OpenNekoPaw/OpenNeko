export const DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION = 5 as const;

export const DESKTOP_HOME_MANAGEMENT_CHANNELS = {
  assetsSearch: 'openneko:desktop:home:assets:search',
  mediaLibrariesSearch: 'openneko:desktop:home:media-libraries:search',
  mediaLibrariesChildren: 'openneko:desktop:home:media-libraries:children',
  mediaLibrariesAdd: 'openneko:desktop:home:media-libraries:add',
  mediaLibrariesRemove: 'openneko:desktop:home:media-libraries:remove',
  mediaLibrariesReveal: 'openneko:desktop:home:media-libraries:reveal',
  pluginsList: 'openneko:desktop:home:plugins:list',
} as const;

export type DesktopHomeCatalogSort = 'name' | 'modifiedAt';
export type DesktopHomeSortDirection = 'ascending' | 'descending';
export type DesktopHomeMediaLibraryLocationKind = 'local' | 'nas' | 'cloud';

export interface DesktopHomeManagementRequest {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopHomeAssetSearchRequest extends DesktopHomeManagementRequest {
  readonly query: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}

export interface DesktopHomeAssetItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly kind: 'asset';
  readonly mediaType?: string;
  readonly modifiedAt?: string;
  readonly availability: 'available' | 'unavailable';
}

export type DesktopHomeAssetSearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'ready';
      readonly items: readonly DesktopHomeAssetItem[];
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'error';
      readonly diagnostic: { readonly message: string };
    };

export interface DesktopHomeMediaLibrarySearchRequest extends DesktopHomeManagementRequest {
  readonly query: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}

export interface DesktopHomeMediaLibraryChildrenRequest extends DesktopHomeManagementRequest {
  readonly libraryId: string;
  readonly relativePath: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}

export interface DesktopHomeMediaLibraryAddRequest extends DesktopHomeManagementRequest {
  readonly locationKind: DesktopHomeMediaLibraryLocationKind;
}

export interface DesktopHomeMediaLibraryRequest extends DesktopHomeManagementRequest {
  readonly libraryId: string;
}

export interface DesktopHomeMediaLibraryItem {
  readonly id: string;
  readonly libraryId: string;
  readonly label: string;
  readonly description?: string;
  readonly kind: 'library' | 'directory' | 'file';
  readonly locationKind: DesktopHomeMediaLibraryLocationKind;
  readonly relativePath: string;
  readonly mediaType?: string;
  readonly modifiedAt?: string;
  readonly availability: 'available' | 'unavailable';
}

export type DesktopHomeMediaLibrarySearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'ready';
      readonly items: readonly DesktopHomeMediaLibraryItem[];
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'error';
      readonly diagnostic: { readonly message: string };
    };

export type DesktopHomeMediaLibraryChildrenResult = DesktopHomeMediaLibrarySearchResult;

export type DesktopHomeMediaLibraryAddResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'added';
      readonly libraryId: string;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
    };

export interface DesktopHomeMediaLibraryRemoveResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'removed';
  readonly libraryId: string;
}

export interface DesktopHomeMediaLibraryRevealResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'revealed';
  readonly libraryId: string;
}

export interface DesktopHomePluginsRequest extends DesktopHomeManagementRequest {}

export interface DesktopHomeSkillItem {
  readonly name: string;
  readonly description: string;
  readonly source: 'builtin' | 'personal';
}

export interface DesktopHomePluginItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: 'builtin';
  readonly status: 'ready' | 'unavailable';
}

export type DesktopHomeSkillDiagnosticCode =
  'file_info_failed' | 'list_failed' | 'read_failed' | 'parse_failed' | 'invalid_metadata';

export interface DesktopHomeSkillDiscoveryProjection {
  readonly diagnostics: readonly {
    readonly code: DesktopHomeSkillDiagnosticCode;
    readonly source: DesktopHomeSkillItem['source'];
    readonly count: number;
  }[];
  readonly duplicateCount: number;
}

export interface DesktopHomePluginsResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly skills: readonly DesktopHomeSkillItem[];
  readonly skillDiscovery: DesktopHomeSkillDiscoveryProjection;
  readonly plugins: readonly DesktopHomePluginItem[];
  readonly externalPluginHost: 'unavailable';
}

export interface OpenNekoDesktopHomeManagementBridge {
  readonly home: {
    readonly assets: {
      search(input: {
        readonly query: string;
        readonly sortBy: DesktopHomeCatalogSort;
        readonly sortDirection: DesktopHomeSortDirection;
        readonly limit?: number;
      }): Promise<DesktopHomeAssetSearchResult>;
    };
    readonly mediaLibraries: {
      search(input: {
        readonly query: string;
        readonly sortBy: DesktopHomeCatalogSort;
        readonly sortDirection: DesktopHomeSortDirection;
        readonly limit?: number;
      }): Promise<DesktopHomeMediaLibrarySearchResult>;
      children(input: {
        readonly libraryId: string;
        readonly relativePath: string;
        readonly sortBy: DesktopHomeCatalogSort;
        readonly sortDirection: DesktopHomeSortDirection;
        readonly limit?: number;
      }): Promise<DesktopHomeMediaLibraryChildrenResult>;
      addLibrary(
        locationKind: DesktopHomeMediaLibraryLocationKind,
      ): Promise<DesktopHomeMediaLibraryAddResult>;
      removeLibrary(libraryId: string): Promise<DesktopHomeMediaLibraryRemoveResult>;
      revealLibrary(libraryId: string): Promise<DesktopHomeMediaLibraryRevealResult>;
    };
    readonly plugins: {
      list(): Promise<DesktopHomePluginsResult>;
    };
  };
}

export function createDesktopHomeAssetSearchRequest(
  requestId: string,
  input: {
    readonly query: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeAssetSearchRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    query: input.query.trim(),
    sortBy: requireCatalogSort(input.sortBy),
    sortDirection: requireSortDirection(input.sortDirection),
    limit: requireLimit(input.limit ?? 60),
  };
}

export function parseDesktopHomeAssetSearchRequest(value: unknown): DesktopHomeAssetSearchRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'query', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home Asset Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetSearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    {
      query: requireString(record['query'], 'Desktop Home asset query must be a string.'),
      sortBy: requireCatalogSort(record['sortBy']),
      sortDirection: requireSortDirection(record['sortDirection']),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomeMediaLibrarySearchRequest(
  requestId: string,
  input: {
    readonly query: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeMediaLibrarySearchRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    query: input.query.trim(),
    sortBy: requireCatalogSort(input.sortBy),
    sortDirection: requireSortDirection(input.sortDirection),
    limit: requireLimit(input.limit ?? 60),
  };
}

export function parseDesktopHomeMediaLibrarySearchRequest(
  value: unknown,
): DesktopHomeMediaLibrarySearchRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'query', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home Media Library search request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibrarySearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    {
      query: requireString(record['query'], 'Desktop Home Media Library query must be a string.'),
      sortBy: requireCatalogSort(record['sortBy']),
      sortDirection: requireSortDirection(record['sortDirection']),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomeMediaLibraryChildrenRequest(
  requestId: string,
  input: {
    readonly libraryId: string;
    readonly relativePath: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeMediaLibraryChildrenRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    libraryId: requireMediaLibraryId(input.libraryId),
    relativePath: requireRelativePath(input.relativePath),
    sortBy: requireCatalogSort(input.sortBy),
    sortDirection: requireSortDirection(input.sortDirection),
    limit: requireLimit(input.limit ?? 200),
  };
}

export function parseDesktopHomeMediaLibraryChildrenRequest(
  value: unknown,
): DesktopHomeMediaLibraryChildrenRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'libraryId', 'relativePath', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home Media Library children request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryChildrenRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    {
      libraryId: requireMediaLibraryId(record['libraryId']),
      relativePath: requireString(
        record['relativePath'],
        'Desktop Home Media Library relative path must be a string.',
      ),
      sortBy: requireCatalogSort(record['sortBy']),
      sortDirection: requireSortDirection(record['sortDirection']),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomeMediaLibraryAddRequest(
  requestId: string,
  locationKind: DesktopHomeMediaLibraryLocationKind,
): DesktopHomeMediaLibraryAddRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    locationKind: requireMediaLibraryLocationKind(locationKind),
  };
}

export function parseDesktopHomeMediaLibraryAddRequest(
  value: unknown,
): DesktopHomeMediaLibraryAddRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'locationKind'],
    'Desktop Home add Media Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryAddRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireMediaLibraryLocationKind(record['locationKind']),
  );
}

export function createDesktopHomeMediaLibraryRequest(
  requestId: string,
  libraryId: string,
): DesktopHomeMediaLibraryRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    libraryId: requireMediaLibraryId(libraryId),
  };
}

export function parseDesktopHomeMediaLibraryRequest(
  value: unknown,
): DesktopHomeMediaLibraryRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'libraryId'],
    'Desktop Home Media Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireMediaLibraryId(record['libraryId']),
  );
}

export function createDesktopHomePluginsRequest(requestId: string): DesktopHomePluginsRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
  };
}

export function parseDesktopHomePluginsRequest(value: unknown): DesktopHomePluginsRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId'],
    'Desktop Home plugins request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomePluginsRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
  );
}

export function parseDesktopHomeAssetSearchResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetSearchResult {
  return parseSearchResult(
    value,
    expectedRequestId,
    'Asset Library',
    parseAssetItem,
  ) as DesktopHomeAssetSearchResult;
}

export function parseDesktopHomeMediaLibrarySearchResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibrarySearchResult {
  return parseSearchResult(
    value,
    expectedRequestId,
    'Media Library',
    parseMediaLibraryItem,
  ) as DesktopHomeMediaLibrarySearchResult;
}

export function parseDesktopHomeMediaLibraryChildrenResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryChildrenResult {
  return parseDesktopHomeMediaLibrarySearchResult(value, expectedRequestId);
}

export function parseDesktopHomeMediaLibraryAddResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryAddResult {
  const base = requireRecord(value, 'Desktop Home add Media Library result must be an object.');
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  if (base['status'] === 'cancelled') {
    requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'status'],
      'Desktop Home add Media Library cancelled result is invalid.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'cancelled',
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'status', 'libraryId'],
    'Desktop Home add Media Library result is invalid.',
  );
  if (record['status'] !== 'added') {
    throw new Error('Desktop Home add Media Library result status is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'added',
    libraryId: requireMediaLibraryId(record['libraryId']),
  };
}

export function parseDesktopHomeMediaLibraryRemoveResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryRemoveResult {
  return parseMediaLibraryMutationResult(value, expectedRequestId, 'removed');
}

export function parseDesktopHomeMediaLibraryRevealResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryRevealResult {
  return parseMediaLibraryMutationResult(value, expectedRequestId, 'revealed');
}

export function parseDesktopHomePluginsResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomePluginsResult {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'skills', 'skillDiscovery', 'plugins', 'externalPluginHost'],
    'Desktop Home plugins result is invalid.',
  );
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  if (
    !Array.isArray(record['skills']) ||
    !Array.isArray(record['plugins']) ||
    record['externalPluginHost'] !== 'unavailable'
  ) {
    throw new Error('Desktop Home plugins result is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    skills: record['skills'].map(parseSkillItem),
    skillDiscovery: parseSkillDiscovery(record['skillDiscovery']),
    plugins: record['plugins'].map(parsePluginItem),
    externalPluginHost: 'unavailable',
  };
}

function parseSearchResult<T>(
  value: unknown,
  expectedRequestId: string,
  label: string,
  parseItem: (value: unknown) => T,
):
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'ready';
      readonly items: readonly T[];
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'error';
      readonly diagnostic: { readonly message: string };
    } {
  const base = requireRecord(value, `Desktop Home ${label} result must be an object.`);
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  if (base['status'] === 'error') {
    const record = requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'status', 'diagnostic'],
      `Desktop Home ${label} error result is invalid.`,
    );
    const diagnostic = requireExactRecord(
      record['diagnostic'],
      ['message'],
      `Desktop Home ${label} diagnostic is invalid.`,
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'error',
      diagnostic: {
        message: requireNonEmptyString(
          diagnostic['message'],
          `Desktop Home ${label} diagnostic message is required.`,
        ),
      },
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'status', 'items'],
    `Desktop Home ${label} ready result is invalid.`,
  );
  if (record['status'] !== 'ready' || !Array.isArray(record['items'])) {
    throw new Error(`Desktop Home ${label} result status or items are invalid.`);
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'ready',
    items: record['items'].map(parseItem),
  };
}

function parseMediaLibraryMutationResult<TStatus extends 'removed' | 'revealed'>(
  value: unknown,
  expectedRequestId: string,
  expectedStatus: TStatus,
): {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: TStatus;
  readonly libraryId: string;
} {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'status', 'libraryId'],
    `Desktop Home ${expectedStatus} Media Library result is invalid.`,
  );
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  if (record['status'] !== expectedStatus) {
    throw new Error(`Desktop Home Media Library result status must be '${expectedStatus}'.`);
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: expectedStatus,
    libraryId: requireMediaLibraryId(record['libraryId']),
  };
}

function parseAssetItem(value: unknown): DesktopHomeAssetItem {
  const record = requireExactRecord(
    value,
    ['id', 'label', 'description', 'kind', 'mediaType', 'modifiedAt', 'availability'],
    'Desktop Home Asset Library item is invalid.',
  );
  if (record['kind'] !== 'asset') {
    throw new Error('Desktop Home Asset Library item kind is invalid.');
  }
  return {
    id: requireNonEmptyString(record['id'], 'Desktop Home Asset Library item id is required.'),
    label: requireNonEmptyString(
      record['label'],
      'Desktop Home Asset Library item label is required.',
    ),
    ...(typeof record['description'] === 'string' ? { description: record['description'] } : {}),
    kind: 'asset',
    ...(typeof record['mediaType'] === 'string' ? { mediaType: record['mediaType'] } : {}),
    ...(typeof record['modifiedAt'] === 'string'
      ? {
          modifiedAt: requireIsoDate(
            record['modifiedAt'],
            'Desktop Home Asset Library modifiedAt is invalid.',
          ),
        }
      : {}),
    availability: requireAvailability(record['availability']),
  };
}

function parseMediaLibraryItem(value: unknown): DesktopHomeMediaLibraryItem {
  const record = requireExactRecord(
    value,
    [
      'id',
      'libraryId',
      'label',
      'description',
      'kind',
      'locationKind',
      'relativePath',
      'mediaType',
      'modifiedAt',
      'availability',
    ],
    'Desktop Home Media Library item is invalid.',
  );
  const kind = record['kind'];
  if (kind !== 'library' && kind !== 'directory' && kind !== 'file') {
    throw new Error('Desktop Home Media Library item kind is invalid.');
  }
  const libraryId = requireMediaLibraryId(record['libraryId']);
  const id = requireNonEmptyString(record['id'], 'Desktop Home Media Library item id is required.');
  if (!id.startsWith(`${libraryId}:`)) {
    throw new Error('Desktop Home Media Library item identity is invalid.');
  }
  return {
    id,
    libraryId,
    label: requireNonEmptyString(
      record['label'],
      'Desktop Home Media Library item label is required.',
    ),
    ...(typeof record['description'] === 'string' ? { description: record['description'] } : {}),
    kind,
    locationKind: requireMediaLibraryLocationKind(record['locationKind']),
    relativePath: requireRelativePath(record['relativePath']),
    ...(typeof record['mediaType'] === 'string' ? { mediaType: record['mediaType'] } : {}),
    ...(typeof record['modifiedAt'] === 'string'
      ? {
          modifiedAt: requireIsoDate(
            record['modifiedAt'],
            'Desktop Home Media Library modifiedAt is invalid.',
          ),
        }
      : {}),
    availability: requireAvailability(record['availability']),
  };
}

function parseSkillItem(value: unknown): DesktopHomeSkillItem {
  const record = requireExactRecord(
    value,
    ['name', 'description', 'source'],
    'Desktop Home Skill item is invalid.',
  );
  return {
    name: requireNonEmptyString(record['name'], 'Desktop Home Skill name is required.'),
    description: requireString(
      record['description'],
      'Desktop Home Skill description must be a string.',
    ),
    source: requireSkillSource(record['source']),
  };
}

function parsePluginItem(value: unknown): DesktopHomePluginItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'kind', 'status'],
    'Desktop Home plugin item is invalid.',
  );
  const status = record['status'];
  if (record['kind'] !== 'builtin' || (status !== 'ready' && status !== 'unavailable')) {
    throw new Error('Desktop Home plugin item kind or status is invalid.');
  }
  return {
    id: requireNonEmptyString(record['id'], 'Desktop Home plugin id is required.'),
    name: requireNonEmptyString(record['name'], 'Desktop Home plugin name is required.'),
    description: requireString(
      record['description'],
      'Desktop Home plugin description must be a string.',
    ),
    kind: 'builtin',
    status,
  };
}

function parseSkillDiscovery(value: unknown): DesktopHomeSkillDiscoveryProjection {
  const record = requireExactRecord(
    value,
    ['diagnostics', 'duplicateCount'],
    'Desktop Home Skill discovery projection is invalid.',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Desktop Home Skill discovery projection is invalid.');
  }
  return {
    diagnostics: record['diagnostics'].map((value) => {
      const diagnostic = requireExactRecord(
        value,
        ['code', 'source', 'count'],
        'Desktop Home Skill diagnostic is invalid.',
      );
      return {
        code: requireSkillDiagnosticCode(diagnostic['code']),
        source: requireSkillSource(diagnostic['source']),
        count: requirePositiveInteger(
          diagnostic['count'],
          'Desktop Home Skill diagnostic count is invalid.',
        ),
      };
    }),
    duplicateCount: requireNonNegativeInteger(
      record['duplicateCount'],
      'Desktop Home Skill duplicate count is invalid.',
    ),
  };
}

function requireSkillDiagnosticCode(value: unknown): DesktopHomeSkillDiagnosticCode {
  if (
    value !== 'file_info_failed' &&
    value !== 'list_failed' &&
    value !== 'read_failed' &&
    value !== 'parse_failed' &&
    value !== 'invalid_metadata'
  ) {
    throw new Error('Desktop Home Skill diagnostic code is invalid.');
  }
  return value;
}

function requireSkillSource(value: unknown): DesktopHomeSkillItem['source'] {
  if (value !== 'builtin' && value !== 'personal') {
    throw new Error('Desktop Home Skill source is invalid.');
  }
  return value;
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION) {
    throw new Error('Desktop Home management contract version is unsupported.');
  }
}

function requireRequestId(value: unknown, expected: string): string {
  const requestId = requireNonEmptyString(value, 'Desktop Home result requestId is required.');
  if (requestId !== expected) {
    throw new Error(`Desktop Home response '${requestId}' does not match '${expected}'.`);
  }
  return requestId;
}

function requireMediaLibraryId(value: unknown): string {
  const libraryId = requireNonEmptyString(value, 'Desktop Home Media Library id is required.');
  const match = /^media-library:(local|nas|cloud):([^:/\\]+)$/.exec(libraryId);
  const libraryName = match?.[2];
  if (
    !libraryName ||
    libraryName !== libraryName.normalize('NFC') ||
    libraryName === '.' ||
    libraryName === '..'
  ) {
    throw new Error('Desktop Home Media Library id is invalid.');
  }
  return libraryId;
}

function requireMediaLibraryLocationKind(value: unknown): DesktopHomeMediaLibraryLocationKind {
  if (value !== 'local' && value !== 'nas' && value !== 'cloud') {
    throw new Error('Desktop Home Media Library location kind is invalid.');
  }
  return value;
}

function requireRelativePath(value: unknown): string {
  const relativePath = requireString(
    value,
    'Desktop Home Media Library relative path must be a string.',
  );
  if (
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error('Desktop Home Media Library relative path is invalid.');
  }
  return relativePath;
}

function requireCatalogSort(value: unknown): DesktopHomeCatalogSort {
  if (value !== 'name' && value !== 'modifiedAt') {
    throw new Error('Desktop Home catalog sort is invalid.');
  }
  return value;
}

function requireSortDirection(value: unknown): DesktopHomeSortDirection {
  if (value !== 'ascending' && value !== 'descending') {
    throw new Error('Desktop Home sort direction is invalid.');
  }
  return value;
}

function requireAvailability(value: unknown): 'available' | 'unavailable' {
  if (value !== 'available' && value !== 'unavailable') {
    throw new Error('Desktop Home item availability is invalid.');
  }
  return value;
}

function requireLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error('Desktop Home result limit must be an integer between 1 and 200.');
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  const record = requireRecord(value, message);
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(message);
  }
  return record;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requireIsoDate(value: string, message: string): string {
  if (Number.isNaN(Date.parse(value))) throw new Error(message);
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  const integer = requireNonNegativeInteger(value, message);
  if (integer === 0) throw new Error(message);
  return integer;
}

function requireNonEmptyString(value: unknown, message: string): string {
  const text = requireString(value, message).trim();
  if (!text) throw new Error(message);
  return text;
}
