import { isMarkdownParentNode, parseNormalizedMarkdown, type MarkdownNode } from '@neko/markdown';
import type {
  CreativeEntityKind,
  SemanticCreativeSchemaRef,
  SemanticSourceDescriptor,
  SemanticTextSegment,
  SemanticTextSegmentKind,
} from '@neko/shared';
import { isMap, isNode, isScalar, isSeq, parseDocument, type Node } from 'yaml';

export const DEFAULT_SEMANTIC_TEXT_MAX_BYTES = 1_000_000;

export type SemanticTextExtractionErrorCode =
  | 'semantic-text-aborted'
  | 'semantic-text-oversized'
  | 'semantic-text-invalid-utf8'
  | 'semantic-text-invalid-json'
  | 'semantic-text-invalid-yaml'
  | 'semantic-text-unregistered-schema'
  | 'semantic-text-unsupported-format';

export class SemanticTextExtractionError extends Error {
  constructor(
    readonly code: SemanticTextExtractionErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SemanticTextExtractionError';
  }
}

export interface ExtractSemanticTextInput {
  readonly source: SemanticSourceDescriptor;
  readonly content: string | Uint8Array;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
  readonly creativeSchemaAdapters?: readonly SemanticCreativeSchemaAdapter[];
}

export interface SemanticCreativeSchemaField {
  readonly explicitEntityKind?: CreativeEntityKind;
  readonly explicitEntityName?: string;
}

export interface SemanticCreativeSchemaAdapter {
  readonly schema: SemanticCreativeSchemaRef;
  readonly formats: readonly ('json' | 'yaml')[];
  selectField(input: {
    readonly path: readonly (string | number)[];
    readonly value: string;
  }): SemanticCreativeSchemaField | false;
}

export function extractSemanticText(
  input: ExtractSemanticTextInput,
): readonly SemanticTextSegment[] {
  assertNotAborted(input.signal);
  const maxBytes = input.maxBytes ?? DEFAULT_SEMANTIC_TEXT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError(`Semantic text maxBytes must be a positive safe integer: ${maxBytes}`);
  }
  const text = decodeContent(input.content, maxBytes);
  assertNotAborted(input.signal);
  switch (input.source.format) {
    case 'plain':
      return extractPlainSegments(input.source.sourceId, text);
    case 'markdown':
      return extractMarkdownSegments(input.source.sourceId, text);
    case 'fountain':
      return extractFountainSegments(input.source.sourceId, text);
    case 'json': {
      const adapter = requireCreativeSchemaAdapter(input, 'json');
      return extractJsonSegments(input.source.sourceId, text, adapter);
    }
    case 'yaml': {
      const adapter = requireCreativeSchemaAdapter(input, 'yaml');
      return extractYamlSegments(input.source.sourceId, text, adapter);
    }
    default:
      throw new SemanticTextExtractionError(
        'semantic-text-unsupported-format',
        `Unsupported semantic text format: ${String(input.source.format)}`,
      );
  }
}

function decodeContent(content: string | Uint8Array, maxBytes: number): string {
  const sizeBytes =
    typeof content === 'string' ? new TextEncoder().encode(content).byteLength : content.byteLength;
  if (sizeBytes > maxBytes) {
    throw new SemanticTextExtractionError(
      'semantic-text-oversized',
      `Semantic text source exceeds ${maxBytes} bytes: ${sizeBytes}`,
    );
  }
  if (typeof content === 'string') return content;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch (error) {
    throw new SemanticTextExtractionError(
      'semantic-text-invalid-utf8',
      'Semantic text source is not valid UTF-8.',
      error,
    );
  }
}

function extractPlainSegments(sourceId: string, text: string): readonly SemanticTextSegment[] {
  const segments: SemanticTextSegment[] = [];
  const lines = lineSpans(text);
  let paragraphStart: number | undefined;
  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index];
    if (line && line.text.trim().length > 0) {
      paragraphStart ??= index;
      continue;
    }
    if (paragraphStart === undefined) continue;
    const first = lines[paragraphStart];
    const last = lines[index - 1];
    if (first && last) {
      segments.push(
        makeSegment(sourceId, segments.length, 'plain', text.slice(first.start, last.end), text, {
          start: first.start,
          end: last.end,
        }),
      );
    }
    paragraphStart = undefined;
  }
  return segments;
}

function extractMarkdownSegments(sourceId: string, text: string): readonly SemanticTextSegment[] {
  const parsed = parseNormalizedMarkdown(text, {
    policy: { maxSourceCodeUnits: Math.max(1, text.length) },
  });
  if (parsed.status === 'failed') {
    throw new SemanticTextExtractionError(
      'semantic-text-unsupported-format',
      `Markdown normalization failed: ${parsed.diagnostics.map((item) => item.code).join(', ')}`,
    );
  }
  const segments: SemanticTextSegment[] = [];
  collectMarkdownSegments(parsed.document.root, false, false, sourceId, text, segments);
  return segments;
}

