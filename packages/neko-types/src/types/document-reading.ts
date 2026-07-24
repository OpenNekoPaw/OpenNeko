import type { ContentRepresentationLocator } from './content-representation';
import type { DocumentEntryContentLocator } from './content-locator';

// =============================================================================
// Document Reading Contracts
// =============================================================================

export type DocumentFormat =
  | 'pdf'
  | 'epub'
  | 'cbz'
  | 'cbr'
  | 'docx'
  | 'doc'
  | 'pptx'
  | 'ppt'
  | 'text'
  | 'markdown'
  | 'fountain'
  | 'html'
  | 'json'
  | 'yaml'
  | 'xlsx'
  | 'xls'
  | 'fdx'
  | 'url'
  | 'unknown';

export const DOCUMENT_FORMATS = [
  'pdf',
  'epub',
  'cbz',
  'cbr',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'text',
  'markdown',
  'fountain',
  'html',
  'json',
  'yaml',
  'xlsx',
  'xls',
  'fdx',
  'url',
  'unknown',
] as const satisfies readonly DocumentFormat[];

export interface DocumentFileIdentity {
  readonly fileId: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly hash?: string;
}

export interface DocumentSourceRef {
  readonly filePath: string;
  readonly format: DocumentFormat;
  readonly fileId?: string;
  readonly identity?: DocumentFileIdentity;
  readonly uri?: string;
  readonly token?: string;
  readonly rangeUrl?: string;
  readonly entryBaseUrl?: string;
}

export interface DocumentRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DocumentPageLocator {
  readonly kind: 'page';
  readonly pageNumber: number;
  readonly pageIndex: number;
  readonly entryName?: string;
}

export interface DocumentChapterLocator {
  readonly kind: 'chapter';
  readonly chapterHref: string;
  readonly spineIndex?: number;
  readonly title?: string;
  readonly cfi?: string;
}

export interface DocumentSlideLocator {
  readonly kind: 'slide';
  readonly slideNumber: number;
  readonly slideIndex: number;
}

export interface DocumentTextRangeLocator {
  readonly kind: 'text-range';
  readonly startChar?: number;
  readonly endChar?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly paragraphIndex?: number;
  readonly heading?: string;
}

export interface DocumentRegionLocator {
  readonly kind: 'region';
  readonly pageNumber: number;
  readonly pageIndex?: number;
  readonly entryName?: string;
  readonly region: DocumentRegion;
}

export type DocumentLocator =
  | DocumentPageLocator
  | DocumentChapterLocator
  | DocumentSlideLocator
  | DocumentTextRangeLocator
  | DocumentRegionLocator;

