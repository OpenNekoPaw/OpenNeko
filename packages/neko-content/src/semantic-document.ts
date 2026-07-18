import type {
  DocumentArchiveResourceRef,
  DocumentLocator,
  DocumentSourceRef,
  SemanticSourceDescriptor,
  SemanticTextSegment,
} from '@neko/shared';
import type { IDocumentAccessService } from './document';
import { extractSemanticText } from './semantic-text';

export const DEFAULT_SEMANTIC_DOCUMENT_MAX_UNITS = 500;
export const DEFAULT_SEMANTIC_DOCUMENT_MAX_UNIT_CHARS = 20_000;
export const DEFAULT_SEMANTIC_DOCUMENT_MAX_TOTAL_CHARS = 500_000;
export const DEFAULT_SEMANTIC_DOCUMENT_MAX_ELAPSED_MS = 30_000;

export type SemanticDocumentExtractionErrorCode =
  | 'semantic-document-aborted'
  | 'semantic-document-budget-exceeded'
  | 'semantic-document-drm'
  | 'semantic-document-ocr-required'
  | 'semantic-document-unsupported-format'
  | 'semantic-document-invalid-cursor';

export class SemanticDocumentExtractionError extends Error {
  constructor(
    readonly code: SemanticDocumentExtractionErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SemanticDocumentExtractionError';
  }
}

export interface SemanticDocumentExtractionBudgets {
  readonly maxUnits?: number;
  readonly maxUnitChars?: number;
  readonly maxTotalChars?: number;
  readonly maxElapsedMs?: number;
}

export interface ExtractSemanticDocumentInput {
  readonly source: SemanticSourceDescriptor;
  readonly runtimePath: string;
  readonly documentAccess: IDocumentAccessService;
  readonly budgets?: SemanticDocumentExtractionBudgets;
  readonly signal?: AbortSignal;
  readonly nowMs?: () => number;
}

export interface SemanticDocumentExtractionResult {
  readonly segments: readonly SemanticTextSegment[];
  readonly resourceRefs: readonly DocumentArchiveResourceRef[];
  readonly unitCount: number;
  readonly totalTextChars: number;
}

