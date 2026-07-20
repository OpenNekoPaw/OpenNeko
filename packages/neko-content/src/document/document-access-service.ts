import * as path from 'node:path';
import {
  createDocumentEntryResourceRef,
  type DocumentBatchCursor,
  type DocumentFormat,
  type DocumentImageInfo,
  type DocumentLocator,
  type DocumentManifest,
  type DocumentManifestCapabilities,
  type DocumentManifestUnit,
  type DocumentRange,
  type DocumentReadResult,
  type DocumentSourceRef,
} from '@neko/shared';
import { probeImageMetadata } from './image-metadata';
import {
  extractEpubImageEntryPaths,
  extractLocalImageReferences,
  type DocumentContent,
  type DocumentReaderRuntimeDeps,
  type IDocumentReader,
  isDocumentUrl,
  stripHtmlToText,
} from './document-reader';

export const DEFAULT_DOCUMENT_BATCH_MAX_CHARS = 20000;

export type DocumentAccessErrorCode =
  | 'unsupported-format'
  | 'unsupported-locator'
  | 'invalid-range'
  | 'stale-cursor'
  | 'engine-access-unavailable';

export class DocumentAccessError extends Error {
  constructor(
    readonly code: DocumentAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentAccessError';
  }
}

export interface DocumentLowLevelAccess {
  identify?(filePath: string): Promise<{ fileId?: string; sizeBytes?: number; mtimeMs?: number }>;
  readFile?(filePath: string): Promise<Uint8Array>;
  readRange?(filePath: string, start: number, end: number): Promise<Uint8Array>;
  readEntry?(filePath: string, entryPath: string): Promise<Uint8Array>;
}

export interface IDocumentAccessService {
  supports(filePath: string): boolean;
  hasDRM(filePath: string): Promise<boolean>;
  readContent(filePath: string): Promise<DocumentContent>;
  getManifest(source: DocumentSourceRef | string): Promise<DocumentManifest>;
  createBatchCursor(
    source: DocumentSourceRef | string,
    options?: { maxChars?: number },
  ): Promise<DocumentBatchCursor>;
  readRange(source: DocumentSourceRef | string, range: DocumentRange): Promise<DocumentReadResult>;
  readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult>;
}

export interface DocumentAccessServiceDeps {
  readonly reader: IDocumentReader;
  readonly runtime: DocumentReaderRuntimeDeps;
  readonly lowLevelAccess?: DocumentLowLevelAccess;
}

interface EpubChapterInfo {
  readonly id: string;
  readonly title?: string;
  readonly href?: string;
}

interface EpubManifestData {
  readonly source: DocumentSourceRef;
  readonly metadata?: Record<string, unknown>;
  readonly chapters: readonly EpubChapterInfo[];
}

interface ParsedEpubData extends EpubManifestData {
  readonly epub: EpubLike;
}

interface ComicRangeSelection<
  TEntry extends { readonly name: string } = { readonly name: string },
> {
  readonly startPageIndex: number;
  readonly entries: readonly TEntry[];
}

interface ExtractedImage {
  readonly entryName?: string;
  readonly info?: DocumentImageInfo;
}

interface PdfParserWithPartial {
  getText(params?: { partial?: number[] }): Promise<{ text?: string; total?: number }>;
  getInfo(): Promise<{ total?: number; info?: Record<string, unknown> }>;
  destroy(): Promise<void>;
}

interface PdfParserConstructorWithPartial {
  new (options: { data: Uint8Array }): PdfParserWithPartial;
}

interface ZipEntryLike {
  readonly name: string;
  getData(): Uint8Array;
}

interface AdmZipLike {
  getEntries(): ZipEntryLike[];
  getEntry(name: string): ZipEntryLike | null;
}

interface AdmZipConstructorLike {
  new (filePath: string): AdmZipLike;
}

interface UnrarFileHeaderLike {
  readonly name: string;
}

interface UnrarExtractedFileLike {
  readonly fileHeader: UnrarFileHeaderLike;
  readonly extract: readonly [unknown, Uint8Array];
}

interface UnrarExtractorLike {
  getFileList(): { fileHeaders: UnrarFileHeaderLike[] };
  extract(): { files: UnrarExtractedFileLike[] };
}

interface UnrarModuleLike {
  createExtractorFromData(options: { data: Uint8Array }): UnrarExtractorLike;
}

interface EpubChapterLike {
  readonly id: string;
  readonly title?: string;
  readonly href?: string;
}

interface EpubLike {
  readonly flow: readonly EpubChapterLike[];
  readonly metadata: {
    readonly title?: string;
    readonly creator?: string;
    readonly publisher?: string;
    readonly language?: string;
  };
  on(event: 'end', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  getChapter(id: string, callback: (error: Error | null, content: string) => void): void;
  parse(): void;
}

interface EpubConstructorLike {
  new (filePath: string): EpubLike;
}

const COMIC_IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

export class DocumentAccessService implements IDocumentAccessService {
  constructor(private readonly deps: DocumentAccessServiceDeps) {}