export interface DocumentReadLimit {
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface DocumentRange {
  readonly locator: DocumentLocator;
  readonly endLocator?: DocumentLocator;
  readonly limit?: DocumentReadLimit;
}

export type DocumentContentKind = 'text' | 'image' | 'mixed';

export type DocumentArchiveResourceVersionPolicy =
  'read-only-source' | 'versioned-export' | 'replace-reference';

export const DOCUMENT_ARCHIVE_RESOURCE_VERSION_POLICIES = [
  'read-only-source',
  'versioned-export',
  'replace-reference',
] as const satisfies readonly DocumentArchiveResourceVersionPolicy[];

export interface DocumentArchiveResourceRef {
  readonly kind: 'document-entry';
  readonly source: DocumentSourceRef;
  readonly entryPath?: string;
  readonly locator?: DocumentLocator;
  readonly versionPolicy?: DocumentArchiveResourceVersionPolicy;
}

export interface CreateDocumentEntryResourceRefInput {
  readonly source?: DocumentSourceRef;
  readonly locator?: DocumentLocator;
  readonly entryPath?: string;
  readonly versionPolicy?: DocumentArchiveResourceVersionPolicy;
}

export interface DocumentImageInfo {
  readonly path?: string;
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly portableForTransfer?: boolean;
  readonly nonPortableReason?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly locator?: DocumentLocator;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly contentLocator?: DocumentEntryContentLocator;
  readonly representationLocator?: ContentRepresentationLocator;
}

export interface DocumentExcerpt {
  readonly text?: string;
  readonly imageData?: string;
  readonly imagePaths?: readonly string[];
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly contentKind: DocumentContentKind;
  readonly truncated?: boolean;
}

export type DocumentManifestUnitKind =
  'page' | 'chapter' | 'entry' | 'slide' | 'section' | 'line' | 'text-range';

export interface DocumentManifestUnit {
  readonly kind: DocumentManifestUnitKind;
  readonly locator: DocumentLocator;
  readonly title?: string;
  readonly href?: string;
  readonly entryName?: string;
  readonly textPreview?: string;
  readonly charCount?: number;
}

export interface DocumentManifestCapabilities {
  readonly supportsManifest: boolean;
  readonly supportsRangeRead: boolean;
  readonly supportsCursorRead: boolean;
  readonly supportsPageRange?: boolean;
  readonly supportsChapterRange?: boolean;
  readonly supportsEntryRange?: boolean;
  readonly supportsSlideRange?: boolean;
  readonly supportsTextRange?: boolean;
  readonly supportsRegion?: boolean;
  readonly requiresFullExtraction?: boolean;
}

export interface DocumentManifest {
  readonly source: DocumentSourceRef;
  readonly format: DocumentFormat;
  readonly fileId?: string;
  readonly title?: string;
  readonly pageCount?: number;
  readonly chapterCount?: number;
  readonly slideCount?: number;
  readonly entryCount?: number;
  readonly lineCount?: number;
  readonly units: readonly DocumentManifestUnit[];
  readonly capabilities: DocumentManifestCapabilities;
  readonly metadata?: Record<string, unknown>;
}

export type DocumentBatchStrategy = 'manifest-order';

export interface DocumentBatchCursor {
  readonly source: DocumentSourceRef;
  readonly strategy: DocumentBatchStrategy;
  readonly next?: DocumentLocator;
  readonly batchIndex: number;
  readonly done: boolean;
  readonly fileId?: string;
  readonly maxChars?: number;
}

export interface DocumentReadResult {
  readonly source: DocumentSourceRef;
  readonly range?: DocumentRange;
  readonly locator?: DocumentLocator;
  readonly text?: string;
  readonly imagePaths?: readonly string[];
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly excerpt?: DocumentExcerpt;
  readonly manifest?: DocumentManifest;
  readonly cursor?: DocumentBatchCursor;
  readonly totalTextChars?: number;
  readonly returnedTextChars?: number;
  readonly truncated?: boolean;
  readonly pageCount?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface DocumentContextData {
  readonly filePath?: string;
  readonly text?: string;
  readonly imageData?: string;
  readonly contentKind?: DocumentContentKind;
  readonly context?: {
    readonly page?: number;
    readonly chapter?: string;
    readonly region?: DocumentRegion;
  };
  readonly source?: DocumentSourceRef;
  readonly locator?: DocumentLocator;
  readonly range?: DocumentRange;
  readonly excerpt?: DocumentExcerpt;
}

export function isDocumentFormat(value: unknown): value is DocumentFormat {
  return typeof value === 'string' && includesString(DOCUMENT_FORMATS, value);
}

export function isDocumentArchiveResourceVersionPolicy(
  value: unknown,
): value is DocumentArchiveResourceVersionPolicy {
  return (
    typeof value === 'string' && includesString(DOCUMENT_ARCHIVE_RESOURCE_VERSION_POLICIES, value)
  );
}

export function isDocumentArchiveResourceRef(value: unknown): value is DocumentArchiveResourceRef {
  return parseDocumentArchiveResourceRef(value) !== undefined;
}

export function parseDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  const resource = asRecord(value);
  if (!resource || resource['kind'] !== 'document-entry') {
    return undefined;
  }

  const source = parseDocumentSourceRef(resource['source']);
  if (!source) {
    return undefined;
  }

  const entryPath = readOptionalStringField(resource, 'entryPath');
  const versionPolicy = readOptionalVersionPolicyField(resource, 'versionPolicy');
  const locator = readOptionalLocatorField(resource, 'locator');
  if (entryPath === null || versionPolicy === null || locator === null) {
    return undefined;
  }

