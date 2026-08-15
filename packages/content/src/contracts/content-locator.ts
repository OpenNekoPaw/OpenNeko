import { normalizeBundleEntryPath } from './bundle-locator';
import { isPortablePathSegment } from '@neko/shared/path';

export interface ContentFingerprint {
  readonly strategy: 'sha256' | 'mtime-size' | 'provider';
  readonly value: string;
}

export interface WorkspaceFileContentLocator {
  readonly kind: 'workspace-file';
  readonly path: string;
  readonly fingerprint?: ContentFingerprint;
}

export interface MediaLibraryContentLocator {
  readonly kind: 'media-library';
  readonly libraryName: string;
  readonly relativePath: string;
  readonly fingerprint?: ContentFingerprint;
}

export interface DocumentEntryContentLocator {
  readonly kind: 'document-entry';
  readonly source: WorkspaceFileContentLocator | MediaLibraryContentLocator;
  readonly entryPath: string;
  readonly fingerprint?: ContentFingerprint;
}

export interface GeneratedOutputContentLocator {
  readonly kind: 'generated-output';
  readonly outputId: string;
  readonly digest: string;
  readonly path: string;
}

export interface PackageResourceContentLocator {
  readonly kind: 'package-resource';
  readonly packageId: string;
  readonly revision: string;
  readonly resourcePath: string;
  readonly digest?: string;
  readonly manifestPath?: string;
}

export type ContentLocator =
  | WorkspaceFileContentLocator
  | MediaLibraryContentLocator
  | DocumentEntryContentLocator
  | GeneratedOutputContentLocator
  | PackageResourceContentLocator;

export type ContentLocatorDiagnosticCode =
  | 'content-locator-invalid-entry-path'
  | 'content-locator-invalid-fingerprint'
  | 'content-locator-invalid-identity'
  | 'content-locator-invalid-kind'
  | 'content-locator-invalid-media-library-name'
  | 'content-locator-invalid-media-library-path'
  | 'content-locator-invalid-workspace-path';

export interface ContentLocatorDiagnostic {
  readonly code: ContentLocatorDiagnosticCode;
  readonly message: string;
}

export type ContentLocatorValidationResult =
  | { readonly ok: true; readonly locator: ContentLocator }
  | { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] };

export function validateContentLocator(value: unknown): ContentLocatorValidationResult {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return invalidLocator('content-locator-invalid-kind', 'Content locator kind is invalid.');
  }

  switch (value['kind']) {
    case 'workspace-file':
      return validateWorkspaceFileLocator(value);
    case 'media-library':
      return validateMediaLibraryLocator(value);
    case 'document-entry':
      return validateDocumentEntryLocator(value);
    case 'generated-output':
      return validateGeneratedOutputLocator(value);
    case 'package-resource':
      return validatePackageResourceLocator(value);
    default:
      return invalidLocator('content-locator-invalid-kind', 'Content locator kind is invalid.');
  }
}

export function isContentLocator(value: unknown): value is ContentLocator {
  return validateContentLocator(value).ok;
}

export function contentLocatorsEqual(left: ContentLocator, right: ContentLocator): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'workspace-file':
      return (
        right.kind === 'workspace-file' &&
        left.path === right.path &&
        fingerprintsEqual(left.fingerprint, right.fingerprint)
      );
    case 'media-library':
      return (
        right.kind === 'media-library' &&
        left.libraryName === right.libraryName &&
        left.relativePath === right.relativePath &&
        fingerprintsEqual(left.fingerprint, right.fingerprint)
      );
    case 'document-entry':
      return (
        right.kind === 'document-entry' &&
        contentLocatorsEqual(left.source, right.source) &&
        left.entryPath === right.entryPath &&
        fingerprintsEqual(left.fingerprint, right.fingerprint)
      );
    case 'generated-output':
      return (
        right.kind === 'generated-output' &&
        left.outputId === right.outputId &&
        left.digest === right.digest &&
        left.path === right.path
      );
    case 'package-resource':
      return (
        right.kind === 'package-resource' &&
        left.packageId === right.packageId &&
        left.revision === right.revision &&
        left.resourcePath === right.resourcePath &&
        left.digest === right.digest &&
        left.manifestPath === right.manifestPath
      );
  }
}

