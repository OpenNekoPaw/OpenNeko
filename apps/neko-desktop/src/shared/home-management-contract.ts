import {
  parseGlobalAssetItem,
  parseGlobalLibraryThumbnailRequest,
  parseGlobalLibraryThumbnailResult,
  parseGlobalMediaLibraryItem,
  type GlobalAssetImportOutcome,
  type GlobalAssetItem,
  type GlobalLibraryCatalogSort,
  type GlobalLibrarySortDirection,
  type GlobalLibraryThumbnailRequest,
  type GlobalLibraryThumbnailResult,
  type GlobalMediaLibraryItem,
  type GlobalMediaLibraryLocationKind,
} from '@neko/assets-domain/global-library/contract';
import type {
  AgentExtensionCatalogItem,
  AgentExtensionDiagnosticCode,
  AgentExtensionStatus,
} from '@neko/agent-contracts';

export const DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION = 8 as const;

export const DESKTOP_HOME_MANAGEMENT_CHANNELS = {
  assetsSearch: 'openneko:desktop:home:assets:search',
  assetsImport: 'openneko:desktop:home:assets:import',
  assetsRemove: 'openneko:desktop:home:assets:remove',
  libraryThumbnailResolve: 'openneko:desktop:home:library-thumbnail:resolve',
  mediaLibrariesSearch: 'openneko:desktop:home:media-libraries:search',
  mediaLibrariesChildren: 'openneko:desktop:home:media-libraries:children',
  mediaLibrariesAdd: 'openneko:desktop:home:media-libraries:add',
  mediaLibrariesRelink: 'openneko:desktop:home:media-libraries:relink',
  mediaLibrariesRemove: 'openneko:desktop:home:media-libraries:remove',
  mediaLibrariesReveal: 'openneko:desktop:home:media-libraries:reveal',
  extensionsList: 'openneko:desktop:home:extensions:list',
  extensionPluginInstall: 'openneko:desktop:home:extensions:plugin-install',
  extensionPluginRemove: 'openneko:desktop:home:extensions:plugin-remove',
  extensionMarketplacesRefresh: 'openneko:desktop:home:extensions:marketplaces-refresh',
  extensionPersonalSkillInstall: 'openneko:desktop:home:extensions:personal-skill-install',
  extensionPersonalSkillRemove: 'openneko:desktop:home:extensions:personal-skill-remove',
} as const;

export type DesktopHomeCatalogSort = GlobalLibraryCatalogSort;
export type DesktopHomeSortDirection = GlobalLibrarySortDirection;
export type MediaLibraryLocationKind = GlobalMediaLibraryLocationKind;
export type DesktopHomeAssetItem = GlobalAssetItem;
export type DesktopHomeMediaLibraryItem = GlobalMediaLibraryItem;

export interface DesktopHomeManagementIdentity {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopHomeManagementRequest extends DesktopHomeManagementIdentity {
  readonly endpointEpoch: string;
}

export interface DesktopHomeAssetSearchRequest extends DesktopHomeManagementRequest {
  readonly query: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}

export interface DesktopHomeExpectedRevisionRequest extends DesktopHomeManagementRequest {
  readonly expectedRevision: number;
}

export interface DesktopHomeAssetRemoveRequest extends DesktopHomeExpectedRevisionRequest {
  readonly assetId: string;
}

export interface DesktopHomeLibraryThumbnailRequest
  extends DesktopHomeManagementRequest, GlobalLibraryThumbnailRequest {}

export type DesktopHomeAssetImportOutcome = GlobalAssetImportOutcome;

export type DesktopHomeAssetImportResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
      readonly revision: number;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'completed';
      readonly revision: number;
      readonly outcomes: readonly DesktopHomeAssetImportOutcome[];
    };

export interface DesktopHomeAssetRemoveResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'removed';
  readonly assetId: string;
  readonly revision: number;
}

export interface DesktopHomeLibraryThumbnailResult
  extends DesktopHomeManagementIdentity, GlobalLibraryThumbnailResult {}

export type DesktopHomeAssetSearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'ready';
      readonly revision: number;
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
  readonly locationKind: MediaLibraryLocationKind;
  readonly expectedRevision: number;
}

export interface DesktopHomeMediaLibraryRequest extends DesktopHomeManagementRequest {
  readonly libraryId: string;
  readonly expectedRevision: number;
}

export type DesktopHomeMediaLibrarySearchResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'ready';
      readonly revision: number;
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
      readonly revision: number;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
      readonly revision: number;
    };

export type DesktopHomeMediaLibraryRelinkResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'relinked';
      readonly libraryId: string;
      readonly revision: number;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
      readonly revision: number;
    };

export interface DesktopHomeMediaLibraryRemoveResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'removed';
  readonly libraryId: string;
  readonly revision: number;
}

export interface DesktopHomeMediaLibraryRevealResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly status: 'revealed';
  readonly libraryId: string;
  readonly revision: number;
}

export interface DesktopHomeExtensionsRequest extends DesktopHomeManagementRequest {}

export type DesktopHomeSkillSource = 'personal' | 'plugin';

export interface DesktopHomeSkillItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: DesktopHomeSkillSource;
  readonly sourceId: string;
  readonly managementId: string;
  readonly canRemove: boolean;
}

export type DesktopHomeExtensionAgentStatus = AgentExtensionStatus;

export type DesktopHomeExtensionItem = AgentExtensionCatalogItem;

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

export type DesktopHomeExtensionDiagnosticCode = AgentExtensionDiagnosticCode;

export interface DesktopHomeExtensionDiscoveryProjection {
  readonly diagnostics: readonly {
    readonly code: DesktopHomeExtensionDiagnosticCode;
    readonly count: number;
  }[];
}

export interface DesktopHomeExtensionsResult {
  readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly catalogRevision: string;
  readonly skills: readonly DesktopHomeSkillItem[];
  readonly skillDiscovery: DesktopHomeSkillDiscoveryProjection;
  readonly extensions: readonly DesktopHomeExtensionItem[];
  readonly extensionDiscovery: DesktopHomeExtensionDiscoveryProjection;
}

export interface DesktopHomePluginMutationRequest extends DesktopHomeManagementRequest {
  readonly pluginId: string;
  readonly expectedCatalogRevision: string;
}

export interface DesktopHomeCatalogMutationRequest extends DesktopHomeManagementRequest {
  readonly expectedCatalogRevision: string;
}

export interface DesktopHomePersonalSkillRemoveRequest extends DesktopHomeManagementRequest {
  readonly managementId: string;
  readonly expectedCatalogRevision: string;
}

export type DesktopHomeExtensionMutationKind =
  | 'plugin-install'
  | 'plugin-remove'
  | 'marketplaces-refresh'
  | 'personal-skill-install'
  | 'personal-skill-remove';

export type DesktopHomeExtensionMutationResult =
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'completed';
      readonly operation: DesktopHomeExtensionMutationKind;
      readonly targetId: string;
      readonly catalogRevision: string;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
      readonly operation: 'personal-skill-install';
      readonly targetId: '';
      readonly catalogRevision: string;
    };

export interface OpenNekoDesktopHomeManagementBridge {
  readonly home: {
    readonly assets: {
      search(input: {
        readonly query: string;
        readonly sortBy: DesktopHomeCatalogSort;
        readonly sortDirection: DesktopHomeSortDirection;
        readonly limit?: number;
      }): Promise<DesktopHomeAssetSearchResult>;
      importFiles(expectedRevision: number): Promise<DesktopHomeAssetImportResult>;
      remove(assetId: string, expectedRevision: number): Promise<DesktopHomeAssetRemoveResult>;
    };
    readonly libraryThumbnails: {
      resolve(request: GlobalLibraryThumbnailRequest): Promise<DesktopHomeLibraryThumbnailResult>;
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
        locationKind: MediaLibraryLocationKind,
        expectedRevision: number,
      ): Promise<DesktopHomeMediaLibraryAddResult>;
      relinkLibrary(
        libraryId: string,
        expectedRevision: number,
      ): Promise<DesktopHomeMediaLibraryRelinkResult>;
      removeLibrary(
        libraryId: string,
        expectedRevision: number,
      ): Promise<DesktopHomeMediaLibraryRemoveResult>;
      revealLibrary(
        libraryId: string,
        expectedRevision: number,
      ): Promise<DesktopHomeMediaLibraryRevealResult>;
    };
    readonly extensions: {
      list(): Promise<DesktopHomeExtensionsResult>;
      installPlugin(
        pluginId: string,
        expectedCatalogRevision: string,
      ): Promise<DesktopHomeExtensionMutationResult>;
      removePlugin(
        pluginId: string,
        expectedCatalogRevision: string,
      ): Promise<DesktopHomeExtensionMutationResult>;
      refreshMarketplaces(
        expectedCatalogRevision: string,
      ): Promise<DesktopHomeExtensionMutationResult>;
      installPersonalSkill(
        expectedCatalogRevision: string,
      ): Promise<DesktopHomeExtensionMutationResult>;
      removePersonalSkill(
        managementId: string,
        expectedCatalogRevision: string,
      ): Promise<DesktopHomeExtensionMutationResult>;
    };
  };
}

