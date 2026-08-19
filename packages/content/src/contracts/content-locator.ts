import { normalizeBundleEntryPath } from './bundle-locator';

export interface ContentFingerprint {
  readonly strategy: 'sha256' | 'mtime-size' | 'provider';
  readonly value: string;
}

export interface WorkspaceContentFileLocator {
  readonly authority: 'workspace';
  readonly path: string;
}

export interface PackageContentFileLocator {
  readonly authority: 'package';
  readonly packageId: string;
  readonly revision: string;
  readonly path: string;
}

export type ContentFileLocator = WorkspaceContentFileLocator | PackageContentFileLocator;

export interface ContentEntrySelector {
  readonly kind: 'entry';
  readonly path: string;
}

export type ContentSelector = ContentEntrySelector;

export interface ContentLocator {
  readonly file: ContentFileLocator;
  readonly selector?: ContentSelector;
}

export type WorkspaceFileContentLocator = ContentLocator & {
  readonly file: WorkspaceContentFileLocator;
};

export type PackageResourceContentLocator = ContentLocator & {
  readonly file: PackageContentFileLocator;
};

export type DocumentEntryContentLocator = WorkspaceFileContentLocator & {
  readonly selector: ContentEntrySelector;
};

export type ContentLocatorDiagnosticCode =
  | 'content-locator-invalid-authority'
  | 'content-locator-invalid-entry-path'
  | 'content-locator-invalid-shape'
  | 'content-locator-invalid-workspace-path';

export interface ContentLocatorDiagnostic {
  readonly code: ContentLocatorDiagnosticCode;
  readonly message: string;
}

export type ContentLocatorValidationResult =
  | { readonly ok: true; readonly locator: ContentLocator }
  | { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] };

export function validateContentLocator(value: unknown): ContentLocatorValidationResult {
  if (!isRecord(value) || !hasOnlyKeys(value, CONTENT_LOCATOR_KEYS) || !isRecord(value['file'])) {
    return invalidLocator('content-locator-invalid-shape', 'Content locator shape is invalid.');
  }

  const file = validateContentFileLocator(value['file']);
  if (!file.ok) return file;
  const selector = validateOptionalContentSelector(value['selector']);
  if (!selector.ok) return selector;
  return {
    ok: true,
    locator: {
      file: file.file,
      ...(selector.selector ? { selector: selector.selector } : {}),
    },
  };
}

export function isContentLocator(value: unknown): value is ContentLocator {
  return validateContentLocator(value).ok;
}

export function isWorkspaceFileContentLocator(
  value: ContentLocator,
): value is WorkspaceFileContentLocator {
  return value.file.authority === 'workspace';
}

export function isPackageResourceContentLocator(
  value: ContentLocator,
): value is PackageResourceContentLocator {
  return value.file.authority === 'package';
}

export function isDocumentEntryContentLocator(
  value: ContentLocator,
): value is DocumentEntryContentLocator {
  return value.file.authority === 'workspace' && value.selector?.kind === 'entry';
}

export function contentLocatorsEqual(left: ContentLocator, right: ContentLocator): boolean {
  return (
    contentFileLocatorsEqual(left.file, right.file) && selectorsEqual(left.selector, right.selector)
  );
}

export function contentLocatorKey(locator: ContentLocator): string {
  const fileKey =
    locator.file.authority === 'workspace'
      ? [locator.file.authority, locator.file.path]
      : [locator.file.authority, locator.file.packageId, locator.file.revision, locator.file.path];
  return JSON.stringify([
    ...fileKey,
    locator.selector?.kind,
    locator.selector?.kind === 'entry' ? locator.selector.path : undefined,
  ]);
}

export function createWorkspaceFileContentLocator(path: string): WorkspaceFileContentLocator {
  const result = validateContentLocator({ file: { authority: 'workspace', path } });
  if (!result.ok || !isWorkspaceFileContentLocator(result.locator)) {
    throw invalidLocatorError('Workspace content path', result);
  }
  return result.locator;
}

export function createPackageResourceContentLocator(input: {
  readonly packageId: string;
  readonly revision: string;
  readonly path: string;
}): PackageResourceContentLocator {
  const result = validateContentLocator({
    file: {
      authority: 'package',
      packageId: input.packageId,
      revision: input.revision,
      path: input.path,
    },
  });
  if (!result.ok || !isPackageResourceContentLocator(result.locator)) {
    throw invalidLocatorError('Package content path', result);
  }
  return result.locator;
}

export function createContentEntryLocator(
  source: WorkspaceFileContentLocator,
  entryPath: string,
): DocumentEntryContentLocator {
  const result = validateContentLocator({
    file: source.file,
    selector: { kind: 'entry', path: entryPath },
  });
  if (!result.ok || !isDocumentEntryContentLocator(result.locator)) {
    throw invalidLocatorError('Document entry path', result);
  }
  return result.locator;
}

