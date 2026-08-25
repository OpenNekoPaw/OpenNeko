import type { ContentRepresentationHandle } from './content-representation';
import {
  isContentLocator,
  isWorkspaceFileContentLocator,
  type ContentLocator,
  type DocumentEntryContentLocator,
  type WorkspaceFileContentLocator,
} from './content-locator';
import type { DocumentReadCoordinate } from './document-read-coordinate';

export type { DocumentRegion } from './document-read-coordinate';

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

const TEXTUAL_DOCUMENT_FORMATS: ReadonlySet<DocumentFormat> = new Set([
  'text',
  'markdown',
  'fountain',
  'html',
  'json',
  'yaml',
]);

export function isTextualDocumentFormat(format: DocumentFormat): boolean {
  return TEXTUAL_DOCUMENT_FORMATS.has(format);
}

export interface DocumentFileIdentity {
  readonly fileId: string;
  readonly sizeBytes?: number;
  readonly mtimeMs?: number;
  readonly hash?: string;
}

export interface DocumentSourceRef {
  readonly filePath: string;
  readonly format: DocumentFormat;
  /** Canonical container identity. Required before document entries can cross package boundaries. */
  readonly contentLocator?: WorkspaceFileContentLocator;
  readonly fileId?: string;
  readonly identity?: DocumentFileIdentity;
  readonly uri?: string;
  readonly token?: string;
  readonly rangeUrl?: string;
  readonly entryBaseUrl?: string;
}

export interface DocumentReadLimit {
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface DocumentRange {
  readonly locator: DocumentReadCoordinate;
  readonly endLocator?: DocumentReadCoordinate;
  readonly limit?: DocumentReadLimit;
}

export type DocumentContentKind = 'text' | 'image' | 'mixed';

export interface CreateDocumentEntryContentLocatorInput {
  readonly source?: DocumentSourceRef;
  readonly entryPath?: string;
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
  readonly locator?: DocumentReadCoordinate;
  readonly contentLocator?: ContentLocator;
  readonly representationHandle?: ContentRepresentationHandle;
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
  readonly locator: DocumentReadCoordinate;
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
  readonly next?: DocumentReadCoordinate;
  readonly batchIndex: number;
  readonly done: boolean;
  readonly fileId?: string;
  readonly maxChars?: number;
}

export interface DocumentReadResult {
  readonly source: DocumentSourceRef;
  readonly range?: DocumentRange;
  readonly locator?: DocumentReadCoordinate;
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
  readonly source?: DocumentSourceRef;
  readonly locator?: DocumentReadCoordinate;
  readonly range?: DocumentRange;
  readonly excerpt?: DocumentExcerpt;
}

export function isDocumentFormat(value: unknown): value is DocumentFormat {
  return typeof value === 'string' && includesString(DOCUMENT_FORMATS, value);
}

export function createDocumentEntryContentLocator(
  input: CreateDocumentEntryContentLocatorInput,
): DocumentEntryContentLocator | undefined {
  if (!input.source?.contentLocator || !input.entryPath) {
    return undefined;
  }
  const locator: DocumentEntryContentLocator = {
    file: input.source.contentLocator.file,
    selector: { kind: 'entry', path: input.entryPath },
  };
  if (!isContentLocator(locator)) {
    return undefined;
  }
  return locator;
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
  const contentLocator = readOptionalDocumentSourceContentLocator(source, 'contentLocator');
  const uri = readOptionalStringField(source, 'uri');
  const token = readOptionalStringField(source, 'token');
  const rangeUrl = readOptionalStringField(source, 'rangeUrl');
  const entryBaseUrl = readOptionalStringField(source, 'entryBaseUrl');
  const identity = readOptionalFileIdentityField(source, 'identity');
  if (
    fileId === null ||
    contentLocator === null ||
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
    ...(contentLocator ? { contentLocator } : {}),
    ...(fileId ? { fileId } : {}),
    ...(identity ? { identity } : {}),
    ...(uri ? { uri } : {}),
    ...(token ? { token } : {}),
    ...(rangeUrl ? { rangeUrl } : {}),
    ...(entryBaseUrl ? { entryBaseUrl } : {}),
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

function readOptionalDocumentSourceContentLocator(
  record: Record<string, unknown>,
  key: string,
): WorkspaceFileContentLocator | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return isContentLocator(value) && isWorkspaceFileContentLocator(value) ? value : null;
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