export function contentLocatorKey(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
      return JSON.stringify([
        locator.kind,
        locator.path,
        locator.fingerprint?.strategy,
        locator.fingerprint?.value,
      ]);
    case 'media-library':
      return JSON.stringify([
        locator.kind,
        locator.libraryName,
        locator.relativePath,
        locator.fingerprint?.strategy,
        locator.fingerprint?.value,
      ]);
    case 'document-entry':
      return JSON.stringify([
        locator.kind,
        contentLocatorKey(locator.source),
        locator.entryPath,
        locator.fingerprint?.strategy,
        locator.fingerprint?.value,
      ]);
    case 'generated-output':
      return JSON.stringify([locator.kind, locator.outputId, locator.digest, locator.path]);
    case 'package-resource':
      return JSON.stringify([
        locator.kind,
        locator.packageId,
        locator.revision,
        locator.resourcePath,
        locator.digest,
        locator.manifestPath,
      ]);
  }
}

const MEDIA_LIBRARY_CONTENT_REFERENCE_PREFIX = 'media-library:';

export function serializeContentReferenceTarget(
  locator: WorkspaceFileContentLocator | MediaLibraryContentLocator,
): string {
  if (locator.kind === 'workspace-file') return locator.path;
  return `${MEDIA_LIBRARY_CONTENT_REFERENCE_PREFIX}${[
    locator.libraryName,
    ...locator.relativePath.split('/'),
  ]
    .map(encodeURIComponent)
    .join('/')}`;
}

export function parseContentReferenceTarget(
  target: string,
): WorkspaceFileContentLocator | MediaLibraryContentLocator | undefined {
  if (target.startsWith(MEDIA_LIBRARY_CONTENT_REFERENCE_PREFIX)) {
    const encodedSegments = target.slice(MEDIA_LIBRARY_CONTENT_REFERENCE_PREFIX.length).split('/');
    if (encodedSegments.length < 2 || encodedSegments.some((segment) => segment.length === 0)) {
      return undefined;
    }
    let segments: string[];
    try {
      segments = encodedSegments.map(decodeURIComponent);
    } catch {
      return undefined;
    }
    const [libraryName, ...relativeSegments] = segments;
    const candidate = {
      kind: 'media-library',
      libraryName,
      relativePath: relativeSegments.join('/'),
    };
    const validation = validateContentLocator(candidate);
    if (
      !validation.ok ||
      validation.locator.kind !== 'media-library' ||
      serializeContentReferenceTarget(validation.locator) !== target
    ) {
      return undefined;
    }
    return validation.locator;
  }
  const validation = validateContentLocator({ kind: 'workspace-file', path: target });
  return validation.ok && validation.locator.kind === 'workspace-file'
    ? validation.locator
    : undefined;
}

export function normalizeMediaLibraryContentPath(value: string): string | undefined {
  const nfc = value.normalize('NFC');
  if (nfc !== value || nfc.includes('\0') || nfc.includes('${') || nfc.includes('\\')) {
    return undefined;
  }
  const normalized = normalizeBundleEntryPath(nfc);
  if (!normalized.ok || normalized.entryPath !== value) return undefined;

  const lower = normalized.entryPath.toLocaleLowerCase('en-US');
  const segments = normalized.entryPath.split('/');
  if (
    segments.some((segment) => segment.includes(':')) ||
    segments.some((segment) => segment.toLocaleLowerCase('en-US') === '.neko') ||
    lower === 'neko/assets' ||
    lower.startsWith('neko/assets/')
  ) {
    return undefined;
  }
  return normalized.entryPath;
}

export function normalizeWorkspaceContentPath(value: string): string | undefined {
  const normalized = value.normalize('NFC').replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return undefined;
  if (normalized.includes('${')) return undefined;
  if (normalized.startsWith('/') || /^[A-Za-z]:(?:\/|$)/.test(normalized)) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) return undefined;
  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.startsWith('.') ||
        segment.includes(':'),
    )
  ) {
    return undefined;
  }
  return segments.join('/');
}

/**
 * Identifies the workspace-relative projection used to expose associated Media
 * Libraries to sender-bound runtimes. The path is valid for runtime access but
 * must not replace the owning MediaLibraryContentLocator in durable facts.
 */
