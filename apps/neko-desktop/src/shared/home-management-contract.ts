export const DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION = 4 as const;

export const DESKTOP_HOME_MANAGEMENT_CHANNELS = {
  assetsSearch: 'openneko:desktop:home:assets:search',
  assetsAddLibrary: 'openneko:desktop:home:assets:libraries:add',
  assetsRemoveLibrary: 'openneko:desktop:home:assets:libraries:remove',
  assetsRevealLibrary: 'openneko:desktop:home:assets:libraries:reveal',
  pluginsList: 'openneko:desktop:home:plugins:list',
} as const;

export type DesktopHomeAssetFacet = 'libraries' | 'assets';
export type DesktopHomeAssetSort = 'name' | 'modifiedAt';
export type DesktopHomeSortDirection = 'ascending' | 'descending';

export interface DesktopHomeManagementRequest {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopHomeAssetSearchRequest extends DesktopHomeManagementRequest {
  readonly facet: DesktopHomeAssetFacet;
  readonly query: string;
  readonly sortBy: DesktopHomeAssetSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}

export interface DesktopHomeAssetItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly kind: 'library' | 'asset';
  readonly mediaType?: string;
  readonly modifiedAt?: string;
  readonly availability: 'available' | 'unavailable';
}

export type DesktopHomeAssetSearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly facet: DesktopHomeAssetFacet;
      readonly status: 'ready';
      readonly items: readonly DesktopHomeAssetItem[];
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly facet: DesktopHomeAssetFacet;
      readonly status: 'error';
      readonly diagnostic: { readonly message: string };
    };

export interface DesktopHomeAssetAddLibraryRequest extends DesktopHomeManagementRequest {}

export interface DesktopHomeAssetLibraryRequest extends DesktopHomeManagementRequest {
  readonly libraryId: string;
}

export type DesktopHomeAssetAddLibraryResult =
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

export interface DesktopHomeAssetRemoveLibraryResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'removed';
  readonly libraryId: string;
}

export interface DesktopHomeAssetRevealLibraryResult {
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
        readonly facet: DesktopHomeAssetFacet;
        readonly query: string;
        readonly sortBy: DesktopHomeAssetSort;
        readonly sortDirection: DesktopHomeSortDirection;
        readonly limit?: number;
      }): Promise<DesktopHomeAssetSearchResult>;
      addLibrary(): Promise<DesktopHomeAssetAddLibraryResult>;
      removeLibrary(libraryId: string): Promise<DesktopHomeAssetRemoveLibraryResult>;
      revealLibrary(libraryId: string): Promise<DesktopHomeAssetRevealLibraryResult>;
    };
    readonly plugins: {
      list(): Promise<DesktopHomePluginsResult>;
    };
  };
}

export function createDesktopHomeAssetSearchRequest(
  requestId: string,
  input: {
    readonly facet: DesktopHomeAssetFacet;
    readonly query: string;
    readonly sortBy: DesktopHomeAssetSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeAssetSearchRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    facet: requireFacet(input.facet),
    query: input.query.trim(),
    sortBy: requireAssetSort(input.sortBy),
    sortDirection: requireSortDirection(input.sortDirection),
    limit: requireLimit(input.limit ?? 60),
  };
}

export function parseDesktopHomeAssetSearchRequest(value: unknown): DesktopHomeAssetSearchRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'facet', 'query', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home asset request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetSearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    {
      facet: requireFacet(record['facet']),
      query: requireString(record['query'], 'Desktop Home asset query must be a string.'),
      sortBy: requireAssetSort(record['sortBy']),
      sortDirection: requireSortDirection(record['sortDirection']),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomeAssetAddLibraryRequest(
  requestId: string,
): DesktopHomeAssetAddLibraryRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
  };
}

export function parseDesktopHomeAssetAddLibraryRequest(
  value: unknown,
): DesktopHomeAssetAddLibraryRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId'],
    'Desktop Home add-library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetAddLibraryRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
  );
}

export function createDesktopHomeAssetLibraryRequest(
  requestId: string,
  libraryId: string,
): DesktopHomeAssetLibraryRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    libraryId: requireLibraryId(libraryId),
  };
}

