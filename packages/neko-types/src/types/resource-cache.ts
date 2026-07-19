// =============================================================================
// Resource Cache Contracts
// =============================================================================
//
// Stable cache identity for derived resources. Paths are runtime resolution
// results; durable cross-package payloads should prefer ResourceRef.
// =============================================================================

import {
  parseDocumentLocator,
  parseDocumentSourceRef,
  type DocumentFormat,
  type DocumentLocator,
  type DocumentSourceRef,
} from './document-reading';

export type ResourceScope = 'project' | 'global' | 'extension-private';

export type ResourceKind = 'document' | 'media' | 'generated' | 'preview' | 'storyboard-reference';

export type ResourceVariantRole =
  'source' | 'thumbnail' | 'page-image' | 'document-entry' | 'preview' | 'proxy' | 'fov-crop';

export type ResourceCacheStatus =
  | 'ready'
  | 'missing'
  | 'stale'
  | 'materializing'
  | 'unsupported'
  | 'unauthorized'
  | 'failed'
  | 'non-portable';

export type ResourceRetentionHint = 'intermediate' | 'debug' | 'pinned' | 'promoted';

export type ResourceSourceKind =
  'document' | 'file' | 'media-library' | 'generated-asset' | 'preview-asset' | 'remote-url';

export type ResourceLocator =
  | { readonly kind: 'document'; readonly locator?: DocumentLocator; readonly entryPath?: string }
  | { readonly kind: 'file'; readonly path?: string; readonly uri?: string }
  | { readonly kind: 'generated-asset'; readonly assetId: string; readonly variantId?: string }
  | { readonly kind: 'preview-asset'; readonly assetId: string; readonly route?: string }
  | { readonly kind: 'storyboard-shot'; readonly sceneId?: string; readonly shotId: string };

export interface ResourceFileIdentity {
  readonly fileId?: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly hash?: string;
}

export interface ResourceSourceRef {
  readonly kind: ResourceSourceKind;
  readonly filePath?: string;
  readonly uri?: string;
  readonly projectRelativePath?: string;
  readonly mediaLibraryId?: string;
  readonly document?: DocumentSourceRef;
  readonly generatedAssetId?: string;
  readonly previewAssetId?: string;
  readonly identity?: ResourceFileIdentity;
  readonly metadata?: Record<string, unknown>;
}

export interface ResourceFingerprint {
  readonly strategy: 'identity' | 'hash' | 'mtime-size' | 'provider' | 'none';
  readonly value: string;
  readonly generatedAt?: string;
  readonly providerId?: string;
}

export interface ResourceRef {
  readonly id: string;
  readonly scope: ResourceScope;
  readonly provider: string;
  readonly kind: ResourceKind;
  readonly source: ResourceSourceRef;
  readonly locator?: ResourceLocator;
  readonly fingerprint: ResourceFingerprint;
}