export async function extractSemanticDocument(
  input: ExtractSemanticDocumentInput,
): Promise<SemanticDocumentExtractionResult> {
  assertSupportedDocumentSource(input.source);
  assertNotAborted(input.signal);
  if (await input.documentAccess.hasDRM(input.runtimePath)) {
    throw new SemanticDocumentExtractionError(
      'semantic-document-drm',
      `Semantic document is DRM-protected: ${input.source.relativePath}`,
    );
  }

  const maxUnits = positiveBudget(
    input.budgets?.maxUnits ?? DEFAULT_SEMANTIC_DOCUMENT_MAX_UNITS,
    'maxUnits',
  );
  const maxUnitChars = positiveBudget(
    input.budgets?.maxUnitChars ?? DEFAULT_SEMANTIC_DOCUMENT_MAX_UNIT_CHARS,
    'maxUnitChars',
  );
  const maxTotalChars = positiveBudget(
    input.budgets?.maxTotalChars ?? DEFAULT_SEMANTIC_DOCUMENT_MAX_TOTAL_CHARS,
    'maxTotalChars',
  );
  const maxElapsedMs = positiveBudget(
    input.budgets?.maxElapsedMs ?? DEFAULT_SEMANTIC_DOCUMENT_MAX_ELAPSED_MS,
    'maxElapsedMs',
  );
  const nowMs = input.nowMs ?? Date.now;
  const startedAt = nowMs();
  const documentSource: DocumentSourceRef = {
    filePath: input.runtimePath,
    format: input.source.format,
    fileId: input.source.sourceId,
    identity: {
      fileId: input.source.sourceId,
      sizeBytes: input.source.sizeBytes,
      mtimeMs: input.source.modifiedAtMs,
      hash: input.source.fingerprint,
    },
  };
  const manifest = await input.documentAccess.getManifest(documentSource);
  if (manifest.units.length > maxUnits) {
    throw budgetExceeded(input.source, `unit count ${manifest.units.length} exceeds ${maxUnits}`);
  }

  let cursor = await input.documentAccess.createBatchCursor(documentSource, {
    maxChars: maxUnitChars,
  });
  const segments: SemanticTextSegment[] = [];
  const resourceRefs = new Map<string, DocumentArchiveResourceRef>();
  let unitCount = 0;
  let totalTextChars = 0;

  while (!cursor.done) {
    assertNotAborted(input.signal);
    if (nowMs() - startedAt > maxElapsedMs) {
      throw budgetExceeded(input.source, `elapsed time exceeds ${maxElapsedMs}ms`);
    }
    if (unitCount >= maxUnits) {
      throw budgetExceeded(input.source, `unit count exceeds ${maxUnits}`);
    }
    const result = await input.documentAccess.readNext(cursor);
    const nextCursor = result.cursor;
    const locator = result.locator;
    if (!nextCursor || !locator) {
      throw new SemanticDocumentExtractionError(
        'semantic-document-invalid-cursor',
        `Document reader did not return a cursor and locator: ${input.source.relativePath}`,
      );
    }
    if (result.truncated) {
      throw budgetExceeded(input.source, `one unit exceeds ${maxUnitChars} characters`);
    }
    unitCount += 1;
    const unitText = result.excerpt?.contentKind === 'image' ? '' : (result.text ?? '');
    totalTextChars += unitText.length;
    if (totalTextChars > maxTotalChars) {
      throw budgetExceeded(input.source, `text exceeds ${maxTotalChars} characters`);
    }
    collectResourceRefs(result.imageInfo, resourceRefs);
    if (unitText.trim()) {
      const unitId = documentUnitId(input.source.sourceId, locator);
      const unitSegments = extractSemanticText({
        source: { ...input.source, format: 'plain', creativeSchema: undefined },
        content: unitText,
        maxBytes: Math.max(1, new TextEncoder().encode(unitText).byteLength),
        signal: input.signal,
      });
      segments.push(
        ...unitSegments.map((segment, index) => ({
          ...segment,
          segmentId: `${unitId}:segment:${index}`,
          unitId,
          locator,
        })),
      );
    }
    cursor = nextCursor;
  }

  if (input.source.format === 'pdf' && segments.length === 0) {
    throw new SemanticDocumentExtractionError(
      'semantic-document-ocr-required',
      `PDF has no usable text layer: ${input.source.relativePath}`,
    );
  }

  return {
    segments,
    resourceRefs: [...resourceRefs.values()],
    unitCount,
    totalTextChars,
  };
}

function assertSupportedDocumentSource(source: SemanticSourceDescriptor): void {
  if (source.format !== 'pdf' && source.format !== 'epub' && source.format !== 'docx') {
    throw new SemanticDocumentExtractionError(
      'semantic-document-unsupported-format',
      `Unsupported semantic document format: ${source.format}`,
    );
  }
}

function collectResourceRefs(
  imageInfo: Awaited<ReturnType<IDocumentAccessService['readNext']>>['imageInfo'],
  refs: Map<string, DocumentArchiveResourceRef>,
): void {
  for (const image of imageInfo ?? []) {
    const resourceRef = image.resourceRef;
    if (!resourceRef) continue;
    refs.set(JSON.stringify(resourceRef), resourceRef);
  }
}

function documentUnitId(sourceId: string, locator: DocumentLocator): string {
  return `${sourceId}:unit:${stableLocator(locator)}`;
}

function stableLocator(locator: DocumentLocator): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(locator)
        .filter(([, value]) => value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function positiveBudget(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Semantic document ${name} must be a positive safe integer: ${value}`);
  }
  return value;
}

function budgetExceeded(source: SemanticSourceDescriptor, reason: string) {
  return new SemanticDocumentExtractionError(
    'semantic-document-budget-exceeded',
    `Semantic document analysis budget exceeded for ${source.relativePath}: ${reason}`,
  );
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new SemanticDocumentExtractionError(
      'semantic-document-aborted',
      'Semantic document extraction aborted.',
    );
  }
}
