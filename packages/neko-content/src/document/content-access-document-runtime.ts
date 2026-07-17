import {
  createDocumentEntryResourceRef,
  createResourceFingerprint,
  createResourceRef,
  isResourceRef,
  readResourceSourceLocalPath,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentDocumentSourceRef,
  type ContentFileSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type DocumentImageInfo,
  type DocumentReadResult,
  type DocumentSourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';
import { detectDocumentFormat, type IDocumentAccessService } from './document-access-service';

export type DocumentContentAccessMode = 'content' | 'manifest' | 'range' | 'next';

export interface DocumentContentAccessInput {
  readonly caller?: string;
  readonly source: ContentSourceRef;
  readonly mode?: DocumentContentAccessMode;
  readonly range?: Parameters<IDocumentAccessService['readRange']>[1];
  readonly cursor?: Parameters<IDocumentAccessService['readNext']>[0];
  readonly startBatch?: boolean;
  readonly includeManifest?: boolean;
  readonly includeImages?: boolean;
  readonly maxChars?: number;
  readonly maxImages?: number;
  readonly signal?: AbortSignal;
  readonly metadata?: Record<string, unknown>;
}

export interface DocumentContentAccessResult {
  readonly contentAccess: ContentAccessResult;
  readonly source?: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>;
  readonly text?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
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
}

export interface DocumentContentAccessRuntimeDeps {
  readonly contentAccess: {
    resolve(request: ContentAccessRequest): Promise<ContentAccessResult>;
  };
  readonly documentAccess: IDocumentAccessService;
  readonly resolveDocumentResourceScope: () => ResourceRef['scope'];
  readonly loadProviderAsset: (input: {
    readonly caller: 'read-document';
    readonly source: ContentSourceRef;
    readonly preferredTarget: 'bytes';
    readonly variant?: ResourceVariantRequest;
    readonly signal?: AbortSignal;
    readonly metadata?: Record<string, unknown>;
  }) => Promise<{
    readonly status: ContentAccessResult['status'];
    readonly diagnostics?: ContentAccessResult['diagnostics'];
  }>;
}

export class DocumentContentAccessRuntime {
  constructor(private readonly deps: DocumentContentAccessRuntimeDeps) {}

  async resolveDocumentContent(
    input: DocumentContentAccessInput,
  ): Promise<DocumentContentAccessResult> {
    const request = createDocumentLocalPathRequest(input.source, input);
    const sourcePath = readSourcePath(input.source);
    if (!sourcePath) {
      return { contentAccess: createFailedAccessResult(request, 'unsupported-source') };
    }

    const resolved = await this.deps.contentAccess.resolve(request);
    if (resolved.status !== 'ready' || !resolved.localPath) {
      return { contentAccess: resolved };
    }

    const mode = input.mode ?? 'content';
    const stableDocumentSource = createStableDocumentSource(input.source, resolved.localPath);
    const resolvedDocumentSource = { ...stableDocumentSource, filePath: resolved.localPath };
    const output =
      mode === 'manifest'
        ? await this.readDocumentManifest(resolvedDocumentSource, stableDocumentSource, input)
        : mode === 'range'
          ? await this.readDocumentRange(resolvedDocumentSource, stableDocumentSource, input)
          : mode === 'next'
            ? await this.readDocumentNext(input)
            : await this.readDocumentContent(resolvedDocumentSource, stableDocumentSource, input);
    const documentResourceRef = readDocumentArchiveRef(input.source);
    return {
      contentAccess: resolved,
      source: resolved.source ?? stableSource(input.source),
      ...output,
      ...(isResourceRef(input.source) ? { resourceRef: input.source } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
    };
  }

  private async readDocumentContent(
    source: DocumentSourceRef,
    stableDocumentSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<Omit<DocumentContentAccessResult, 'contentAccess' | 'source'>> {
    const content = await this.deps.documentAccess.readContent(source.filePath);
    const imageProjection = await this.projectDocumentImages(
      content.imageInfo,
      stableDocumentSource,
      input,
    );
    return {
      text: content.text,
      totalTextChars: content.text.length,
      returnedTextChars: content.text.length,
      truncated: false,
      ...(content.pageCount !== undefined ? { pageCount: content.pageCount } : {}),
      ...imageProjection,
      ...(content.metadata
        ? { metadata: { ...content.metadata, source: stableDocumentSource } }
        : {}),
    };
  }

  private async readDocumentManifest(
    source: DocumentSourceRef,
    stableDocumentSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<Omit<DocumentContentAccessResult, 'contentAccess' | 'source'>> {
    const manifest = await this.deps.documentAccess.getManifest(source);
    const stableManifest = withStableManifestSource(manifest, stableDocumentSource);
    return {
      manifest: stableManifest,
      ...(input.startBatch
        ? {
            cursor: withStableCursorSource(
              await this.deps.documentAccess.createBatchCursor(manifest.source, {
                maxChars: input.maxChars,
              }),
              stableDocumentSource,
            ),
          }
        : {}),
      metadata: stableManifest.metadata,
    };
  }

  private async readDocumentRange(
    source: DocumentSourceRef,
    stableDocumentSource: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<Omit<DocumentContentAccessResult, 'contentAccess' | 'source'>> {
    if (!input.range) {
      throw new Error('ReadDocument range mode requires a range.');
    }
    const result = await this.deps.documentAccess.readRange(source, {
      ...input.range,
      limit: {
        ...input.range.limit,
        ...(input.maxChars !== undefined ? { maxChars: input.maxChars } : {}),
        ...(input.maxImages !== undefined ? { maxImages: input.maxImages } : {}),
      },
    });
    return this.projectDocumentReadResult(
      withStableReadResultSource(result, stableDocumentSource),
      input,
    );
  }

  private async readDocumentNext(
    input: DocumentContentAccessInput,
  ): Promise<Omit<DocumentContentAccessResult, 'contentAccess' | 'source'>> {
    if (!input.cursor) {
      throw new Error('ReadDocument next mode requires a cursor.');
    }
    const resolvedSource = await this.resolveDocumentSourceForRuntime(input.cursor.source, input);
    const result = await this.deps.documentAccess.readNext({
      ...input.cursor,
      source: resolvedSource,
    });
    return this.projectDocumentReadResult(
      withStableReadResultSource(result, input.cursor.source),
      input,
    );
  }

  private async projectDocumentReadResult(
    result: Awaited<ReturnType<IDocumentAccessService['readRange']>>,
    input: DocumentContentAccessInput,
  ): Promise<Omit<DocumentContentAccessResult, 'contentAccess' | 'source'>> {
    const imageProjection = await this.projectDocumentImages(
      result.imageInfo,
      result.source,
      input,
    );
    return {
      text: result.text,
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
    source: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<Pick<DocumentContentAccessResult, 'imageInfo' | 'imageCount' | 'imagesTruncated'>> {
    if (input.includeImages === false || !imageInfo || imageInfo.length === 0) {
      return {};
    }
    const limit = input.maxImages ?? imageInfo.length;
    const visible = imageInfo.slice(0, limit);
    const projected = await Promise.all(
      visible.map(async (image) => this.projectDocumentImage(image, source, input)),
    );
    return {
      imageInfo: projected,
      imageCount: imageInfo.length,
      imagesTruncated: projected.length < imageInfo.length,
    };
  }

  private async projectDocumentImage(
    image: DocumentImageInfo,
    source: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentImageInfo> {
    const archiveRef = readDocumentImageArchiveRef(image, source);
    if (!archiveRef) {
      return stripDocumentImageRuntimeFields(image);
    }
    const resolvedArchiveRef = await this.resolveDocumentArchiveRefForRuntime(archiveRef, input);
    const managedRef = this.toManagedDocumentResourceRef(resolvedArchiveRef);
    const providerAsset = await this.deps.loadProviderAsset({
      caller: 'read-document',
      source: managedRef,
      preferredTarget: 'bytes',
      variant: createDocumentEntryVariant(),
      metadata: input.metadata,
      signal: input.signal,
    });
    if (providerAsset.status !== 'ready') {
      throw new Error(
        providerAsset.diagnostics?.find((diagnostic) => diagnostic.severity === 'error')?.message ??
          `Document image resource could not be resolved through content access: ${providerAsset.status}`,
      );
    }
    return {
      ...stripDocumentImageRuntimeFields(image),
      resourceRef: archiveRef,
    };
  }

  private async resolveDocumentArchiveRefForRuntime(
    ref: DocumentArchiveResourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentArchiveResourceRef> {
    const resolved = await this.resolveDocumentSourceForRuntime(ref.source, input);
    return {
      ...ref,
      source: resolved,
    };
  }

  private async resolveDocumentSourceForRuntime(
    source: DocumentSourceRef,
    input: DocumentContentAccessInput,
  ): Promise<DocumentSourceRef> {
    const request = createDocumentLocalPathRequest(
      createFileSourceFromDocumentSource(source),
      input,
    );
    const resolved = await this.deps.contentAccess.resolve(request);
    if (resolved.status !== 'ready' || !resolved.localPath) {
      throw new Error(
        resolved.diagnostics?.find((diagnostic) => diagnostic.severity === 'error')?.message ??
          `Document source could not be resolved through content access: ${resolved.status}`,
      );
    }
    return {
      ...source,
      filePath: resolved.localPath,
    };
  }

  private toManagedDocumentResourceRef(ref: DocumentArchiveResourceRef): ResourceRef {
    return createResourceRef({
      scope: this.deps.resolveDocumentResourceScope(),
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: ref.source,
      },
      ...(ref.entryPath || ref.locator
        ? {
            locator: {
              kind: 'document',
              ...(ref.entryPath ? { entryPath: ref.entryPath } : {}),
              ...(ref.locator ? { locator: ref.locator } : {}),
            },
          }
        : {}),
      fingerprint: createResourceFingerprint({
        strategy: ref.source.identity ? 'identity' : 'provider',
        value: ref.source.identity?.fileId ?? ref.source.fileId ?? ref.source.filePath,
        providerId: 'document-archive',
      }),
    });
  }
}

function createDocumentLocalPathRequest(
  source: ContentSourceRef,
  input: {
    readonly caller?: string;
    readonly signal?: AbortSignal;
    readonly metadata?: Record<string, unknown>;
  },
): ContentAccessRequest {
  return {
    ref: source,
    intent: 'agent-context',
    target: 'local-path',
    caller: input.caller ?? 'read-document',
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function createFailedAccessResult(
  request: ContentAccessRequest,
  status: ContentAccessResult['status'],
): ContentAccessResult {
  return {
    status,
    request,
    diagnostics: [
      {
        code: `document-content-access-${status}`,
        severity: 'error',
        message: 'Document content access requires a path-backed source ref.',
        intent: request.intent,
        target: request.target,
      },
    ],
    error: 'Document content access requires a path-backed source ref.',
  };
}

function stableSource(
  source: ContentSourceRef,
): Exclude<ContentSourceRef, { readonly kind: 'runtime' }> | undefined {
  return source.kind === 'runtime' ? source.source : source;
}

function readSourcePath(ref: ContentSourceRef): string | undefined {
  if (isResourceRef(ref)) {
    const locatorPath = ref.locator?.kind === 'file' ? ref.locator.path : undefined;
    return readResourceSourceLocalPath(ref.source) ?? locatorPath;
  }
  switch (ref.kind) {
    case 'document':
      return readResourceSourceLocalPath(ref.source);
    case 'asset':
      return ref.sourcePath ?? readOptionalResourceSourcePath(ref.resource);
    case 'file':
      return ref.path;
    case 'media-library':
      return ref.path;
    case 'generated-asset':
      return ref.path ?? readOptionalResourceSourcePath(ref.resource);
    case 'runtime':
      return ref.source ? readSourcePath(ref.source) : undefined;
    default:
      return assertNever(ref);
  }
}

function readOptionalResourceSourcePath(resource: ResourceRef | undefined): string | undefined {
  return resource ? readResourceSourceLocalPath(resource.source) : undefined;
}

function createDocumentEntryVariant(): ResourceVariantRequest {
  return {
    role: 'document-entry',
  };
}

function readDocumentArchiveRef(source: ContentSourceRef): DocumentArchiveResourceRef | undefined {
  if (isContentDocumentSourceRef(source)) {
    const documentSource = source.source.document;
    if (!documentSource) {
      return undefined;
    }
    const locator = source.locator?.kind === 'document' ? source.locator.locator : undefined;
    const entryPath =
      source.entryPath ??
      (source.locator?.kind === 'document' ? source.locator.entryPath : undefined);
    return {
      kind: 'document-entry',
      source: documentSource,
      ...(entryPath ? { entryPath } : {}),
      ...(locator ? { locator } : {}),
      versionPolicy: 'versioned-export',
    };
  }
  if (isResourceRef(source) && source.source.kind === 'document' && source.source.document) {
    const locator = source.locator?.kind === 'document' ? source.locator.locator : undefined;
    const entryPath = source.locator?.kind === 'document' ? source.locator.entryPath : undefined;
    return {
      kind: 'document-entry',
      source: source.source.document,
      ...(entryPath ? { entryPath } : {}),
      ...(locator ? { locator } : {}),
      versionPolicy: 'versioned-export',
    };
  }
  return undefined;
}

function createStableDocumentSource(
  source: ContentSourceRef,
  resolvedFilePath: string,
): DocumentSourceRef {
  const archiveRef = readDocumentArchiveRef(source);
  if (archiveRef) {
    return {
      ...archiveRef.source,
      format: archiveRef.source.format ?? detectDocumentFormat(resolvedFilePath),
    };
  }
  return {
    filePath: readSourcePath(source) ?? resolvedFilePath,
    format: detectDocumentFormat(resolvedFilePath),
  };
}

function createFileSourceFromDocumentSource(source: DocumentSourceRef): ContentFileSourceRef {
  return {
    kind: 'file',
    path: source.filePath,
    metadata: {
      mimeType: source.format,
      enginePurpose: 'preview',
    },
  };
}

function withStableManifestSource(
  manifest: Awaited<ReturnType<IDocumentAccessService['getManifest']>>,
  source: DocumentSourceRef,
): Awaited<ReturnType<IDocumentAccessService['getManifest']>> {
  return {
    ...manifest,
    source,
    metadata: manifest.metadata,
  };
}

function withStableCursorSource(
  cursor: NonNullable<DocumentReadResult['cursor']>,
  source: DocumentSourceRef,
): NonNullable<DocumentReadResult['cursor']> {
  return {
    ...cursor,
    source,
  };
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
    ...(result.imageInfo
      ? {
          imageInfo: result.imageInfo.map((image) => withStableDocumentImageSource(image, source)),
        }
      : {}),
    ...(result.excerpt
      ? {
          excerpt: {
            ...result.excerpt,
            ...(result.excerpt.imageInfo
              ? {
                  imageInfo: result.excerpt.imageInfo.map((image) =>
                    withStableDocumentImageSource(image, source),
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

function withStableDocumentImageSource(
  image: DocumentImageInfo,
  source: DocumentSourceRef,
): DocumentImageInfo {
  return {
    ...image,
    ...(image.resourceRef ? { resourceRef: { ...image.resourceRef, source } } : {}),
  };
}

function readDocumentImageArchiveRef(
  image: DocumentImageInfo,
  source: DocumentSourceRef,
): DocumentArchiveResourceRef | undefined {
  const refSource = image.resourceRef?.source ?? source;
  return createDocumentEntryResourceRef({
    source: refSource,
    entryPath: image.entryPath ?? image.resourceRef?.entryPath,
    locator: image.locator ?? image.resourceRef?.locator,
    versionPolicy: image.resourceRef?.versionPolicy,
  });
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
    ...(image.resourceRef ? { resourceRef: image.resourceRef } : {}),
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

function isContentDocumentSourceRef(source: ContentSourceRef): source is ContentDocumentSourceRef {
  return !isResourceRef(source) && source.kind === 'document';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled content source ref kind: ${JSON.stringify(value)}`);
}