export interface ResourceVariantRef {
  readonly resource: ResourceRef;
  readonly role: ResourceVariantRole;
  readonly format?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ResourceCacheEntry {
  readonly resource: ResourceRef;
  readonly variants: readonly ResourceCacheVariantEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAccessedAt?: string;
  readonly status: ResourceCacheStatus;
  readonly lifecycle?: ResourceCacheLifecycleMetadata;
  readonly providerMetadata?: Record<string, unknown>;
}

export interface ResourceCacheVariantEntry {
  readonly key: string;
  readonly role: ResourceVariantRole;
  readonly status: ResourceCacheStatus;
  readonly relativePath?: string;
  readonly absolutePath?: string;
  readonly format?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly sourceFingerprint?: ResourceFingerprint;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAccessedAt?: string;
  readonly pinned?: boolean;
  readonly sessionActive?: boolean;
  readonly retentionHint?: ResourceRetentionHint;
  readonly promoted?: boolean;
  readonly rebuildable?: boolean;
  readonly error?: string;
}

export interface ResourceCacheLifecycleMetadata {
  readonly processorRunId?: string;
  readonly stageId?: string;
  readonly attempt?: number;
  readonly retentionHint?: ResourceRetentionHint;
  readonly promoted?: boolean;
  readonly promotedTarget?: 'asset' | 'project' | 'mediaLibrary';
  readonly updatedAt: string;
  readonly ownerId?: string;
  readonly reason?: string;
}

export interface ResourceCacheManifest {
  readonly version: 1;
  readonly projectRoot?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: Record<string, ResourceCacheEntry>;
  readonly stats?: ResourceCacheStats;
}

export interface ResourceCacheManifestLoadOptions {
  readonly refresh?: boolean;
}

export interface ResourceCacheManifestStore {
  load(options?: ResourceCacheManifestLoadOptions): Promise<ResourceCacheManifest>;
  save(manifest: ResourceCacheManifest): Promise<void>;
  update(
    operation: (
      manifest: ResourceCacheManifest,
    ) => ResourceCacheManifest | Promise<ResourceCacheManifest>,
  ): Promise<ResourceCacheManifest>;
  invalidateCache(): void;
}

export interface ResourceCacheStats {
  readonly totalSizeBytes: number;
  readonly entryCount: number;
  readonly variantCount: number;
  readonly staleCount?: number;
  readonly missingCount?: number;
  readonly scopeBytes?: Partial<Record<ResourceScope, number>>;
  readonly providerBytes?: Record<string, number>;
  readonly statusCounts?: Partial<Record<ResourceCacheStatus, number>>;
  readonly roleCounts?: Partial<Record<ResourceVariantRole, number>>;
  readonly scopeEntryCounts?: Partial<Record<ResourceScope, number>>;
  readonly providerEntryCounts?: Record<string, number>;
  readonly lastAccessedAt?: string;
}

export interface ResourceCacheQuotaPolicy {
  readonly projectMaxBytes?: number;
  readonly globalMaxBytes?: number;
  readonly minFreeDiskBytes?: number;
  readonly preservePinned?: boolean;
  readonly preserveSessionActive?: boolean;
  readonly preserveDebug?: boolean;
  readonly preservePromoted?: boolean;
  readonly activeVariantKeys?: readonly string[];
}

export interface ResourceCacheSettings {
  readonly projectMaxBytes?: number;
  readonly globalMaxBytes?: number;
  readonly minFreeDiskBytes?: number;
  readonly preservePinned?: boolean;
  readonly preserveSessionActive?: boolean;
  readonly preserveDebug?: boolean;
  readonly preservePromoted?: boolean;
}

export const DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES = 512 * 1024 * 1024;

export interface ResourceVariantRequest {
  readonly role: ResourceVariantRole;
  readonly format?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
}

export type BrandedPath<TBrand extends string> = string & { readonly __pathBrand: TBrand };

export type ProjectFactPath = BrandedPath<'project-fact'>;
export type ProjectCachePath = BrandedPath<'project-cache'>;
export type GlobalCachePath = BrandedPath<'global-cache'>;
export type ExtensionPrivateCachePath = BrandedPath<'extension-private-cache'>;
export type SourceAssetPath = BrandedPath<'source-asset'>;

export type ResourcePathCategory =
  | 'project-fact'
  | 'project-cache'
  | 'global-cache'
  | 'extension-private-cache'
  | 'source-asset'
  | 'unknown';

export const RESOURCE_SCOPES: readonly ResourceScope[] = [
  'project',
  'global',
  'extension-private',
] as const;

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'document',
  'media',
  'generated',
  'preview',
  'storyboard-reference',
] as const;

export const RESOURCE_VARIANT_ROLES: readonly ResourceVariantRole[] = [
  'source',
  'thumbnail',
  'page-image',
  'document-entry',
  'preview',
  'proxy',
  'fov-crop',
] as const;

export const RESOURCE_CACHE_STATUSES: readonly ResourceCacheStatus[] = [
  'ready',
  'missing',
  'stale',
  'materializing',
  'unsupported',
  'unauthorized',
  'failed',
  'non-portable',
] as const;

export const RESOURCE_SOURCE_KINDS: readonly ResourceSourceKind[] = [
  'document',
  'file',
  'media-library',
  'generated-asset',
  'preview-asset',
  'remote-url',
] as const;

export function createResourceRef(
  input: Omit<ResourceRef, 'id'> & { readonly id?: string },
): ResourceRef {
  const ref: ResourceRef = {
    ...input,
    id: input.id ?? createResourceRefId(input),
  };
  return ref;
}

export function createResourceRefId(
  input:
    | Omit<ResourceRef, 'id'>
    | Pick<ResourceRef, 'scope' | 'provider' | 'kind' | 'source' | 'locator' | 'fingerprint'>,
): string {
  return `res_${hashStableValue({
    scope: input.scope,
    provider: input.provider,
    kind: input.kind,
    source: input.source,
    locator: input.locator,
    fingerprint: input.fingerprint,
  })}`;
}