  supports(filePath: string): boolean {
    return this.deps.reader.supports(filePath);
  }

  hasDRM(filePath: string): Promise<boolean> {
    return this.deps.reader.hasDRM(filePath);
  }

  readContent(filePath: string): Promise<DocumentContent> {
    return this.deps.reader.read(filePath);
  }

  async getManifest(sourceInput: DocumentSourceRef | string): Promise<DocumentManifest> {
    const source = await this.resolveSource(sourceInput);
    const format = source.format;

    switch (format) {
      case 'pdf':
        return this.getPdfManifest(source);
      case 'epub':
        return this.getEpubManifest(source);
      case 'cbz':
        return this.getCbzManifest(source);
      case 'cbr':
        return this.getCbrManifest(source);
      case 'text':
      case 'fountain':
      case 'json':
      case 'yaml':
      case 'html':
        return this.getTextManifest(source);
      case 'markdown':
        return this.getTextManifest(source);
      case 'docx':
      case 'doc':
      case 'pptx':
      case 'ppt':
      case 'xlsx':
      case 'xls':
      case 'fdx':
      case 'url':
        return this.getContentBackedManifest(source);
      default:
        throw new DocumentAccessError(
          'unsupported-format',
          `Unsupported document format for manifest: ${format}`,
        );
    }
  }

  async createBatchCursor(
    sourceInput: DocumentSourceRef | string,
    options: { maxChars?: number } = {},
  ): Promise<DocumentBatchCursor> {
    const manifest = await this.getManifest(sourceInput);
    return createManifestBatchCursor(manifest, options);
  }

  async readRange(
    sourceInput: DocumentSourceRef | string,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    const source = await this.resolveSource(sourceInput);

    switch (source.format) {
      case 'pdf':
        return this.readPdfRange(source, range);
      case 'epub':
        return this.readEpubRange(source, range);
      case 'cbz':
        return this.readCbzRange(source, range);
      case 'cbr':
        return this.readCbrRange(source, range);
      case 'text':
      case 'fountain':
      case 'json':
      case 'yaml':
      case 'html':
        return this.readTextRange(source, range);
      case 'markdown':
        return this.readTextRange(source, range);
      case 'docx':
      case 'doc':
      case 'pptx':
      case 'ppt':
      case 'xlsx':
      case 'xls':
      case 'fdx':
      case 'url':
        return this.readContentBackedRange(source, range);
      default:
        throw new DocumentAccessError(
          'unsupported-format',
          `Unsupported document format for range read: ${source.format}`,
        );
    }
  }

  async readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult> {
    const source = await this.resolveSource(cursor.source);
    if (cursor.fileId && source.fileId && cursor.fileId !== source.fileId) {
      throw new DocumentAccessError('stale-cursor', 'Document cursor identity is stale');
    }

    if (cursor.done || !cursor.next) {
      return {
        source,
        text: '',
        returnedTextChars: 0,
        truncated: false,
        cursor: { ...cursor, source, done: true },
      };
    }

    const result = await this.readRange(source, {
      locator: cursor.next,
      limit: { maxChars: cursor.maxChars ?? DEFAULT_DOCUMENT_BATCH_MAX_CHARS },
    });
    const manifest = result.manifest ?? (await this.getManifest(source));
    const currentIndex = findManifestUnitIndex(manifest.units, cursor.next);
    const nextUnit = currentIndex >= 0 ? manifest.units[currentIndex + 1] : undefined;

    return {
      ...result,
      manifest,
      cursor: {
        source,
        strategy: cursor.strategy,
        next: nextUnit?.locator,
        batchIndex: cursor.batchIndex + 1,
        done: !nextUnit,
        fileId: source.fileId,
        maxChars: cursor.maxChars,
      },
    };
  }

  private async resolveSource(input: DocumentSourceRef | string): Promise<DocumentSourceRef> {
    if (typeof input !== 'string') {
      return this.withIdentity({
        ...input,
        format: input.format ?? detectDocumentFormat(input.filePath),
      });
    }

    return this.withIdentity({
      filePath: input,
      format: detectDocumentFormat(input),
    });
  }

  private async withIdentity(source: DocumentSourceRef): Promise<DocumentSourceRef> {
    const identified = await this.deps.lowLevelAccess
      ?.identify?.(source.filePath)
      .catch(() => null);
    const identity = identified ?? source.identity;
    const fileId =
      identity?.fileId ??
      source.fileId ??
      (identity?.sizeBytes !== undefined || identity?.mtimeMs !== undefined
        ? `${source.filePath}:${identity.sizeBytes ?? 'unknown'}:${identity.mtimeMs ?? 'unknown'}`
        : source.filePath);

    return {
      ...source,
      fileId,
      ...(identity
        ? {
            identity: {
              fileId,
              sizeBytes: identity.sizeBytes,
              mtimeMs: identity.mtimeMs,
            },
          }
        : {}),
    };
  }

  private async getPdfManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const pdfModule = await this.deps.runtime.loadModule<unknown>('pdf-parse');
    const PdfParser = resolvePdfParserConstructor(pdfModule);
    if (!PdfParser) {
      return this.getContentBackedManifest(source);
    }

