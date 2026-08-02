export const GLOBAL_LIBRARY_OWNERS = ['global-asset-library', 'media-library'] as const;
export type GlobalLibraryOwner = (typeof GLOBAL_LIBRARY_OWNERS)[number];

export const GLOBAL_LIBRARY_THUMBNAIL_VARIANTS = ['icon', 'hover'] as const;
export type GlobalLibraryThumbnailVariant = (typeof GLOBAL_LIBRARY_THUMBNAIL_VARIANTS)[number];

export type GlobalLibraryCatalogSort = 'name' | 'modifiedAt';
export type GlobalLibrarySortDirection = 'ascending' | 'descending';
export type GlobalMediaLibraryLocationKind = 'local' | 'nas' | 'cloud';
export type GlobalLibraryViewMode = 'list' | 'grid';

export interface GlobalLibraryThumbnailDescriptor {
  readonly descriptorId: string;
  readonly revision: string;
  readonly mediaType: 'image' | 'video';
}

interface GlobalLibraryItemBase {
  readonly id: string;
  readonly owner: GlobalLibraryOwner;
  readonly label: string;
  readonly description?: string;
  readonly mediaType?: string;
  readonly byteLength?: number;
  readonly modifiedAt?: string;
  readonly availability: 'available' | 'unavailable';
  readonly thumbnail?: GlobalLibraryThumbnailDescriptor;
}

export interface GlobalAssetItem extends GlobalLibraryItemBase {
  readonly owner: 'global-asset-library';
  readonly kind: 'asset';
}

export interface GlobalMediaLibraryItem extends GlobalLibraryItemBase {
  readonly owner: 'media-library';
  readonly libraryId: string;
  readonly libraryLabel: string;
  readonly kind: 'library' | 'directory' | 'file';
  readonly locationKind: GlobalMediaLibraryLocationKind;
  readonly relativePath: string;
}

export type GlobalLibraryItem = GlobalAssetItem | GlobalMediaLibraryItem;

export interface GlobalAssetProjection {
  readonly revision: number;
  readonly items: readonly GlobalAssetItem[];
}

export interface GlobalMediaLibraryProjection {
  readonly revision: number;
  readonly items: readonly GlobalMediaLibraryItem[];
}

export interface GlobalLibrarySearchInput {
  readonly query: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly limit?: number;
}

export interface GlobalLibraryThumbnailRequest {
  readonly owner: GlobalLibraryOwner;
  readonly itemId: string;
  readonly expectedCatalogRevision: number;
  readonly descriptorId: string;
  readonly thumbnailRevision: string;
  readonly variant: GlobalLibraryThumbnailVariant;
}

export interface GlobalLibraryThumbnailResult extends GlobalLibraryThumbnailRequest {
  readonly dataUrl: string;
}

export type GlobalAssetImportOutcome =
  | {
      readonly status: 'added';
      readonly label: string;
      readonly assetId: string;
    }
  | {
      readonly status: 'conflict' | 'rejected';
      readonly label: string;
      readonly diagnostic: string;
    };

export type GlobalAssetImportResult =
  | {
      readonly status: 'cancelled';
      readonly revision: number;
    }
  | {
      readonly status: 'completed';
      readonly revision: number;
      readonly outcomes: readonly GlobalAssetImportOutcome[];
    };

export interface GlobalAssetRemoveResult {
  readonly status: 'removed';
  readonly assetId: string;
  readonly revision: number;
}

export type GlobalMediaLibraryAddResult =
  | {
      readonly status: 'added';
      readonly libraryId: string;
      readonly revision: number;
    }
  | {
      readonly status: 'cancelled';
      readonly revision: number;
    };

export type GlobalMediaLibraryRelinkResult =
  | {
      readonly status: 'relinked';
      readonly libraryId: string;
      readonly revision: number;
    }
  | {
      readonly status: 'cancelled';
      readonly revision: number;
    };

export interface GlobalMediaLibraryMutationResult {
  readonly status: 'removed' | 'revealed';
  readonly libraryId: string;
  readonly revision: number;
}

