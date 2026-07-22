// Stable source identities retained for Agent/tool inputs during locator migration.
// Runtime handles are accepted only so boundaries can reject them explicitly; they are not
// durable identity and must never be persisted or projected as a successful source.

import {
  getResourcePathCategory,
  isManagedCachePathCategory,
  isResourceRef,
  type ResourceRef,
  type ResourceScope,
} from './resource-cache';

export type ContentRuntimeRefKind =
  | 'cache-path'
  | 'webview-uri'
  | 'blob-url'
  | 'object-url'
  | 'preview-token'
  | 'engine-token'
  | 'runtime-stream'
  | 'scratch-path';

export interface ContentDocumentSourceRef {
  readonly kind: 'document';
  readonly source: ResourceRef['source'];
  readonly resource?: ResourceRef;
  readonly entryPath?: string;
  readonly locator?: ResourceRef['locator'];
}

export interface ContentAssetSourceRef {
  readonly kind: 'asset';
  readonly assetId: string;
  readonly sourcePath?: string;
  readonly resource?: ResourceRef;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentFileSourceRef {
  readonly kind: 'file';
  readonly path: string;
  readonly scope?: ResourceScope;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentGeneratedAssetSourceRef {
  readonly kind: 'generated-asset';
  readonly assetId: string;
  readonly path?: string;
  readonly resource?: ResourceRef;
  readonly promoted?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentRuntimeRef {
  readonly kind: 'runtime';
  readonly runtimeKind: ContentRuntimeRefKind;
  readonly value: string;
  readonly source?: ContentStableSourceRef;
  readonly metadata?: Record<string, unknown>;
}

export type ContentStableSourceRef =
  | ResourceRef
  | ContentDocumentSourceRef
  | ContentAssetSourceRef
  | ContentFileSourceRef
  | ContentGeneratedAssetSourceRef;

export type ContentSourceRef = ContentStableSourceRef | ContentRuntimeRef;

export const RUNTIME_REF_KINDS: readonly ContentRuntimeRefKind[] = [
  'cache-path',
  'webview-uri',
  'blob-url',
  'object-url',
  'preview-token',
  'engine-token',
  'runtime-stream',
  'scratch-path',
] as const;

export function isRuntimeOnlyContentRef(ref: ContentSourceRef): ref is ContentRuntimeRef {
  return ref.kind === 'runtime';
}

export function isCacheOrRuntimeOnlyContentRef(ref: ContentSourceRef): boolean {
  if (isRuntimeOnlyContentRef(ref)) return ref.source === undefined;
  if (isResourceRef(ref) && ref.scope === 'extension-private') return true;
  if ('kind' in ref && ref.kind === 'generated-asset') {
    return ref.promoted !== true || isGeneratedCacheBackedSourceRef(ref);
  }
  return false;
}

export function isGeneratedCacheBackedSourceRef(ref: ContentSourceRef): boolean {
  if (!('kind' in ref) || ref.kind !== 'generated-asset') return false;
  return typeof ref.path === 'string' && isGeneratedCachePath(ref.path);
}

export function isContentRuntimeRefKind(value: unknown): value is ContentRuntimeRefKind {
  return typeof value === 'string' && RUNTIME_REF_KINDS.includes(value as ContentRuntimeRefKind);
}

export function isWebviewLikeRuntimeValue(value: string): boolean {
  return (
    value.startsWith('vscode-resource:') ||
    value.startsWith('vscode-webview-resource:') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    value.startsWith('object:')
  );
}

export function isPrivateCachePath(
  filePath: string,
  options: {
    readonly projectRoot?: string;
    readonly globalRoot?: string;
    readonly extensionPrivateRoot?: string;
  } = {},
): boolean {
  return isManagedCachePathCategory(getResourcePathCategory(filePath, options));
}

export function isContentSourceRef(value: unknown): value is ContentSourceRef {
  if (isResourceRef(value)) return true;
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;

  switch (value['kind']) {
    case 'document':
      return isRecord(value['source']);
    case 'asset':
      return typeof value['assetId'] === 'string' && optionalString(value['sourcePath']);
    case 'file':
      return typeof value['path'] === 'string';
    case 'generated-asset':
      return (
        typeof value['assetId'] === 'string' &&
        optionalString(value['path']) &&
        optionalBoolean(value['promoted'])
      );
    case 'runtime':
      return isContentRuntimeRefKind(value['runtimeKind']) && typeof value['value'] === 'string';
    default:
      return false;
  }
}

function isGeneratedCachePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/') ||
    isPrivateCachePath(value)
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