    const parser = new PdfParser({ data: await this.deps.runtime.readBinaryFile(source.filePath) });
    try {
      const info = await parser.getInfo();
      const pageCount = info.total ?? 0;
      return {
        source,
        format: source.format,
        fileId: source.fileId,
        title: readStringMetadata(info.info, 'Title') ?? readStringMetadata(info.info, 'title'),
        pageCount,
        units: Array.from({ length: pageCount }, (_, index) => ({
          kind: 'page',
          locator: { kind: 'page', pageNumber: index + 1, pageIndex: index },
          title: `Page ${index + 1}`,
        })),
        capabilities: makeCapabilities({ page: pageCount > 0 }),
        metadata: info.info,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private makeEpubManifest(data: EpubManifestData): DocumentManifest {
    return {
      source: data.source,
      format: 'epub',
      fileId: data.source.fileId,
      title: readStringMetadata(data.metadata, 'title'),
      chapterCount: data.chapters.length,
      units: data.chapters.map((chapter, index) => ({
        kind: 'chapter',
        locator: {
          kind: 'chapter',
          chapterHref: createEpubChapterLocatorHref(chapter),
          spineIndex: index,
          title: chapter.title,
        },
        href: chapter.href ?? chapter.id,
        title: chapter.title,
      })),
      capabilities: makeCapabilities({ chapter: true }),
      metadata: data.metadata,
    };
  }

  private async getEpubManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const data = await this.readEpubManifestData(source);
    return this.makeEpubManifest(data);
  }

  private async getCbzManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const entries = await this.readCbzEntries(source.filePath);
    return this.makeComicManifest(source, entries, 'cbz');
  }

  private async getCbrManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const entries = await this.readCbrEntries(source.filePath);
    return this.makeComicManifest(source, entries, 'cbr');
  }

  private makeComicManifest(
    source: DocumentSourceRef,
    entries: readonly { readonly name: string }[],
    format: 'cbz' | 'cbr',
  ): DocumentManifest {
    return {
      source,
      format,
      fileId: source.fileId,
      pageCount: entries.length,
      entryCount: entries.length,
      units: entries.map((entry, index) => ({
        kind: 'entry',
        locator: {
          kind: 'page',
          pageNumber: index + 1,
          pageIndex: index,
          entryName: entry.name,
        },
        entryName: entry.name,
        title: path.basename(entry.name),
      })),
      capabilities: makeCapabilities({ entry: true, region: true }),
      metadata: { format, fileName: path.basename(source.filePath) },
    };
  }

