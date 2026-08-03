import {
  ASSET_CENTER_SESSION_CONTRACT_VERSION,
  parseAssetCenterFilterProjection,
  parseAssetCenterSessionIdentity,
  parseAssetCenterSessionProjection,
  type AssetCenterFilterProjection,
  type AssetCenterSessionIdentity,
  type AssetCenterSessionProjection,
} from './contract';
import {
  parseAuthorizedPreviewSessionProjection,
  type AuthorizedPreviewSessionProjection,
} from '@neko/preview-domain/authorized-session';
import {
  GLOBAL_LIBRARY_OWNERS,
  GLOBAL_LIBRARY_THUMBNAIL_VARIANTS,
  parseGlobalLibraryThumbnailResult,
  type GlobalLibraryOwner,
  type GlobalLibraryThumbnailResult,
  type GlobalLibraryThumbnailVariant,
  type GlobalMediaLibraryLocationKind,
} from '../global-library';

export { ASSET_CENTER_SESSION_CONTRACT_VERSION } from './contract';

export const ASSET_CENTER_HOST_CHANNEL = 'neko:assets:asset-center' as const;

interface AssetCenterHostRequestBase {
  readonly schemaVersion: typeof ASSET_CENTER_SESSION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly endpointEpoch: string;
  readonly identity: AssetCenterSessionIdentity;
}

export type AssetCenterHostRequest =
  | (AssetCenterHostRequestBase & {
      readonly route: 'attach';
      readonly initialViewMode: AssetCenterFilterProjection['viewMode'];
    })
  | (AssetCenterHostRequestBase & { readonly route: 'snapshot.get' | 'preview.detach' })
  | (AssetCenterHostRequestBase & {
      readonly route: 'filter.update';
      readonly expectedRevision: number;
      readonly filter: AssetCenterFilterProjection;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'catalog.refresh';
      readonly expectedRevision: number;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'selection.select';
      readonly expectedRevision: number;
      readonly owner: GlobalLibraryOwner;
      readonly itemId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'preview.get';
      readonly previewSessionId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'thumbnail.resolve';
      readonly expectedRevision: number;
      readonly itemId: string;
      readonly variant: GlobalLibraryThumbnailVariant;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'asset.import';
      readonly expectedRevision: number;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'asset.remove';
      readonly expectedRevision: number;
      readonly itemId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'media-library.add';
      readonly expectedRevision: number;
      readonly locationKind: GlobalMediaLibraryLocationKind;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'media-library.relink' | 'media-library.remove' | 'media-library.reveal';
      readonly expectedRevision: number;
      readonly libraryId: string;
    });

export type AssetCenterHostResult =
  | {
      readonly schemaVersion: typeof ASSET_CENTER_SESSION_CONTRACT_VERSION;
      readonly requestId: string;
      readonly route: Exclude<AssetCenterHostRequest['route'], 'preview.get' | 'thumbnail.resolve'>;
      readonly projection: AssetCenterSessionProjection;
    }
  | {
      readonly schemaVersion: typeof ASSET_CENTER_SESSION_CONTRACT_VERSION;
      readonly requestId: string;
      readonly route: 'preview.get';
      readonly preview: AuthorizedPreviewSessionProjection;
    }
  | {
      readonly schemaVersion: typeof ASSET_CENTER_SESSION_CONTRACT_VERSION;
      readonly requestId: string;
      readonly route: 'thumbnail.resolve';
      readonly thumbnail: GlobalLibraryThumbnailResult;
    };

export interface OpenNekoAssetCenterBridge {
  readonly assetCenter: {
    execute(request: AssetCenterHostRequest): Promise<AssetCenterHostResult>;
  };
}

type AssetCenterHostRequestInput = AssetCenterHostRequest extends infer Request
  ? Request extends { readonly schemaVersion: number }
    ? Omit<Request, 'schemaVersion'>
    : never
  : never;

export function createAssetCenterHostRequest(
  input: AssetCenterHostRequestInput,
): AssetCenterHostRequest {
  return parseAssetCenterHostRequest({
    schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
    ...input,
  });
}