export function parseDesktopHomeAssetLibraryRequest(
  value: unknown,
): DesktopHomeAssetLibraryRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'libraryId'],
    'Desktop Home media-library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetLibraryRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireLibraryId(record['libraryId']),
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
  const base = requireRecord(value, 'Desktop Home asset result must be an object.');
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  const facet = requireFacet(base['facet']);
  if (base['status'] === 'error') {
    const record = requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'facet', 'status', 'diagnostic'],
      'Desktop Home asset error result is invalid.',
    );
    const diagnostic = requireExactRecord(
      record['diagnostic'],
      ['message'],
      'Desktop Home asset diagnostic is invalid.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      facet,
      status: 'error',
      diagnostic: {
        message: requireNonEmptyString(
          diagnostic['message'],
          'Desktop Home asset diagnostic message is required.',
        ),
      },
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'facet', 'status', 'items'],
    'Desktop Home asset ready result is invalid.',
  );
  if (record['status'] !== 'ready' || !Array.isArray(record['items'])) {
    throw new Error('Desktop Home asset result status or items are invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    facet,
    status: 'ready',
    items: record['items'].map(parseAssetItem),
  };
}

export function parseDesktopHomeAssetAddLibraryResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetAddLibraryResult {
  const base = requireRecord(value, 'Desktop Home add-library result must be an object.');
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  if (base['status'] === 'cancelled') {
    requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'status'],
      'Desktop Home add-library cancelled result is invalid.',
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
    'Desktop Home add-library result is invalid.',
  );
  if (record['status'] !== 'added') {
    throw new Error('Desktop Home add-library result status is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'added',
    libraryId: requireLibraryId(record['libraryId']),
  };
}

export function parseDesktopHomeAssetRemoveLibraryResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetRemoveLibraryResult {
  return parseDesktopHomeAssetLibraryMutationResult(value, expectedRequestId, 'removed');
}

export function parseDesktopHomeAssetRevealLibraryResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetRevealLibraryResult {
  return parseDesktopHomeAssetLibraryMutationResult(value, expectedRequestId, 'revealed');
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

function parseDesktopHomeAssetLibraryMutationResult<TStatus extends 'removed' | 'revealed'>(
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
    `Desktop Home ${expectedStatus} media-library result is invalid.`,
  );
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  if (record['status'] !== expectedStatus) {
    throw new Error(`Desktop Home media-library result status must be '${expectedStatus}'.`);
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: expectedStatus,
    libraryId: requireLibraryId(record['libraryId']),
  };
}

function parseAssetItem(value: unknown): DesktopHomeAssetItem {
  const record = requireExactRecord(
    value,
    ['id', 'label', 'description', 'kind', 'mediaType', 'modifiedAt', 'availability'],
    'Desktop Home asset item is invalid.',
  );
  const kind = record['kind'];
  const availability = record['availability'];
  if (kind !== 'library' && kind !== 'asset') {
    throw new Error('Desktop Home asset item kind is invalid.');
  }
  if (availability !== 'available' && availability !== 'unavailable') {
    throw new Error('Desktop Home asset item availability is invalid.');
  }
  return {
    id: requireNonEmptyString(record['id'], 'Desktop Home asset item id is required.'),
    label: requireNonEmptyString(record['label'], 'Desktop Home asset item label is required.'),
    ...(typeof record['description'] === 'string' ? { description: record['description'] } : {}),
    kind,
    ...(typeof record['mediaType'] === 'string' ? { mediaType: record['mediaType'] } : {}),
    ...(typeof record['modifiedAt'] === 'string'
      ? {
          modifiedAt: requireIsoDate(
            record['modifiedAt'],
            'Desktop Home asset modifiedAt is invalid.',
          ),
        }
      : {}),
    availability,
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
  const duplicateCount = requireNonNegativeInteger(
    record['duplicateCount'],
    'Desktop Home Skill duplicate count is invalid.',
  );
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
    duplicateCount,
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

function requireFacet(value: unknown): DesktopHomeAssetFacet {
  if (value !== 'libraries' && value !== 'assets') {
    throw new Error('Desktop Home asset facet is invalid.');
  }
  return value;
}

function requireLibraryId(value: unknown): string {
  const libraryId = requireNonEmptyString(value, 'Desktop Home media-library id is required.');
  const libraryName = libraryId.startsWith('library:') ? libraryId.slice('library:'.length) : '';
  if (
    libraryName.length === 0 ||
    libraryName !== libraryName.normalize('NFC') ||
    libraryName === '.' ||
    libraryName === '..' ||
    libraryName.includes('/') ||
    libraryName.includes('\\') ||
    libraryName.startsWith('.openneko-import-')
  ) {
    throw new Error('Desktop Home media-library id is invalid.');
  }
  return libraryId;
}

function requireAssetSort(value: unknown): DesktopHomeAssetSort {
  if (value !== 'name' && value !== 'modifiedAt') {
    throw new Error('Desktop Home asset sort is invalid.');
  }
  return value;
}

function requireSortDirection(value: unknown): DesktopHomeSortDirection {
  if (value !== 'ascending' && value !== 'descending') {
    throw new Error('Desktop Home sort direction is invalid.');
  }
  return value;
}

function requireLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error('Desktop Home asset limit must be an integer between 1 and 200.');
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
