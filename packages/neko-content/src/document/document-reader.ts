import * as path from 'node:path';
import {
  createDocumentEntryResourceRef,
  type DocumentFormat,
  type DocumentImageInfo,
  type DocumentLocator,
  type DocumentSourceRef,
} from '@neko/shared';
import { probeImageMetadata } from './image-metadata';

export interface DocumentContent {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
  imagePaths?: string[];
  imageInfo?: DocumentImageInfo[];
}

export interface IDocumentReader {
  read(filePath: string): Promise<DocumentContent>;
  supports(filePath: string): boolean;
  hasDRM(filePath: string): Promise<boolean>;
}

export interface DocumentReaderLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface DocumentReaderRuntimeDeps {
  readTextFile(filePath: string): Promise<string>;
  readBinaryFile(filePath: string): Promise<Uint8Array>;
  readEntry?(filePath: string, entryPath: string): Promise<Uint8Array | null>;
  loadModule<T>(packageName: string): Promise<T | null>;
  logger?: DocumentReaderLogger;
  now?: () => Date;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.md',
  '.txt',
  '.fountain',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
  '.epub',
  '.cbz',
  '.cbr',
  '.xlsx',
  '.xls',
  '.fdx',
]);

const COMIC_IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
const HTML_IMAGE_ATTRIBUTE_PATTERN =
  /<(?:img|image|object|source)\b[^>]*(?:src|href|xlink:href|data|srcset)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function isDocumentUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function isSupportedDocumentPath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function estimateSlideCount(text: string): number {
  return text.split('\n\n').filter((section) => section.trim().length > 0).length;
}

interface PdfTextResult {
  text?: string;
  total?: number;
}

interface PdfInfoResult {
  total?: number;
  info?: Record<string, unknown>;
}

interface PdfParserInstance {
  getText(): Promise<PdfTextResult>;
  getInfo(): Promise<PdfInfoResult>;
  destroy(): Promise<void>;
}

interface PdfParserConstructor {
  new (options: { data: Uint8Array }): PdfParserInstance;
}

type PdfReader = (buffer: Uint8Array) => Promise<DocumentContent>;

interface MammothModule {
  extractRawText(options: { path: string }): Promise<{ value: string }>;
}

interface OfficeParserAst {
  type?: string;
  metadata?: Record<string, unknown>;
  toText(): string;
}

type OfficeReader = (filePath: string) => Promise<DocumentContent>;
type UnknownFunction = (...args: unknown[]) => unknown;

interface EpubChapter {
  id: string;
  href?: string;
  title?: string;
}

interface EpubMetadata {
  title?: string;
  creator?: string;
  publisher?: string;
  language?: string;
}

interface EpubInstance {
  flow: EpubChapter[];
  metadata: EpubMetadata;
  on(event: 'end', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  getChapter(id: string, callback: (error: Error | null, content: string) => void): void;
  parse(): void;
}

interface EpubConstructor {
  new (filePath: string): EpubInstance;
}

interface ZipEntry {
  name: string;
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntries(): ZipEntry[];
  getEntry(name: string): ZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
}

interface UnrarFileHeader {
  name: string;
}

interface UnrarExtractedFile {
  fileHeader: UnrarFileHeader;
  extract: [unknown, Uint8Array];
}

interface UnrarExtractor {
  getFileList(): { fileHeaders: UnrarFileHeader[] };
  extract(): { files: UnrarExtractedFile[] };
}

interface UnrarModule {
  createExtractorFromData(options: { data: Uint8Array }): UnrarExtractor;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

type FetchFn = (url: string) => Promise<FetchResponse>;

interface FetchModule {
  default?: FetchFn;
}

interface CheerioSelection {
  remove(): void;
  text(): string;
  attr(name: string): string | undefined;
  each(callback: (index: number, element: unknown) => void): void;
}

interface CheerioRoot {
  (selector: string | unknown): CheerioSelection;
}

interface CheerioModule {
  load(html: string): CheerioRoot;
}

interface XlsxSheet {
  [key: string]: unknown;
}

interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XlsxSheet | undefined>;
}

interface XlsxModule {
  readFile(filePath: string): XlsxWorkbook;
  utils: {
    sheet_to_json(sheet: XlsxSheet, options: { header: 1 }): unknown[];
  };
}

interface XmlParser {
  parse(xml: string): unknown;
}

interface XmlParserConstructor {
  new (options: { ignoreAttributes: boolean; attributeNamePrefix: string }): XmlParser;
}

interface FastXmlParserModule {
  XMLParser?: XmlParserConstructor | null;
}

class DocumentImageEntryReadError extends Error {
  constructor(
    readonly entryPath: string,
    cause?: unknown,
  ) {
    super(
      `Document image entry could not be read: ${entryPath}${
        cause instanceof Error ? ` (${cause.message})` : ''
      }`,
    );
    this.name = 'DocumentImageEntryReadError';
  }
}

export class DocumentReaderRuntime implements IDocumentReader {
  constructor(private readonly deps: DocumentReaderRuntimeDeps) {}