export interface GlobalLibraryBrowserRuntime {
  searchAssets(input: GlobalLibrarySearchInput): Promise<GlobalAssetProjection>;
  searchMediaLibraries(input: GlobalLibrarySearchInput): Promise<GlobalMediaLibraryProjection>;
  readMediaLibraryChildren(
    input: GlobalLibrarySearchInput & {
      readonly libraryId: string;
      readonly relativePath: string;
    },
  ): Promise<GlobalMediaLibraryProjection>;
  resolveThumbnail(request: GlobalLibraryThumbnailRequest): Promise<GlobalLibraryThumbnailResult>;
  importAssets(expectedRevision: number): Promise<GlobalAssetImportResult>;
  removeAsset(assetId: string, expectedRevision: number): Promise<GlobalAssetRemoveResult>;
  addMediaLibrary(
    locationKind: GlobalMediaLibraryLocationKind,
    expectedRevision: number,
  ): Promise<GlobalMediaLibraryAddResult>;
  relinkMediaLibrary(
    libraryId: string,
    expectedRevision: number,
  ): Promise<GlobalMediaLibraryRelinkResult>;
  removeMediaLibrary(
    libraryId: string,
    expectedRevision: number,
  ): Promise<GlobalMediaLibraryMutationResult>;
  revealMediaLibrary(
    libraryId: string,
    expectedRevision: number,
  ): Promise<GlobalMediaLibraryMutationResult>;
}

