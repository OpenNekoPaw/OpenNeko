// =============================================================================
// Intent-Aware Content Access Contracts
// =============================================================================
//
// Durable records store stable refs. Cache paths, Webview URIs, engine tokens,
// and other runtime handles are transport results, not source identity.
// =============================================================================

import {
  getResourcePathCategory,
  isManagedCachePathCategory,
  isResourceRef,
  isResourceVariantRole,
  type ResourceRef,
  type ResourceScope,
  type ResourceVariantRequest,
  type ResourceVariantRole,
} from './resource-cache';

export type ContentAccessIntent =
  | 'interactive-preview'
  | 'agent-context'
  | 'edit-playback'
  | 'cache-materialize'
  | 'final-export'
  | 'package'
  | 'verify';

export type ContentAccessTarget =
  'webview-uri' | 'local-path' | 'bytes' | 'engine-source' | 'runtime-stream';

export type ContentIngestMode =
  | 'add'
  | 'link'
  | 'create-asset'
  | 'import-source'
  | 'register-existing-source'
  | 'generated-output'
  | 'stage-export'
  | 'cache-artifact';

export type ContentAccessQualityMode = 'source' | 'draft-proxy';

export type ContentAccessMaterializationPolicy =
  'never' | 'if-missing' | 'refresh' | 'require-existing';

export type ContentAccessStatus =
  | 'ready'
  | 'missing-cache'
  | 'missing-source'
  | 'stale-source'
  | 'unsupported-intent'
  | 'unsupported-source'
  | 'unsupported-destination'
  | 'unauthorized'
  | 'non-portable'
  | 'unrecoverable'
  | 'failed';

export type ContentAccessSourceKind =
  'resource' | 'document' | 'asset' | 'file' | 'media-library' | 'generated-asset' | 'runtime';

export type ContentRuntimeRefKind =
  | 'cache-path'
  | 'webview-uri'
  | 'blob-url'
  | 'object-url'
  | 'preview-token'
  | 'engine-token'
  | 'runtime-stream'
  | 'scratch-path';

export type ContentAccessDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ContentAccessDiagnostic {
  readonly code: string;
  readonly severity: ContentAccessDiagnosticSeverity;
  readonly message: string;
  readonly providerId?: string;
  readonly sourceId?: string;
  readonly role?: ResourceVariantRole;
  readonly intent?: ContentAccessIntent;
  readonly target?: ContentAccessTarget;
  readonly qualityMode?: ContentAccessQualityMode;
  readonly destination?: ContentIngestDestinationPolicy;
  readonly materialization?: 'none' | 'resolved-existing' | 'materialized' | 'rejected';
  readonly ingestAction?: ContentIngestMode;
  readonly metadata?: Record<string, unknown>;
}

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