export function parseAssetCenterHostRequest(value: unknown): AssetCenterHostRequest {
  const record = requireRecord(value, 'Asset Center Host request must be an object.');
  if (record['schemaVersion'] !== ASSET_CENTER_SESSION_CONTRACT_VERSION) {
    throw new Error(`Unsupported Asset Center Host version '${String(record['schemaVersion'])}'.`);
  }
  const base = {
    schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
    requestId: requireIdentity(record['requestId'], 'Asset Center request'),
    endpointEpoch: requireIdentity(record['endpointEpoch'], 'Asset Center endpoint'),
    identity: parseAssetCenterSessionIdentity(record['identity']),
  } as const;
  switch (record['route']) {
    case 'attach':
      requireExactKeys(record, [...BASE_KEYS, 'initialViewMode'], 'Asset Center attach request');
      return {
        ...base,
        route: 'attach',
        initialViewMode: requireViewMode(record['initialViewMode']),
      };
    case 'snapshot.get':
    case 'preview.detach':
      requireExactKeys(record, BASE_KEYS, 'Asset Center snapshot request');
      return { ...base, route: record['route'] };
    case 'catalog.refresh':
    case 'asset.import':
      requireExactKeys(record, [...BASE_KEYS, 'expectedRevision'], 'Asset Center refresh request');
      return {
        ...base,
        route: record['route'],
        expectedRevision: requireRevision(record['expectedRevision']),
      };
    case 'filter.update':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'filter'],
        'Asset Center filter request',
      );
      return {
        ...base,
        route: 'filter.update',
        expectedRevision: requireRevision(record['expectedRevision']),
        filter: parseAssetCenterFilterProjection(record['filter']),
      };
    case 'selection.select':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'owner', 'itemId'],
        'Asset Center selection request',
      );
      return {
        ...base,
        route: 'selection.select',
        expectedRevision: requireRevision(record['expectedRevision']),
        owner: requireOwner(record['owner']),
        itemId: requireIdentity(record['itemId'], 'Asset Center selected item'),
      };
    case 'preview.get':
      requireExactKeys(record, [...BASE_KEYS, 'previewSessionId'], 'Asset Center Preview request');
      return {
        ...base,
        route: 'preview.get',
        previewSessionId: requireIdentity(
          record['previewSessionId'],
          'Asset Center Preview session',
        ),
      };
    case 'thumbnail.resolve':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'itemId', 'variant'],
        'Asset Center thumbnail request',
      );
      return {
        ...base,
        route: 'thumbnail.resolve',
        expectedRevision: requireRevision(record['expectedRevision']),
        itemId: requireIdentity(record['itemId'], 'Asset Center thumbnail item'),
        variant: requireThumbnailVariant(record['variant']),
      };
    case 'asset.remove':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'itemId'],
        'Asset Center asset removal request',
      );
      return {
        ...base,
        route: 'asset.remove',
        expectedRevision: requireRevision(record['expectedRevision']),
        itemId: requireIdentity(record['itemId'], 'Asset Center asset item'),
      };
    case 'media-library.add':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'locationKind'],
        'Asset Center Media Library add request',
      );
      return {
        ...base,
        route: 'media-library.add',
        expectedRevision: requireRevision(record['expectedRevision']),
        locationKind: requireLocationKind(record['locationKind']),
      };
    case 'media-library.relink':
    case 'media-library.remove':
    case 'media-library.reveal':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'expectedRevision', 'libraryId'],
        'Asset Center Media Library request',
      );
      return {
        ...base,
        route: record['route'],
        expectedRevision: requireRevision(record['expectedRevision']),
        libraryId: requireIdentity(record['libraryId'], 'Asset Center Media Library'),
      };
    default:
      throw new Error(`Unknown Asset Center Host route '${String(record['route'])}'.`);
  }
}

export function parseAssetCenterHostResult(
  value: unknown,
  request: AssetCenterHostRequest,
): AssetCenterHostResult {
  const record = requireRecord(value, 'Asset Center Host result must be an object.');
  if (
    record['schemaVersion'] !== ASSET_CENTER_SESSION_CONTRACT_VERSION ||
    record['requestId'] !== request.requestId ||
    record['route'] !== request.route
  ) {
    throw new Error('Asset Center Host result identity is stale.');
  }
  if (request.route === 'preview.get') {
    requireExactKeys(
      record,
      ['schemaVersion', 'requestId', 'route', 'preview'],
      'Asset Center Preview result',
    );
    return {
      schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
      requestId: request.requestId,
      route: request.route,
      preview: parseAuthorizedPreviewSessionProjection(record['preview']),
    };
  }
  if (request.route === 'thumbnail.resolve') {
    requireExactKeys(
      record,
      ['schemaVersion', 'requestId', 'route', 'thumbnail'],
      'Asset Center thumbnail result',
    );
    return {
      schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
      requestId: request.requestId,
      route: request.route,
      thumbnail: parseGlobalLibraryThumbnailResult(record['thumbnail']),
    };
  }
  requireExactKeys(
    record,
    ['schemaVersion', 'requestId', 'route', 'projection'],
    'Asset Center Host result',
  );
  return {
    schemaVersion: ASSET_CENTER_SESSION_CONTRACT_VERSION,
    requestId: request.requestId,
    route: request.route,
    projection: parseAssetCenterSessionProjection(record['projection']),
  };
}

const BASE_KEYS = ['schemaVersion', 'requestId', 'endpointEpoch', 'identity', 'route'] as const;

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  owner: string,
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error(`${owner} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${owner} is required.`);
  return value;
}

function requireRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Asset Center expected revision must be a non-negative integer.');
  }
  return value;
}

function requireOwner(value: unknown): GlobalLibraryOwner {
  const owner = GLOBAL_LIBRARY_OWNERS.find((candidate) => candidate === value);
  if (!owner) throw new Error('Asset Center resource owner is invalid.');
  return owner;
}

function requireViewMode(value: unknown): AssetCenterFilterProjection['viewMode'] {
  if (value !== 'list' && value !== 'grid') throw new Error('Asset Center view mode is invalid.');
  return value;
}

function requireThumbnailVariant(value: unknown): GlobalLibraryThumbnailVariant {
  const variant = GLOBAL_LIBRARY_THUMBNAIL_VARIANTS.find((candidate) => candidate === value);
  if (!variant) throw new Error('Asset Center thumbnail variant is invalid.');
  return variant;
}

function requireLocationKind(value: unknown): GlobalMediaLibraryLocationKind {
  if (value !== 'local' && value !== 'nas' && value !== 'cloud') {
    throw new Error('Asset Center Media Library location kind is invalid.');
  }
  return value;
}