  private async getTextManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const text = await this.readTextLikeSource(source);
    const lines = text.split(/\r?\n/);
    return {
      source,
      format: source.format,
      fileId: source.fileId,
      lineCount: lines.length,
      units: [
        {
          kind: 'text-range',
          locator: { kind: 'text-range', startLine: 1, endLine: lines.length },
          title: 'Full text',
          charCount: text.length,
          textPreview: text.slice(0, 200),
        },
      ],
      capabilities: makeCapabilities({ text: true }),
      metadata: { lineCount: lines.length },
    };
  }

  private async getContentBackedManifest(source: DocumentSourceRef): Promise<DocumentManifest> {
    const content = await this.deps.reader.read(source.filePath);
    if (source.format === 'docx' || source.format === 'doc') {
      const sections = splitTextSectionSpans(content.text);
      return {
        source,
        format: source.format,
        fileId: source.fileId,
        units: sections.map((section, index) => ({
          kind: 'section',
          locator: {
            kind: 'text-range',
            startChar: section.start,
            endChar: section.end,
            paragraphIndex: index,
          },
          title: `Paragraph ${index + 1}`,
          charCount: section.end - section.start,
        })),
        capabilities: makeCapabilities({ text: true, requiresFullExtraction: true }),
        metadata: content.metadata,
      };
    }
    const count = content.pageCount ?? 1;
    const unitKind = source.format === 'pptx' || source.format === 'ppt' ? 'slide' : 'section';
    const units = Array.from({ length: Math.max(count, 1) }, (_, index): DocumentManifestUnit => {
      const locator: DocumentLocator =
        unitKind === 'slide'
          ? { kind: 'slide', slideNumber: index + 1, slideIndex: index }
          : { kind: 'text-range', startChar: 0, endChar: content.text.length };
      return {
        kind: unitKind,
        locator,
        title: unitKind === 'slide' ? `Slide ${index + 1}` : 'Full content',
        charCount: unitKind === 'section' ? content.text.length : undefined,
      };
    });

    return {
      source,
      format: source.format,
      fileId: source.fileId,
      pageCount: content.pageCount,
      slideCount: unitKind === 'slide' ? count : undefined,
      units,
      capabilities: makeCapabilities({
        slide: unitKind === 'slide',
        text: unitKind !== 'slide',
        requiresFullExtraction: true,
      }),
      metadata: content.metadata,
    };
  }

  private async readPdfRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'page') {
      throw unsupportedLocator(range.locator, 'PDF range reads require a page locator');
    }

    const pdfModule = await this.deps.runtime.loadModule<unknown>('pdf-parse');
    const PdfParser = resolvePdfParserConstructor(pdfModule);
    if (!PdfParser) {
      return this.readContentBackedRange(source, range);
    }

    const parser = new PdfParser({ data: await this.deps.runtime.readBinaryFile(source.filePath) });
    try {
      const textResult = await parser.getText({ partial: [range.locator.pageNumber] });
      const info = await parser.getInfo().catch(() => undefined);
      const text = typeof textResult.text === 'string' ? textResult.text : '';
      return this.makeTextResult(source, range, text, range.limit?.maxChars, {
        pageCount: info?.total ?? textResult.total,
        metadata: info?.info,
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async readEpubRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'chapter') {
      throw unsupportedLocator(range.locator, 'EPUB range reads require a chapter locator');
    }

    const locator = range.locator;
    const data = await this.parseEpubData(source);
    const startIndex = findEpubChapterIndex(data.chapters, locator);
    const endIndex =
      range.endLocator?.kind === 'chapter'
        ? findEpubChapterIndex(data.chapters, range.endLocator)
        : startIndex;
    const chapter = startIndex >= 0 ? data.chapters[startIndex] : undefined;
    if (!chapter) {
      throw new DocumentAccessError(
        'invalid-range',
        `EPUB chapter not found: ${locator.chapterHref}`,
      );
    }
    if (endIndex < startIndex) {
      throw new DocumentAccessError(
        'invalid-range',
        `Invalid EPUB chapter range: ${locator.chapterHref}`,
      );
    }

    const chapters = data.chapters.slice(startIndex, endIndex + 1);
    const chapterContents = await Promise.all(
      chapters.map(async (item, offset) => ({
        chapter: item,
        spineIndex: startIndex + offset,
        html: await readEpubChapterHtml(data.epub, item.id),
      })),
    );
    const text = chapterContents.map((item) => stripHtmlToText(item.html)).join('\n\n');
    const imageRefs = dedupeEpubImageRefs(
      chapterContents.flatMap((item) =>
        extractEpubImageEntryPaths(item.html, item.chapter.href ?? item.chapter.title).map(
          (entryPath) => ({
            entryPath,
            locator: {
              kind: 'chapter' as const,
              chapterHref: createEpubChapterLocatorHref(item.chapter),
              spineIndex: item.spineIndex,
              ...(item.chapter.title ? { title: item.chapter.title } : {}),
            },
          }),
        ),
      ),
    ).slice(0, range.limit?.maxImages);
    const imageInfo = await Promise.all(
      imageRefs.map((image) => this.readZipEntryImageInfo(source, image.entryPath, image.locator)),
    );
    const readableText = text.trim().length > 0 ? text : '';
    const result = this.makeTextResult(source, range, readableText, range.limit?.maxChars, {
      metadata: data.metadata,
    });
    const contentKind = imageInfo.length > 0 ? (readableText ? 'mixed' : 'image') : 'text';
    const resultText = result.text ?? '';
    const rangeText =
      resultText.trim().length > 0
        ? resultText
        : imageInfo.length > 0
          ? `EPUB chapter range with ${imageInfo.length} image pages`
          : resultText;

    return {
      ...result,
      text: rangeText,
      imageInfo,
      excerpt: {
        ...result.excerpt,
        contentKind,
        text: rangeText,
        ...(imageInfo.length > 0 ? { imageInfo } : {}),
      },
      returnedTextChars: rangeText.length,
      totalTextChars: result.totalTextChars === 0 ? rangeText.length : result.totalTextChars,
      pageCount: data.chapters.length,
      manifest: this.makeEpubManifest(data),
    };
  }

  private async readCbzRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'page' && range.locator.kind !== 'region') {
      throw unsupportedLocator(range.locator, 'CBZ range reads require a page or region locator');
    }

    const entries = await this.readCbzEntries(source.filePath);
    const selection = selectComicRangeEntries(entries, range, 'CBZ');
    const images = await this.readZipEntryImages(source, selection);
    return this.makeComicRangeResult(
      source,
      range,
      selection,
      images,
      'CBZ',
      entries.length,
      this.makeComicManifest(source, entries, 'cbz'),
    );
  }

  private async readCbrRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'page' && range.locator.kind !== 'region') {
      throw unsupportedLocator(range.locator, 'CBR range reads require a page or region locator');
    }

    const entries = await this.readCbrEntries(source.filePath);
    const selection = selectComicRangeEntries(entries, range, 'CBR');
    return this.makeComicRangeResult(
      source,
      range,
      selection,
      [],
      'CBR',
      entries.length,
      this.makeComicManifest(source, entries, 'cbr'),
    );
  }

  private makeComicRangeResult(
    source: DocumentSourceRef,
    range: DocumentRange,
    selection: ComicRangeSelection,
    images: readonly ExtractedImage[],
    label: 'CBZ' | 'CBR',
    pageCount: number,
    manifest: DocumentManifest,
  ): DocumentReadResult {
    const entryNames = selection.entries.map((entry) => entry.name);
    const selectedIndexByEntryName = new Map(
      selection.entries.map((entry, index) => [entry.name, selection.startPageIndex + index]),
    );
    const imageInfo = images.flatMap((image, index) => {
      const pageIndex =
        selectedIndexByEntryName.get(image.entryName ?? '') ?? selection.startPageIndex + index;
      const entryName = image.entryName ?? selection.entries[index]?.name;
      const locator: DocumentLocator = {
        kind: 'page',
        pageNumber: pageIndex + 1,
        pageIndex,
        ...(entryName ? { entryName } : {}),
      };
      return image.info
        ? [
            {
              ...image.info,
              locator,
              ...(entryName && !image.info.entryPath ? { entryPath: entryName } : {}),
              resourceRef:
                image.info.resourceRef ??
                createDocumentEntryResourceRef({
                  source,
                  locator,
                  entryPath: entryName,
                }),
            },
          ]
        : [];
    });
    const text =
      selection.entries.length === 1
        ? `Comic page ${selection.startPageIndex + 1}: ${entryNames[0] ?? ''}`
        : `${label} page range ${selection.startPageIndex + 1}-${
            selection.startPageIndex + selection.entries.length
          }: ${selection.entries.length} image pages`;
    return {
      source,
      range,
      locator: range.locator,
      text,
      ...(imageInfo.length > 0 ? { imageInfo } : {}),
      excerpt: {
        contentKind: imageInfo.length > 0 ? 'image' : 'text',
        text,
        ...(imageInfo.length > 0 ? { imageInfo } : {}),
        truncated: false,
      },
      returnedTextChars: text.length,
      totalTextChars: text.length,
      truncated: false,
      pageCount,
      metadata: {
        format: label.toLowerCase(),
        ...(entryNames.length === 1 ? { entryName: entryNames[0] } : { entryNames }),
      },
      manifest,
    };
  }

  private async readTextRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    if (range.locator.kind !== 'text-range') {
      throw unsupportedLocator(range.locator, 'Text range reads require a text-range locator');
    }

    const text = await this.readTextLikeSource(source);
    const selected = sliceTextByLocator(text, range.locator);
    const result = this.makeTextResult(source, range, selected, range.limit?.maxChars, {
      metadata: { totalTextChars: text.length },
    });
    if (source.format !== 'markdown' && source.format !== 'html') {
      return result;
    }

    const imagePaths = extractLocalImageReferences(
      await this.deps.runtime.readTextFile(source.filePath),
    );
    return withContentImages(result, { text: selected, imagePaths });
  }

  private async readContentBackedRange(
    source: DocumentSourceRef,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    const content = await this.deps.reader.read(source.filePath);
    if (range.locator.kind === 'text-range') {
      const result = this.makeTextResult(
        source,
        range,
        sliceTextByLocator(content.text, range.locator),
        range.limit?.maxChars,
        { pageCount: content.pageCount, metadata: content.metadata },
      );
      return withContentImages(result, content);
    }

    if (range.locator.kind === 'slide') {
      const chunks = splitTextIntoSections(content.text);
      const text = chunks[range.locator.slideIndex] ?? chunks.join('\n\n');
      const result = this.makeTextResult(source, range, text, range.limit?.maxChars, {
        pageCount: content.pageCount,
        metadata: content.metadata,
      });
      return withContentImages(result, content);
    }

    const result = this.makeTextResult(source, range, content.text, range.limit?.maxChars, {
      pageCount: content.pageCount,
      metadata: content.metadata,
    });
    return withContentImages(result, content);
  }

  private async readTextLikeSource(source: DocumentSourceRef): Promise<string> {
    if (source.format === 'html') {
      return stripHtmlToText(await this.deps.runtime.readTextFile(source.filePath));
    }
    return this.deps.runtime.readTextFile(source.filePath);
  }

  private async readEpubManifestData(source: DocumentSourceRef): Promise<EpubManifestData> {
    const data = await this.parseEpubData(source);
    return {
      source: data.source,
      metadata: data.metadata,
      chapters: data.chapters,
    };
  }

  private async parseEpubData(source: DocumentSourceRef): Promise<ParsedEpubData> {
    const EPub = resolveEpubConstructor(await this.deps.runtime.loadModule<unknown>('epub2'));
    if (!EPub) {
      throw new DocumentAccessError(
        'unsupported-format',
        'EPUB reader is unavailable in this NekoAgent build',
      );
    }

    const epub = await parseEpub(source.filePath, EPub);
    return {
      source,
      epub,
      metadata: {
        title: epub.metadata.title,
        author: epub.metadata.creator,
        publisher: epub.metadata.publisher,
        language: epub.metadata.language,
      },
      chapters: epub.flow.map((chapter) => ({
        id: chapter.id,
        href: chapter.href,
        title: chapter.title ?? chapter.href ?? chapter.id,
      })),
    };
  }

  private async readCbzEntries(filePath: string): Promise<readonly ZipEntryLike[]> {
    const AdmZip = await this.deps.runtime.loadModule<AdmZipConstructorLike>('adm-zip');
    if (!AdmZip) {
      throw new DocumentAccessError(
        'unsupported-format',
        'CBZ image reader is unavailable in this NekoAgent build',
      );
    }
    return new AdmZip(filePath)
      .getEntries()
      .filter((entry) => COMIC_IMAGE_PATTERN.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private async readCbrEntries(filePath: string): Promise<readonly { readonly name: string }[]> {
    const unrar = await this.deps.runtime.loadModule<UnrarModuleLike>('node-unrar-js');
    if (!unrar) {
      throw new DocumentAccessError(
        'unsupported-format',
        'CBR image reader is unavailable in this NekoAgent build',
      );
    }

    const extractor = unrar.createExtractorFromData({
      data: await this.deps.runtime.readBinaryFile(filePath),
    });
    return extractor
      .getFileList()
      .fileHeaders.filter((file) => COMIC_IMAGE_PATTERN.test(file.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private async readZipEntryImages(
    source: DocumentSourceRef,
    selection: ComicRangeSelection<ZipEntryLike>,
  ): Promise<ExtractedImage[]> {
    return Promise.all(
      selection.entries.map(async (entry, index) => {
        const pageIndex = selection.startPageIndex + index;
        const locator: DocumentLocator = {
          kind: 'page',
          pageNumber: pageIndex + 1,
          pageIndex,
          entryName: entry.name,
        };
        return {
          entryName: entry.name,
          info: await this.readZipEntryImageInfo(source, entry.name, locator),
        };
      }),
    );
  }

  private async readZipEntryImageInfo(
    source: DocumentSourceRef,
    entryPath: string,
    locator: DocumentLocator,
  ): Promise<DocumentImageInfo> {
    const bytes = await this.readZipEntryBytes(source.filePath, entryPath);
    return createImageInfo(bytes, {
      source,
      locator,
      entryPath,
    });
  }

  private async readZipEntryBytes(filePath: string, entryPath: string): Promise<Uint8Array> {
    if (this.deps.runtime.readEntry) {
      const bytes = await this.deps.runtime.readEntry(filePath, entryPath);
      if (!bytes) {
        throw new DocumentAccessError(
          'engine-access-unavailable',
          `Document entry could not be read through the configured entry reader: ${entryPath}`,
        );
      }
      return bytes;
    }
    throw new DocumentAccessError(
      'engine-access-unavailable',
      `Document entry reader is unavailable for ZIP-backed document entry: ${entryPath}`,
    );
  }

  private makeTextResult(
    source: DocumentSourceRef,
    range: DocumentRange,
    text: string,
    maxChars: number | undefined,
    extra: { pageCount?: number; metadata?: Record<string, unknown> } = {},
  ): DocumentReadResult {
    const limit = maxChars ?? text.length;
    const truncated = text.length > limit;
    const returnedText = truncated ? text.slice(0, limit) : text;
    return {
      source,
      range,
      locator: range.locator,
      text: returnedText,
      excerpt: {
        contentKind: 'text',
        text: returnedText,
        truncated,
      },
      totalTextChars: text.length,
      returnedTextChars: returnedText.length,
      truncated,
      pageCount: extra.pageCount,
      metadata: extra.metadata,
    };
  }
}

export function createDocumentAccessService(
  deps: DocumentAccessServiceDeps,
): IDocumentAccessService {
  return new DocumentAccessService(deps);
}

export function createManifestBatchCursor(
  manifest: DocumentManifest,
  options: { maxChars?: number } = {},
): DocumentBatchCursor {
  const firstUnit = manifest.units[0];
  return {
    source: manifest.source,
    strategy: 'manifest-order',
    next: firstUnit?.locator,
    batchIndex: 0,
    done: firstUnit === undefined,
    fileId: manifest.source.fileId ?? manifest.fileId,
    maxChars: options.maxChars,
  };
}

export function detectDocumentFormat(filePath: string): DocumentFormat {
  if (isDocumentUrl(filePath)) {
    return 'url';
  }

  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'pdf';
    case '.epub':
      return 'epub';
    case '.cbz':
      return 'cbz';
    case '.cbr':
      return 'cbr';
    case '.docx':
      return 'docx';
    case '.doc':
      return 'doc';
    case '.pptx':
      return 'pptx';
    case '.ppt':
      return 'ppt';
    case '.md':
      return 'markdown';
    case '.txt':
      return 'text';
    case '.fountain':
      return 'fountain';
    case '.html':
    case '.htm':
      return 'html';
    case '.json':
      return 'json';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.xlsx':
      return 'xlsx';
    case '.xls':
      return 'xls';
    case '.fdx':
      return 'fdx';
    default:
      return 'unknown';
  }
}

function makeCapabilities(input: {
  readonly page?: boolean;
  readonly chapter?: boolean;
  readonly entry?: boolean;
  readonly slide?: boolean;
  readonly text?: boolean;
  readonly region?: boolean;
  readonly requiresFullExtraction?: boolean;
}): DocumentManifestCapabilities {
  return {
    supportsManifest: true,
    supportsRangeRead: true,
    supportsCursorRead: true,
    supportsPageRange: input.page,
    supportsChapterRange: input.chapter,
    supportsEntryRange: input.entry,
    supportsSlideRange: input.slide,
    supportsTextRange: input.text,
    supportsRegion: input.region,
    requiresFullExtraction: input.requiresFullExtraction,
  };
}

function resolvePdfParserConstructor(moduleValue: unknown): PdfParserConstructorWithPartial | null {
  if (!hasPropertyBag(moduleValue)) {
    return null;
  }
  const constructorValue = moduleValue['PDFParse'];
  return typeof constructorValue === 'function'
    ? (constructorValue as unknown as PdfParserConstructorWithPartial)
    : null;
}

function resolveEpubConstructor(moduleValue: unknown): EpubConstructorLike | null {
  const constructorValue =
    typeof moduleValue === 'function'
      ? moduleValue
      : hasPropertyBag(moduleValue) &&
          (typeof moduleValue['EPub'] === 'function' ||
            typeof moduleValue['default'] === 'function')
        ? (moduleValue['EPub'] ?? moduleValue['default'])
        : null;

  return constructorValue ? (constructorValue as EpubConstructorLike) : null;
}

function parseEpub(filePath: string, EPub: EpubConstructorLike): Promise<EpubLike> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on('end', () => resolve(epub));
    epub.on('error', reject);
    epub.parse();
  });
}

