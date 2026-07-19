import {
  TOOL_NAMES_SYSTEM,
  type ContentAccessDiagnostic,
  type ContentAccessResult,
  type DocumentArchiveResourceRef,
  createTool,
  isContentSourceRef,
  type ContentSourceRef,
  parseDocumentLocator,
  parseDocumentSourceRef,
  type DocumentBatchCursor,
  type DocumentImageInfo,
  type DocumentManifest,
  type DocumentRange,
  type DocumentReadResult,
  type ResourceRef,
  type Tool,
  type ToolExecuteOptions,
  type ToolParameterProperty,
  type ToolResult,
} from '@neko/shared';

export const DEFAULT_READ_DOCUMENT_MAX_CHARS = 20000;
export const MAX_READ_DOCUMENT_CHARS = 100000;
export const DEFAULT_DOCUMENT_IMAGE_INFO_LIMIT = 50;
export const MAX_DOCUMENT_IMAGE_INFO_LIMIT = 500;

const CONTENT_SOURCE_REF_PARAMETER: ToolParameterProperty = {
  type: 'object',
  description:
    'Canonical ContentSourceRef. For a portable document path use {"kind":"file","path":"${VAR}/file.epub"} or {"kind":"file","path":"relative/path.epub"}.',
  properties: {
    kind: {
      type: 'string',
      enum: ['file', 'document', 'asset', 'media-library', 'generated-asset'],
    },
    path: {
      type: 'string',
      description: 'Source path for kind="file"; may be project-relative or ${VAR}/path.',
    },
  },
  required: ['kind'],
  additionalProperties: true,
};

const DOCUMENT_LOCATOR_PARAMETER: ToolParameterProperty = {
  type: 'object',
  description:
    'Semantic locator copied from ReadDocument manifest output. Chapter locators require chapterHref; spineIndex alone is invalid.',
  anyOf: [
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['page'] },
        pageNumber: { type: 'number' },
        pageIndex: { type: 'number' },
        entryName: { type: 'string', minLength: 1 },
      },
      required: ['kind', 'pageNumber', 'pageIndex'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['chapter'] },
        chapterHref: {
          type: 'string',
          minLength: 1,
          description: 'Required chapter href copied exactly from the document manifest.',
        },
        spineIndex: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
        cfi: { type: 'string', minLength: 1 },
      },
      required: ['kind', 'chapterHref'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['slide'] },
        slideNumber: { type: 'number' },
        slideIndex: { type: 'number' },
      },
      required: ['kind', 'slideNumber', 'slideIndex'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['text-range'] },
        startChar: { type: 'number' },
        endChar: { type: 'number' },
        startLine: { type: 'number' },
        endLine: { type: 'number' },
        paragraphIndex: { type: 'number' },
        heading: { type: 'string', minLength: 1 },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['region'] },
        pageNumber: { type: 'number' },
        pageIndex: { type: 'number' },
        entryName: { type: 'string', minLength: 1 },
        region: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['x', 'y', 'width', 'height'],
          additionalProperties: false,
        },
      },
      required: ['kind', 'pageNumber', 'region'],
      additionalProperties: false,
    },
  ],
};