export function isWorkspaceMediaLibraryProjectionPath(value: string): boolean {
  const normalized = normalizeWorkspaceContentPath(value);
  if (!normalized || normalized !== value) return false;
  const lower = normalized.toLocaleLowerCase('en-US');
  return lower === 'neko/assets' || lower.startsWith('neko/assets/');
}

/**
 * Validates a locator that will become a durable Project fact. Managed Media
 * Library workspace paths are runtime projections; their owning
 * MediaLibraryContentLocator must be persisted instead.
 */
export function isProjectDurableContentLocator(value: unknown): value is ContentLocator {
  const validation = validateContentLocator(value);
  if (!validation.ok) return false;
  const source =
    validation.locator.kind === 'document-entry' ? validation.locator.source : validation.locator;
  return source.kind !== 'workspace-file' || !isWorkspaceMediaLibraryProjectionPath(source.path);
}

function validateWorkspaceFileLocator(
  value: Record<string, unknown>,
): ContentLocatorValidationResult {
  if (!hasOnlyKeys(value, WORKSPACE_FILE_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Workspace file locator contains unsupported fields.',
    );
  }
  const path =
    typeof value['path'] === 'string' ? normalizeWorkspaceContentPath(value['path']) : undefined;
  if (!path || path !== value['path']) {
    return invalidLocator(
      'content-locator-invalid-workspace-path',
      'Workspace file locator path must be normalized and workspace-relative.',
    );
  }
  const fingerprint = validateOptionalFingerprint(value['fingerprint']);
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    locator: {
      kind: 'workspace-file',
      path,
      ...(fingerprint.fingerprint ? { fingerprint: fingerprint.fingerprint } : {}),
    },
  };
}

function validateMediaLibraryLocator(
  value: Record<string, unknown>,
): ContentLocatorValidationResult {
  if (!hasOnlyKeys(value, MEDIA_LIBRARY_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Media Library locator contains unsupported fields.',
    );
  }
  if (typeof value['libraryName'] !== 'string' || !isPortablePathSegment(value['libraryName'])) {
    return invalidLocator(
      'content-locator-invalid-media-library-name',
      'Media Library locator name must be one portable logical segment.',
    );
  }
  const relativePath =
    typeof value['relativePath'] === 'string'
      ? normalizeMediaLibraryContentPath(value['relativePath'])
      : undefined;
  if (!relativePath) {
    return invalidLocator(
      'content-locator-invalid-media-library-path',
      'Media Library locator path must be normalized and relative to its logical library.',
    );
  }
  const fingerprint = validateOptionalFingerprint(value['fingerprint']);
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    locator: {
      kind: 'media-library',
      libraryName: value['libraryName'],
      relativePath,
      ...(fingerprint.fingerprint ? { fingerprint: fingerprint.fingerprint } : {}),
    },
  };
}

function validateDocumentEntryLocator(
  value: Record<string, unknown>,
): ContentLocatorValidationResult {
  if (!hasOnlyKeys(value, DOCUMENT_ENTRY_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Document entry locator contains unsupported fields.',
    );
  }
  const source = validateContentLocator(value['source']);
  if (
    !source.ok ||
    (source.locator.kind !== 'workspace-file' && source.locator.kind !== 'media-library')
  ) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Document entry source must be a Workspace File or Media Library locator.',
    );
  }
  if (typeof value['entryPath'] !== 'string') {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Document entry path must be a normalized archive-relative path.',
    );
  }
  const entryPath = normalizeBundleEntryPath(value['entryPath']);
  if (!entryPath.ok || entryPath.entryPath !== value['entryPath']) {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Document entry path must be a normalized archive-relative path.',
    );
  }
  const fingerprint = validateOptionalFingerprint(value['fingerprint']);
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    locator: {
      kind: 'document-entry',
      source: source.locator,
      entryPath: entryPath.entryPath,
      ...(fingerprint.fingerprint ? { fingerprint: fingerprint.fingerprint } : {}),
    },
  };
}

function validateGeneratedOutputLocator(
  value: Record<string, unknown>,
): ContentLocatorValidationResult {
  if (!hasOnlyKeys(value, GENERATED_OUTPUT_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Generated output locator contains unsupported fields.',
    );
  }
  const path =
    typeof value['path'] === 'string' ? normalizeWorkspaceContentPath(value['path']) : undefined;
  if (
    !isStableOwnerIdentity(value['outputId']) ||
    !isDigest(value['digest']) ||
    !path ||
    path !== value['path']
  ) {
    return invalidLocator(
      'content-locator-invalid-identity',
      'Generated output locator requires stable identity, digest, and workspace path.',
    );
  }
  return {
    ok: true,
    locator: {
      kind: 'generated-output',
      outputId: value['outputId'],
      digest: value['digest'],
      path,
    },
  };
}