function collectMarkdownSegments(
  node: MarkdownNode,
  insideListItem: boolean,
  insideTableCell: boolean,
  sourceId: string,
  source: string,
  segments: SemanticTextSegment[],
): void {
  const kind = markdownSegmentKind(node, insideListItem, insideTableCell);
  if (kind) {
    const text = markdownVisibleText(node).trim();
    if (text) {
      segments.push(
        makeSegment(sourceId, segments.length, kind, text, source, {
          start: node.range.startOffset,
          end: node.range.endOffset,
        }),
      );
    }
  }
  if (!isMarkdownParentNode(node)) return;
  const nextInsideListItem = insideListItem || node.type === 'listItem';
  const nextInsideTableCell = insideTableCell || node.type === 'tableCell';
  for (const child of node.children) {
    collectMarkdownSegments(
      child,
      nextInsideListItem,
      nextInsideTableCell,
      sourceId,
      source,
      segments,
    );
  }
}

function markdownSegmentKind(
  node: MarkdownNode,
  insideListItem: boolean,
  insideTableCell: boolean,
): SemanticTextSegmentKind | undefined {
  if (node.type === 'heading') return 'heading';
  if (node.type === 'listItem') return 'list-item';
  if (node.type === 'tableCell') return 'table-cell';
  if (node.type === 'paragraph' && !insideListItem && !insideTableCell) return 'paragraph';
  return undefined;
}

function markdownVisibleText(node: MarkdownNode): string {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'codeBlock') {
    return node.value;
  }
  if (node.type === 'nekoMention') return node.label;
  if (node.type === 'image' || node.type === 'imageReference') return node.altText;
  if (node.type === 'softBreak' || node.type === 'hardBreak') return '\n';
  if (node.type === 'html' || node.type === 'definition' || node.type === 'thematicBreak')
    return '';
  if (!isMarkdownParentNode(node)) return '';
  return node.children.map(markdownVisibleText).join('');
}

function extractFountainSegments(sourceId: string, text: string): readonly SemanticTextSegment[] {
  const segments: SemanticTextSegment[] = [];
  const lines = lineSpans(text);
  let dialogueOwner: string | undefined;
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed) {
      dialogueOwner = undefined;
      continue;
    }
    if (isFountainSceneHeading(trimmed)) {
      dialogueOwner = undefined;
      segments.push(
        makeSegment(sourceId, segments.length, 'fountain-scene', trimmed, text, line, {
          explicitEntityKind: 'scene',
          explicitEntityName: cleanFountainSceneName(trimmed),
        }),
      );
      continue;
    }
    const characterName = fountainCharacterName(trimmed);
    if (characterName) {
      dialogueOwner = characterName;
      segments.push(
        makeSegment(sourceId, segments.length, 'fountain-character', characterName, text, line, {
          explicitEntityKind: 'character',
          explicitEntityName: characterName,
        }),
      );
      continue;
    }
    segments.push(
      makeSegment(
        sourceId,
        segments.length,
        dialogueOwner ? 'fountain-dialogue' : 'fountain-action',
        trimmed,
        text,
        line,
        dialogueOwner ? { metadata: { dialogueOwner } } : undefined,
      ),
    );
  }
  return segments;
}

function extractJsonSegments(
  sourceId: string,
  text: string,
  adapter: SemanticCreativeSchemaAdapter,
): readonly SemanticTextSegment[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SemanticTextExtractionError(
      'semantic-text-invalid-json',
      'Semantic JSON source is invalid.',
      error,
    );
  }
  const segments: SemanticTextSegment[] = [];
  let searchOffset = 0;
  visitStructuredValue(value, [], (stringValue, path) => {
    const field = adapter.selectField({ path, value: stringValue });
    if (!field) return;
    const literal = JSON.stringify(stringValue);
    const found = text.indexOf(literal, searchOffset);
    const start = found >= 0 ? found + 1 : Math.max(0, searchOffset);
    const end = found >= 0 ? found + literal.length - 1 : start + stringValue.length;
    searchOffset = Math.max(searchOffset, end);
    segments.push(
      structuredSegment(sourceId, segments.length, stringValue, text, start, end, path, field),
    );
  });
  return segments;
}

function extractYamlSegments(
  sourceId: string,
  text: string,
  adapter: SemanticCreativeSchemaAdapter,
): readonly SemanticTextSegment[] {
  const document = parseDocument(text, { strict: true });
  if (document.errors.length > 0) {
    throw new SemanticTextExtractionError(
      'semantic-text-invalid-yaml',
      `Semantic YAML source is invalid: ${document.errors.map((item) => item.message).join('; ')}`,
    );
  }
  const segments: SemanticTextSegment[] = [];
  if (document.contents) {
    visitYamlNode(document.contents, [], (value, path, start, end) => {
      const field = adapter.selectField({ path, value });
      if (field) {
        segments.push(
          structuredSegment(sourceId, segments.length, value, text, start, end, path, field),
        );
      }
    });
  }
  return segments;
}