  supports(filePath: string): boolean {
    return isSupportedDocumentPath(filePath);
  }

  async read(filePath: string): Promise<DocumentContent> {
    if (isDocumentUrl(filePath)) {
      return this.readUrl(filePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (await this.hasDRM(filePath)) {
      throw new Error(
        'DRM-protected files are not supported due to legal restrictions. ' +
          'Please use DRM-free versions of your content.',
      );
    }

    switch (ext) {
      case '.pdf':
        return this.readPdf(filePath);
      case '.docx':
      case '.doc':
        return this.readDocx(filePath);
      case '.pptx':
      case '.ppt':
        return this.readPptx(filePath);
      case '.epub':
        return this.readEpub(filePath);
      case '.cbz':
        return this.readCbz(filePath);
      case '.cbr':
        return this.readCbr(filePath);
      case '.xlsx':
      case '.xls':
        return this.readExcel(filePath);
      case '.fdx':
        return this.readFinalDraft(filePath);
      case '.md':
      case '.txt':
      case '.fountain':
      case '.json':
      case '.yaml':
      case '.yml':
        return this.readTextFile(filePath);
      case '.html':
      case '.htm':
        return this.readHtmlFile(filePath);
      default:
        throw new Error(`Unsupported document format: ${ext}`);
    }
  }

  async hasDRM(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.epub') {
        const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
        if (!AdmZip) return false;

        const zip = new AdmZip(filePath);
        return zip.getEntry('META-INF/encryption.xml') !== null;
      }

      if (ext === '.pdf') {
        const buffer = await this.deps.readBinaryFile(filePath);
        const header = new TextDecoder().decode(buffer.slice(0, 1024));
        return header.includes('/Encrypt');
      }

      return false;
    } catch (error) {
      this.deps.logger?.warn('Failed to check DRM', { path: filePath, error });
      return false;
    }
  }

  private async readTextFile(filePath: string): Promise<DocumentContent> {
    return { text: await this.deps.readTextFile(filePath) };
  }

  private async readHtmlFile(filePath: string): Promise<DocumentContent> {
    const html = await this.deps.readTextFile(filePath);
    return {
      text: stripHtmlToText(html),
      imagePaths: extractLocalImageReferences(html),
    };
  }

