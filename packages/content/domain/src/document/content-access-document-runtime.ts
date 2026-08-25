import { type ContentIoDiagnostic, type ContentReadService } from '../contracts/content-io';
import {
  createContentEntryLocator,
  isContentLocator,
  type ContentSelector,
  type DocumentEntryContentLocator,
  type WorkspaceFileContentLocator,
} from '../contracts/content-locator';
import {
  type DocumentBatchCursor,
  type DocumentFormat,
  type DocumentImageInfo,
  type DocumentManifest,
  type DocumentManifestUnit,
  type DocumentReadResult,
  type DocumentSourceRef,
} from '../contracts/document-reading';
import type { DocumentReadCoordinate } from '../contracts/document-read-coordinate';
import { detectDocumentFormat, type IDocumentAccessService } from './document-access-service';

export type DocumentContentAccessMode = 'content' | 'manifest' | 'range' | 'next';

export type ContentDocumentManifestUnit = Omit<DocumentManifestUnit, 'locator'> & {
  readonly contentLocator: WorkspaceFileContentLocator;
};

export type ContentDocumentManifest = Omit<DocumentManifest, 'source' | 'fileId' | 'units'> & {
  readonly source: WorkspaceFileContentLocator;
  readonly units: readonly ContentDocumentManifestUnit[];
};

export interface ContentDocumentCursor {
  readonly source: WorkspaceFileContentLocator;
  readonly strategy: DocumentBatchCursor['strategy'];
  readonly next?: WorkspaceFileContentLocator;
  readonly batchIndex: number;
  readonly done: boolean;
  readonly maxChars?: number;
}

export interface DocumentContentAccessInput {
  readonly source: WorkspaceFileContentLocator;
  readonly format?: DocumentFormat;
  readonly mode?: DocumentContentAccessMode;
  readonly cursor?: ContentDocumentCursor;
  readonly startBatch?: boolean;
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
  readonly signal?: AbortSignal;
}

export type DocumentContentAccessResult =
  | {
      readonly status: 'unavailable';
      readonly source: WorkspaceFileContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    }
  | {
      readonly status: 'ready';
      readonly source: WorkspaceFileContentLocator;
      readonly text?: string;
      readonly manifest?: ContentDocumentManifest;
      readonly excerpt?: DocumentReadResult['excerpt'];
      readonly cursor?: ContentDocumentCursor;
      readonly imageInfo?: readonly DocumentImageInfo[];
      readonly imageCount?: number;
      readonly imagesTruncated?: boolean;
      readonly pageCount?: number;
      readonly totalTextChars?: number;
      readonly returnedTextChars?: number;
      readonly truncated?: boolean;
      readonly metadata?: Record<string, unknown>;
    };

export interface DocumentContentAccessRuntimeDeps {
  readonly contentRead: ContentReadService;
  readonly documentAccess: IDocumentAccessService;
  /** Resolves a validated workspace locator for path-only document decoder libraries. */
  readonly resolveHostFilePath: (
    source: WorkspaceFileContentLocator,
  ) => Promise<string | undefined> | string | undefined;
}

/**
 * Locator-first document facade. Physical paths are confined to the decoder call and are never
 * returned. Source and archive-entry authorization stays on the narrow ContentReadService path.
 */
export class DocumentContentAccessRuntime {
  constructor(private readonly deps: DocumentContentAccessRuntimeDeps) {}