export function createDesktopHomeAssetSearchRequest(
  requestId: string,
  endpointEpoch: string,
  input: {
    readonly query: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeAssetSearchRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    query: input.query.trim(),
    sortBy: requireCatalogSort(input.sortBy),
    sortDirection: requireSortDirection(input.sortDirection),
    limit: requireLimit(input.limit ?? 60),
  };
}

export function parseDesktopHomeAssetSearchRequest(value: unknown): DesktopHomeAssetSearchRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'query', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home Asset Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetSearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    {
      query: requireString(record['query'], 'Desktop Home asset query must be a string.'),
      sortBy: requireCatalogSort(record['sortBy']),
      sortDirection: requireSortDirection(record['sortDirection']),
      limit: requireLimit(record['limit']),
    },
  );
}

export function createDesktopHomeAssetImportRequest(
  requestId: string,
  endpointEpoch: string,
  expectedRevision: number,
): DesktopHomeExpectedRevisionRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    expectedRevision: requireRevision(expectedRevision),
  };
}

export function parseDesktopHomeAssetImportRequest(
  value: unknown,
): DesktopHomeExpectedRevisionRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'expectedRevision'],
    'Desktop Home Asset import request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetImportRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireRevision(record['expectedRevision']),
  );
}

export function createDesktopHomeAssetRemoveRequest(
  requestId: string,
  endpointEpoch: string,
  assetId: string,
  expectedRevision: number,
): DesktopHomeAssetRemoveRequest {
  return {
    ...createDesktopHomeAssetImportRequest(requestId, endpointEpoch, expectedRevision),
    assetId: requireAssetId(assetId),
  };
}

export function parseDesktopHomeAssetRemoveRequest(value: unknown): DesktopHomeAssetRemoveRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'assetId', 'expectedRevision'],
    'Desktop Home Asset remove request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeAssetRemoveRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireAssetId(record['assetId']),
    requireRevision(record['expectedRevision']),
  );
}

export function createDesktopHomeLibraryThumbnailRequest(
  requestId: string,
  endpointEpoch: string,
  request: GlobalLibraryThumbnailRequest,
): DesktopHomeLibraryThumbnailRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    ...parseGlobalLibraryThumbnailRequest(request),
  };
}

export function parseDesktopHomeLibraryThumbnailRequest(
  value: unknown,
): DesktopHomeLibraryThumbnailRequest {
  const record = requireExactRecord(
    value,
    [
      'schemaVersion',
      'requestId',
      'endpointEpoch',
      'owner',
      'itemId',
      'expectedCatalogRevision',
      'descriptorId',
      'thumbnailRevision',
      'variant',
    ],
    'Desktop Home Library thumbnail request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeLibraryThumbnailRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    parseGlobalLibraryThumbnailRequest({
      owner: record['owner'],
      itemId: record['itemId'],
      expectedCatalogRevision: record['expectedCatalogRevision'],
      descriptorId: record['descriptorId'],
      thumbnailRevision: record['thumbnailRevision'],
      variant: record['variant'],
    }),
  );
}

export function createDesktopHomeMediaLibrarySearchRequest(
  requestId: string,
  endpointEpoch: string,
  input: {
    readonly query: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeMediaLibrarySearchRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
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
    ['schemaVersion', 'requestId', 'endpointEpoch', 'query', 'sortBy', 'sortDirection', 'limit'],
    'Desktop Home Media Library search request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibrarySearchRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
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
  endpointEpoch: string,
  input: {
    readonly libraryId: string;
    readonly relativePath: string;
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
    readonly limit?: number;
  },
): DesktopHomeMediaLibraryChildrenRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
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
    [
      'schemaVersion',
      'requestId',
      'endpointEpoch',
      'libraryId',
      'relativePath',
      'sortBy',
      'sortDirection',
      'limit',
    ],
    'Desktop Home Media Library children request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryChildrenRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
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
  endpointEpoch: string,
  locationKind: MediaLibraryLocationKind,
  expectedRevision: number,
): DesktopHomeMediaLibraryAddRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    locationKind: requireMediaLibraryLocationKind(locationKind),
    expectedRevision: requireRevision(expectedRevision),
  };
}