export function serializeContentReferenceTarget(locator: WorkspaceFileContentLocator): string {
  return locator.file.path;
}

export function parseContentReferenceTarget(
  target: string,
): WorkspaceFileContentLocator | undefined {
  const validation = validateContentLocator({ file: { authority: 'workspace', path: target } });
  return validation.ok && isWorkspaceFileContentLocator(validation.locator)
    ? validation.locator
    : undefined;
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

export function isProjectDurableContentLocator(value: unknown): value is ContentLocator {
  return validateContentLocator(value).ok;
}

type ContentFileLocatorValidationResult =
  | { readonly ok: true; readonly file: ContentFileLocator }
  | { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] };

function validateContentFileLocator(
  value: Record<string, unknown>,
): ContentFileLocatorValidationResult {
  switch (value['authority']) {
    case 'workspace':
      return validateWorkspaceContentFileLocator(value);
    case 'package':
      return validatePackageContentFileLocator(value);
    default:
      return invalidLocator(
        'content-locator-invalid-authority',
        'Content file authority is invalid.',
      );
  }
}

function validateWorkspaceContentFileLocator(
  value: Record<string, unknown>,
): ContentFileLocatorValidationResult {
  if (!hasOnlyKeys(value, WORKSPACE_FILE_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-shape',
      'Workspace content file contains unsupported fields.',
    );
  }
  const path =
    typeof value['path'] === 'string' ? normalizeWorkspaceContentPath(value['path']) : undefined;
  if (!path || path !== value['path']) {
    return invalidLocator(
      'content-locator-invalid-workspace-path',
      'Workspace content path must be normalized and workspace-relative.',
    );
  }
  return { ok: true, file: { authority: 'workspace', path } };
}

function validatePackageContentFileLocator(
  value: Record<string, unknown>,
): ContentFileLocatorValidationResult {
  if (!hasOnlyKeys(value, PACKAGE_FILE_KEYS)) {
    return invalidLocator(
      'content-locator-invalid-shape',
      'Package content file contains unsupported fields.',
    );
  }
  if (
    !isStableOwnerIdentity(value['packageId']) ||
    !isStableOwnerIdentity(value['revision']) ||
    typeof value['path'] !== 'string'
  ) {
    return invalidLocator(
      'content-locator-invalid-authority',
      'Package content file requires exact package identity and revision.',
    );
  }
  const path = normalizeBundleEntryPath(value['path']);
  if (!path.ok || path.entryPath !== value['path']) {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Package content path must be normalized and package-relative.',
    );
  }
  return {
    ok: true,
    file: {
      authority: 'package',
      packageId: value['packageId'],
      revision: value['revision'],
      path: path.entryPath,
    },
  };
}

type ContentSelectorValidationResult =
  | { readonly ok: true; readonly selector?: ContentSelector }
  | { readonly ok: false; readonly diagnostics: readonly ContentLocatorDiagnostic[] };

function validateOptionalContentSelector(value: unknown): ContentSelectorValidationResult {
  if (value === undefined) return { ok: true };
  if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_SELECTOR_KEYS) || value['kind'] !== 'entry') {
    return invalidLocator('content-locator-invalid-shape', 'Content selector is invalid.');
  }
  if (typeof value['path'] !== 'string') {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Content entry path must be normalized and file-relative.',
    );
  }
  const path = normalizeBundleEntryPath(value['path']);
  if (!path.ok || path.entryPath !== value['path']) {
    return invalidLocator(
      'content-locator-invalid-entry-path',
      'Content entry path must be normalized and file-relative.',
    );
  }
  return { ok: true, selector: { kind: 'entry', path: path.entryPath } };
}

function contentFileLocatorsEqual(left: ContentFileLocator, right: ContentFileLocator): boolean {
  if (left.authority !== right.authority) return false;
  if (left.authority === 'workspace') {
    return right.authority === 'workspace' && left.path === right.path;
  }
  return (
    right.authority === 'package' &&
    left.packageId === right.packageId &&
    left.revision === right.revision &&
    left.path === right.path
  );
}

function selectorsEqual(
  left: ContentSelector | undefined,
  right: ContentSelector | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.kind === right.kind && left.path === right.path;
}

function invalidLocatorError(label: string, result: ContentLocatorValidationResult): Error {
  const detail = result.ok
    ? 'Content locator has the wrong authority or selector.'
    : result.diagnostics.map((entry) => entry.message).join('; ');
  return new Error(`${label} is invalid: ${detail}`);
}

const CONTENT_LOCATOR_KEYS = ['file', 'selector'] as const;
const WORKSPACE_FILE_KEYS = ['authority', 'path'] as const;
const PACKAGE_FILE_KEYS = ['authority', 'packageId', 'revision', 'path'] as const;
const ENTRY_SELECTOR_KEYS = ['kind', 'path'] as const;

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
