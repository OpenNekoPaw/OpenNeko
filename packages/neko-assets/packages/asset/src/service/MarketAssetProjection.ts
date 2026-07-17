import type {
  AssetEntity,
  AssetManifest,
  CreateEntityInput,
  EntityCategory,
  InstalledPackage,
  InstalledPackageStatus,
  MediaKind,
} from '@neko/shared';

export interface MarketAssetProjection {
  packageId: string;
  name: string;
  category: EntityCategory;
  installedPath: string;
  type: 'media' | 'identity';
  status: InstalledPackageStatus;
  detailCommand: 'neko.market.open';
  detailArgs: { packageId: string };
}

const BLOCKING_MARKET_STATUSES = new Set<InstalledPackageStatus>(['expired', 'incompatible']);

type AssetLibraryMarketInstall = InstalledPackage & { type: 'media' | 'identity' };

export function isUsableMarketAssetInstall(
  pkg: InstalledPackage,
): pkg is AssetLibraryMarketInstall {
  if (!pkg.enabled) return false;
  if (pkg.type !== 'media' && pkg.type !== 'identity') return false;
  if (pkg.status && BLOCKING_MARKET_STATUSES.has(pkg.status)) return false;
  return Boolean(pkg.installedPath);
}

export function projectMarketAssetInstall(
  pkg: InstalledPackage,
): MarketAssetProjection | undefined {
  if (!isUsableMarketAssetInstall(pkg)) return undefined;

  return {
    packageId: pkg.packageId,
    name: pkg.manifest.name,
    category: toEntityCategory(pkg.manifest),
    installedPath: pkg.installedPath,
    type: pkg.type,
    status: pkg.status ?? 'active',
    detailCommand: 'neko.market.open',
    detailArgs: { packageId: pkg.packageId },
  };
}

export function projectMarketAssetInstalls(
  packages: readonly InstalledPackage[],
): MarketAssetProjection[] {
  return packages
    .map((pkg) => projectMarketAssetInstall(pkg))
    .filter((projection): projection is MarketAssetProjection => projection !== undefined);
}

export function marketAssetProjectionToEntityInput(
  projection: MarketAssetProjection,
): CreateEntityInput {
  return {
    name: projection.name,
    category: projection.category,
    tags: ['market', projection.type],
    metadata: {
      source: {
        type: 'stock',
        provider: 'neko-market',
        sourceUrl: `market://${projection.packageId}`,
      },
    },
    ownership: { scope: 'purchased', access: 'readonly' },
  };
}

export function isMarketProjectedEntity(entity: AssetEntity, packageId?: string): boolean {
  const source = entity.metadata.source;
  if (source?.provider !== 'neko-market') return false;
  if (!packageId) return true;
  return source.sourceUrl === `market://${packageId}`;
}

function toEntityCategory(manifest: AssetManifest): EntityCategory {
  if (manifest.type === 'identity') {
    const kind =
      manifest.typeMetadata?.type === 'identity'
        ? manifest.typeMetadata.data.identityKind
        : undefined;
    if (kind === 'character') return 'character';
    if (kind === 'location') return 'environment';
    return 'object';
  }

  const mediaKind =
    manifest.typeMetadata?.type === 'media' ? manifest.typeMetadata.data.mediaKind : undefined;
  return toMediaEntityCategory(mediaKind);
}

function toMediaEntityCategory(mediaKind: MediaKind | undefined): EntityCategory {
  switch (mediaKind) {
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
    case 'video':
    case 'image':
    case 'sequence':
      return 'effect';
    case '3d-model':
    case 'puppet-model':
    case 'puppet-motion':
    default:
      return 'object';
  }
}