export function parseDesktopHomeMediaLibraryAddRequest(
  value: unknown,
): DesktopHomeMediaLibraryAddRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'locationKind', 'expectedRevision'],
    'Desktop Home add Media Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryAddRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireMediaLibraryLocationKind(record['locationKind']),
    requireRevision(record['expectedRevision']),
  );
}

export function createDesktopHomeMediaLibraryRequest(
  requestId: string,
  endpointEpoch: string,
  libraryId: string,
  expectedRevision: number,
): DesktopHomeMediaLibraryRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    libraryId: requireMediaLibraryId(libraryId),
    expectedRevision: requireRevision(expectedRevision),
  };
}

export function parseDesktopHomeMediaLibraryRequest(
  value: unknown,
): DesktopHomeMediaLibraryRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'libraryId', 'expectedRevision'],
    'Desktop Home Media Library request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeMediaLibraryRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireMediaLibraryId(record['libraryId']),
    requireRevision(record['expectedRevision']),
  );
}

export function createDesktopHomeExtensionsRequest(
  requestId: string,
  endpointEpoch: string,
): DesktopHomeExtensionsRequest {
  return createDesktopHomeRequestIdentity(requestId, endpointEpoch);
}

export function parseDesktopHomeExtensionsRequest(value: unknown): DesktopHomeExtensionsRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch'],
    'Desktop Home extensions request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeExtensionsRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
  );
}

export function createDesktopHomePluginMutationRequest(
  requestId: string,
  endpointEpoch: string,
  pluginId: string,
  expectedCatalogRevision: string,
): DesktopHomePluginMutationRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    pluginId: requirePluginId(pluginId),
    expectedCatalogRevision: requireCatalogRevision(expectedCatalogRevision),
  };
}

export function parseDesktopHomePluginMutationRequest(
  value: unknown,
): DesktopHomePluginMutationRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'pluginId', 'expectedCatalogRevision'],
    'Desktop Home plugin mutation request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomePluginMutationRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requirePluginId(record['pluginId']),
    requireCatalogRevision(record['expectedCatalogRevision']),
  );
}

export function createDesktopHomeCatalogMutationRequest(
  requestId: string,
  endpointEpoch: string,
  expectedCatalogRevision: string,
): DesktopHomeCatalogMutationRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    expectedCatalogRevision: requireCatalogRevision(expectedCatalogRevision),
  };
}

export function parseDesktopHomeCatalogMutationRequest(
  value: unknown,
): DesktopHomeCatalogMutationRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'expectedCatalogRevision'],
    'Desktop Home extension catalog mutation request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomeCatalogMutationRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireCatalogRevision(record['expectedCatalogRevision']),
  );
}

export function createDesktopHomePersonalSkillRemoveRequest(
  requestId: string,
  endpointEpoch: string,
  managementId: string,
  expectedCatalogRevision: string,
): DesktopHomePersonalSkillRemoveRequest {
  return {
    ...createDesktopHomeRequestIdentity(requestId, endpointEpoch),
    managementId: requireManagementId(managementId),
    expectedCatalogRevision: requireCatalogRevision(expectedCatalogRevision),
  };
}

export function parseDesktopHomePersonalSkillRemoveRequest(
  value: unknown,
): DesktopHomePersonalSkillRemoveRequest {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'endpointEpoch', 'managementId', 'expectedCatalogRevision'],
    'Desktop Home personal Skill remove request is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return createDesktopHomePersonalSkillRemoveRequest(
    requireNonEmptyString(record['requestId'], 'Desktop Home requestId is required.'),
    requireEndpointEpoch(record['endpointEpoch']),
    requireManagementId(record['managementId']),
    requireCatalogRevision(record['expectedCatalogRevision']),
  );
}

export function parseDesktopHomeAssetSearchResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetSearchResult {
  return parseSearchResult(value, expectedRequestId, 'Asset Library', parseGlobalAssetItem);
}

export function parseDesktopHomeMediaLibrarySearchResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibrarySearchResult {
  return parseSearchResult(value, expectedRequestId, 'Media Library', parseGlobalMediaLibraryItem);
}

export function parseDesktopHomeMediaLibraryChildrenResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryChildrenResult {
  return parseDesktopHomeMediaLibrarySearchResult(value, expectedRequestId);
}

export function parseDesktopHomeAssetImportResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetImportResult {
  const base = requireRecord(value, 'Desktop Home Asset import result must be an object.');
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  const revision = requireRevision(base['revision']);
  if (base['status'] === 'cancelled') {
    requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'status', 'revision'],
      'Desktop Home Asset import cancelled result is invalid.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'cancelled',
      revision,
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'status', 'revision', 'outcomes'],
    'Desktop Home Asset import result is invalid.',
  );
  if (record['status'] !== 'completed' || !Array.isArray(record['outcomes'])) {
    throw new Error('Desktop Home Asset import result status or outcomes are invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'completed',
    revision,
    outcomes: record['outcomes'].map(parseAssetImportOutcome),
  };
}

export function parseDesktopHomeAssetRemoveResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeAssetRemoveResult {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'status', 'assetId', 'revision'],
    'Desktop Home Asset remove result is invalid.',
  );
  requireVersion(record['schemaVersion']);
  if (record['status'] !== 'removed') {
    throw new Error('Desktop Home Asset remove result status is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireRequestId(record['requestId'], expectedRequestId),
    status: 'removed',
    assetId: requireAssetId(record['assetId']),
    revision: requireRevision(record['revision']),
  };
}

export function parseDesktopHomeLibraryThumbnailResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeLibraryThumbnailResult {
  const record = requireExactRecord(
    value,
    [
      'schemaVersion',
      'requestId',
      'owner',
      'itemId',
      'expectedCatalogRevision',
      'descriptorId',
      'thumbnailRevision',
      'variant',
      'dataUrl',
    ],
    'Desktop Home Library thumbnail result is invalid.',
  );
  requireVersion(record['schemaVersion']);
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireRequestId(record['requestId'], expectedRequestId),
    ...parseGlobalLibraryThumbnailResult({
      owner: record['owner'],
      itemId: record['itemId'],
      expectedCatalogRevision: record['expectedCatalogRevision'],
      descriptorId: record['descriptorId'],
      thumbnailRevision: record['thumbnailRevision'],
      variant: record['variant'],
      dataUrl: record['dataUrl'],
    }),
  };
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
      ['schemaVersion', 'requestId', 'status', 'revision'],
      'Desktop Home add Media Library cancelled result is invalid.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'cancelled',
      revision: requireRevision(base['revision']),
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'status', 'libraryId', 'revision'],
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
    revision: requireRevision(record['revision']),
  };
}

