import { normalizeBundleEntryPath } from './bundle-locator';

export interface ContentFingerprint {
  readonly strategy: 'sha256' | 'mtime-size' | 'provider';
  readonly value: string;
}

export interface WorkspaceFileContentLocator {
  readonly kind: 'workspace-file';
  readonly path: string;
  readonly fingerprint?: ContentFingerprint;
}

export interface DocumentEntryContentLocator {
  readonly kind: 'document-entry';
  readonly source: WorkspaceFileContentLocator;
  readonly entryPath: string;
  readonly fingerprint?: ContentFingerprint;
}

export interface GeneratedOutputContentLocator {
  readonly kind: 'generated-output';
  readonly outputId: string;
  readonly revision: string;
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
  | DocumentEntryContentLocator
  | GeneratedOutputContentLocator
  | PackageResourceContentLocator;

export type ContentLocatorDiagnosticCode =
  | 'content-locator-invalid-entry-path'
  | 'content-locator-invalid-fingerprint'
  | 'content-locator-invalid-identity'
  | 'content-locator-invalid-kind'
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
        left.revision === right.revision &&
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
    case 'document-entry':
      return JSON.stringify([
        locator.kind,
        contentLocatorKey(locator.source),
        locator.entryPath,
        locator.fingerprint?.strategy,
        locator.fingerprint?.value,
      ]);
    case 'generated-output':
      return JSON.stringify([
        locator.kind,
        locator.outputId,
        locator.revision,
        locator.digest,
        locator.path,
      ]);
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

export function normalizeWorkspaceContentPath(value: string): string | undefined {
  const normalized = value.normalize('NFC').replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return undefined;
  if (normalized.includes('${')) return undefined;
  if (normalized.startsWith('/') || /^[A-Za-z]:(?:\/|$)/.test(normalized)) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) return undefined;
  if (normalized.startsWith('.neko/.cache/') || normalized.startsWith('neko/.cache/')) {
    return undefined;
  }

  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..' || segment.includes(':'),
    )
  ) {
    return undefined;
  }
  return segments.join('/');
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
  if (!source.ok || source.locator.kind !== 'workspace-file') {
    return invalidLocator(
      'content-locator-invalid-workspace-path',
      'Document entry source must be a workspace file locator.',
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
    !isStableOwnerIdentity(value['revision']) ||
    !isDigest(value['digest']) ||
    !path ||
    path !== value['path']
  ) {
    return invalidLocator(
      'content-locator-invalid-identity',
      'Generated output locator requires stable identity, digest, revision, and workspace path.',
    );
  }
  return {
    ok: true,
    locator: {
      kind: 'generated-output',
      outputId: value['outputId'],
      revision: value['revision'],
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
const DOCUMENT_ENTRY_KEYS = ['kind', 'source', 'entryPath', 'fingerprint'] as const;
const GENERATED_OUTPUT_KEYS = ['kind', 'outputId', 'revision', 'digest', 'path'] as const;
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