  return {
    kind: 'document-entry',
    source,
    ...(entryPath ? { entryPath } : {}),
    ...(locator ? { locator } : {}),
    ...(versionPolicy ? { versionPolicy } : {}),
  };
}

export function createDocumentEntryResourceRef(
  input: CreateDocumentEntryResourceRefInput,
): DocumentArchiveResourceRef | undefined {
  if (!input.source || (!input.entryPath && !input.locator)) {
    return undefined;
  }

  const source = parseDocumentSourceRef(input.source);
  const locator = input.locator ? parseDocumentLocator(input.locator) : undefined;
  const versionPolicy = input.versionPolicy ?? 'versioned-export';
  if (!source || !isDocumentArchiveResourceVersionPolicy(versionPolicy)) {
    return undefined;
  }

  return {
    kind: 'document-entry',
    source,
    ...(input.entryPath ? { entryPath: input.entryPath } : {}),
    ...(locator ? { locator } : {}),
    versionPolicy,
  };
}

export function parseDocumentSourceRef(value: unknown): DocumentSourceRef | undefined {
  const source = asRecord(value);
  if (!source) {
    return undefined;
  }

  const filePath = readRequiredString(source['filePath']);
  const format = source['format'];
  if (!filePath || !isDocumentFormat(format)) {
    return undefined;
  }

  const fileId = readOptionalStringField(source, 'fileId');
  const uri = readOptionalStringField(source, 'uri');
  const token = readOptionalStringField(source, 'token');
  const rangeUrl = readOptionalStringField(source, 'rangeUrl');
  const entryBaseUrl = readOptionalStringField(source, 'entryBaseUrl');
  const identity = readOptionalFileIdentityField(source, 'identity');
  if (
    fileId === null ||
    uri === null ||
    token === null ||
    rangeUrl === null ||
    entryBaseUrl === null ||
    identity === null
  ) {
    return undefined;
  }

  return {
    filePath,
    format,
    ...(fileId ? { fileId } : {}),
    ...(identity ? { identity } : {}),
    ...(uri ? { uri } : {}),
    ...(token ? { token } : {}),
    ...(rangeUrl ? { rangeUrl } : {}),
    ...(entryBaseUrl ? { entryBaseUrl } : {}),
  };
}

export function parseDocumentLocator(value: unknown): DocumentLocator | undefined {
  const locator = asRecord(value);
  if (!locator || typeof locator['kind'] !== 'string') {
    return undefined;
  }

  switch (locator['kind']) {
    case 'page':
      return parsePageLocator(locator);
    case 'chapter':
      return parseChapterLocator(locator);
    case 'slide':
      return parseSlideLocator(locator);
    case 'text-range':
      return parseTextRangeLocator(locator);
    case 'region':
      return parseRegionLocator(locator);
    default:
      return undefined;
  }
}

function parsePageLocator(locator: Record<string, unknown>): DocumentPageLocator | undefined {
  if (!isFiniteNumber(locator['pageNumber']) || !isFiniteNumber(locator['pageIndex'])) {
    return undefined;
  }

  const entryName = readOptionalStringField(locator, 'entryName');
  if (entryName === null) {
    return undefined;
  }

  return {
    kind: 'page',
    pageNumber: locator['pageNumber'],
    pageIndex: locator['pageIndex'],
    ...(entryName ? { entryName } : {}),
  };
}

function parseChapterLocator(locator: Record<string, unknown>): DocumentChapterLocator | undefined {
  const chapterHref = readRequiredString(locator['chapterHref']);
  if (!chapterHref) {
    return undefined;
  }

  const spineIndex = readOptionalNumberField(locator, 'spineIndex');
  const title = readOptionalStringField(locator, 'title');
  const cfi = readOptionalStringField(locator, 'cfi');
  if (spineIndex === null || title === null || cfi === null) {
    return undefined;
  }

  return {
    kind: 'chapter',
    chapterHref,
    ...(spineIndex !== undefined ? { spineIndex } : {}),
    ...(title ? { title } : {}),
    ...(cfi ? { cfi } : {}),
  };
}

function parseSlideLocator(locator: Record<string, unknown>): DocumentSlideLocator | undefined {
  if (!isFiniteNumber(locator['slideNumber']) || !isFiniteNumber(locator['slideIndex'])) {
    return undefined;
  }

  return {
    kind: 'slide',
    slideNumber: locator['slideNumber'],
    slideIndex: locator['slideIndex'],
  };
}

function parseTextRangeLocator(
  locator: Record<string, unknown>,
): DocumentTextRangeLocator | undefined {
  const startChar = readOptionalNumberField(locator, 'startChar');
  const endChar = readOptionalNumberField(locator, 'endChar');
  const startLine = readOptionalNumberField(locator, 'startLine');
  const endLine = readOptionalNumberField(locator, 'endLine');
  const paragraphIndex = readOptionalNumberField(locator, 'paragraphIndex');
  const heading = readOptionalStringField(locator, 'heading');
  if (
    startChar === null ||
    endChar === null ||
    startLine === null ||
    endLine === null ||
    paragraphIndex === null ||
    heading === null
  ) {
    return undefined;
  }

  return {
    kind: 'text-range',
    ...(startChar !== undefined ? { startChar } : {}),
    ...(endChar !== undefined ? { endChar } : {}),
    ...(startLine !== undefined ? { startLine } : {}),
    ...(endLine !== undefined ? { endLine } : {}),
    ...(paragraphIndex !== undefined ? { paragraphIndex } : {}),
    ...(heading ? { heading } : {}),
  };
}

function parseRegionLocator(locator: Record<string, unknown>): DocumentRegionLocator | undefined {
  if (!isFiniteNumber(locator['pageNumber'])) {
    return undefined;
  }

  const pageIndex = readOptionalNumberField(locator, 'pageIndex');
  const entryName = readOptionalStringField(locator, 'entryName');
  const region = parseDocumentRegion(locator['region']);
  if (pageIndex === null || entryName === null || !region) {
    return undefined;
  }

  return {
    kind: 'region',
    pageNumber: locator['pageNumber'],
    ...(pageIndex !== undefined ? { pageIndex } : {}),
    ...(entryName ? { entryName } : {}),
    region,
  };
}

function parseDocumentRegion(value: unknown): DocumentRegion | undefined {
  const region = asRecord(value);
  if (
    !region ||
    !isFiniteNumber(region['x']) ||
    !isFiniteNumber(region['y']) ||
    !isFiniteNumber(region['width']) ||
    !isFiniteNumber(region['height'])
  ) {
    return undefined;
  }

  return {
    x: region['x'],
    y: region['y'],
    width: region['width'],
    height: region['height'],
  };
}

function parseDocumentFileIdentity(value: unknown): DocumentFileIdentity | undefined {
  const identity = asRecord(value);
  if (!identity) {
    return undefined;
  }

  const fileId = readRequiredString(identity['fileId']);
  if (!fileId) {
    return undefined;
  }

  const sizeBytes = readOptionalNumberField(identity, 'sizeBytes');
  const mtimeMs = readOptionalNumberField(identity, 'mtimeMs');
  const hash = readOptionalStringField(identity, 'hash');
  if (sizeBytes === null || mtimeMs === null || hash === null) {
    return undefined;
  }

  return {
    fileId,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(mtimeMs !== undefined ? { mtimeMs } : {}),
    ...(hash ? { hash } : {}),
  };
}

function readOptionalFileIdentityField(
  record: Record<string, unknown>,
  key: string,
): DocumentFileIdentity | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return parseDocumentFileIdentity(record[key]) ?? null;
}

function readOptionalLocatorField(
  record: Record<string, unknown>,
  key: string,
): DocumentLocator | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return parseDocumentLocator(record[key]) ?? null;
}

function readOptionalVersionPolicyField(
  record: Record<string, unknown>,
  key: string,
): DocumentArchiveResourceVersionPolicy | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return isDocumentArchiveResourceVersionPolicy(value) ? value : null;
}

function readOptionalStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return typeof record[key] === 'string' ? record[key] : null;
}

function readOptionalNumberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return isFiniteNumber(record[key]) ? record[key] : null;
}

function readRequiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function includesString<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