const DOCUMENT_RANGE_PARAMETER: ToolParameterProperty = {
  type: 'object',
  description:
    'Semantic document range for mode="range". Copy complete locator values from the document manifest.',
  properties: {
    locator: DOCUMENT_LOCATOR_PARAMETER,
    endLocator: DOCUMENT_LOCATOR_PARAMETER,
    limit: {
      type: 'object',
      properties: {
        maxChars: { type: 'integer', minimum: 1 },
        maxImages: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  required: ['locator'],
  additionalProperties: false,
};

type ReadDocumentMode = 'content' | 'manifest' | 'range' | 'next';

export interface ReadDocumentToolDeps {
  readonly contentAccessRuntime?: ReadDocumentContentAccessRuntime;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
}

export interface ReadDocumentContentAccessRuntime {
  resolveDocumentContent(
    input: ReadDocumentContentAccessInput,
  ): Promise<ReadDocumentContentAccessResult>;
}

export interface ReadDocumentContentAccessInput {
  readonly caller: 'read-document';
  readonly source: ContentSourceRef;
  readonly intent: 'agent-context';
  readonly mode?: ReadDocumentMode;
  readonly range?: DocumentRange;
  readonly cursor?: DocumentBatchCursor;
  readonly startBatch?: boolean;
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface ReadDocumentContentAccessResult {
  readonly status: ContentAccessResult['status'];
  readonly source?: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>;
  readonly diagnostics: readonly ContentAccessDiagnostic[];
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly text?: string;
  readonly totalTextChars?: number;
  readonly returnedTextChars?: number;
  readonly truncated?: boolean;
  readonly pageCount?: number;
  readonly manifest?: DocumentManifest;
  readonly range?: DocumentRange;
  readonly locator?: DocumentReadResult['locator'];
  readonly excerpt?: DocumentReadResult['excerpt'];
  readonly cursor?: DocumentBatchCursor;
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly imageCount?: number;
  readonly imagesTruncated?: boolean;
  readonly metadata?: Record<string, unknown>;
}

interface ReadDocumentToolData {
  readonly source: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>;
  readonly mode: ReadDocumentMode;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly text?: string;
  readonly totalTextChars?: number;
  readonly returnedTextChars?: number;
  readonly truncated?: boolean;
  readonly pageCount?: number;
  readonly manifest?: DocumentManifest;
  readonly range?: DocumentRange;
  readonly locator?: DocumentReadResult['locator'];
  readonly excerpt?: DocumentReadResult['excerpt'];
  readonly cursor?: DocumentBatchCursor;
  readonly imageInfo?: readonly DocumentImageInfo[];
  readonly imageCount?: number;
  readonly imagesTruncated?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export function createReadDocumentTool(deps: ReadDocumentToolDeps): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_DOCUMENT,
    description:
      'Read document text, manifests, ranges, and cursor batches through the unified content access runtime. The input must be a stable source ref returned by Neko content access.',
    category: 'document',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        source: {
          ...CONTENT_SOURCE_REF_PARAMETER,
        },
        mode: {
          type: 'string',
          enum: ['content', 'manifest', 'range', 'next'],
          description:
            'Read mode. content returns document text; manifest returns structure; range reads a semantic locator; next continues a batch cursor.',
        },
        range: {
          ...DOCUMENT_RANGE_PARAMETER,
        },
        cursor: {
          type: 'object',
          description: 'Document batch cursor returned by a prior ReadDocument result.',
        },
        start_batch: {
          type: 'boolean',
          description:
            'When true with mode="manifest", also returns the first manifest-order cursor.',
        },
        max_chars: {
          type: 'integer',
          description: `Maximum number of text characters to return. Default ${DEFAULT_READ_DOCUMENT_MAX_CHARS}; max ${MAX_READ_DOCUMENT_CHARS}.`,
          minimum: 1000,
          maximum: MAX_READ_DOCUMENT_CHARS,
        },
        include_metadata: {
          type: 'boolean',
          description: 'Whether to include extracted document metadata. Default true.',
        },
        include_manifest: {
          type: 'boolean',
          description:
            'Whether range/next results should include the full document manifest. Default false.',
        },
        include_images: {
          type: 'boolean',
          description:
            'Whether to include document image metadata and stable document resource refs when available. Default true.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum document image refs to return. Default ${DEFAULT_DOCUMENT_IMAGE_INFO_LIMIT}; max ${MAX_DOCUMENT_IMAGE_INFO_LIMIT}.`,
          minimum: 1,
          maximum: MAX_DOCUMENT_IMAGE_INFO_LIMIT,
        },
      },
      required: ['source'],
    },
    execute: async (args, options) => executeReadDocument(deps, args, options),
  });
}