export function createResourceLogicalContentIdentity(resourceRef: ResourceRef): string {
  return hashStableValue({
    kind: 'resource-content',
    scope: resourceRef.scope,
    resourceKind: resourceRef.kind,
    identity: resourceRef.locator
      ? { locator: resourceRef.locator }
      : createResourceSourceContentLocator(resourceRef),
  });
}

export function createResourceContentIdentity(resourceRef: ResourceRef): string {
  const logicalIdentity = createResourceLogicalContentIdentity(resourceRef);
  if (resourceRef.fingerprint.strategy === 'none') return logicalIdentity;
  return hashStableValue({
    kind: 'resource-revision',
    logicalIdentity,
    fingerprint: {
      strategy: resourceRef.fingerprint.strategy,
      value: resourceRef.fingerprint.value,
      ...(resourceRef.fingerprint.providerId
        ? { providerId: resourceRef.fingerprint.providerId }
        : {}),
    },
  });
}

export function areResourceRefsContentCompatible(left: ResourceRef, right: ResourceRef): boolean {
  if (createResourceLogicalContentIdentity(left) !== createResourceLogicalContentIdentity(right)) {
    return false;
  }
  if (left.fingerprint.strategy === 'none' || right.fingerprint.strategy === 'none') return true;
  return (
    left.fingerprint.strategy === right.fingerprint.strategy &&
    left.fingerprint.value === right.fingerprint.value &&
    left.fingerprint.providerId === right.fingerprint.providerId
  );
}

export function compareResourceRefObservationStrength(
  left: ResourceRef,
  right: ResourceRef,
): number {
  return (
    fingerprintStrength(left.fingerprint.strategy) - fingerprintStrength(right.fingerprint.strategy)
  );
}

function createResourceSourceContentLocator(resourceRef: ResourceRef): Record<string, unknown> {
  const source = resourceRef.source;
  const locator = {
    kind: source.kind,
    ...(source.projectRelativePath ? { projectRelativePath: source.projectRelativePath } : {}),
    ...(source.filePath ? { filePath: source.filePath } : {}),
    ...(source.uri ? { uri: source.uri } : {}),
    ...(source.mediaLibraryId ? { mediaLibraryId: source.mediaLibraryId } : {}),
    ...(source.generatedAssetId ? { generatedAssetId: source.generatedAssetId } : {}),
    ...(source.previewAssetId ? { previewAssetId: source.previewAssetId } : {}),
    ...(source.document ? { document: source.document } : {}),
  };
  return Object.keys(locator).length > 1 ? locator : { resourceId: resourceRef.id };
}

function fingerprintStrength(strategy: ResourceFingerprint['strategy']): number {
  switch (strategy) {
    case 'hash':
      return 4;
    case 'identity':
    case 'provider':
      return 3;
    case 'mtime-size':
      return 2;
    case 'none':
      return 0;
  }
}

export function createResourceVariantKey(
  variant: ResourceVariantRef | ResourceVariantRequest,
): string {
  const request = normalizeResourceVariantKeyInput(
    'resource' in variant
      ? {
          resourceId: variant.resource.id,
          role: variant.role,
          format: variant.format,
          mimeType: variant.mimeType,
          width: variant.width,
          height: variant.height,
        }
      : variant,
  );
  return `variant_${hashStableValue(request)}`;
}

function normalizeResourceVariantKeyInput(
  variant: (ResourceVariantRequest | ResourceVariantRef) & { readonly resourceId?: string },
): Record<string, unknown> {
  if (variant.role === 'document-entry') {
    return {
      resourceId: variant.resourceId,
      role: variant.role,
    };
  }
  return {
    resourceId: variant.resourceId,
    role: variant.role,
    format: variant.format,
    mimeType: variant.mimeType,
    width: variant.width,
    height: variant.height,
  };
}

export function createResourceFingerprint(input: {
  readonly strategy: ResourceFingerprint['strategy'];
  readonly value?: string;
  readonly providerId?: string;
  readonly generatedAt?: string;
  readonly source?: unknown;
}): ResourceFingerprint {
  const value = input.value ?? hashStableValue(input.source ?? {});
  return {
    strategy: input.strategy,
    value,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
  };
}

