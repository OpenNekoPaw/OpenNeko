import {
  contentLocatorsEqual,
  isContentLocator,
  isWorkspaceFileContentLocator,
  type ContentLocator,
  type WorkspaceFileContentLocator,
} from '../contracts';
import type { ContentDocumentCursor } from './content-access-document-runtime';

export const DOCUMENT_DSH_TOOL_NAME = 'openneko.document' as const;
export const DOCUMENT_DSH_TOOL_OPERATIONS = ['read', 'continue', 'read-images'] as const;

export type DocumentDshToolOperation = (typeof DOCUMENT_DSH_TOOL_OPERATIONS)[number];

export type DocumentDshJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly DocumentDshJsonValue[]
  | { readonly [key: string]: DocumentDshJsonValue };

const WORKSPACE_FILE_BASE_SCHEMA = {
  type: 'object',
  title: 'workspace-file ContentLocator',
  description:
    'Canonical workspace file locator. Media-library files are addressed like ordinary workspace files, for example neko/assets/Blame/book.epub.',
  properties: {
    file: {
      type: 'object',
      properties: {
        authority: {
          type: 'string',
          const: 'workspace',
          required: true,
          description: 'Must be workspace; never use kind: workspace-file.',
        },
        path: {
          type: 'string',
          required: true,
          description:
            'Workspace-relative POSIX path. Managed media libraries use neko/assets/<library>/... and need no special locator.',
        },
      },
      additionalProperties: false,
      required: true,
    },
  },
  additionalProperties: false,
} as const;

