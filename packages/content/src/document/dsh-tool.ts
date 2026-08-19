import {
  isContentLocator,
  isWorkspaceFileContentLocator,
  type ContentLocator,
  type DocumentBatchCursor,
} from '../contracts';

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

export const DOCUMENT_DSH_TOOL_PARAMETERS = {
  operation: {
    type: 'string',
    enum: [...DOCUMENT_DSH_TOOL_OPERATIONS],
    description: 'Read document content, continue an issued cursor, or list document images.',
    required: true,
  },
  input: {
    type: 'json',
    description:
      'Operation-specific input. The package-owned decoder enforces the exact canonical shape.',
    required: true,
  },
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
  readonly mode?: 'content' | 'manifest' | 'range';
  readonly range?: Record<string, unknown>;
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
}

export interface DocumentDshContinueInput {
  readonly source: ContentLocator;
  readonly cursor: DocumentBatchCursor;
}

export interface DocumentDshReadImagesInput {
  readonly source: ContentLocator;
  readonly maxImages?: number;
}

export function decodeDocumentDshToolInput(
  operation: unknown,
  input: unknown,
): DocumentDshToolInput {
  if (operation === 'read') {
    const record = requireRecord(input, 'input');
    requireExactKeys(
      record,
      ['source', 'mode', 'range', 'includeManifest', 'includeImages', 'maxChars', 'maxImages'],
      'input',
      true,
    );
    return {
      operation,
      input: {
        source: requireContentLocator(record.source, 'input.source'),
        ...(record.mode === undefined ? {} : { mode: requireMode(record.mode) }),
        ...(record.range === undefined
          ? {}
          : { range: requireRecord(record.range, 'input.range') }),
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
    return {
      operation,
      input: {
        source: requireContentLocator(record.source, 'input.source'),
        cursor: requireRecord(record.cursor, 'input.cursor') as unknown as DocumentBatchCursor,
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

function requireContentLocator(value: unknown, field: string): ContentLocator {
  if (!isContentLocator(value) || !isWorkspaceFileContentLocator(value)) {
    throw new Error(`${field} must be a canonical workspace-file ContentLocator.`);
  }
  return value;
}

function requireMode(value: unknown): DocumentDshReadInput['mode'] {
  if (value === 'content' || value === 'manifest' || value === 'range') return value;
  throw new Error('input.mode must be content, manifest, or range.');
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
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value as number;
}