export function parseDesktopHomeMediaLibraryRelinkResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeMediaLibraryRelinkResult {
  const base = requireRecord(value, 'Desktop Home relink Media Library result must be an object.');
  requireVersion(base['schemaVersion']);
  const requestId = requireRequestId(base['requestId'], expectedRequestId);
  const revision = requireRevision(base['revision']);
  if (base['status'] === 'cancelled') {
    requireExactRecord(
      base,
      ['schemaVersion', 'requestId', 'status', 'revision'],
      'Desktop Home relink Media Library cancelled result is invalid.',
    );
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'cancelled',
      revision,
    };
  }
  const record = requireExactRecord(
    base,
    ['schemaVersion', 'requestId', 'status', 'libraryId', 'revision'],
    'Desktop Home relink Media Library result is invalid.',
  );
  if (record['status'] !== 'relinked') {
    throw new Error('Desktop Home relink Media Library result status is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'relinked',
    libraryId: requireMediaLibraryId(record['libraryId']),
    revision,
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

export function parseDesktopHomeExtensionsResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeExtensionsResult {
  const record = requireExactRecord(
    value,
    [
      'schemaVersion',
      'requestId',
      'catalogRevision',
      'skills',
      'skillDiscovery',
      'extensions',
      'extensionDiscovery',
    ],
    'Desktop Home extensions result is invalid.',
  );
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  if (!Array.isArray(record['skills']) || !Array.isArray(record['extensions'])) {
    throw new Error('Desktop Home extensions result is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    catalogRevision: requireCatalogRevision(record['catalogRevision']),
    skills: record['skills'].map(parseSkillItem),
    skillDiscovery: parseSkillDiscovery(record['skillDiscovery']),
    extensions: record['extensions'].map(parseExtensionItem),
    extensionDiscovery: parseExtensionDiscovery(record['extensionDiscovery']),
  };
}

export function parseDesktopHomeExtensionMutationResult(
  value: unknown,
  expectedRequestId: string,
): DesktopHomeExtensionMutationResult {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'status', 'operation', 'targetId', 'catalogRevision'],
    'Desktop Home extension mutation result is invalid.',
  );
  requireVersion(record['schemaVersion']);
  const requestId = requireRequestId(record['requestId'], expectedRequestId);
  const operation = requireExtensionMutationKind(record['operation']);
  const catalogRevision = requireCatalogRevision(record['catalogRevision']);
  if (record['status'] === 'cancelled') {
    if (operation !== 'personal-skill-install' || record['targetId'] !== '') {
      throw new Error('Desktop Home cancelled extension mutation result is invalid.');
    }
    return {
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId,
      status: 'cancelled',
      operation,
      targetId: '',
      catalogRevision,
    };
  }
  if (record['status'] !== 'completed') {
    throw new Error('Desktop Home extension mutation result status is invalid.');
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'completed',
    operation,
    targetId:
      operation === 'marketplaces-refresh'
        ? requireEmptyString(record['targetId'])
        : requireNonEmptyString(
            record['targetId'],
            'Desktop Home extension mutation target is required.',
          ),
    catalogRevision,
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
      readonly revision: number;
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
    ['schemaVersion', 'requestId', 'status', 'revision', 'items'],
    `Desktop Home ${label} ready result is invalid.`,
  );
  if (record['status'] !== 'ready' || !Array.isArray(record['items'])) {
    throw new Error(`Desktop Home ${label} result status or items are invalid.`);
  }
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId,
    status: 'ready',
    revision: requireRevision(record['revision']),
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
  readonly revision: number;
} {
  const record = requireExactRecord(
    value,
    ['schemaVersion', 'requestId', 'status', 'libraryId', 'revision'],
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
    revision: requireRevision(record['revision']),
  };
}

function parseAssetImportOutcome(value: unknown): DesktopHomeAssetImportOutcome {
  const base = requireRecord(value, 'Desktop Home Asset import outcome must be an object.');
  const label = requireAssetImportLabel(base['label']);
  if (base['status'] === 'added') {
    const record = requireExactRecord(
      base,
      ['status', 'label', 'assetId'],
      'Desktop Home added Asset import outcome is invalid.',
    );
    return {
      status: 'added',
      label,
      assetId: requireAssetId(record['assetId']),
    };
  }
  const record = requireExactRecord(
    base,
    ['status', 'label', 'diagnostic'],
    'Desktop Home non-added Asset import outcome is invalid.',
  );
  if (record['status'] !== 'conflict' && record['status'] !== 'rejected') {
    throw new Error('Desktop Home Asset import outcome status is invalid.');
  }
  return {
    status: record['status'],
    label,
    diagnostic: requireNonEmptyString(
      record['diagnostic'],
      'Desktop Home Asset import diagnostic is required.',
    ),
  };
}

function parseSkillItem(value: unknown): DesktopHomeSkillItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'source', 'sourceId', 'managementId', 'canRemove'],
    'Desktop Home Skill item is invalid.',
  );
  const source = requireSkillSource(record['source']);
  const sourceId = requireNonEmptyString(
    record['sourceId'],
    'Desktop Home Skill source id is required.',
  );
  const managementId = requireString(
    record['managementId'],
    'Desktop Home Skill management id must be a string.',
  );
  if (typeof record['canRemove'] !== 'boolean') {
    throw new Error('Desktop Home Skill removal capability is invalid.');
  }
  if (source === 'plugin') {
    requirePluginId(sourceId);
  } else if (sourceId !== source) {
    throw new Error('Desktop Home Skill source identity is inconsistent.');
  }
  if (
    (source === 'personal' && (!record['canRemove'] || managementId.length === 0)) ||
    (source !== 'personal' && (record['canRemove'] || managementId.length > 0))
  ) {
    throw new Error('Desktop Home Skill management capability is inconsistent.');
  }
  const name = requireNonEmptyString(record['name'], 'Desktop Home Skill name is required.');
  const id = requireNonEmptyString(record['id'], 'Desktop Home Skill id is required.');
  if (!id.startsWith(`${source}:${sourceId}:`)) {
    throw new Error('Desktop Home Skill identity is inconsistent.');
  }
  return {
    id,
    name,
    description: requireString(
      record['description'],
      'Desktop Home Skill description must be a string.',
    ),
    source,
    sourceId,
    managementId: source === 'personal' ? requireManagementId(managementId) : '',
    canRemove: record['canRemove'],
  };
}