export function readResourceSourceLocalPath(source: ResourceSourceRef): string | undefined {
  return source.filePath ?? source.projectRelativePath ?? source.document?.filePath ?? source.uri;
}

export function isResourceScope(value: unknown): value is ResourceScope {
  return includesString(RESOURCE_SCOPES, value);
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return includesString(RESOURCE_KINDS, value);
}

export function isResourceVariantRole(value: unknown): value is ResourceVariantRole {
  return includesString(RESOURCE_VARIANT_ROLES, value);
}

export function isResourceCacheStatus(value: unknown): value is ResourceCacheStatus {
  return includesString(RESOURCE_CACHE_STATUSES, value);
}

export function isResourceSourceKind(value: unknown): value is ResourceSourceKind {
  return includesString(RESOURCE_SOURCE_KINDS, value);
}

export function isResourceFingerprint(value: unknown): value is ResourceFingerprint {
  if (!isRecord(value)) return false;
  return (
    (value['strategy'] === 'identity' ||
      value['strategy'] === 'hash' ||
      value['strategy'] === 'mtime-size' ||
      value['strategy'] === 'provider' ||
      value['strategy'] === 'none') &&
    typeof value['value'] === 'string' &&
    optionalString(value['generatedAt']) &&
    optionalString(value['providerId'])
  );
}

export function isResourceSourceRef(value: unknown): value is ResourceSourceRef {
  if (!isRecord(value) || !isResourceSourceKind(value['kind'])) return false;
  return (
    optionalString(value['filePath']) &&
    optionalString(value['uri']) &&
    optionalString(value['projectRelativePath']) &&
    optionalString(value['mediaLibraryId']) &&
    optionalDocumentSourceRef(value['document']) &&
    optionalString(value['generatedAssetId']) &&
    optionalString(value['previewAssetId']) &&
    optionalResourceFileIdentity(value['identity']) &&
    optionalRecord(value['metadata'])
  );
}

export function isResourceLocator(value: unknown): value is ResourceLocator {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;
  switch (value['kind']) {
    case 'document':
      return (
        (value['locator'] === undefined || parseDocumentLocator(value['locator']) !== undefined) &&
        optionalString(value['entryPath']) &&
        (value['locator'] !== undefined || typeof value['entryPath'] === 'string')
      );
    case 'file':
      return optionalString(value['path']) && optionalString(value['uri']);
    case 'generated-asset':
      return typeof value['assetId'] === 'string' && optionalString(value['variantId']);
    case 'preview-asset':
      return typeof value['assetId'] === 'string' && optionalString(value['route']);
    case 'storyboard-shot':
      return typeof value['shotId'] === 'string' && optionalString(value['sceneId']);
    default:
      return false;
  }
}

export function isResourceRef(value: unknown): value is ResourceRef {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isResourceScope(value['scope']) &&
    typeof value['provider'] === 'string' &&
    isResourceKind(value['kind']) &&
    isResourceSourceRef(value['source']) &&
    (value['locator'] === undefined || isResourceLocator(value['locator'])) &&
    isResourceFingerprint(value['fingerprint'])
  );
}

export function isResourceVariantRef(value: unknown): value is ResourceVariantRef {
  if (!isRecord(value)) return false;
  return (
    isResourceRef(value['resource']) &&
    isResourceVariantRole(value['role']) &&
    optionalString(value['format']) &&
    optionalString(value['mimeType']) &&
    optionalNumber(value['width']) &&
    optionalNumber(value['height'])
  );
}

export function isResourceCacheManifest(value: unknown): value is ResourceCacheManifest {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['entries'])) return false;
  return (
    optionalString(value['projectRoot']) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    Object.values(value['entries']).every((entry) => isResourceCacheEntry(entry)) &&
    (value['stats'] === undefined || isResourceCacheStats(value['stats']))
  );
}

export function getResourcePathCategory(
  filePath: string,
  options: {
    readonly projectRoot?: string;
    readonly globalRoot?: string;
    readonly extensionPrivateRoot?: string;
  } = {},
): ResourcePathCategory {
  const normalizedPath = normalizePathForCategory(filePath);
  const projectRoot = options.projectRoot
    ? normalizePathForCategory(options.projectRoot)
    : undefined;
  const globalRoot = options.globalRoot ? normalizePathForCategory(options.globalRoot) : undefined;
  const extensionRoot = options.extensionPrivateRoot
    ? normalizePathForCategory(options.extensionPrivateRoot)
    : undefined;

  if (projectRoot && isPathInside(normalizedPath, `${projectRoot}/.neko/.cache`)) {
    return 'project-cache';
  }
  if (projectRoot && isPathInside(normalizedPath, `${projectRoot}/neko`)) {
    return 'project-fact';
  }
  if (globalRoot && isPathInside(normalizedPath, globalRoot)) {
    return 'global-cache';
  }
  if (extensionRoot && isPathInside(normalizedPath, extensionRoot)) {
    return 'extension-private-cache';
  }
  return 'source-asset';
}