function readEpubChapterHtml(epub: EpubLike, chapterId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    epub.getChapter(chapterId, (error, content) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(content);
    });
  });
}

function findEpubChapterIndex(
  chapters: readonly EpubChapterInfo[],
  locator: Extract<DocumentLocator, { kind: 'chapter' }>,
): number {
  if (locator.spineIndex !== undefined) {
    return chapters[locator.spineIndex] ? locator.spineIndex : -1;
  }
  return chapters.findIndex((item) => {
    return (
      item.id === locator.chapterHref ||
      item.href === locator.chapterHref ||
      item.title === locator.chapterHref
    );
  });
}

function sliceTextByLocator(
  text: string,
  locator: Extract<DocumentLocator, { kind: 'text-range' }>,
): string {
  if (locator.startLine !== undefined || locator.endLine !== undefined) {
    const lines = text.split(/\r?\n/);
    const start = Math.max(0, (locator.startLine ?? 1) - 1);
    const end = Math.min(lines.length, locator.endLine ?? lines.length);
    return lines.slice(start, end).join('\n');
  }

  const start = Math.max(0, locator.startChar ?? 0);
  const end = Math.min(text.length, locator.endChar ?? text.length);
  if (end < start) {
    throw new DocumentAccessError('invalid-range', `Invalid text character range: ${start}-${end}`);
  }
  return text.slice(start, end);
}