function parseExtensionItem(value: unknown): DesktopHomeExtensionItem {
  const record = requireExactRecord(
    value,
    [
      'id',
      'name',
      'displayName',
      'description',
      'version',
      'developer',
      'marketplace',
      'category',
      'installed',
      'enabled',
      'canInstall',
      'canRemove',
      'agentStatus',
      'runtimeDiagnosticCode',
      'iconDataUrl',
      'mcpServerIds',
      'hasSkills',
      'appIds',
    ],
    'Desktop Home extension item is invalid.',
  );
  const name = requireExtensionIdentifier(
    record['name'],
    'Desktop Home extension name is invalid.',
  );
  const marketplace = requireExtensionIdentifier(
    record['marketplace'],
    'Desktop Home extension marketplace is invalid.',
  );
  const id = requireNonEmptyString(record['id'], 'Desktop Home extension id is required.');
  if (id !== `${name}@${marketplace}`) {
    throw new Error('Desktop Home extension identity is inconsistent.');
  }
  if (typeof record['hasSkills'] !== 'boolean') {
    throw new Error('Desktop Home extension Skill contribution flag is invalid.');
  }
  const installed = requireBoolean(record['installed'], 'installed');
  const enabled = requireBoolean(record['enabled'], 'enabled');
  const canInstall = requireBoolean(record['canInstall'], 'canInstall');
  const canRemove = requireBoolean(record['canRemove'], 'canRemove');
  if ((installed && canInstall) || (!installed && canRemove) || (!installed && enabled)) {
    throw new Error('Desktop Home extension management flags are inconsistent.');
  }
  const agentStatus = requireExtensionAgentStatus(record['agentStatus']);
  if (!installed && agentStatus !== 'not-installed') {
    throw new Error('Desktop Home extension Agent status is inconsistent.');
  }
  return {
    id,
    name,
    displayName: requireNonEmptyString(
      record['displayName'],
      'Desktop Home extension display name is required.',
    ),
    description: requireString(
      record['description'],
      'Desktop Home extension description must be a string.',
    ),
    version: requireNonEmptyString(
      record['version'],
      'Desktop Home extension version is required.',
    ),
    developer: requireString(
      record['developer'],
      'Desktop Home extension developer must be a string.',
    ),
    marketplace,
    category: requireString(
      record['category'],
      'Desktop Home extension category must be a string.',
    ),
    installed,
    enabled,
    canInstall,
    canRemove,
    agentStatus,
    runtimeDiagnosticCode: requireExtensionDiagnosticValue(record['runtimeDiagnosticCode']),
    iconDataUrl: requireExtensionIconDataUrl(record['iconDataUrl']),
    mcpServerIds: requireUniqueExtensionIdentifiers(
      record['mcpServerIds'],
      'Desktop Home extension MCP Server ids are invalid.',
    ),
    hasSkills: record['hasSkills'],
    appIds: requireUniqueExtensionIdentifiers(
      record['appIds'],
      'Desktop Home extension App ids are invalid.',
    ),
  };
}