export function isProjectCachePath(
  filePath: string,
  options: { readonly projectRoot?: string } = {},
): filePath is ProjectCachePath {
  return getResourcePathCategory(filePath, options) === 'project-cache';
}

export function isProjectFactPath(
  filePath: string,
  options: { readonly projectRoot?: string } = {},
): filePath is ProjectFactPath {
  return getResourcePathCategory(filePath, options) === 'project-fact';
}

export function asProjectCachePath(
  filePath: string,
  options: { readonly projectRoot?: string } = {},
): ProjectCachePath | undefined {
  return isProjectCachePath(filePath, options) ? (filePath as ProjectCachePath) : undefined;
}

export function asProjectFactPath(
  filePath: string,
  options: { readonly projectRoot?: string } = {},
): ProjectFactPath | undefined {
  return isProjectFactPath(filePath, options) ? (filePath as ProjectFactPath) : undefined;
}

export function isManagedCachePathCategory(category: ResourcePathCategory): boolean {
  return (
    category === 'project-cache' ||
    category === 'global-cache' ||
    category === 'extension-private-cache'
  );
}

export function hashStableValue(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function isResourceCacheEntry(value: unknown): value is ResourceCacheEntry {
  if (!isRecord(value)) return false;
  return (
    isResourceRef(value['resource']) &&
    Array.isArray(value['variants']) &&
    value['variants'].every((variant) => isResourceCacheVariantEntry(variant)) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    optionalString(value['lastAccessedAt']) &&
    isResourceCacheStatus(value['status']) &&
    optionalRecord(value['providerMetadata'])
  );
}

export function isResourceCacheVariantEntry(value: unknown): value is ResourceCacheVariantEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value['key'] === 'string' &&
    isResourceVariantRole(value['role']) &&
    isResourceCacheStatus(value['status']) &&
    optionalString(value['relativePath']) &&
    optionalString(value['absolutePath']) &&
    optionalString(value['format']) &&
    optionalString(value['mimeType']) &&
    optionalNumber(value['width']) &&
    optionalNumber(value['height']) &&
    optionalNumber(value['sizeBytes']) &&
    (value['sourceFingerprint'] === undefined ||
      isResourceFingerprint(value['sourceFingerprint'])) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    optionalString(value['lastAccessedAt']) &&
    optionalBoolean(value['pinned']) &&
    optionalBoolean(value['rebuildable']) &&
    optionalString(value['error'])
  );
}

function isResourceCacheStats(value: unknown): value is ResourceCacheStats {
  if (!isRecord(value)) return false;
  return (
    typeof value['totalSizeBytes'] === 'number' &&
    typeof value['entryCount'] === 'number' &&
    typeof value['variantCount'] === 'number' &&
    optionalNumber(value['staleCount']) &&
    optionalNumber(value['missingCount']) &&
    optionalRecord(value['scopeBytes']) &&
    optionalRecord(value['providerBytes']) &&
    optionalRecord(value['statusCounts']) &&
    optionalRecord(value['roleCounts']) &&
    optionalRecord(value['scopeEntryCounts']) &&
    optionalRecord(value['providerEntryCounts']) &&
    optionalString(value['lastAccessedAt'])
  );
}

function optionalResourceFileIdentity(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    optionalString(value['fileId']) &&
    optionalNumber(value['sizeBytes']) &&
    optionalNumber(value['mtimeMs']) &&
    optionalString(value['hash'])
  );
}

function optionalDocumentSourceRef(value: unknown): boolean {
  return value === undefined || parseDocumentSourceRef(value) !== undefined;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePathForCategory(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function isPathInside(filePath: string, root: string): boolean {
  return filePath === root || filePath.startsWith(`${root}/`);
}

// Type-only references keep these imports visible to API consumers.
export type { DocumentFormat, DocumentLocator, DocumentSourceRef };
