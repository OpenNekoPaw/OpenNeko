import {
  type ContentIoDiagnostic,
  type ContentReadService,
  type DocumentEntryContentLocator,
  type DocumentFormat,
  type DocumentImageInfo,
  type DocumentReadResult,
  type DocumentSourceRef,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import { detectDocumentFormat, type IDocumentAccessService } from './document-access-service';

export type DocumentContentAccessMode = 'content' | 'manifest' | 'range' | 'next';

export interface DocumentContentAccessInput {
  readonly source: WorkspaceFileContentLocator;
  readonly format?: DocumentFormat;
  readonly mode?: DocumentContentAccessMode;
  readonly range?: Parameters<IDocumentAccessService['readRange']>[1];
  readonly cursor?: Parameters<IDocumentAccessService['readNext']>[0];
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
      readonly documentSource: DocumentSourceRef;
      readonly text?: string;
      readonly manifest?: Awaited<ReturnType<IDocumentAccessService['getManifest']>>;
      readonly range?: DocumentReadResult['range'];
      readonly locator?: DocumentReadResult['locator'];
      readonly excerpt?: DocumentReadResult['excerpt'];
      readonly cursor?: NonNullable<DocumentReadResult['cursor']>;
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
    const sourceStat = await this.deps.contentRead.stat(input.source, {
      ...(input.source.fingerprint ? { expectedFingerprint: input.source.fingerprint } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (sourceStat.status === 'unavailable') {
      return { status: 'unavailable', source: input.source, diagnostic: sourceStat.diagnostic };
    }

    const hostFilePath = await this.deps.resolveHostFilePath(input.source);
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

    const stableDocumentSource = createStableDocumentSource(input, sourceStat.fingerprint.value);
    const runtimeDocumentSource = { ...stableDocumentSource, filePath: hostFilePath };
    const mode = input.mode ?? 'content';
    const output =
      mode === 'manifest'
        ? await this.readDocumentManifest(runtimeDocumentSource, stableDocumentSource, input)
        : mode === 'range'
          ? await this.readDocumentRange(runtimeDocumentSource, stableDocumentSource, input)
          : mode === 'next'
            ? await this.readDocumentNext(stableDocumentSource, input)
            : await this.readDocumentContent(runtimeDocumentSource, stableDocumentSource, input);

    return {
      status: 'ready',
      source: input.source,
      documentSource: stableDocumentSource,
      ...output,
    };
  }

  private async readDocumentContent(
    source: DocumentSourceRef,
    stableSource: DocumentSourceRef,
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
      ...(content.metadata ? { metadata: { ...content.metadata, source: stableSource } } : {}),
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
    if (!input.range) throw new Error('ReadDocument range mode requires a range.');
    const result = await this.deps.documentAccess.readRange(source, {
      ...input.range,
      limit: {
        ...input.range.limit,
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
    if (!input.cursor) throw new Error('ReadDocument next mode requires a cursor.');
    const hostFilePath = await this.deps.resolveHostFilePath(input.source);
    if (!hostFilePath) throw new Error('Document source is unavailable.');
    const result = await this.deps.documentAccess.readNext({
      ...input.cursor,
      source: { ...input.cursor.source, filePath: hostFilePath },
    });
    return this.projectDocumentReadResult(withStableReadResultSource(result, stableSource), input);
  }

  private async projectDocumentReadResult(
    result: Awaited<ReturnType<IDocumentAccessService['readRange']>>,
    input: DocumentContentAccessInput,
  ): Promise<DocumentReadyOutput> {
    const imageProjection = await this.projectDocumentImages(result.imageInfo, input);
    return {
      ...(result.text !== undefined ? { text: result.text } : {}),
      ...(result.range ? { range: result.range } : {}),
      ...(result.locator ? { locator: result.locator } : {}),
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
      ...(result.metadata ? { metadata: result.metadata } : {}),
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
        const entryPath = image.entryPath ?? image.resourceRef?.entryPath;
        if (!entryPath) return stripDocumentImageRuntimeFields(image);
        const contentLocator: DocumentEntryContentLocator = {
          kind: 'document-entry',
          source: input.source,
          entryPath,
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
type DocumentReadyOutput = Omit<DocumentReadyResult, 'status' | 'source' | 'documentSource'>;

function createStableDocumentSource(
  input: DocumentContentAccessInput,
  fingerprint: string,
): DocumentSourceRef {
  return {
    filePath: input.source.path,
    format: input.format ?? detectDocumentFormat(input.source.path),
    fileId: fingerprint,
    identity: { fileId: fingerprint },
  };
}

function withStableManifestSource(
  manifest: Awaited<ReturnType<IDocumentAccessService['getManifest']>>,
  source: DocumentSourceRef,
): Awaited<ReturnType<IDocumentAccessService['getManifest']>> {
  return { ...manifest, source, metadata: manifest.metadata };
}

function withStableCursorSource(
  cursor: NonNullable<DocumentReadResult['cursor']>,
  source: DocumentSourceRef,
): NonNullable<DocumentReadResult['cursor']> {
  return { ...cursor, source };
}

function withStableReadResultSource(
  result: Awaited<ReturnType<IDocumentAccessService['readRange']>>,
  source: DocumentSourceRef,
): Awaited<ReturnType<IDocumentAccessService['readRange']>> {
  return {
    ...result,
    source,
    ...(result.manifest ? { manifest: withStableManifestSource(result.manifest, source) } : {}),
    ...(result.cursor ? { cursor: withStableCursorSource(result.cursor, source) } : {}),
  };
}

function stripDocumentImageRuntimeFields(image: DocumentImageInfo): DocumentImageInfo {
  return {
    ...(image.alias ? { alias: image.alias } : {}),
    ...(image.aliasScope ? { aliasScope: image.aliasScope } : {}),
    ...(image.sourceDocumentId ? { sourceDocumentId: image.sourceDocumentId } : {}),
    ...(image.entryPath ? { entryPath: image.entryPath } : {}),
    ...(image.portableForTransfer !== undefined
      ? { portableForTransfer: image.portableForTransfer }
      : {}),
    ...(image.nonPortableReason ? { nonPortableReason: image.nonPortableReason } : {}),
    ...(image.width !== undefined ? { width: image.width } : {}),
    ...(image.height !== undefined ? { height: image.height } : {}),
    ...(image.mimeType ? { mimeType: image.mimeType } : {}),
    ...(image.byteSize !== undefined ? { byteSize: image.byteSize } : {}),
    ...(image.locator ? { locator: image.locator } : {}),
    ...(image.representationLocator ? { representationLocator: image.representationLocator } : {}),
  };
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
