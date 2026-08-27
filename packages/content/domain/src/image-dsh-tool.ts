import {
  isContentLocator,
  isWorkspaceFileContentLocator,
  type ContentEntrySelector,
  type WorkspaceFileContentLocator,
} from './contracts';

export const CONTENT_IMAGE_DSH_TOOL_NAME = 'openneko_read_image' as const;
export const CONTENT_IMAGE_DSH_TOOL_OPERATION = 'read-chunk' as const;
export const CONTENT_IMAGE_DSH_CHUNK_BYTES = 128 * 1024;

export const CONTENT_IMAGE_DSH_SOURCE_SCHEMA = {
  type: 'object',
  title: 'workspace ContentLocator',
  description:
    'Canonical Workspace ContentLocator returned by an OpenNeko content capability. Preserve it exactly; document entries include selector.kind="entry" and selector.path.',
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
} as const;

export type ContentImageDshSource = WorkspaceFileContentLocator & {
  readonly selector?: ContentEntrySelector;
};

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