function splitTextIntoSections(text: string): readonly string[] {
  return splitTextSectionSpans(text).map((section) => text.slice(section.start, section.end));
}

function splitTextSectionSpans(
  text: string,
): readonly { readonly start: number; readonly end: number }[] {
  const sections: { start: number; end: number }[] = [];
  let rawStart = 0;
  for (const separator of text.matchAll(/\n{2,}/gu)) {
    const separatorStart = separator.index;
    appendTrimmedSection(text, rawStart, separatorStart, sections);
    rawStart = separatorStart + separator[0].length;
  }
  appendTrimmedSection(text, rawStart, text.length, sections);
  return sections.length > 0 ? sections : [{ start: 0, end: 0 }];
}

function appendTrimmedSection(
  text: string,
  rawStart: number,
  rawEnd: number,
  sections: { start: number; end: number }[],
): void {
  const raw = text.slice(rawStart, rawEnd);
  const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
  const start = rawStart + leading;
  const end = Math.max(start, rawEnd - trailing);
  if (end > start) sections.push({ start, end });
}

function selectComicRangeEntries<TEntry extends { readonly name: string }>(
  entries: readonly TEntry[],
  range: DocumentRange,
  label: 'CBZ' | 'CBR',
): ComicRangeSelection<TEntry> {
  const startPageIndex =
    range.locator.kind === 'page'
      ? range.locator.pageIndex
      : range.locator.kind === 'region'
        ? Math.max(0, range.locator.pageNumber - 1)
        : 0;
  const startEntryName =
    range.locator.kind === 'page' || range.locator.kind === 'region'
      ? (range.locator.entryName ?? entries[startPageIndex]?.name)
      : entries[startPageIndex]?.name;
  const startEntryIndex = findComicEntryIndex(entries, startEntryName, startPageIndex);
  if (startEntryIndex < 0) {
    throw new DocumentAccessError(
      'invalid-range',
      `${label} page not found: ${startPageIndex + 1}`,
    );
  }

  const endPageIndex =
    range.endLocator?.kind === 'page'
      ? range.endLocator.pageIndex
      : range.endLocator?.kind === 'region'
        ? Math.max(0, range.endLocator.pageNumber - 1)
        : startEntryIndex;
  const endEntryName =
    range.endLocator?.kind === 'page' || range.endLocator?.kind === 'region'
      ? (range.endLocator.entryName ?? entries[endPageIndex]?.name)
      : entries[endPageIndex]?.name;
  const endEntryIndex = findComicEntryIndex(entries, endEntryName, endPageIndex);
  if (endEntryIndex < startEntryIndex) {
    throw new DocumentAccessError('invalid-range', `Invalid ${label} page range`);
  }

  const boundedEndIndex =
    range.limit?.maxImages !== undefined
      ? Math.min(endEntryIndex, startEntryIndex + range.limit.maxImages - 1)
      : endEntryIndex;
  return {
    startPageIndex: startEntryIndex,
    entries: entries.slice(startEntryIndex, boundedEndIndex + 1),
  };
}

