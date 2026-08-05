import {
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

export const ASSET_CENTER_HOST_CHANNEL = 'neko:assets:asset-center' as const;

interface AssetCenterHostRequestBase {
  readonly requestId: string;
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
      readonly filter: AssetCenterFilterProjection;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'catalog.refresh';
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'selection.select';
      readonly owner: GlobalLibraryOwner;
      readonly itemId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'preview.get';
      readonly previewSessionId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'thumbnail.resolve';
      readonly itemId: string;
      readonly variant: GlobalLibraryThumbnailVariant;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'asset.import';
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'asset.remove';
      readonly itemId: string;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'media-library.add';
      readonly locationKind: GlobalMediaLibraryLocationKind;
    })
  | (AssetCenterHostRequestBase & {
      readonly route: 'media-library.relink' | 'media-library.remove' | 'media-library.reveal';
      readonly libraryId: string;
    });

export type AssetCenterHostResult =
  | {
      readonly requestId: string;
      readonly route: Exclude<AssetCenterHostRequest['route'], 'preview.get' | 'thumbnail.resolve'>;
      readonly projection: AssetCenterSessionProjection;
    }
  | {
      readonly requestId: string;
      readonly route: 'preview.get';
      readonly preview: AuthorizedPreviewSessionProjection;
    }
  | {
      readonly requestId: string;
      readonly route: 'thumbnail.resolve';
      readonly thumbnail: GlobalLibraryThumbnailResult;
    };

export interface OpenNekoAssetCenterBridge {
  readonly assetCenter: {
    execute(request: AssetCenterHostRequest): Promise<AssetCenterHostResult>;
  };
}

type AssetCenterHostRequestInput = AssetCenterHostRequest;

export function createAssetCenterHostRequest(
  input: AssetCenterHostRequestInput,
): AssetCenterHostRequest {
  return parseAssetCenterHostRequest(input);
}

export function parseAssetCenterHostRequest(value: unknown): AssetCenterHostRequest {
  const record = requireRecord(value, 'Asset Center Host request must be an object.');
  const base = {
    requestId: requireIdentity(record['requestId'], 'Asset Center request'),
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
      requireExactKeys(record, [...BASE_KEYS], 'Asset Center refresh request');
      return {
        ...base,
        route: record['route'],
      };
    case 'filter.update':
      requireExactKeys(record, [...BASE_KEYS, 'filter'], 'Asset Center filter request');
      return {
        ...base,
        route: 'filter.update',
        filter: parseAssetCenterFilterProjection(record['filter']),
      };
    case 'selection.select':
      requireExactKeys(record, [...BASE_KEYS, 'owner', 'itemId'], 'Asset Center selection request');
      return {
        ...base,
        route: 'selection.select',
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
        [...BASE_KEYS, 'itemId', 'variant'],
        'Asset Center thumbnail request',
      );
      return {
        ...base,
        route: 'thumbnail.resolve',
        itemId: requireIdentity(record['itemId'], 'Asset Center thumbnail item'),
        variant: requireThumbnailVariant(record['variant']),
      };
    case 'asset.remove':
      requireExactKeys(record, [...BASE_KEYS, 'itemId'], 'Asset Center asset removal request');
      return {
        ...base,
        route: 'asset.remove',
        itemId: requireIdentity(record['itemId'], 'Asset Center asset item'),
      };
    case 'media-library.add':
      requireExactKeys(
        record,
        [...BASE_KEYS, 'locationKind'],
        'Asset Center Media Library add request',
      );
      return {
        ...base,
        route: 'media-library.add',
        locationKind: requireLocationKind(record['locationKind']),
      };
    case 'media-library.relink':
    case 'media-library.remove':
    case 'media-library.reveal':
      requireExactKeys(record, [...BASE_KEYS, 'libraryId'], 'Asset Center Media Library request');
      return {
        ...base,
        route: record['route'],
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
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Asset Center Host result identity is stale.');
  }
  if (request.route === 'preview.get') {
    requireExactKeys(record, ['requestId', 'route', 'preview'], 'Asset Center Preview result');
    return {
      requestId: request.requestId,
      route: request.route,
      preview: parseAuthorizedPreviewSessionProjection(record['preview']),
    };
  }
  if (request.route === 'thumbnail.resolve') {
    requireExactKeys(record, ['requestId', 'route', 'thumbnail'], 'Asset Center thumbnail result');
    return {
      requestId: request.requestId,
      route: request.route,
      thumbnail: parseGlobalLibraryThumbnailResult(record['thumbnail']),
    };
  }
  requireExactKeys(record, ['requestId', 'route', 'projection'], 'Asset Center Host result');
  return {
    requestId: request.requestId,
    route: request.route,
    projection: parseAssetCenterSessionProjection(record['projection']),
  };
}

const BASE_KEYS = ['requestId', 'identity', 'route'] as const;

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
