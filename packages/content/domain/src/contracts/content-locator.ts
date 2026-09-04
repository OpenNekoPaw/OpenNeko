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

export interface ContentPageSelector {
  readonly kind: 'page';
  readonly pageNumber: number;
  readonly pageIndex: number;
}

export interface ContentTextRangeSelector {
  readonly kind: 'text-range';
  readonly startChar?: number;
  readonly endChar?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly paragraphIndex?: number;
  readonly heading?: string;
}

export type ContentSelector = ContentEntrySelector | ContentPageSelector | ContentTextRangeSelector;

export interface ContentLocator {
  readonly file: ContentFileLocator;
  readonly selector?: ContentSelector;
}

const CONTENT_LOCATOR_KEYS = ['file', 'selector'] as const;
const WORKSPACE_FILE_KEYS = ['authority', 'path'] as const;
const PACKAGE_FILE_KEYS = ['authority', 'packageId', 'revision', 'path'] as const;
const PACKAGE_REVISION_KEY = PACKAGE_FILE_KEYS[2];
const ENTRY_SELECTOR_KEYS = ['kind', 'path'] as const;
const PAGE_SELECTOR_KEYS = ['kind', 'pageNumber', 'pageIndex'] as const;
const TEXT_RANGE_SELECTOR_KEYS = [
  'kind',
  'startChar',
  'endChar',
  'startLine',
  'endLine',
  'paragraphIndex',
  'heading',
] as const;

export const CONTENT_LOCATOR_DSH_SCHEMA = {
  type: 'object',
  description:
    'Canonical @neko/content-domain ContentLocator. Use file.authority. Omit selector when the whole file is the target; never send selector: {} or add a top-level kind.',
  properties: {
    file: {
      oneOf: [
        {
          type: 'object',
          title: 'workspace content file',
          properties: {
            authority: { type: 'string', const: 'workspace', required: true },
            path: { type: 'string', required: true },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          title: 'package content file',
          properties: {
            authority: { type: 'string', const: 'package', required: true },
            packageId: { type: 'string', required: true },
            [PACKAGE_REVISION_KEY]: { type: 'string', required: true },
            path: { type: 'string', required: true },
          },
          additionalProperties: false,
        },
      ],
      required: true,
    },
    selector: {
      oneOf: [
        {
          type: 'object',
          title: 'content entry selector',
          properties: {
            kind: { type: 'string', const: 'entry', required: true },
            path: { type: 'string', required: true },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          title: 'content page selector',
          properties: {
            kind: { type: 'string', const: 'page', required: true },
            pageNumber: { type: 'number', required: true },
            pageIndex: { type: 'number', required: true },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          title: 'content text range selector',
          properties: {
            kind: { type: 'string', const: 'text-range', required: true },
            startChar: { type: 'number' },
            endChar: { type: 'number' },
            startLine: { type: 'number' },
            endLine: { type: 'number' },
            paragraphIndex: { type: 'number' },
            heading: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
} as const;

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

export function parseContentSelector(value: unknown): ContentSelector | undefined {
  const result = validateOptionalContentSelector(value);
  return result.ok ? result.selector : undefined;
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
  return JSON.stringify([...fileKey, canonicalSelector(locator.selector)]);
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
  if (!isRecord(value)) {
    return invalidLocator('content-locator-invalid-shape', 'Content selector is invalid.');
  }
  if (value['kind'] === 'page') return validatePageSelector(value);
  if (value['kind'] === 'text-range') return validateTextRangeSelector(value);
  if (!hasOnlyKeys(value, ENTRY_SELECTOR_KEYS) || value['kind'] !== 'entry') {
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

function validatePageSelector(value: Record<string, unknown>): ContentSelectorValidationResult {
  if (
    !hasOnlyKeys(value, PAGE_SELECTOR_KEYS) ||
    !isPositiveSafeInteger(value['pageNumber']) ||
    !isNonNegativeSafeInteger(value['pageIndex']) ||
    value['pageNumber'] !== value['pageIndex'] + 1
  ) {
    return invalidLocator(
      'content-locator-invalid-shape',
      'Content page selector requires matching one-based pageNumber and zero-based pageIndex.',
    );
  }
  return {
    ok: true,
    selector: {
      kind: 'page',
      pageNumber: value['pageNumber'],
      pageIndex: value['pageIndex'],
    },
  };
}

function validateTextRangeSelector(
  value: Record<string, unknown>,
): ContentSelectorValidationResult {
  if (
    !hasOnlyKeys(value, TEXT_RANGE_SELECTOR_KEYS) ||
    !isOptionalNonNegativeSafeInteger(value['startChar']) ||
    !isOptionalNonNegativeSafeInteger(value['endChar']) ||
    !isOptionalPositiveSafeInteger(value['startLine']) ||
    !isOptionalPositiveSafeInteger(value['endLine']) ||
    !isOptionalNonNegativeSafeInteger(value['paragraphIndex']) ||
    !isOptionalNonEmptyString(value['heading']) ||
    !hasOneTextRangeCoordinateFamily(value) ||
    !isOrderedOptionalRange(value['startChar'], value['endChar']) ||
    !isOrderedOptionalRange(value['startLine'], value['endLine'])
  ) {
    return invalidLocator(
      'content-locator-invalid-shape',
      'Content text-range selector is invalid.',
    );
  }
  return {
    ok: true,
    selector: {
      kind: 'text-range',
      ...(value['startChar'] === undefined ? {} : { startChar: value['startChar'] }),
      ...(value['endChar'] === undefined ? {} : { endChar: value['endChar'] }),
      ...(value['startLine'] === undefined ? {} : { startLine: value['startLine'] }),
      ...(value['endLine'] === undefined ? {} : { endLine: value['endLine'] }),
      ...(value['paragraphIndex'] === undefined ? {} : { paragraphIndex: value['paragraphIndex'] }),
      ...(value['heading'] === undefined ? {} : { heading: value['heading'] }),
    },
  };
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
  return JSON.stringify(canonicalSelector(left)) === JSON.stringify(canonicalSelector(right));
}

function canonicalSelector(selector: ContentSelector | undefined): unknown {
  if (selector === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(selector)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function invalidLocatorError(label: string, result: ContentLocatorValidationResult): Error {
  const detail = result.ok
    ? 'Content locator has the wrong authority or selector.'
    : result.diagnostics.map((entry) => entry.message).join('; ');
  return new Error(`${label} is invalid: ${detail}`);
}

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

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptionalNonNegativeSafeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeSafeInteger(value);
}

function isOptionalPositiveSafeInteger(value: unknown): value is number | undefined {
  return value === undefined || isPositiveSafeInteger(value);
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function hasOneTextRangeCoordinateFamily(value: Record<string, unknown>): boolean {
  const families = [
    value['startChar'] !== undefined || value['endChar'] !== undefined,
    value['startLine'] !== undefined || value['endLine'] !== undefined,
    value['paragraphIndex'] !== undefined,
    value['heading'] !== undefined,
  ];
  return families.filter(Boolean).length === 1;
}

function isOrderedOptionalRange(start: unknown, end: unknown): boolean {
  return (
    start === undefined ||
    end === undefined ||
    (typeof start === 'number' && typeof end === 'number' && end >= start)
  );
}