function findComicEntryIndex(
  entries: readonly { readonly name: string }[],
  entryName: string | undefined,
  fallbackIndex: number,
): number {
  if (entryName) {
    const entryIndex = entries.findIndex((entry) => entry.name === entryName);
    if (entryIndex >= 0) {
      return entryIndex;
    }
  }
  return entries[fallbackIndex] ? fallbackIndex : -1;
}

function dedupeEpubImageRefs(
  refs: readonly {
    readonly entryPath: string;
    readonly locator: Extract<DocumentLocator, { kind: 'chapter' }>;
  }[],
): Array<{
  readonly entryPath: string;
  readonly locator: Extract<DocumentLocator, { kind: 'chapter' }>;
}> {
  const seen = new Set<string>();
  const deduped: Array<{
    readonly entryPath: string;
    readonly locator: Extract<DocumentLocator, { kind: 'chapter' }>;
  }> = [];
  for (const ref of refs) {
    if (seen.has(ref.entryPath)) {
      continue;
    }
    seen.add(ref.entryPath);
    deduped.push(ref);
  }
  return deduped;
}

function createImageInfo(
  bytes: Uint8Array,
  resource?: {
    readonly source?: DocumentSourceRef;
    readonly locator?: DocumentLocator;
    readonly entryPath?: string;
  },
): DocumentImageInfo {
  const metadata = probeImageMetadata(bytes);
  const resourceRef = createDocumentEntryResourceRef({
    source: resource?.source,
    locator: resource?.locator,
    entryPath: resource?.entryPath,
  });
  return {
    byteSize: metadata?.byteSize ?? bytes.length,
    ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
    ...(metadata?.width !== undefined ? { width: metadata.width } : {}),
    ...(metadata?.height !== undefined ? { height: metadata.height } : {}),
    ...(resource?.entryPath ? { entryPath: resource.entryPath } : {}),
    ...(resource?.locator ? { locator: resource.locator } : {}),
    ...(resourceRef ? { resourceRef } : {}),
  };
}