function visitYamlNode(
  node: Node,
  path: readonly (string | number)[],
  visitString: (
    value: string,
    path: readonly (string | number)[],
    start: number,
    end: number,
  ) => void,
): void {
  if (isScalar(node)) {
    if (typeof node.value === 'string' && node.range) {
      visitString(node.value, path, node.range[0], node.range[1]);
    }
    return;
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      if (!pair.value || !isNode(pair.value)) continue;
      const key = isScalar(pair.key) ? String(pair.key.value) : String(path.length);
      visitYamlNode(pair.value, [...path, key], visitString);
    }
    return;
  }
  if (isSeq(node)) {
    node.items.forEach((item, index) => {
      if (isNode(item)) visitYamlNode(item, [...path, index], visitString);
    });
  }
}

function visitStructuredValue(
  value: unknown,
  path: readonly (string | number)[],
  visitString: (value: string, path: readonly (string | number)[]) => void,
): void {
  if (typeof value === 'string') {
    visitString(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStructuredValue(item, [...path, index], visitString));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    visitStructuredValue(item, [...path, key], visitString);
  }
}

function structuredSegment(
  sourceId: string,
  ordinal: number,
  value: string,
  source: string,
  start: number,
  end: number,
  path: readonly (string | number)[],
  field: SemanticCreativeSchemaField,
): SemanticTextSegment {
  return makeSegment(
    sourceId,
    ordinal,
    'structured-string',
    value,
    source,
    { start, end },
    {
      ...(field.explicitEntityKind ? { explicitEntityKind: field.explicitEntityKind } : {}),
      ...(field.explicitEntityName ? { explicitEntityName: field.explicitEntityName } : {}),
      structuredPath: path,
    },
  );
}

function makeSegment(
  sourceId: string,
  ordinal: number,
  kind: SemanticTextSegmentKind,
  value: string,
  source: string,
  offsets: { readonly start: number; readonly end: number },
  options?: {
    readonly explicitEntityKind?: CreativeEntityKind;
    readonly explicitEntityName?: string;
    readonly structuredPath?: readonly (string | number)[];
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  },
): SemanticTextSegment {
  const start = positionAt(source, offsets.start);
  const end = positionAt(source, offsets.end);
  return {
    segmentId: `${sourceId}:segment:${ordinal}`,
    unitId: `${sourceId}:text`,
    kind,
    text: value,
    locator: {
      kind: 'text-range',
      startChar: offsets.start,
      endChar: offsets.end,
      startLine: start.line,
      endLine: end.line,
    },
    contentHash: hashSemanticText(value),
    range: {
      startOffset: offsets.start,
      endOffset: offsets.end,
      startLine: start.line,
      endLine: end.line,
      startColumn: start.column,
      endColumn: end.column,
      ...(options?.structuredPath ? { structuredPath: options.structuredPath } : {}),
    },
    ...(options?.explicitEntityKind ? { explicitEntityKind: options.explicitEntityKind } : {}),
    ...(options?.explicitEntityName ? { explicitEntityName: options.explicitEntityName } : {}),
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  };
}

function requireCreativeSchemaAdapter(
  input: ExtractSemanticTextInput,
  format: 'json' | 'yaml',
): SemanticCreativeSchemaAdapter {
  const schema = input.source.creativeSchema;
  const adapter = input.creativeSchemaAdapters?.find(
    (candidate) =>
      candidate.schema.schemaId === schema?.schemaId &&
      candidate.schema.schemaVersion === schema.schemaVersion &&
      candidate.formats.includes(format),
  );
  if (!schema || !adapter) {
    throw new SemanticTextExtractionError(
      'semantic-text-unregistered-schema',
      `Semantic ${format.toUpperCase()} requires a registered creative schema adapter.`,
    );
  }
  return adapter;
}

function hashSemanticText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function lineSpans(text: string): readonly LineSpan[] {
  const lines: LineSpan[] = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== '\n') continue;
    const rawEnd = index > start && text[index - 1] === '\r' ? index - 1 : index;
    lines.push({ text: text.slice(start, rawEnd), start, end: rawEnd });
    start = index + 1;
  }
  return lines;
}

interface LineSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function positionAt(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const bounded = Math.max(0, Math.min(source.length, offset));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < bounded; index += 1) {
    if (source[index] !== '\n') continue;
    line += 1;
    lineStart = index + 1;
  }
  return { line, column: bounded - lineStart + 1 };
}

function isFountainSceneHeading(value: string): boolean {
  const normalized = value.startsWith('.') ? value.slice(1) : value;
  return /^(?:INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)\s/u.test(normalized.toUpperCase());
}

function cleanFountainSceneName(value: string): string {
  return value
    .replace(/^\.?\s*(?:INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)\s*/iu, '')
    .replace(/\s+-\s+.+$/u, '')
    .trim();
}

function fountainCharacterName(value: string): string | undefined {
  const forced = value.startsWith('@') ? value.slice(1).trim() : undefined;
  const candidate = forced ?? value;
  if (!candidate || candidate.length > 80 || /[.!?。！？]$/u.test(candidate)) return undefined;
  if (!forced && !/^[A-Z0-9 _.'()-]+$/u.test(candidate)) return undefined;
  return candidate.replace(/\s*\([^)]*\)\s*$/u, '').trim() || undefined;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new SemanticTextExtractionError(
      'semantic-text-aborted',
      'Semantic text extraction aborted.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