async function executeReadDocument(
  deps: ReadDocumentToolDeps,
  args: Record<string, unknown>,
  options?: ToolExecuteOptions,
): Promise<ToolResult> {
  const source = readContentSourceRef(args['source']);
  if (!source) {
    return {
      success: false,
      error:
        'ReadDocument requires source to be a canonical ContentSourceRef, for example {"kind":"file","path":"${VAR}/book.epub"}.',
    };
  }
  const contentAccessRuntime = deps.contentAccessRuntime;
  if (!contentAccessRuntime) {
    return { success: false, error: 'ReadDocument requires AgentContentAccessRuntime.' };
  }

  const maxChars = readBoundedInteger(
    args['max_chars'],
    DEFAULT_READ_DOCUMENT_MAX_CHARS,
    1000,
    MAX_READ_DOCUMENT_CHARS,
  );
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_DOCUMENT_IMAGE_INFO_LIMIT,
    1,
    MAX_DOCUMENT_IMAGE_INFO_LIMIT,
  );
  const mode = readMode(args['mode']);
  const range = args['range'] === undefined ? undefined : readDocumentRange(args['range']);
  if (mode === 'range' && !range) {
    return { success: false, error: describeInvalidDocumentRange(args['range']) };
  }
  const cursor = args['cursor'] === undefined ? undefined : readDocumentCursor(args['cursor']);
  if (mode === 'next' && !cursor) {
    return { success: false, error: 'ReadDocument next mode requires a valid cursor.' };
  }
  const result = await contentAccessRuntime.resolveDocumentContent({
    caller: 'read-document',
    source,
    intent: 'agent-context',
    mode,
    ...(range ? { range } : {}),
    ...(cursor ? { cursor } : {}),
    startBatch: readBoolean(args['start_batch'], false),
    includeManifest: readBoolean(args['include_manifest'], false),
    includeImages: readBoolean(args['include_images'], true),
    maxChars,
    maxImages,
  });
  if (result.status !== 'ready' || !result.source) {
    return {
      success: false,
      error:
        result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `ReadDocument content is not ready: ${result.status}`,
    };
  }

  const text = localizeGeneratedDocumentPlaceholder(
    result.text ?? '',
    options?.metadata?.['locale'],
  );
  const truncatedText =
    result.text === undefined ? undefined : truncateText(text, maxChars, result.truncated);
  return {
    success: true,
    data: {
      source: result.source,
      mode,
      ...(result.resourceRef ? { resourceRef: result.resourceRef } : {}),
      ...(result.documentResourceRef ? { documentResourceRef: result.documentResourceRef } : {}),
      ...(truncatedText
        ? {
            text: truncatedText.text,
            totalTextChars: result.totalTextChars ?? text.length,
            returnedTextChars: truncatedText.text.length,
            truncated: truncatedText.truncated,
          }
        : {}),
      ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
      ...(result.manifest ? { manifest: result.manifest } : {}),
      ...(result.range ? { range: result.range } : {}),
      ...(result.locator ? { locator: result.locator } : {}),
      ...(result.excerpt ? { excerpt: result.excerpt } : {}),
      ...(result.cursor ? { cursor: result.cursor } : {}),
      ...(result.imageInfo && result.imageInfo.length > 0 ? { imageInfo: result.imageInfo } : {}),
      ...(result.imageCount !== undefined ? { imageCount: result.imageCount } : {}),
      ...(result.imagesTruncated !== undefined ? { imagesTruncated: result.imagesTruncated } : {}),
      ...(readBoolean(args['include_metadata'], true) && result.metadata
        ? { metadata: result.metadata }
        : {}),
    } satisfies ReadDocumentToolData,
  };
}

function readContentSourceRef(value: unknown): ContentSourceRef | undefined {
  return isContentSourceRef(value) ? value : undefined;
}

function readMode(value: unknown): ReadDocumentMode {
  return value === 'manifest' || value === 'range' || value === 'next' || value === 'content'
    ? value
    : 'content';
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, value));
}

function readDocumentRange(value: unknown): DocumentRange | undefined {
  const range = asRecord(value);
  if (!range) return undefined;

  const locator = parseDocumentLocator(range['locator']);
  if (!locator) return undefined;
  const endLocator =
    range['endLocator'] === undefined ? undefined : parseDocumentLocator(range['endLocator']);
  if (range['endLocator'] !== undefined && !endLocator) return undefined;

  const limit = readDocumentLimit(range['limit']);
  if (limit === null) return undefined;

  return {
    locator,
    ...(endLocator ? { endLocator } : {}),
    ...(limit ? { limit } : {}),
  };
}