function findManifestUnitIndex(
  units: readonly DocumentManifestUnit[],
  locator: DocumentLocator,
): number {
  return units.findIndex((unit) => sameLocator(unit.locator, locator));
}

function sameLocator(left: DocumentLocator, right: DocumentLocator): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'page':
      return right.kind === 'page' && left.pageIndex === right.pageIndex;
    case 'chapter':
      return right.kind === 'chapter' && sameChapterLocator(left, right);
    case 'slide':
      return right.kind === 'slide' && left.slideIndex === right.slideIndex;
    case 'text-range':
      return (
        right.kind === 'text-range' &&
        left.startChar === right.startChar &&
        left.endChar === right.endChar &&
        left.startLine === right.startLine &&
        left.endLine === right.endLine
      );
    case 'region':
      return right.kind === 'region' && left.pageNumber === right.pageNumber;
  }
  return false;
}

function createEpubChapterLocatorHref(chapter: EpubChapterInfo): string {
  return chapter.href ?? chapter.id;
}

function sameChapterLocator(
  left: Extract<DocumentLocator, { kind: 'chapter' }>,
  right: Extract<DocumentLocator, { kind: 'chapter' }>,
): boolean {
  if (left.spineIndex !== undefined && right.spineIndex !== undefined) {
    return left.spineIndex === right.spineIndex;
  }
  return left.chapterHref === right.chapterHref;
}

function withContentImages(
  result: DocumentReadResult,
  content: DocumentContent,
): DocumentReadResult {
  const imagePaths = content.imagePaths;
  if (!imagePaths || imagePaths.length === 0) {
    return result;
  }

  return {
    ...result,
    imagePaths,
    ...(content.imageInfo && content.imageInfo.length > 0 ? { imageInfo: content.imageInfo } : {}),
    excerpt: {
      ...result.excerpt,
      contentKind: result.text && result.text.trim().length > 0 ? 'mixed' : 'image',
      imagePaths,
      ...(content.imageInfo && content.imageInfo.length > 0
        ? { imageInfo: content.imageInfo }
        : {}),
    },
  };
}

function unsupportedLocator(locator: DocumentLocator, message: string): DocumentAccessError {
  return new DocumentAccessError('unsupported-locator', `${message}; received ${locator.kind}`);
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function hasPropertyBag(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}