function parseExtensionDiscovery(value: unknown): DesktopHomeExtensionDiscoveryProjection {
  const record = requireExactRecord(
    value,
    ['diagnostics'],
    'Desktop Home extension discovery projection is invalid.',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Desktop Home extension discovery projection is invalid.');
  }
  return {
    diagnostics: record['diagnostics'].map((value) => {
      const diagnostic = requireExactRecord(
        value,
        ['code', 'count'],
        'Desktop Home extension diagnostic is invalid.',
      );
      return {
        code: requireExtensionDiagnosticCode(diagnostic['code']),
        count: requirePositiveInteger(
          diagnostic['count'],
          'Desktop Home extension diagnostic count is invalid.',
        ),
      };
    }),
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

function requireExtensionDiagnosticCode(value: unknown): DesktopHomeExtensionDiagnosticCode {
  if (
    value !== 'repository_unavailable' &&
    value !== 'repository_failed' &&
    value !== 'repository_invalid' &&
    value !== 'manifest_invalid' &&
    value !== 'contribution_invalid' &&
    value !== 'runtime_unsupported' &&
    value !== 'runtime_failed' &&
    value !== 'skill_invalid'
  ) {
    throw new Error('Desktop Home extension diagnostic code is invalid.');
  }
  return value;
}

function requireUniqueExtensionIdentifiers(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(message);
  const identifiers = value.map((item) => requireExtensionIdentifier(item, message));
  if (new Set(identifiers).size !== identifiers.length) throw new Error(message);
  return identifiers;
}

function requireExtensionIdentifier(value: unknown, message: string): string {
  const identifier = requireNonEmptyString(value, message);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(identifier)) throw new Error(message);
  return identifier;
}

function requireSkillSource(value: unknown): DesktopHomeSkillItem['source'] {
  if (value !== 'personal' && value !== 'plugin') {
    throw new Error('Desktop Home Skill source is invalid.');
  }
  return value;
}

function requireExtensionAgentStatus(value: unknown): DesktopHomeExtensionAgentStatus {
  if (
    value !== 'not-installed' &&
    value !== 'ready' &&
    value !== 'partial' &&
    value !== 'unsupported' &&
    value !== 'error'
  ) {
    throw new Error('Desktop Home extension Agent status is invalid.');
  }
  return value;
}

function requireExtensionMutationKind(value: unknown): DesktopHomeExtensionMutationKind {
  if (
    value !== 'plugin-install' &&
    value !== 'plugin-remove' &&
    value !== 'marketplaces-refresh' &&
    value !== 'personal-skill-install' &&
    value !== 'personal-skill-remove'
  ) {
    throw new Error('Desktop Home extension mutation kind is invalid.');
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Desktop Home extension ${label} flag is invalid.`);
  }
  return value;
}

function requireCatalogRevision(value: unknown): string {
  const revision = requireNonEmptyString(
    value,
    'Desktop Home extension catalog revision is required.',
  );
  if (!/^sha256:[0-9a-f]{64}$/u.test(revision)) {
    throw new Error('Desktop Home extension catalog revision is invalid.');
  }
  return revision;
}

function requirePluginId(value: unknown): string {
  const id = requireNonEmptyString(value, 'Desktop Home plugin id is required.');
  const separator = id.lastIndexOf('@');
  if (separator <= 0 || separator === id.length - 1) {
    throw new Error('Desktop Home plugin id is invalid.');
  }
  requireExtensionIdentifier(id.slice(0, separator), 'Desktop Home plugin id is invalid.');
  requireExtensionIdentifier(id.slice(separator + 1), 'Desktop Home plugin id is invalid.');
  return id;
}

function requireManagementId(value: unknown): string {
  const id = requireNonEmptyString(value, 'Desktop Home Skill management id is required.');
  if (!/^skill:[0-9a-f]{64}$/u.test(id)) {
    throw new Error('Desktop Home Skill management id is invalid.');
  }
  return id;
}

function requireExtensionDiagnosticValue(value: unknown): string {
  const code = requireString(
    value,
    'Desktop Home extension runtime diagnostic code must be a string.',
  );
  if (code !== '' && !/^[a-z][a-z0-9._-]*$/u.test(code)) {
    throw new Error('Desktop Home extension runtime diagnostic code is invalid.');
  }
  return code;
}

function requireExtensionIconDataUrl(value: unknown): string {
  const dataUrl = requireString(value, 'Desktop Home extension icon data URL must be a string.');
  if (
    dataUrl !== '' &&
    !/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/u.test(dataUrl)
  ) {
    throw new Error('Desktop Home extension icon data URL is invalid.');
  }
  return dataUrl;
}

function requireEmptyString(value: unknown): '' {
  if (value !== '') throw new Error('Desktop Home extension mutation target must be empty.');
  return '';
}

function createDesktopHomeRequestIdentity(
  requestId: string,
  endpointEpoch: string,
): DesktopHomeManagementRequest {
  return {
    schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop Home requestId is required.'),
    endpointEpoch: requireEndpointEpoch(endpointEpoch),
  };
}

function requireEndpointEpoch(value: unknown): string {
  return requireNonEmptyString(value, 'Desktop Home endpoint epoch is required.');
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

function requireAssetId(value: unknown): string {
  const assetId = requireNonEmptyString(value, 'Desktop Home Asset id is required.');
  if (!/^global-asset-library:[a-f0-9]+$/u.test(assetId)) {
    throw new Error('Desktop Home Asset id is invalid.');
  }
  return assetId;
}

function requireAssetImportLabel(value: unknown): string {
  const label = requireNonEmptyString(value, 'Desktop Home Asset import label is required.');
  if (label === '.' || label === '..' || label.includes('/') || label.includes('\\')) {
    throw new Error('Desktop Home Asset import label is invalid.');
  }
  return label;
}

function requireMediaLibraryLocationKind(value: unknown): MediaLibraryLocationKind {
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

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function requireRevision(value: unknown): number {
  return requireNonNegativeInteger(value, 'Desktop Home catalog revision is invalid.');
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