  async resolveDocumentContent(
    input: DocumentContentAccessInput,
  ): Promise<DocumentContentAccessResult> {
    const containerSource = documentContainerLocator(input.source);
    const sourceStat = await this.deps.contentRead.stat(containerSource, {
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (sourceStat.status === 'unavailable') {
      return { status: 'unavailable', source: input.source, diagnostic: sourceStat.diagnostic };
    }

    const hostFilePath = await this.deps.resolveHostFilePath(containerSource);
    if (!hostFilePath) {
      return {
        status: 'unavailable',
        source: input.source,
        diagnostic: { code: 'content-unsupported' },
      };
    }
    if (input.signal?.aborted) {
      return {
        status: 'unavailable',
        source: input.source,
        diagnostic: { code: 'content-cancelled' },
      };
    }

    const stableDocumentSource = createStableDocumentSource(
      containerSource,
      input.format,
      sourceStat.fingerprint.value,
    );
    const runtimeDocumentSource = { ...stableDocumentSource, filePath: hostFilePath };
    const mode = input.mode ?? 'content';
    const output =
      mode === 'manifest'
        ? await this.readDocumentManifest(runtimeDocumentSource, stableDocumentSource, input)
        : mode === 'range'
          ? await this.readDocumentRange(runtimeDocumentSource, stableDocumentSource, input)
          : mode === 'next'
            ? await this.readDocumentNext(stableDocumentSource, input)
            : await this.readDocumentContent(runtimeDocumentSource, input);

    return {
      status: 'ready',
      source: input.source,
      ...output,
    };
  }

  private async readDocumentContent(
    source: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    const content = await this.deps.documentAccess.readContent(source.filePath);
    const imageProjection = await this.projectDocumentImages(content.imageInfo, input);
    return {
      text: content.text,
      totalTextChars: content.text.length,
      returnedTextChars: content.text.length,
      truncated: false,
      ...(content.pageCount !== undefined ? { pageCount: content.pageCount } : {}),
      ...imageProjection,
      ...(content.metadata ? { metadata: publicDocumentMetadata(content.metadata) } : {}),
    };
  }

  private async readDocumentManifest(
    source: DocumentSourceRef,
    stableSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    const manifest = withStableManifestSource(
      await this.deps.documentAccess.getManifest(source),
      stableSource,
    );
    return {
      manifest,
      ...(input.startBatch
        ? {
            cursor: withStableCursorSource(
              await this.deps.documentAccess.createBatchCursor(source, {
                maxChars: input.maxChars,
              }),
              stableSource,
            ),
          }
        : {}),
      ...(manifest.metadata ? { metadata: manifest.metadata } : {}),
    };
  }

  private async readDocumentRange(
    source: DocumentSourceRef,
    stableSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    if (!input.source.selector) {
      throw new Error('openneko.document targeted read requires source.selector.');
    }
    const locator = await this.resolveReaderLocator(source, input.source.selector);
    const result = await this.deps.documentAccess.readRange(source, {
      locator,
      limit: {
        ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
        ...(input.maxImages !== undefined ? { maxImages: input.maxImages } : {}),
      },
    });
    return this.projectDocumentReadResult(withStableReadResultSource(result, stableSource), input);
  }

  private async readDocumentNext(
    stableSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    if (!input.cursor) throw new Error('openneko.document continue mode requires a cursor.');
    const containerSource = documentContainerLocator(input.source);
    const hostFilePath = await this.deps.resolveHostFilePath(containerSource);
    if (!hostFilePath) throw new Error('Document source is unavailable.');
    const runtimeSource = { ...stableSource, filePath: hostFilePath };
    const next = input.cursor.next?.selector
      ? await this.resolveReaderLocator(runtimeSource, input.cursor.next.selector)
      : undefined;
    const result = await this.deps.documentAccess.readNext({
      source: runtimeSource,
      strategy: input.cursor.strategy,
      ...(next ? { next } : {}),
      batchIndex: input.cursor.batchIndex,
      done: input.cursor.done,
      fileId: stableSource.fileId,
      maxChars: input.cursor.maxChars,
    });
    return this.projectDocumentReadResult(withStableReadResultSource(result, stableSource), input);
  }

  private async resolveReaderLocator(
    source: DocumentSourceRef,
    selector: ContentSelector,
  ): Promise<DocumentReadCoordinate> {
    if (selector.kind === 'page' || selector.kind === 'text-range') return selector;
    const manifest = await this.deps.documentAccess.getManifest(source);
    const unit = manifest.units.find(
      (candidate) =>
        candidate.href === selector.path ||
        candidate.entryName === selector.path ||
        (candidate.locator.kind === 'chapter' && candidate.locator.chapterHref === selector.path) ||
        ((candidate.locator.kind === 'page' || candidate.locator.kind === 'region') &&
          candidate.locator.entryName === selector.path),
    );
    if (!unit) {
      throw new Error(`Document entry selector is not present in the manifest: ${selector.path}`);
    }
    return unit.locator;
  }

  private async projectDocumentReadResult(
    result: StableDocumentReadResult,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    const imageProjection = await this.projectDocumentImages(result.imageInfo, input);
    return {
      ...(result.text !== undefined ? { text: result.text } : {}),
      ...(result.excerpt ? { excerpt: stripDocumentExcerptRuntimeFields(result.excerpt) } : {}),
      ...(input.includeManifest && result.manifest ? { manifest: result.manifest } : {}),
      ...(result.cursor ? { cursor: result.cursor } : {}),
      ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
      ...(result.totalTextChars !== undefined ? { totalTextChars: result.totalTextChars } : {}),
      ...(result.returnedTextChars !== undefined
        ? { returnedTextChars: result.returnedTextChars }
        : {}),
      ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
      ...imageProjection,
      ...(result.metadata ? { metadata: publicDocumentMetadata(result.metadata) } : {}),
    };
  }

  private async projectDocumentImages(
    imageInfo: readonly DocumentImageInfo[] | undefined,
    input: DocumentContentAccessInput,
  ): Promise<Pick<DocumentReadyOutput, 'imageInfo' | 'imageCount' | 'imagesTruncated'>> {
    if (input.includeImages === false || !imageInfo?.length) return {};
    const visible = imageInfo.slice(0, input.maxImages ?? imageInfo.length);
    const projected = await Promise.all(
      visible.map(async (image) => {
        const entryPath =
          image.entryPath ??
          (image.contentLocator?.selector?.kind === 'entry'
            ? image.contentLocator.selector.path
            : undefined);
        if (!entryPath) return stripDocumentImageRuntimeFields(image);
        const contentLocator: DocumentEntryContentLocator = {
          file: input.source.file,
          selector: { kind: 'entry', path: entryPath },
        };
        const entry = await this.deps.contentRead.stat(contentLocator, {
          ...(input.signal ? { signal: input.signal } : {}),
        });
        if (entry.status === 'unavailable') {
          throw new Error(`Document entry is unavailable: ${entry.diagnostic.code}`);
        }
        return { ...stripDocumentImageRuntimeFields(image), contentLocator };
      }),
    );
    return {
      imageInfo: projected,
      imageCount: imageInfo.length,
      imagesTruncated: projected.length < imageInfo.length,
    };
  }
}

type DocumentReadyResult = Extract<DocumentContentAccessResult, { status: 'ready' }>;
type DocumentReadyOutput = Omit<DocumentReadyResult, 'status' | 'source'>;

function createStableDocumentSource(
  source: WorkspaceFileContentLocator,
  format: DocumentFormat | undefined,
  fingerprint: string,
): DocumentSourceRef {
  return {
    filePath: source.file.path,
    format: format ?? detectDocumentFormat(source.file.path),
    contentLocator: source,
    fileId: fingerprint,
    identity: { fileId: fingerprint },
  };
}

function documentContainerLocator(
  source: WorkspaceFileContentLocator,
): WorkspaceFileContentLocator {
  return { file: source.file };
}

function withStableManifestSource(
  manifest: Awaited<ReturnType<IDocumentAccessService['getManifest']>>,
  source: DocumentSourceRef,
): ContentDocumentManifest {
  const container = source.contentLocator;
  if (!container) throw new Error('Document manifest source has no ContentLocator.');
  const { source: _readerSource, fileId: _fileId, units, metadata, ...manifestFacts } = manifest;
  return {
    ...manifestFacts,
    source: container,
    units: units.map((unit) => projectManifestUnit(container, unit)),
    ...(metadata ? { metadata: publicDocumentMetadata(metadata) } : {}),
  };
}

function withStableCursorSource(
  cursor: NonNullable<DocumentReadResult['cursor']>,
  source: DocumentSourceRef,
): ContentDocumentCursor {
  const container = source.contentLocator;
  if (!container) throw new Error('Document cursor source has no ContentLocator.');
  return {
    source: container,
    strategy: cursor.strategy,
    ...(cursor.next ? { next: contentLocatorFromReaderLocator(container, cursor.next) } : {}),
    batchIndex: cursor.batchIndex,
    done: cursor.done,
    ...(cursor.maxChars === undefined ? {} : { maxChars: cursor.maxChars }),
  };
}

type StableDocumentReadResult = Omit<DocumentReadResult, 'manifest' | 'cursor'> & {
  readonly manifest?: ContentDocumentManifest;
  readonly cursor?: ContentDocumentCursor;
};

function withStableReadResultSource(
  result: Awaited<ReturnType<IDocumentAccessService['readRange']>>,
  source: DocumentSourceRef,
): StableDocumentReadResult {
  const { manifest, cursor, ...readResult } = result;
  return {
    ...readResult,
    source,
    ...(manifest ? { manifest: withStableManifestSource(manifest, source) } : {}),
    ...(cursor ? { cursor: withStableCursorSource(cursor, source) } : {}),
  };
}

function projectManifestUnit(
  source: WorkspaceFileContentLocator,
  unit: DocumentManifestUnit,
): ContentDocumentManifestUnit {
  const { locator, ...projection } = unit;
  return {
    ...projection,
    contentLocator: contentLocatorFromReaderLocator(source, locator),
  };
}

function contentLocatorFromReaderLocator(
  source: WorkspaceFileContentLocator,
  locator: DocumentReadCoordinate,
): WorkspaceFileContentLocator {
  if (locator.kind === 'chapter') {
    return createContentEntryLocator(source, locator.chapterHref);
  }
  if (locator.kind === 'page' && locator.entryName) {
    return createContentEntryLocator(source, locator.entryName);
  }
  if (locator.kind === 'page') {
    const selected = {
      file: source.file,
      selector: {
        kind: 'page' as const,
        pageNumber: locator.pageNumber,
        pageIndex: locator.pageIndex,
      },
    };
    if (!isContentLocator(selected)) throw new Error('Document page locator is invalid.');
    return selected;
  }
  if (locator.kind === 'text-range') {
    const selected = { file: source.file, selector: publicTextRangeSelector(locator) };
    if (!isContentLocator(selected)) throw new Error('Document text locator is invalid.');
    return selected;
  }
  throw new Error(`Document selector kind is not supported by ContentLocator: ${locator.kind}`);
}

function publicTextRangeSelector(
  locator: Extract<DocumentReadCoordinate, { kind: 'text-range' }>,
): Extract<ContentSelector, { kind: 'text-range' }> {
  if (locator.startChar !== undefined || locator.endChar !== undefined) {
    return {
      kind: 'text-range',
      ...(locator.startChar === undefined ? {} : { startChar: locator.startChar }),
      ...(locator.endChar === undefined ? {} : { endChar: locator.endChar }),
    };
  }
  if (locator.startLine !== undefined || locator.endLine !== undefined) {
    return {
      kind: 'text-range',
      ...(locator.startLine === undefined ? {} : { startLine: locator.startLine }),
      ...(locator.endLine === undefined ? {} : { endLine: locator.endLine }),
    };
  }
  if (locator.paragraphIndex !== undefined) {
    return { kind: 'text-range', paragraphIndex: locator.paragraphIndex };
  }
  if (locator.heading !== undefined) {
    return { kind: 'text-range', heading: locator.heading };
  }
  throw new Error('Document text locator has no coordinate.');
}

function stripDocumentImageRuntimeFields(image: DocumentImageInfo): DocumentImageInfo {
  return {
    ...(image.alias ? { alias: image.alias } : {}),
    ...(image.aliasScope ? { aliasScope: image.aliasScope } : {}),
    ...(image.entryPath ? { entryPath: image.entryPath } : {}),
    ...(image.portableForTransfer !== undefined
      ? { portableForTransfer: image.portableForTransfer }
      : {}),
    ...(image.nonPortableReason ? { nonPortableReason: image.nonPortableReason } : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {}),
    ...(image.mimeType ? { mimeType: image.mimeType } : {}),
    ...(image.byteSize !== undefined ? { byteSize: image.byteSize } : {}),
    ...(image.representationHandle ? { representationHandle: image.representationHandle } : {}),
  };
}

function publicDocumentMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const {
    source: _source,
    fileId: _fileId,
    identity: _identity,
    fingerprint: _fingerprint,
    ...publicMetadata
  } = metadata;
  return publicMetadata;
}

function stripDocumentExcerptRuntimeFields(
  excerpt: NonNullable<DocumentReadResult['excerpt']>,
): NonNullable<DocumentReadResult['excerpt']> {
  return {
    ...(excerpt.text !== undefined ? { text: excerpt.text } : {}),
    ...(excerpt.imageData !== undefined ? { imageData: excerpt.imageData } : {}),
    contentKind: excerpt.contentKind,
    ...(excerpt.truncated !== undefined ? { truncated: excerpt.truncated } : {}),
  };
}