function validatePackageResourceLocator(
  value: Record<string, unknown>,
): ContentLocatorValidationResult {
  if (!hasOnlyKeys(value, PACKAGE_RESOURCE_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-kind',
      'Package resource locator contains unsupported fields.',
    );
  }
  if (
    !isStableOwnerIdentity(value['packageId']) ||
    !isStableOwnerIdentity(value['revision']) ||
    typeof value['resourcePath'] !== 'string'
  ) {
    return invalidLocator(
      'content-locator-invalid-identity',
      'Package resource locator requires package identity, revision, and resource path.',
    );
  }
  const resourcePath = normalizeBundleEntryPath(value['resourcePath']);
  if (!resourcePath.ok || resourcePath.entryPath !== value['resourcePath']) {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Package resource path must be normalized and package-relative.',
    );
  }
  if (value['digest'] !== undefined && !isDigest(value['digest'])) {
    return invalidLocator(
      'content-locator-invalid-identity',
      'Package resource digest is invalid.',
    );
  }
  const manifestPath =
    typeof value['manifestPath'] === 'string'
      ? normalizeWorkspaceContentPath(value['manifestPath'])
      : undefined;
  if (
    value['manifestPath'] !== undefined &&
    (!manifestPath || manifestPath !== value['manifestPath'])
  ) {
    return invalidLocator(
      'content-locator-invalid-workspace-path',
      'Package manifest path must be normalized and workspace-relative.',
    );
  }
  return {
    ok: true,
    locator: {
      kind: 'package-resource',
      packageId: value['packageId'],
      revision: value['revision'],
      resourcePath: resourcePath.entryPath,
      ...(value['digest'] ? { digest: value['digest'] } : {}),
      ...(manifestPath ? { manifestPath } : {}),
    },
  };
}

type FingerprintValidationResult =
  | { readonly ok: true; readonly fingerprint?: ContentFingerprint }
  | { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] };

function validateOptionalFingerprint(value: unknown): FingerprintValidationResult {
  if (value === undefined) return { ok: true };
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, FINGERPRINT_KEYS) ||
    (value['strategy'] !== 'sha256' &&
      value['strategy'] !== 'mtime-size' &&
      value['strategy'] !== 'provider') ||
    !isNonEmptyString(value['value'])
  ) {
    return invalidLocator(
      'content-locator-invalid-fingerprint',
      'Content locator fingerprint is invalid.',
    );
  }
  return {
    ok: true,
    fingerprint: { strategy: value['strategy'], value: value['value'] },
  };
}

function fingerprintsEqual(
  left: ContentFingerprint | undefined,
  right: ContentFingerprint | undefined,
): boolean {
  return left?.strategy === right?.strategy && left?.value === right?.value;
}

const WORKSPACE_FILE_KEYS = ['kind', 'path', 'fingerprint'] as const;
const MEDIA_LIBRARY_KEYS = ['kind', 'libraryName', 'relativePath', 'fingerprint'] as const;
const DOCUMENT_ENTRY_KEYS = ['kind', 'source', 'entryPath', 'fingerprint'] as const;
const GENERATED_OUTPUT_KEYS = ['kind', 'outputId', 'digest', 'path'] as const;
const PACKAGE_RESOURCE_KEYS = [
  'kind',
  'packageId',
  'revision',
  'resourcePath',
  'digest',
  'manifestPath',
] as const;
const FINGERPRINT_KEYS = ['strategy', 'value'] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function invalidLocator(
  code: ContentLocatorDiagnosticCode,
  message: string,
): { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] } {
  return { ok: false, diagnostics: [{ code, message }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDigest(value: unknown): value is string {
  return isNonEmptyString(value) && /^[A-Za-z0-9][A-Za-z0-9:+._-]*$/.test(value);
}

function isStableOwnerIdentity(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !value.includes('\0') &&
    !value.includes('${') &&
    !value.includes('project://assets/') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/u.test(value)
  );
}