export function createGlobalLibraryOpaqueId(
  owner: GlobalLibraryOwner,
  canonicalKey: string,
): string {
  if (canonicalKey.length === 0) {
    throw new Error('Global Library canonical identity key is required.');
  }
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < canonicalKey.length; index += 1) {
    const code = canonicalKey.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${owner}:${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

export function createGlobalLibraryThumbnailDescriptor(input: {
  readonly owner: GlobalLibraryOwner;
  readonly itemId: string;
  readonly mediaType: string | undefined;
  readonly modifiedAt: string | undefined;
  readonly byteLength: number | undefined;
}): GlobalLibraryThumbnailDescriptor | undefined {
  if (input.mediaType !== 'image' && input.mediaType !== 'video') return undefined;
  return {
    descriptorId: createGlobalLibraryOpaqueId(input.owner, `thumbnail:${input.itemId}`),
    revision: `${input.modifiedAt ?? 'unknown'}:${input.byteLength ?? 0}`,
    mediaType: input.mediaType,
  };
}

export function parseGlobalAssetItem(value: unknown): GlobalAssetItem {
  const record = requireExactRecord(
    value,
    [
      'id',
      'owner',
      'label',
      'description',
      'kind',
      'mediaType',
      'byteLength',
      'modifiedAt',
      'availability',
      'thumbnail',
    ],
    'Global Asset Library item is invalid.',
  );
  if (record['owner'] !== 'global-asset-library' || record['kind'] !== 'asset') {
    throw new Error('Global Asset Library item owner or kind is invalid.');
  }
  return {
    ...parseGlobalLibraryItemBase(record),
    owner: 'global-asset-library',
    kind: 'asset',
  };
}

export function parseGlobalMediaLibraryItem(value: unknown): GlobalMediaLibraryItem {
  const record = requireExactRecord(
    value,
    [
      'id',
      'owner',
      'label',
      'description',
      'kind',
      'mediaType',
      'byteLength',
      'modifiedAt',
      'availability',
      'thumbnail',
      'libraryId',
      'libraryLabel',
      'locationKind',
      'relativePath',
    ],
    'Global Media Library item is invalid.',
  );
  const kind = requireOneOf(record['kind'], ['library', 'directory', 'file'] as const, 'kind');
  if (record['owner'] !== 'media-library') {
    throw new Error('Global Media Library item owner is invalid.');
  }
  return {
    ...parseGlobalLibraryItemBase(record),
    owner: 'media-library',
    kind,
    libraryId: requireNonEmptyString(
      record['libraryId'],
      'Global Media Library item libraryId is required.',
    ),
    libraryLabel: requireNonEmptyString(
      record['libraryLabel'],
      'Global Media Library item libraryLabel is required.',
    ),
    locationKind: requireOneOf(
      record['locationKind'],
      ['local', 'nas', 'cloud'] as const,
      'locationKind',
    ),
    relativePath: requireString(
      record['relativePath'],
      'Global Media Library relativePath must be a string.',
    ),
  };
}

export function parseGlobalLibraryThumbnailRequest(value: unknown): GlobalLibraryThumbnailRequest {
  const record = requireExactRecord(
    value,
    ['owner', 'itemId', 'expectedCatalogRevision', 'descriptorId', 'thumbnailRevision', 'variant'],
    'Global Library thumbnail request is invalid.',
  );
  return {
    owner: requireOneOf(record['owner'], GLOBAL_LIBRARY_OWNERS, 'owner'),
    itemId: requireNonEmptyString(record['itemId'], 'Global Library itemId is required.'),
    expectedCatalogRevision: requireRevision(record['expectedCatalogRevision']),
    descriptorId: requireNonEmptyString(
      record['descriptorId'],
      'Global Library descriptorId is required.',
    ),
    thumbnailRevision: requireNonEmptyString(
      record['thumbnailRevision'],
      'Global Library thumbnail revision is required.',
    ),
    variant: requireOneOf(
      record['variant'],
      GLOBAL_LIBRARY_THUMBNAIL_VARIANTS,
      'thumbnail variant',
    ),
  };
}

export function parseGlobalLibraryThumbnailResult(value: unknown): GlobalLibraryThumbnailResult {
  const record = requireExactRecord(
    value,
    [
      'owner',
      'itemId',
      'expectedCatalogRevision',
      'descriptorId',
      'thumbnailRevision',
      'variant',
      'dataUrl',
    ],
    'Global Library thumbnail result is invalid.',
  );
  return {
    ...parseGlobalLibraryThumbnailRequest({
      owner: record['owner'],
      itemId: record['itemId'],
      expectedCatalogRevision: record['expectedCatalogRevision'],
      descriptorId: record['descriptorId'],
      thumbnailRevision: record['thumbnailRevision'],
      variant: record['variant'],
    }),
    dataUrl: requireDataUrl(record['dataUrl']),
  };
}

function parseGlobalLibraryItemBase(
  record: Readonly<Record<string, unknown>>,
): Omit<GlobalLibraryItemBase, 'owner'> {
  return {
    id: requireNonEmptyString(record['id'], 'Global Library item id is required.'),
    label: requireNonEmptyString(record['label'], 'Global Library item label is required.'),
    ...(typeof record['description'] === 'string' ? { description: record['description'] } : {}),
    ...(typeof record['mediaType'] === 'string' ? { mediaType: record['mediaType'] } : {}),
    ...(record['byteLength'] === undefined
      ? {}
      : { byteLength: requireNonNegativeInteger(record['byteLength'], 'byteLength') }),
    ...(record['modifiedAt'] === undefined
      ? {}
      : {
          modifiedAt: requireIsoDate(record['modifiedAt'], 'Global Library modifiedAt is invalid.'),
        }),
    availability: requireOneOf(
      record['availability'],
      ['available', 'unavailable'] as const,
      'availability',
    ),
    ...(record['thumbnail'] === undefined
      ? {}
      : { thumbnail: parseGlobalLibraryThumbnailDescriptor(record['thumbnail']) }),
  };
}

function parseGlobalLibraryThumbnailDescriptor(value: unknown): GlobalLibraryThumbnailDescriptor {
  const record = requireExactRecord(
    value,
    ['descriptorId', 'revision', 'mediaType'],
    'Global Library thumbnail descriptor is invalid.',
  );
  return {
    descriptorId: requireNonEmptyString(
      record['descriptorId'],
      'Global Library descriptorId is required.',
    ),
    revision: requireNonEmptyString(
      record['revision'],
      'Global Library thumbnail revision is required.',
    ),
    mediaType: requireOneOf(
      record['mediaType'],
      ['image', 'video'] as const,
      'thumbnail mediaType',
    ),
  };
}

function requireExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new Error(message);
  }
  return record;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message);
  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  const matched = allowed.find((candidate) => candidate === value);
  if (!matched) throw new Error(`Global Library ${field} is invalid.`);
  return matched;
}

function requireRevision(value: unknown): number {
  return requireNonNegativeInteger(value, 'catalog revision');
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    throw new Error(`Global Library ${field} is invalid.`);
  }
  return value;
}

function requireIsoDate(value: unknown, message: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(message);
  }
  return value;
}

function requireDataUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('data:image/')) {
    throw new Error('Global Library thumbnail data URL is invalid.');
  }
  return value;
}