function describeInvalidDocumentRange(value: unknown): string {
  const range = asRecord(value);
  if (!range) {
    return 'ReadDocument range must be an object with a valid locator.';
  }
  const locator = asRecord(range['locator']);
  if (locator?.['kind'] === 'chapter' && !readString(locator['chapterHref'])) {
    return 'ReadDocument range.locator must match a DocumentLocator; chapter locators require chapterHref.';
  }
  if (!parseDocumentLocator(range['locator'])) {
    return 'ReadDocument range.locator must match a DocumentLocator.';
  }
  const endLocator = asRecord(range['endLocator']);
  if (endLocator?.['kind'] === 'chapter' && !readString(endLocator['chapterHref'])) {
    return 'ReadDocument range.endLocator must match a DocumentLocator; chapter locators require chapterHref.';
  }
  if (range['endLocator'] !== undefined && !parseDocumentLocator(range['endLocator'])) {
    return 'ReadDocument range.endLocator must match a DocumentLocator.';
  }
  if (readDocumentLimit(range['limit']) === null) {
    return 'ReadDocument range.limit must contain positive integer maxChars/maxImages values.';
  }
  return 'ReadDocument range must contain a valid locator and optional endLocator/limit.';
}

function readDocumentLimit(value: unknown): DocumentRange['limit'] | null | undefined {
  if (value === undefined) return undefined;
  const limit = asRecord(value);
  if (!limit) return null;
  const maxChars = readOptionalPositiveInteger(limit['maxChars']);
  const maxImages = readOptionalPositiveInteger(limit['maxImages']);
  if (maxChars === null || maxImages === null) return null;
  return {
    ...(maxChars !== undefined ? { maxChars } : {}),
    ...(maxImages !== undefined ? { maxImages } : {}),
  };
}

function readDocumentCursor(value: unknown): DocumentBatchCursor | undefined {
  const cursor = asRecord(value);
  if (!cursor) return undefined;
  const source = parseDocumentSourceRef(cursor['source']);
  const batchIndex = readNonNegativeInteger(cursor['batchIndex']);
  const done = cursor['done'];
  const next = cursor['next'] === undefined ? undefined : parseDocumentLocator(cursor['next']);
  const maxChars = readOptionalPositiveInteger(cursor['maxChars']);
  if (
    !source ||
    cursor['strategy'] !== 'manifest-order' ||
    batchIndex === null ||
    typeof done !== 'boolean' ||
    (cursor['next'] !== undefined && !next) ||
    (!done && !next) ||
    maxChars === null
  ) {
    return undefined;
  }
  const fileId = readString(cursor['fileId']);
  return {
    source,
    strategy: 'manifest-order',
    batchIndex,
    done,
    ...(next ? { next } : {}),
    ...(fileId ? { fileId } : {}),
    ...(maxChars !== undefined ? { maxChars } : {}),
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readOptionalPositiveInteger(value: unknown): number | null | undefined {
  return value === undefined
    ? undefined
    : typeof value === 'number' && Number.isInteger(value) && value >= 1
      ? value
      : null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function localizeGeneratedDocumentPlaceholder(text: string, locale: unknown): string {
  if (typeof locale !== 'string' || !locale.trim().toLowerCase().startsWith('zh')) {
    return text;
  }

  const epubChapterRange = /^EPUB chapter range with (\d+) image pages$/.exec(text);
  if (epubChapterRange) {
    return `EPUB 章节范围包含 ${epubChapterRange[1]} 张图片页面`;
  }

  const epubImageDocument = /^EPUB image document with (\d+) image pages$/.exec(text);
  if (epubImageDocument) {
    return `EPUB 图片文档包含 ${epubImageDocument[1]} 张图片页面`;
  }

  const cbzPageRange = /^CBZ page range ([^:]+): (\d+) image pages$/.exec(text);
  if (cbzPageRange) {
    return `CBZ 页面范围 ${cbzPageRange[1]} 包含 ${cbzPageRange[2]} 张图片页面`;
  }

  return text;
}

function truncateText(
  text: string,
  maxChars: number,
  alreadyTruncated = false,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: alreadyTruncated };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[ReadDocument truncated ${text.length - maxChars} characters]`,
    truncated: true,
  };
}
