import type {
  DocumentArchiveResourceRef,
  DocumentBatchCursor,
  DocumentFormat,
  DocumentLocator,
  DocumentManifest,
  DocumentReadResult,
  DocumentSourceRef,
  SemanticSourceDescriptor,
} from '@neko/shared';
import { describe, expect, it } from 'vitest';
import type { IDocumentAccessService } from './document';
import { extractSemanticDocument, SemanticDocumentExtractionError } from './semantic-document';
import {
  readSemanticOccurrenceContext,
  SemanticOccurrenceContextError,
} from './semantic-occurrence-context';

describe('semantic document extraction', () => {
  it.each([
    ['pdf', { kind: 'page', pageNumber: 1, pageIndex: 0 }],
    ['epub', { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 }],
    ['docx', { kind: 'text-range', startChar: 0, endChar: 12, paragraphIndex: 0 }],
  ] as const)('preserves stable %s unit locators', async (format, locator) => {
    const access = fakeDocumentAccess(format, [{ locator, text: 'Rin meets Nova.' }]);
    const result = await extractSemanticDocument({
      source: source(format),
      runtimePath: `/workspace/story.${format}`,
      documentAccess: access,
    });
    expect(result.segments).toEqual([
      expect.objectContaining({
        locator,
        unitId: expect.stringContaining(':unit:'),
        contentHash: expect.stringMatching(/^fnv1a32:/u),
      }),
    ]);
    expect(JSON.stringify(result.segments)).toContain('Rin meets Nova.');
  });

  it('returns OCR-required for a scanned PDF instead of invoking media analysis', async () => {
    await expect(
      extractSemanticDocument({
        source: source('pdf'),
        runtimePath: '/workspace/scanned.pdf',
        documentAccess: fakeDocumentAccess('pdf', [
          { locator: { kind: 'page', pageNumber: 1, pageIndex: 0 }, text: '' },
        ]),
      }),
    ).rejects.toMatchObject({ code: 'semantic-document-ocr-required' });
  });

  it('fails visibly for DRM, truncation, total budgets, and cancellation', async () => {
    await expect(
      extractSemanticDocument({
        source: source('epub'),
        runtimePath: '/workspace/drm.epub',
        documentAccess: fakeDocumentAccess('epub', [], { drm: true }),
      }),
    ).rejects.toMatchObject({ code: 'semantic-document-drm' });

    await expect(
      extractSemanticDocument({
        source: source('pdf'),
        runtimePath: '/workspace/large.pdf',
        documentAccess: fakeDocumentAccess('pdf', [
          {
            locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
            text: '0123456789',
            truncated: true,
          },
        ]),
        budgets: { maxUnitChars: 5 },
      }),
    ).rejects.toMatchObject({ code: 'semantic-document-budget-exceeded' });

    const controller = new AbortController();
    controller.abort();
    await expect(
      extractSemanticDocument({
        source: source('docx'),
        runtimePath: '/workspace/story.docx',
        documentAccess: fakeDocumentAccess('docx', []),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(SemanticDocumentExtractionError);
  });

  it('returns embedded media only as resource references', async () => {
    const resourceRef: DocumentArchiveResourceRef = {
      kind: 'document-entry',
      source: { filePath: '/workspace/book.epub', format: 'epub' },
      entryPath: 'images/portrait.png',
      locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
    };
    const result = await extractSemanticDocument({
      source: source('epub'),
      runtimePath: '/workspace/book.epub',
      documentAccess: fakeDocumentAccess('epub', [
        {
          locator: { kind: 'chapter', chapterHref: 'chapter-1', spineIndex: 0 },
          text: 'Rin enters.',
          resourceRef,
        },
      ]),
    });
    expect(result.resourceRefs).toEqual([resourceRef]);
    expect(JSON.stringify(result.segments)).not.toContain('portrait.png');
  });
});

describe('semantic occurrence context', () => {
  it('reads session-only context through the stored locator after fingerprint checks', async () => {
    const locator = { kind: 'page' as const, pageNumber: 1, pageIndex: 0 };
    const result = await readSemanticOccurrenceContext({
      record: occurrenceRecord(locator),
      source: { filePath: '/workspace/story.pdf', format: 'pdf' },
      documentAccess: fakeDocumentAccess('pdf', [{ locator, text: 'Rin meets Nova.' }]),
      readFingerprint: async () => 'sha256:pdf',
    });
    expect(result.text).toBe('Rin meets Nova.');
  });

  it('rejects stale context instead of returning mismatched text', async () => {
    const locator = { kind: 'page' as const, pageNumber: 1, pageIndex: 0 };
    await expect(
      readSemanticOccurrenceContext({
        record: occurrenceRecord(locator),
        source: { filePath: '/workspace/story.pdf', format: 'pdf' },
        documentAccess: fakeDocumentAccess('pdf', [{ locator, text: 'Changed.' }]),
        readFingerprint: async () => 'sha256:changed',
      }),
    ).rejects.toBeInstanceOf(SemanticOccurrenceContextError);
  });
});

interface FakeUnit {
  readonly locator: DocumentLocator;
  readonly text: string;
  readonly truncated?: boolean;
  readonly resourceRef?: DocumentArchiveResourceRef;
}

function fakeDocumentAccess(
  format: Extract<DocumentFormat, 'pdf' | 'epub' | 'docx'>,
  units: readonly FakeUnit[],
  options: { readonly drm?: boolean } = {},
): IDocumentAccessService {
  const manifestFor = (sourceRef: DocumentSourceRef): DocumentManifest => ({
    source: sourceRef,
    format,
    units: units.map((unit) => ({
      kind:
        unit.locator.kind === 'page'
          ? 'page'
          : unit.locator.kind === 'chapter'
            ? 'chapter'
            : 'section',
      locator: unit.locator,
    })),
    capabilities: {
      supportsManifest: true,
      supportsRangeRead: true,
      supportsCursorRead: true,
    },
  });
  return {
    supports: () => true,
    hasDRM: async () => options.drm ?? false,
    readContent: async () => ({ text: units.map((unit) => unit.text).join('\n\n') }),
    getManifest: async (sourceInput) => manifestFor(resolveSource(sourceInput, format)),
    createBatchCursor: async (sourceInput, cursorOptions = {}) => ({
      source: resolveSource(sourceInput, format),
      strategy: 'manifest-order',
      next: units[0]?.locator,
      batchIndex: 0,
      done: units.length === 0,
      maxChars: cursorOptions.maxChars,
    }),
    readRange: async (sourceInput, range) => {
      const unit = units.find((candidate) => sameLocator(candidate.locator, range.locator));
      if (!unit) throw new Error(`Unknown fake document locator: ${JSON.stringify(range.locator)}`);
      return readResult(resolveSource(sourceInput, format), range.locator, unit, undefined);
    },
    readNext: async (cursor) => {
      const unitIndex = cursor.batchIndex;
      const unit = units[unitIndex];
      if (!unit) {
        return { source: cursor.source, cursor: { ...cursor, done: true }, text: '' };
      }
      const next = units[unitIndex + 1];
      return readResult(cursor.source, unit.locator, unit, {
        ...cursor,
        next: next?.locator,
        batchIndex: unitIndex + 1,
        done: next === undefined,
      });
    },
  };
}

function readResult(
  sourceRef: DocumentSourceRef,
  locator: DocumentLocator,
  unit: FakeUnit,
  cursor: DocumentBatchCursor | undefined,
): DocumentReadResult {
  return {
    source: sourceRef,
    locator,
    range: { locator },
    text: unit.text,
    excerpt: { contentKind: 'text', text: unit.text, truncated: unit.truncated },
    returnedTextChars: unit.text.length,
    totalTextChars: unit.text.length,
    truncated: unit.truncated ?? false,
    ...(unit.resourceRef
      ? {
          imageInfo: [
            {
              path: unit.resourceRef.entryPath,
              resourceRef: unit.resourceRef,
            },
          ],
        }
      : {}),
    ...(cursor ? { cursor } : {}),
  };
}

function source(format: 'pdf' | 'epub' | 'docx'): SemanticSourceDescriptor {
  return {
    sourceId: `workspace:story.${format}`,
    workspaceId: 'workspace-1',
    rootId: 'workspace',
    rootKind: 'workspace',
    relativePath: `story.${format}`,
    portablePath: `${'${WORKSPACE}'}/story.${format}`,
    format,
    analysisMode: 'link-existing',
    fingerprint: `sha256:${format}`,
    sizeBytes: 20_000_000,
    modifiedAtMs: 1,
  };
}

function resolveSource(
  input: DocumentSourceRef | string,
  format: DocumentFormat,
): DocumentSourceRef {
  return typeof input === 'string' ? { filePath: input, format } : input;
}

function sameLocator(left: DocumentLocator, right: DocumentLocator): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function occurrenceRecord(locator: DocumentLocator) {
  return {
    occurrenceId: 'occurrence-1',
    sourceId: 'workspace:story.pdf',
    sourceFingerprint: 'sha256:pdf',
    freshness: 'fresh' as const,
    occurrence: {
      occurrenceId: 'occurrence-1',
      mentionId: 'mention-1',
      entityRef: { entityId: 'char_rin', entityKind: 'character' as const },
      label: 'Rin',
      source: {
        sourceId: 'workspace:story.pdf',
        sourceKind: 'document' as const,
        sourceRef: '${WORKSPACE}/story.pdf',
        providerId: 'neko.text-entity.deterministic',
        freshness: 'fresh' as const,
        updatedAt: '2026-07-18T00:00:00.000Z',
      },
      role: 'reference' as const,
      location: '${WORKSPACE}/story.pdf:1',
      locator,
      sourceFingerprint: 'sha256:pdf',
    },
  };
}
