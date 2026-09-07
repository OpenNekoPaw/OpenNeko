import {
  contentLocatorsEqual,
  isContentLocator,
  isWorkspaceFileContentLocator,
  type ContentEntrySelector,
  type WorkspaceFileContentLocator,
} from './contracts';

export const CONTENT_IMAGE_DSH_TOOL_NAME = 'openneko_read_image' as const;
export const CONTENT_IMAGES_DSH_TOOL_NAME = 'openneko_read_images' as const;
export const CONTENT_IMAGE_DSH_TOOL_OPERATION = 'read-chunk' as const;
export const CONTENT_IMAGE_DSH_CHUNK_BYTES = 128 * 1024;
export const CONTENT_IMAGE_DSH_DETAILS = ['overview', 'original'] as const;
export const CONTENT_IMAGES_DSH_MAX_SOURCES = 16;

export type ContentImageDshDetail = (typeof CONTENT_IMAGE_DSH_DETAILS)[number];

export const CONTENT_IMAGE_DSH_SOURCE_SCHEMA = {
  type: 'object',
  title: 'workspace ContentLocator',
  description:
    'Canonical Workspace ContentLocator for raster image bytes. Preserve an imageInfo locator returned by openneko_document exactly; document image entries include selector.kind="entry" and selector.path. A chapter, XHTML, HTML, or other document entry is not an image source. This locator contains only file and optional selector; do not put read options such as detail inside it.',
  properties: {
    file: {
      type: 'object',
      properties: {
        authority: { type: 'string', const: 'workspace', required: true },
        path: { type: 'string', required: true },
      },
      additionalProperties: false,
      required: true,
    },
    selector: {
      type: 'object',
      properties: {
        kind: { type: 'string', const: 'entry', required: true },
        path: { type: 'string', required: true },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

export const CONTENT_IMAGE_DSH_TOOL_PARAMETERS = {
  source: {
    ...CONTENT_IMAGE_DSH_SOURCE_SCHEMA,
    required: true,
  },
  detail: {
    type: 'string',
    enum: CONTENT_IMAGE_DSH_DETAILS,
    description:
      'Top-level sibling of source, never source.detail. Use overview for initial visual screening and original only for selected images that need close inspection. Defaults to original. Example: {"source":{"file":{"authority":"workspace","path":"reference.png"}},"detail":"overview"}.',
  },
} as const;

export const CONTENT_IMAGES_DSH_TOOL_PARAMETERS = {
  sources: {
    type: 'array',
    items: CONTENT_IMAGE_DSH_SOURCE_SCHEMA,
    required: true,
    description:
      'One to sixteen distinct raster image ContentLocators in reading/comparison order. Prefer eight pages per batch; use four for dense pages and up to sixteen for broad overview. A final batch may contain fewer than four pages. Use imageInfo locators returned by openneko_document, never chapter/XHTML/HTML entries. The result is ONE large contact sheet of numbered thumbnails, not separate image attachments. Use openneko_read_image with detail="original" for names, dialogue, equipment and other details selected from the overview.',
  },
} as const;

export type ContentImageDshSource = WorkspaceFileContentLocator & {
  readonly selector?: ContentEntrySelector;
};

export interface ContentImageDshToolInput {
  readonly source: ContentImageDshSource;
  readonly detail: ContentImageDshDetail;
}

export interface ContentImagesDshToolInput {
  readonly sources: readonly ContentImageDshSource[];
}

export interface ContentImageDshChunkRequest {
  readonly source: ContentImageDshSource;
  readonly offset: number;
}

export interface ContentImageDshChunk {
  readonly source: ContentImageDshSource;
  readonly offset: number;
  readonly totalBytes: number;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  readonly data: string;
}

export function decodeContentImageDshToolSource(value: unknown): ContentImageDshSource {
  if (!isContentLocator(value) || !isWorkspaceFileContentLocator(value)) {
    throw new Error('source must be a canonical Workspace ContentLocator.');
  }
  if (value.selector !== undefined && value.selector.kind !== 'entry') {
    throw new Error('source selector must identify an image entry.');
  }
  return value as ContentImageDshSource;
}

export function decodeContentImageDshToolInput(value: unknown): ContentImageDshToolInput {
  const record = requireRecord(value, 'Content image arguments');
  const keys = Object.keys(record);
  if (keys.some((key) => key !== 'source' && key !== 'detail')) {
    throw new Error('Content image arguments may contain only source and detail.');
  }
  return {
    source: decodeContentImageDshToolSource(record.source),
    detail: decodeContentImageDshDetail(record.detail),
  };
}

export function decodeContentImagesDshToolInput(value: unknown): ContentImagesDshToolInput {
  const record = requireExactRecord(value, ['sources'], 'Content image overview arguments');
  if (!Array.isArray(record.sources)) {
    throw new Error('sources must be an array.');
  }
  if (record.sources.length < 1 || record.sources.length > CONTENT_IMAGES_DSH_MAX_SOURCES) {
    throw new Error(`sources must contain between 1 and ${CONTENT_IMAGES_DSH_MAX_SOURCES} images.`);
  }
  const sources = record.sources.map(decodeContentImageDshToolSource);
  for (const [index, candidate] of sources.entries()) {
    if (sources.slice(0, index).some((source) => contentLocatorsEqual(source, candidate))) {
      throw new Error(`sources contains a duplicate ContentLocator at index ${index}.`);
    }
  }
  return { sources };
}

export function decodeContentImageDshChunkRequest(
  operation: unknown,
  input: unknown,
): ContentImageDshChunkRequest {
  if (operation !== CONTENT_IMAGE_DSH_TOOL_OPERATION) {
    throw new Error(`Content image DSH operation must be ${CONTENT_IMAGE_DSH_TOOL_OPERATION}.`);
  }
  const record = requireExactRecord(input, ['source', 'offset'], 'input');
  return {
    source: decodeContentImageDshToolSource(record.source),
    offset: requireNonNegativeInteger(record.offset, 'input.offset'),
  };
}

export function decodeContentImageDshChunk(value: unknown): ContentImageDshChunk {
  const record = requireExactRecord(
    value,
    ['source', 'offset', 'totalBytes', 'mimeType', 'data'],
    'Content image chunk',
  );
  const data = requireCanonicalBase64(record.data, 'Content image chunk data');
  return {
    source: decodeContentImageDshToolSource(record.source),
    offset: requireNonNegativeInteger(record.offset, 'Content image chunk offset'),
    totalBytes: requirePositiveInteger(record.totalBytes, 'Content image chunk totalBytes'),
    mimeType: requireImageMimeType(record.mimeType),
    data,
  };
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(keys);
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !expected.has(key))
  ) {
    throw new Error(`${field} must contain exactly ${keys.join(', ')}.`);
  }
  return record;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function decodeContentImageDshDetail(value: unknown): ContentImageDshDetail {
  if (value === undefined) return 'original';
  if (value === 'overview' || value === 'original') return value;
  throw new Error(`detail must be one of ${CONTENT_IMAGE_DSH_DETAILS.join(', ')}.`);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value as number;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value as number;
}

function requireImageMimeType(value: unknown): ContentImageDshChunk['mimeType'] {
  if (
    value === 'image/png' ||
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'image/gif'
  ) {
    return value;
  }
  throw new Error('Content image chunk mimeType is unsupported.');
}

function requireCanonicalBase64(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error(`${field} must be canonical base64.`);
  }
  return value;
}