export interface ContentMediaLibrarySourceRef {
  readonly kind: 'media-library';
  readonly libraryId: string;
  readonly path?: string;
  readonly assetId?: string;
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
  | ContentMediaLibrarySourceRef
  | ContentGeneratedAssetSourceRef;

export type ContentSourceRef = ContentStableSourceRef | ContentRuntimeRef;

export interface ContentAccessRequest {
  readonly ref: ContentSourceRef;
  readonly intent: ContentAccessIntent;
  readonly target: ContentAccessTarget;
  readonly variant?: ResourceVariantRequest;
  readonly role?: ResourceVariantRole;
  readonly materialization?: ContentAccessMaterializationPolicy;
  readonly qualityMode?: ContentAccessQualityMode;
  readonly caller?: string;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentAccessResult {
  readonly status: ContentAccessStatus;
  readonly request: ContentAccessRequest;
  readonly providerId?: string;
  readonly source?: ContentStableSourceRef;
  readonly role?: ResourceVariantRole;
  readonly uri?: string;
  readonly localPath?: string;
  readonly bytes?: Uint8Array;
  readonly engineSource?: ContentEngineSource;
  readonly runtimeStream?: ContentRuntimeStream;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly diagnostics?: readonly ContentAccessDiagnostic[];
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentEngineSource {
  readonly token: string;
  readonly sourcePath?: string;
  readonly entryPath?: string;
  readonly uri?: string;
  readonly runtimeOnly: true;
}

export interface ContentRuntimeStream {
  readonly streamId: string;
  readonly url?: string;
  readonly runtimeOnly: true;
}

export interface ContentAccessProviderRequest {
  readonly request: ContentAccessRequest;
}

export interface ContentAccessProvider {
  readonly id: string;
  supports(request: ContentAccessRequest): boolean;
  resolve(input: ContentAccessProviderRequest): Promise<ContentAccessResult>;
}

export type ContentIngestDestinationKind =
  'project' | 'media-library' | 'generated-assets' | 'export-output' | 'cache';

export interface ContentIngestDestinationPolicy {
  readonly kind: ContentIngestDestinationKind;
  readonly projectRoot?: string;
  readonly mediaLibraryId?: string;
  readonly directory?: string;
  readonly copyMode?: 'copy' | 'link' | 'register';
  readonly pathVariable?: string;
  readonly allowAbsolutePath?: boolean;
}

export interface ContentIngestRequest {
  readonly mode: ContentIngestMode;
  readonly sourcePath?: string;
  readonly bytes?: Uint8Array;
  readonly resource?: ResourceRef;
  readonly variant?: ResourceVariantRequest;
  readonly destination: ContentIngestDestinationPolicy;
  readonly mimeType?: string;
  readonly fileName?: string;
  readonly caller?: string;
  readonly prewarm?: readonly ResourceVariantRequest[];
  readonly metadata?: Record<string, unknown>;
}

export interface ContentIngestResult {
  readonly status: ContentAccessStatus;
  readonly request: ContentIngestRequest;
  readonly providerId?: string;
  readonly source?: ContentStableSourceRef;
  readonly outputPath?: string;
  readonly contractedPath?: string;
  readonly stagedOutput?: ContentStagedOutput;
  readonly prewarm?: readonly ResourceVariantRequest[];
  readonly diagnostics?: readonly ContentAccessDiagnostic[];
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ContentStagedOutput {
  readonly path: string;
  readonly kind: 'export' | 'package' | 'diagnostic';
  readonly importedSource?: ContentStableSourceRef;
}

export interface ContentIngestProviderRequest {
  readonly request: ContentIngestRequest;
}

export interface ContentIngestProvider {
  readonly id: string;
  supports(request: ContentIngestRequest): boolean;
  ingest(input: ContentIngestProviderRequest): Promise<ContentIngestResult>;
}

export const CONTENT_ACCESS_INTENTS: readonly ContentAccessIntent[] = [
  'interactive-preview',
  'agent-context',
  'edit-playback',
  'cache-materialize',
  'final-export',
  'package',
  'verify',
] as const;

export const CONTENT_ACCESS_TARGETS: readonly ContentAccessTarget[] = [
  'webview-uri',
  'local-path',
  'bytes',
  'engine-source',
  'runtime-stream',
] as const;

export const CONTENT_INGEST_MODES: readonly ContentIngestMode[] = [
  'add',
  'link',
  'create-asset',
  'import-source',
  'register-existing-source',
  'generated-output',
  'stage-export',
  'cache-artifact',
] as const;

export const CONTENT_ACCESS_STATUSES: readonly ContentAccessStatus[] = [
  'ready',
  'missing-cache',
  'missing-source',
  'stale-source',
  'unsupported-intent',
  'unsupported-source',
  'unsupported-destination',
  'unauthorized',
  'non-portable',
  'unrecoverable',
  'failed',
] as const;

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

export const PREVIEW_LIKE_CONTENT_ACCESS_INTENTS: readonly ContentAccessIntent[] = [
  'interactive-preview',
  'agent-context',
  'edit-playback',
  'cache-materialize',
] as const;

export const OFFLINE_CONTENT_ACCESS_INTENTS: readonly ContentAccessIntent[] = [
  'final-export',
  'package',
  'verify',
] as const;

export const RUNTIME_ONLY_CONTENT_ACCESS_TARGETS: readonly ContentAccessTarget[] = [
  'webview-uri',
  'runtime-stream',
] as const;

export const CONTENT_ACCESS_MATERIALIZATION_POLICIES: readonly ContentAccessMaterializationPolicy[] =
  ['never', 'if-missing', 'refresh', 'require-existing'] as const;

export const CONTENT_ACCESS_QUALITY_MODES: readonly ContentAccessQualityMode[] = [
  'source',
  'draft-proxy',
] as const;

export const DERIVED_CONTENT_VARIANT_ROLES: readonly ResourceVariantRole[] = [
  'thumbnail',
  'page-image',
  'document-entry',
  'preview',
  'proxy',
  'fov-crop',
] as const;

export function isContentAccessIntent(value: unknown): value is ContentAccessIntent {
  return includesString(CONTENT_ACCESS_INTENTS, value);
}

export function isContentAccessTarget(value: unknown): value is ContentAccessTarget {
  return includesString(CONTENT_ACCESS_TARGETS, value);
}

export function isContentIngestMode(value: unknown): value is ContentIngestMode {
  return includesString(CONTENT_INGEST_MODES, value);
}

export function isContentAccessStatus(value: unknown): value is ContentAccessStatus {
  return includesString(CONTENT_ACCESS_STATUSES, value);
}

export function isContentAccessMaterializationPolicy(
  value: unknown,
): value is ContentAccessMaterializationPolicy {
  return includesString(CONTENT_ACCESS_MATERIALIZATION_POLICIES, value);
}

export function isContentAccessQualityMode(value: unknown): value is ContentAccessQualityMode {
  return includesString(CONTENT_ACCESS_QUALITY_MODES, value);
}

export function isPreviewLikeContentAccessIntent(
  intent: ContentAccessIntent,
): intent is (typeof PREVIEW_LIKE_CONTENT_ACCESS_INTENTS)[number] {
  return PREVIEW_LIKE_CONTENT_ACCESS_INTENTS.includes(intent);
}

export function isOfflineContentAccessIntent(
  intent: ContentAccessIntent,
): intent is (typeof OFFLINE_CONTENT_ACCESS_INTENTS)[number] {
  return OFFLINE_CONTENT_ACCESS_INTENTS.includes(intent);
}

export function isRuntimeOnlyContentAccessTarget(target: ContentAccessTarget): boolean {
  return RUNTIME_ONLY_CONTENT_ACCESS_TARGETS.includes(target);
}

export function isDerivedContentVariantRole(role: ResourceVariantRole): boolean {
  return DERIVED_CONTENT_VARIANT_ROLES.includes(role);
}

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

function isGeneratedCachePath(value: string): boolean {
  const normalized = normalizePath(value);
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/') ||
    isPrivateCachePath(value)
  );
}

export function isContentRuntimeRefKind(value: unknown): value is ContentRuntimeRefKind {
  return includesString(RUNTIME_REF_KINDS, value);
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
  const category = getResourcePathCategory(filePath, options);
  return isManagedCachePathCategory(category);
}

export function validateContentAccessRequest(
  request: ContentAccessRequest,
): readonly ContentAccessDiagnostic[] {
  const diagnostics: ContentAccessDiagnostic[] = [];
  const role = request.role ?? request.variant?.role;

  if (isOfflineContentAccessIntent(request.intent)) {
    if (isGeneratedCacheBackedSourceRef(request.ref)) {
      diagnostics.push({
        code: 'generated-cache-source-not-durable',
        severity: 'error',
        message:
          'Promoted generated assets cannot use private cache paths as durable source identity.',
        intent: request.intent,
        target: request.target,
        qualityMode: request.qualityMode,
      });
    }

    if (request.qualityMode !== 'draft-proxy' && isCacheOrRuntimeOnlyContentRef(request.ref)) {
      diagnostics.push({
        code: 'offline-runtime-ref',
        severity: 'error',
        message: 'Offline content access requires a durable source ref.',
        intent: request.intent,
        target: request.target,
        qualityMode: request.qualityMode,
      });
    }

    if (request.qualityMode !== 'draft-proxy' && role && isDerivedContentVariantRole(role)) {
      diagnostics.push({
        code: 'offline-derived-role',
        severity: 'error',
        message: 'Offline content access cannot use derived cache roles by default.',
        role,
        intent: request.intent,
        target: request.target,
        qualityMode: request.qualityMode,
      });
    }

    if (isRuntimeOnlyContentAccessTarget(request.target)) {
      diagnostics.push({
        code: 'offline-runtime-target',
        severity: 'error',
        message: 'Offline content access cannot request runtime-only targets.',
        intent: request.intent,
        target: request.target,
      });
    }
  }

  if (request.target === 'webview-uri' && !isPreviewLikeContentAccessIntent(request.intent)) {
    diagnostics.push({
      code: 'webview-target-non-preview',
      severity: 'error',
      message: 'Webview URI targets are reserved for preview-like intents.',
      intent: request.intent,
      target: request.target,
    });
  }

  return diagnostics;
}

export function validateContentIngestRequest(
  request: ContentIngestRequest,
  options: {
    readonly projectRoot?: string;
    readonly globalRoot?: string;
    readonly extensionPrivateRoot?: string;
  } = {},
): readonly ContentAccessDiagnostic[] {
  const diagnostics: ContentAccessDiagnostic[] = [];
  if (request.destination.kind !== 'generated-assets') return diagnostics;

  if (request.destination.copyMode === 'register' && request.sourcePath) {
    return diagnostics;
  }

  if (request.destination.directory) {
    if (isPrivateCachePath(request.destination.directory, options)) {
      diagnostics.push({
        code: 'generated-assets-destination-cache',
        severity: 'error',
        message:
          'Generated assets retained by users must be written to durable generated asset roots outside private cache.',
        destination: request.destination,
        ingestAction: request.mode,
      });
    }
    return diagnostics;
  }

  if (!request.destination.projectRoot && !options.projectRoot) {
    diagnostics.push({
      code: 'generated-assets-destination-missing-root',
      severity: 'error',
      message:
        'Generated asset ingest requires a durable workspace, media-library, asset-store, or explicit promote destination.',
      destination: request.destination,
      ingestAction: request.mode,
    });
  }

  return diagnostics;
}

export function validateContentIngestResult(
  result: ContentIngestResult,
  options: {
    readonly projectRoot?: string;
    readonly globalRoot?: string;
    readonly extensionPrivateRoot?: string;
    readonly pathWasContracted?: boolean;
  } = {},
): readonly ContentAccessDiagnostic[] {
  const diagnostics: ContentAccessDiagnostic[] = [
    ...validateContentIngestRequest(result.request, options),
  ];
  const outputPath = result.outputPath ?? result.contractedPath;

  if (outputPath && isWebviewLikeRuntimeValue(outputPath)) {
    diagnostics.push({
      code: 'ingest-runtime-output',
      severity: 'error',
      message: 'Durable ingest results cannot use runtime URLs as source identity.',
      destination: result.request.destination,
      ingestAction: result.request.mode,
    });
  }

  if (
    result.outputPath &&
    result.request.mode !== 'cache-artifact' &&
    isPrivateCachePath(result.outputPath, options)
  ) {
    diagnostics.push({
      code: 'ingest-cache-output',
      severity: 'error',
      message: 'Durable ingest results cannot use private cache paths as source identity.',
      destination: result.request.destination,
      ingestAction: result.request.mode,
    });
  }

  if (
    isDurableSourceIngestMode(result.request.mode) &&
    result.request.destination.allowAbsolutePath !== true &&
    result.outputPath &&
    (result.contractedPath === undefined ||
      result.contractedPath === result.outputPath ||
      isAbsoluteLocalPath(result.contractedPath)) &&
    options.pathWasContracted !== true
  ) {
    diagnostics.push({
      code: 'ingest-uncontracted-path',
      severity: 'error',
      message: 'Durable ingest results must contract persistent source paths when possible.',
      destination: result.request.destination,
      ingestAction: result.request.mode,
    });
  }

  return diagnostics;
}

export function isDurableSourceIngestMode(mode: ContentIngestMode): boolean {
  return (
    mode === 'add' ||
    mode === 'link' ||
    mode === 'create-asset' ||
    mode === 'import-source' ||
    mode === 'register-existing-source' ||
    mode === 'generated-output'
  );
}

export function isCreateAssetIngestMode(mode: ContentIngestMode): boolean {
  return mode === 'create-asset' || mode === 'generated-output';
}

export function isContentAccessRequest(value: unknown): value is ContentAccessRequest {
  if (!isRecord(value)) return false;
  return (
    isContentSourceRef(value['ref']) &&
    isContentAccessIntent(value['intent']) &&
    isContentAccessTarget(value['target']) &&
    optionalResourceVariantRequest(value['variant']) &&
    (value['role'] === undefined || isResourceVariantRole(value['role'])) &&
    (value['materialization'] === undefined ||
      isContentAccessMaterializationPolicy(value['materialization'])) &&
    (value['qualityMode'] === undefined || isContentAccessQualityMode(value['qualityMode'])) &&
    optionalString(value['caller']) &&
    optionalRecord(value['metadata'])
  );
}

export function isContentIngestRequest(value: unknown): value is ContentIngestRequest {
  if (!isRecord(value)) return false;
  return (
    isContentIngestMode(value['mode']) &&
    isContentIngestDestinationPolicy(value['destination']) &&
    optionalString(value['sourcePath']) &&
    optionalBytes(value['bytes']) &&
    (value['resource'] === undefined || isResourceRef(value['resource'])) &&
    optionalResourceVariantRequest(value['variant']) &&
    optionalString(value['mimeType']) &&
    optionalString(value['fileName']) &&
    optionalString(value['caller']) &&
    optionalRecord(value['metadata'])
  );
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
    case 'media-library':
      return (
        typeof value['libraryId'] === 'string' &&
        optionalString(value['path']) &&
        optionalString(value['assetId'])
      );
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

function isContentIngestDestinationPolicy(value: unknown): value is ContentIngestDestinationPolicy {
  if (!isRecord(value)) return false;
  return (
    (value['kind'] === 'project' ||
      value['kind'] === 'media-library' ||
      value['kind'] === 'generated-assets' ||
      value['kind'] === 'export-output' ||
      value['kind'] === 'cache') &&
    optionalString(value['projectRoot']) &&
    optionalString(value['mediaLibraryId']) &&
    optionalString(value['directory']) &&
    optionalString(value['copyMode']) &&
    optionalString(value['pathVariable']) &&
    optionalBoolean(value['allowAbsolutePath'])
  );
}

function optionalResourceVariantRequest(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    isResourceVariantRole(value['role']) &&
    optionalString(value['format']) &&
    optionalString(value['mimeType']) &&
    optionalNumber(value['width']) &&
    optionalNumber(value['height'])
  );
}

function optionalBytes(value: unknown): boolean {
  return value === undefined || value instanceof Uint8Array;
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

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