  private async readPdf(filePath: string): Promise<DocumentContent> {
    try {
      const pdfReader = resolvePdfReader(await this.deps.loadModule<unknown>('pdf-parse'));
      if (!pdfReader) {
        throw new Error('PDF text reader is unavailable in this NekoAgent build');
      }

      return await pdfReader(await this.deps.readBinaryFile(filePath));
    } catch (error) {
      if (error instanceof Error && error.message.includes('PDF text reader')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read PDF', { path: filePath, error });
      throw new Error(
        `Failed to read PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readDocx(filePath: string): Promise<DocumentContent> {
    try {
      const mammoth = await this.deps.loadModule<MammothModule>('mammoth');
      if (!mammoth) {
        throw new Error('Word document reader is unavailable in this NekoAgent build');
      }

      const result = await mammoth.extractRawText({ path: filePath });
      const imageInfo = await this.readZipImageInfo(filePath, 'docx', (entryPath) =>
        entryPath.startsWith('word/media/'),
      );
      return {
        text: result.value,
        ...(imageInfo.length > 0 ? { imageInfo } : {}),
        ...(imageInfo.length > 0 ? { metadata: { imageCount: imageInfo.length } } : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Word document reader')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read DOCX', { path: filePath, error });
      throw new Error(
        `Failed to read DOCX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readPptx(filePath: string): Promise<DocumentContent> {
    try {
      const officeReader = resolveOfficeReader(await this.deps.loadModule<unknown>('officeparser'));
      if (!officeReader) {
        throw new Error('Presentation reader is unavailable in this NekoAgent build');
      }

      const content = await officeReader(filePath);
      const imageInfo = await this.readZipImageInfo(filePath, 'pptx', (entryPath) =>
        entryPath.startsWith('ppt/media/'),
      );
      return {
        ...content,
        ...(imageInfo.length > 0 ? { imageInfo } : {}),
        ...(imageInfo.length > 0
          ? {
              metadata: {
                ...content.metadata,
                imageCount: imageInfo.length,
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Presentation reader')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read PPTX', { path: filePath, error });
      throw new Error(
        `Failed to read PPTX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readEpub(filePath: string): Promise<DocumentContent> {
    try {
      const EPub = resolveEpubConstructor(await this.deps.loadModule<unknown>('epub2'));
      if (!EPub) {
        throw new Error('EPUB reader is unavailable in this NekoAgent build');
      }

      return new Promise((resolve, reject) => {
        const epub = new EPub(filePath);

        epub.on('end', async () => {
          try {
            const texts: string[] = [];
            const imageEntryPaths: string[] = [];
            for (const chapter of epub.flow) {
              const content = await new Promise<string>((res) => {
                epub.getChapter(chapter.id, (err, content) => {
                  res(err ? '' : content);
                });
              });
              texts.push(stripHtmlToText(content));
              imageEntryPaths.push(
                ...extractEpubImageEntryPaths(content, chapter.href ?? chapter.title),
              );
            }

            const imageInfo = await this.readEpubImageInfo(
              filePath,
              dedupeStrings(imageEntryPaths),
            );
            const rawText = texts.join('\n\n');
            const text =
              rawText.trim().length > 0
                ? rawText
                : imageInfo.length > 0
                  ? `EPUB image document with ${imageInfo.length} image pages`
                  : rawText;
            const metadata: Record<string, unknown> = {
              title: epub.metadata.title,
              author: epub.metadata.creator,
              publisher: epub.metadata.publisher,
              language: epub.metadata.language,
            };
            if (imageInfo.length > 0) {
              metadata.imageCount = imageInfo.length;
            }

            resolve({
              text,
              pageCount: epub.flow.length,
              ...(imageInfo.length > 0 ? { imageInfo } : {}),
              metadata,
            });
          } catch (error) {
            reject(error);
          }
        });

        epub.on('error', reject);
        epub.parse();
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('epub2')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read EPUB', { path: filePath, error });
      throw new Error(
        `Failed to read EPUB: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readEpubImageInfo(
    filePath: string,
    entryPaths: readonly string[],
  ): Promise<DocumentImageInfo[]> {
    if (entryPaths.length === 0) {
      return [];
    }

    const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
    if (!AdmZip) {
      this.deps.logger?.warn('Internal ZIP image reader is unavailable for EPUB images', {
        path: filePath,
      });
      return [];
    }

    const zip = new AdmZip(filePath);
    const images: DocumentImageInfo[] = [];
    for (let index = 0; index < entryPaths.length; index += 1) {
      const entryPath = entryPaths[index];
      if (!entryPath) {
        continue;
      }
      const entry = zip.getEntry(entryPath);
      if (!entry) {
        this.deps.logger?.warn('EPUB image entry not found', { path: filePath, entryPath });
        continue;
      }

      const imageBytes = await this.readEntryBytes(filePath, entryPath);
      images.push(
        createArchiveImageInfo(
          imageBytes,
          createDocumentImageResource(filePath, 'epub', entryPath),
        ),
      );
    }

    return images;
  }

  private async readZipImageInfo(
    filePath: string,
    sourceFormat: DocumentFormat,
    includeEntry: (entryPath: string) => boolean,
  ): Promise<DocumentImageInfo[]> {
    try {
      const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
      if (!AdmZip) {
        this.deps.logger?.warn('Internal ZIP image reader is unavailable', {
          path: filePath,
        });
        return [];
      }

      const entries = new AdmZip(filePath)
        .getEntries()
        .filter((entry) => includeEntry(entry.name) && COMIC_IMAGE_PATTERN.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      if (entries.length === 0) {
        return [];
      }

      const images: DocumentImageInfo[] = [];
      for (const entry of entries) {
        const imageBytes = await this.readEntryBytes(filePath, entry.name);
        images.push(
          createArchiveImageInfo(
            imageBytes,
            createDocumentImageResource(filePath, sourceFormat, entry.name),
          ),
        );
      }

      return images;
    } catch (error) {
      if (error instanceof DocumentImageEntryReadError) {
        throw error;
      }
      this.deps.logger?.warn('Failed to read document image entries', {
        path: filePath,
        format: sourceFormat,
        error,
      });
      return [];
    }
  }

  private async readEntryBytes(filePath: string, entryPath: string): Promise<Uint8Array> {
    if (!this.deps.readEntry) {
      throw new DocumentImageEntryReadError(
        entryPath,
        new Error('document entry reader is unavailable'),
      );
    }
    try {
      const bytes = await this.deps.readEntry(filePath, entryPath);
      if (!bytes) {
        throw new DocumentImageEntryReadError(entryPath);
      }
      return bytes;
    } catch (error) {
      if (error instanceof DocumentImageEntryReadError) {
        throw error;
      }
      throw new DocumentImageEntryReadError(entryPath, error);
    }
  }

  private async readCbz(filePath: string): Promise<DocumentContent> {
    try {
      const AdmZip = await this.deps.loadModule<AdmZipConstructor>('adm-zip');
      if (!AdmZip) {
        throw new Error('CBZ image reader is unavailable in this NekoAgent build');
      }

      const entries = new AdmZip(filePath)
        .getEntries()
        .filter((entry) => COMIC_IMAGE_PATTERN.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const imageInfo: DocumentImageInfo[] = [];
      for (const entry of entries) {
        const imageBytes = await this.readEntryBytes(filePath, entry.name);
        imageInfo.push(
          createArchiveImageInfo(
            imageBytes,
            createDocumentImageResource(filePath, 'cbz', entry.name),
          ),
        );
      }

      return this.createComicContent('cbz', filePath, entries.length, imageInfo);
    } catch (error) {
      if (error instanceof Error && error.message.includes('CBZ image reader')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read CBZ', { path: filePath, error });
      throw new Error(
        `Failed to read CBZ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readCbr(filePath: string): Promise<DocumentContent> {
    try {
      const unrar = await this.deps.loadModule<UnrarModule>('node-unrar-js');
      if (!unrar) {
        throw new Error('CBR image reader is unavailable in this NekoAgent build');
      }

      const extractor = unrar.createExtractorFromData({
        data: await this.deps.readBinaryFile(filePath),
      });
      const imageFiles = extractor
        .getFileList()
        .fileHeaders.filter((file) => COMIC_IMAGE_PATTERN.test(file.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      const filesByName = new Map(
        extractor
          .extract()
          .files.filter((file) => COMIC_IMAGE_PATTERN.test(file.fileHeader.name))
          .map((file) => [file.fileHeader.name, file]),
      );
      const imageInfo: DocumentImageInfo[] = [];
      for (const fileHeader of imageFiles) {
        const file = filesByName.get(fileHeader.name);
        if (!file) {
          continue;
        }
        const imageBytes = file.extract[1];
        imageInfo.push(createImageInfoFromBytes(imageBytes));
      }

      return this.createComicContent('cbr', filePath, imageFiles.length, imageInfo);
    } catch (error) {
      if (error instanceof Error && error.message.includes('CBR image reader')) {
        throw error;
      }
      this.deps.logger?.error('Failed to read CBR', { path: filePath, error });
      throw new Error(
        `Failed to read CBR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readUrl(url: string): Promise<DocumentContent> {
    try {
      const fetchModule = await this.deps.loadModule<FetchModule | FetchFn>('node-fetch');
      const cheerio = await this.deps.loadModule<CheerioModule>('cheerio');
      const fetch = typeof fetchModule === 'function' ? fetchModule : fetchModule?.default;

      if (!fetch || !cheerio) {
        throw new Error('URL reader is unavailable in this NekoAgent build');
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, aside, footer, header, .ad, .advertisement').remove();

      const mainContent =
        $('article').text() || $('main').text() || $('.content').text() || $('body').text();
      const imagePaths: string[] = [];
      $('img, image, object, source').each((_index, element) => {
        const selection = $(element);
        const value =
          selection.attr('src') ??
          selection.attr('href') ??
          selection.attr('xlink:href') ??
          selection.attr('data') ??
          selection.attr('srcset');
        if (value) {
          imagePaths.push(...extractLocalImageReferencesFromValue(value));
        }
      });

      return {
        text: mainContent.replace(/\s+/g, ' ').trim(),
        ...(imagePaths.length > 0 ? { imagePaths: dedupeStrings(imagePaths) } : {}),
        metadata: {
          url,
          title: $('title').text().trim(),
          fetchedAt: (this.deps.now?.() ?? new Date()).toISOString(),
          ...(imagePaths.length > 0 ? { imageCount: dedupeStrings(imagePaths).length } : {}),
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to read URL', { url, error });
      throw new Error(
        `Failed to read URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readExcel(filePath: string): Promise<DocumentContent> {
    try {
      const xlsx = await this.deps.loadModule<XlsxModule>('xlsx');
      if (!xlsx) {
        throw new Error('Excel reader is unavailable in this NekoAgent build');
      }

      const workbook = xlsx.readFile(filePath);
      const sheets: string[] = [];
      const allData: unknown[][] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        allData.push(...data);
        sheets.push(`Sheet: ${sheetName}\n${data.map((row) => row.join('\t')).join('\n')}`);
      }
      const imageInfo = await this.readZipImageInfo(filePath, 'xlsx', (entryPath) =>
        entryPath.startsWith('xl/media/'),
      );

      return {
        text: sheets.join('\n\n'),
        ...(imageInfo.length > 0 ? { imageInfo } : {}),
        metadata: {
          format: 'xlsx',
          sheetCount: workbook.SheetNames.length,
          sheets: workbook.SheetNames,
          rowCount: allData.length,
          ...(imageInfo.length > 0 ? { imageCount: imageInfo.length } : {}),
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to read Excel', { path: filePath, error });
      throw new Error(
        `Failed to read Excel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readFinalDraft(filePath: string): Promise<DocumentContent> {
    try {
      const fastXmlParser = await this.deps.loadModule<FastXmlParserModule>('fast-xml-parser');
      const XMLParser = fastXmlParser?.XMLParser;
      if (!XMLParser) {
        throw new Error('Final Draft reader is unavailable in this NekoAgent build');
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const doc = parser.parse(await this.deps.readTextFile(filePath));
      const scenes = extractFDXScenes(doc);

      return {
        text: scenes.map((scene) => scene.text).join('\n\n'),
        pageCount: scenes.length,
        metadata: {
          format: 'fdx',
          sceneCount: scenes.length,
          title:
            readNestedValue(doc, ['FinalDraft', 'Content', 'TitlePage', 'Content']) ?? 'Untitled',
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to read Final Draft', { path: filePath, error });
      throw new Error(
        `Failed to read Final Draft: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createComicContent(
    format: 'cbz' | 'cbr',
    filePath: string,
    pageCount: number,
    imageInfo: DocumentImageInfo[] = [],
  ): DocumentContent {
    return {
      text: `Comic archive with ${pageCount} pages`,
      pageCount,
      ...(imageInfo.length > 0 ? { imageInfo } : {}),
      metadata: {
        format,
        fileName: path.basename(filePath),
        ...(imageInfo.length > 0 ? { imageCount: imageInfo.length } : {}),
      },
    };
  }
}

export function extractEpubImageEntryPaths(
  html: string,
  chapterHref: string | undefined,
): string[] {
  const paths: string[] = [];
  for (const source of extractHtmlImageSources(html)) {
    const entryPath = resolveEpubEntryReference(chapterHref, source);
    if (entryPath && COMIC_IMAGE_PATTERN.test(entryPath)) {
      paths.push(entryPath);
    }
  }
  return dedupeStrings(paths);
}

export function extractLocalImageReferences(html: string): string[] {
  const paths = extractHtmlImageSources(html)
    .map((source) => normalizeLocalImageReference(source))
    .filter((source): source is string => source !== null);
  return dedupeStrings(paths);
}

function extractHtmlImageSources(html: string): string[] {
  const sources: string[] = [];
  HTML_IMAGE_ATTRIBUTE_PATTERN.lastIndex = 0;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = HTML_IMAGE_ATTRIBUTE_PATTERN.exec(html)) !== null) {
    const match = htmlMatch;
    const rawValue = match[1] ?? match[2] ?? match[3];
    if (!rawValue) {
      continue;
    }
    sources.push(...splitImageAttributeValue(rawValue));
  }
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = MARKDOWN_IMAGE_PATTERN.exec(html)) !== null) {
    const rawValue = markdownMatch[1];
    if (rawValue) {
      sources.push(rawValue);
    }
  }
  return sources;
}

function extractLocalImageReferencesFromValue(value: string): string[] {
  return dedupeStrings(
    splitImageAttributeValue(value)
      .map((source) => normalizeLocalImageReference(source))
      .filter((source): source is string => source !== null),
  );
}

export function resolveEpubEntryReference(
  chapterHref: string | undefined,
  resourceHref: string,
): string | null {
  const normalizedResource = decodeHtmlAttribute(resourceHref).trim();
  if (
    normalizedResource.length === 0 ||
    normalizedResource.startsWith('#') ||
    /^(?:data|blob|https?):/i.test(normalizedResource)
  ) {
    return null;
  }

  const isRootReference = normalizedResource.startsWith('/');
  let cleanHref = normalizedResource.split(/[?#]/, 1)[0]?.replace(/^\/+/, '');
  if (!cleanHref) {
    return null;
  }
  if (cleanHref.startsWith('images/')) {
    cleanHref = cleanHref.slice('images/'.length);
  }
  if (isRootReference) {
    return cleanHref;
  }

  const baseDir = chapterHref ? path.posix.dirname(chapterHref.replace(/\\/g, '/')) : '.';
  const resolved = path.posix.normalize(path.posix.join(baseDir, cleanHref));
  return resolved.startsWith('../') ? resolved.replace(/^(\.\.\/)+/, '') : resolved;
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

interface DocumentImageResourceInput {
  readonly source: DocumentSourceRef;
  readonly locator?: DocumentLocator;
  readonly entryPath?: string;
}

function createArchiveImageInfo(
  bytes: Uint8Array,
  resource: DocumentImageResourceInput,
): DocumentImageInfo {
  const resourceRef = createDocumentEntryResourceRef({
    source: resource.source,
    locator: resource.locator,
    entryPath: resource.entryPath,
  });
  return {
    ...createImageInfoFromBytes(bytes),
    ...(resource.entryPath ? { entryPath: resource.entryPath } : {}),
    ...(resource.locator ? { locator: resource.locator } : {}),
    ...(resourceRef ? { resourceRef } : {}),
  };
}

function createImageInfoFromBytes(bytes: Uint8Array): DocumentImageInfo {
  const metadata = probeImageMetadata(bytes);
  return {
    byteSize: metadata?.byteSize ?? bytes.length,
    ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
    ...(metadata?.width !== undefined ? { width: metadata.width } : {}),
    ...(metadata?.height !== undefined ? { height: metadata.height } : {}),
  };
}

function createDocumentImageResource(
  filePath: string,
  format: DocumentFormat,
  entryPath: string,
): DocumentImageResourceInput {
  return {
    source: {
      filePath,
      format,
    },
    entryPath,
  };
}

function normalizeLocalImageReference(resourceHref: string): string | null {
  const normalizedResource = decodeHtmlAttribute(resourceHref).trim();
  if (
    normalizedResource.length === 0 ||
    normalizedResource.startsWith('#') ||
    /^(?:data|blob):/i.test(normalizedResource)
  ) {
    return null;
  }

  const cleanHref = normalizedResource.split(/[?#]/, 1)[0];
  if (!cleanHref || !COMIC_IMAGE_PATTERN.test(cleanHref)) {
    return null;
  }
  return cleanHref;
}

function splitImageAttributeValue(value: string): string[] {
  return value
    .split(',')
    .map(readFirstImageAttributeToken)
    .filter((part): part is string => part !== null);
}

function readFirstImageAttributeToken(value: string): string | null {
  const token = value.trim().split(/\s+/, 1)[0];
  return token && token.length > 0 ? token : null;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractFDXScenes(doc: unknown): Array<{ text: string }> {
  const scenes: Array<{ text: string }> = [];
  try {
    const content = readNestedValue(doc, ['FinalDraft', 'Content', 'Paragraph']);
    if (!Array.isArray(content)) return scenes;

    let currentScene = '';
    for (const para of content) {
      if (!isRecord(para)) continue;
      const type = typeof para['@_Type'] === 'string' ? para['@_Type'] : undefined;
      const rawText = para['Text'];
      const text = Array.isArray(rawText)
        ? rawText.join(' ')
        : typeof rawText === 'string'
          ? rawText
          : '';

      if (type === 'Scene Heading') {
        if (currentScene) {
          scenes.push({ text: currentScene.trim() });
        }
        currentScene = `${text}\n`;
      } else if (type === 'Action' || type === 'Character' || type === 'Dialogue') {
        currentScene += `${text}\n`;
      }
    }

    if (currentScene) {
      scenes.push({ text: currentScene.trim() });
    }
  } catch {
    return [{ text: 'Failed to parse FDX content' }];
  }

  return scenes.length > 0 ? scenes : [{ text: 'Failed to parse FDX content' }];
}

function resolvePdfReader(moduleValue: unknown): PdfReader | null {
  const modernConstructor = readFunctionProperty(moduleValue, 'PDFParse');
  if (!modernConstructor) return null;

  return async (buffer) => {
    const PdfParser = modernConstructor as unknown as PdfParserConstructor;
    const parser = new PdfParser({ data: buffer });
    try {
      const textResult = await parser.getText();
      const infoResult = await readPdfInfo(parser);
      const metadata = isRecord(infoResult?.info) ? infoResult.info : undefined;
      const pageCount = readNumber(infoResult?.total) ?? readNumber(textResult.total);

      return {
        text: typeof textResult.text === 'string' ? textResult.text : '',
        ...(pageCount !== undefined ? { pageCount } : {}),
        ...(metadata ? { metadata } : {}),
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  };
}

async function readPdfInfo(parser: PdfParserInstance): Promise<PdfInfoResult | undefined> {
  try {
    return await parser.getInfo();
  } catch {
    return undefined;
  }
}

function resolveOfficeReader(moduleValue: unknown): OfficeReader | null {
  const parser =
    readFunctionProperty(moduleValue, 'parseOffice') ??
    readNestedFunctionProperty(moduleValue, 'OfficeParser', 'parseOffice') ??
    readNestedFunctionProperty(moduleValue, 'default', 'parseOffice') ??
    readCallableDefault(moduleValue);

  if (!parser) {
    return null;
  }

  return async (filePath) => {
    const ast = await parser(filePath);
    return normalizeOfficeAst(ast, filePath);
  };
}

function normalizeOfficeAst(value: unknown, filePath: string): DocumentContent {
  if (!isOfficeParserAst(value)) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const slideCount = estimateSlideCount(text);
    return {
      text,
      pageCount: slideCount,
      metadata: {
        format: readDocumentFormat(filePath, 'pptx'),
        slideCount,
      },
    };
  }

  const text = value.toText();
  const slideCount = estimateSlideCount(text);
  return {
    text,
    pageCount: slideCount,
    metadata: {
      ...(value.metadata ?? {}),
      format: value.type ?? readDocumentFormat(filePath, 'pptx'),
      slideCount,
    },
  };
}

function resolveEpubConstructor(moduleValue: unknown): EpubConstructor | null {
  const constructorValue =
    typeof moduleValue === 'function'
      ? moduleValue
      : (readFunctionProperty(moduleValue, 'EPub') ?? readFunctionProperty(moduleValue, 'default'));

  return constructorValue ? (constructorValue as EpubConstructor) : null;
}

function readNestedValue(value: unknown, pathSegments: string[]): unknown {
  let current = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOfficeParserAst(value: unknown): value is OfficeParserAst {
  return isRecord(value) && typeof value['toText'] === 'function';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDocumentFormat(filePath: string, defaultFormat: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext.length > 1 ? ext.slice(1) : defaultFormat;
}

function readFunctionProperty(value: unknown, property: string): UnknownFunction | null {
  if (!hasPropertyBag(value)) {
    return null;
  }

  const propertyValue = value[property];
  return typeof propertyValue === 'function' ? (propertyValue as UnknownFunction) : null;
}

function readNestedFunctionProperty(
  value: unknown,
  parentProperty: string,
  childProperty: string,
): UnknownFunction | null {
  if (!hasPropertyBag(value)) {
    return null;
  }

  return readFunctionProperty(value[parentProperty], childProperty);
}

function readCallableDefault(value: unknown): UnknownFunction | null {
  if (!hasPropertyBag(value)) {
    return null;
  }

  const defaultValue = value['default'];
  if (typeof defaultValue !== 'function' || readFunctionProperty(defaultValue, 'parseOffice')) {
    return null;
  }

  return defaultValue as UnknownFunction;
}

function hasPropertyBag(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}

export function createDocumentReaderRuntime(deps: DocumentReaderRuntimeDeps): IDocumentReader {
  return new DocumentReaderRuntime(deps);
}