const CONTENT_SELECTOR_SCHEMAS = [
  {
    type: 'object',
    description: 'EPUB or CBZ entry inside the selected container file.',
    properties: {
      kind: { type: 'string', const: 'entry', required: true },
      path: { type: 'string', required: true },
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    description: 'PDF page selection.',
    properties: {
      kind: { type: 'string', const: 'page', required: true },
      pageNumber: { type: 'number', required: true },
      pageIndex: { type: 'number', required: true },
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    description: 'DOCX or other textual document selection.',
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
] as const;

const WORKSPACE_FILE_LOCATOR_SCHEMA = {
  ...WORKSPACE_FILE_BASE_SCHEMA,
  properties: {
    ...WORKSPACE_FILE_BASE_SCHEMA.properties,
    selector: {
      description:
        'Optional exact selection inside the document. EPUB/CBZ use entry, PDF uses page, and DOCX uses text-range.',
      oneOf: CONTENT_SELECTOR_SCHEMAS,
    },
  },
} as const;

const DOCUMENT_CURSOR_SCHEMA = {
  type: 'object',
  description: 'Cursor returned by a previous openneko.document read.',
  properties: {
    source: { ...WORKSPACE_FILE_LOCATOR_SCHEMA, required: true },
    strategy: { type: 'string', const: 'manifest-order', required: true },
    next: WORKSPACE_FILE_LOCATOR_SCHEMA,
    batchIndex: { type: 'integer', required: true },
    done: { type: 'boolean', required: true },
    maxChars: { type: 'integer' },
  },
  additionalProperties: false,
} as const;

export const DOCUMENT_DSH_TOOL_PARAMETERS = {
  operation: {
    type: 'string',
    enum: [...DOCUMENT_DSH_TOOL_OPERATIONS],
    description:
      'Top-level operation discriminator: read document content, continue an issued cursor, or list document images. Never add strategy at the top level; continue must replay the returned cursor unchanged.',
    required: true,
  },
  source: {
    ...WORKSPACE_FILE_LOCATOR_SCHEMA,
    description:
      'Top-level canonical document source. Use source.file.authority="workspace" and source.file.path; never wrap source inside input.',
    required: true,
  },
  mode: {
    type: 'string',
    enum: ['content', 'manifest'],
    description:
      'Read result mode. Manifest discovers whole-document structure; content extracts content. Use content (or omit mode) when source.selector targets exact document content. Never use range, next, or a top-level strategy.',
  },
  cursor: DOCUMENT_CURSOR_SCHEMA,
  includeManifest: { type: 'boolean' },
  includeImages: { type: 'boolean' },
  maxImages: { type: 'number' },
  maxChars: { type: 'number' },
} as const;

export type DocumentDshToolInput =
  | {
      readonly operation: 'read';
      readonly input: DocumentDshReadInput;
    }
  | {
      readonly operation: 'continue';
      readonly input: DocumentDshContinueInput;
    }
  | {
      readonly operation: 'read-images';
      readonly input: DocumentDshReadImagesInput;
    };

export interface DocumentDshReadInput {
  readonly source: ContentLocator;
  readonly mode?: 'content' | 'manifest';
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface DocumentDshContinueInput {
  readonly source: ContentLocator;
  readonly cursor: ContentDocumentCursor;
}

export interface DocumentDshReadImagesInput {
  readonly source: ContentLocator;
  readonly maxImages?: number;
}

export function decodeDocumentDshToolArgs(args: unknown): DocumentDshToolInput {
  const record = requireRecord(args, 'arguments');
  if ('input' in record) {
    throw new Error(
      'arguments.input is not supported; pass source and document options at the top level.',
    );
  }
  const { operation, ...input } = record;
  return decodeDocumentDshToolInput(operation, input);
}

export function decodeDocumentDshToolInput(
  operation: unknown,
  input: unknown,
): DocumentDshToolInput {
  if (operation === 'read') {
    const record = requireRecord(input, 'input');
    requireExactKeys(
      record,
      ['source', 'mode', 'includeManifest', 'includeImages', 'maxChars', 'maxImages'],
      'input',
      true,
    );
    const source = requireContentLocator(record.source, 'input.source');
    const mode = requireReadMode(record.mode, source);
    return {
      operation,
      input: {
        source,
        ...(mode === undefined ? {} : { mode }),
        ...(record.includeManifest === undefined
          ? {}
          : { includeManifest: requireBoolean(record.includeManifest, 'input.includeManifest') }),
        ...(record.includeImages === undefined
          ? {}
          : { includeImages: requireBoolean(record.includeImages, 'input.includeImages') }),
        ...(record.maxChars === undefined
          ? {}
          : { maxChars: requirePositiveInteger(record.maxChars, 'input.maxChars') }),
        ...(record.maxImages === undefined
          ? {}
          : { maxImages: requirePositiveInteger(record.maxImages, 'input.maxImages') }),
      },
    };
  }
  if (operation === 'continue') {
    const record = requireRecord(input, 'input');
    requireExactKeys(record, ['source', 'cursor'], 'input');
    const source = requireContentLocator(record.source, 'input.source');
    return {
      operation,
      input: {
        source,
        cursor: requireDocumentCursor(record.cursor, source),
      },
    };
  }
  if (operation === 'read-images') {
    const record = requireRecord(input, 'input');
    requireExactKeys(record, ['source', 'maxImages'], 'input', true);
    return {
      operation,
      input: {
        source: requireContentLocator(record.source, 'input.source'),
        ...(record.maxImages === undefined
          ? {}
          : { maxImages: requirePositiveInteger(record.maxImages, 'input.maxImages') }),
      },
    };
  }
  throw new Error(
    `Document DSH tool operation must be one of ${DOCUMENT_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

function requireDocumentCursor(
  value: unknown,
  requestedSource: ContentLocator,
): ContentDocumentCursor {
  const record = requireRecord(value, 'input.cursor');
  requireExactKeys(
    record,
    ['source', 'strategy', 'next', 'batchIndex', 'done', 'maxChars'],
    'input.cursor',
    true,
  );
  const source = requireContentLocator(record.source, 'input.cursor.source');
  if (!contentLocatorsEqual(source, requestedSource)) {
    throw new Error('input.cursor.source must match input.source exactly.');
  }
  if (record.strategy !== 'manifest-order') {
    throw new Error('input.cursor.strategy must be manifest-order.');
  }
  const next =
    record.next === undefined ? undefined : requireContentLocator(record.next, 'input.cursor.next');
  if (next !== undefined && !sameContentFile(next, source)) {
    throw new Error('input.cursor.next must address the same document as input.cursor.source.');
  }
  const done = requireBoolean(record.done, 'input.cursor.done');
  if (done && next !== undefined) {
    throw new Error('input.cursor.next must be omitted when input.cursor.done is true.');
  }
  return {
    source,
    strategy: 'manifest-order',
    ...(next === undefined ? {} : { next }),
    batchIndex: requireNonNegativeInteger(record.batchIndex, 'input.cursor.batchIndex'),
    done,
    ...(record.maxChars === undefined
      ? {}
      : { maxChars: requirePositiveInteger(record.maxChars, 'input.cursor.maxChars') }),
  };
}

function sameContentFile(left: ContentLocator, right: ContentLocator): boolean {
  return contentLocatorsEqual({ file: left.file }, { file: right.file });
}

export function documentDshJsonValue(value: unknown): DocumentDshJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(documentDshJsonValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') return [];
        return [[key, documentDshJsonValue(item)]];
      }),
    );
  }
  throw new Error(`Document DSH result contains unsupported value type: ${typeof value}.`);
}

function requireContentLocator(value: unknown, field: string): WorkspaceFileContentLocator {
  if (!isContentLocator(value) || !isWorkspaceFileContentLocator(value)) {
    throw new Error(`${field} must be a canonical workspace-file ContentLocator.`);
  }
  return value;
}

function requireReadMode(
  value: unknown,
  source: ContentLocator,
): DocumentDshReadInput['mode'] | undefined {
  if (source.selector !== undefined) {
    requireSupportedDocumentSelector(source);
    if (value === undefined || value === 'content') return value;
    if (value === 'manifest') {
      throw new Error('input.mode manifest cannot be used when input.source.selector is present.');
    }
    throw new Error('input.mode must be content or manifest.');
  }
  if (value === undefined) return undefined;
  if (value === 'content' || value === 'manifest') return value;
  throw new Error('input.mode must be content or manifest.');
}

function requireSupportedDocumentSelector(source: ContentLocator): void {
  const extension = source.file.path.split('.').at(-1)?.toLowerCase();
  const expectedKind =
    extension === 'epub' || extension === 'cbz'
      ? 'entry'
      : extension === 'pdf'
        ? 'page'
        : extension === 'docx'
          ? 'text-range'
          : undefined;
  if (expectedKind !== undefined && source.selector?.kind !== expectedKind) {
    throw new Error(
      `${(extension ?? 'document').toUpperCase()} document selection requires ${expectedKind}.`,
    );
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  field: string,
  optional = false,
): void {
  const actual = Object.keys(record);
  const allowed = new Set(keys);
  if (actual.some((key) => !allowed.has(key))) {
    throw new Error(`${field} contains unsupported fields.`);
  }
  if (!optional && actual.length !== keys.length) {
    throw new Error(`${field} must contain exactly ${keys.join(', ')}.`);
  }
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean.`);
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}
