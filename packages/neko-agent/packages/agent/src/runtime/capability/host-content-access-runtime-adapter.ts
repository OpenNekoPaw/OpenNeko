import {
  DocumentContentAccessRuntime,
  probeImageMetadata,
  type IDocumentAccessService,
} from '@neko/content/document';
import {
  isResourceRef,
  readResourceSourceLocalPath,
  type ContentReadService,
  type ContentLocator,
  type ContentRepresentationLocator,
  type ContentRepresentationService,
  type ContentSourceRef,
  type GeneratedOutputContentLocator,
  type ResourceRef,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import {
  createAgentContentAccessDiagnostic,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessRuntime,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
} from './agent-content-access-runtime';

const DEFAULT_AGENT_CONTENT_READ_MAX_BYTES = 20 * 1024 * 1024;

export interface CreateHostAgentContentAccessRuntimeOptions {
  readonly contentRead: ContentReadService;
  readonly documentAccess: IDocumentAccessService;
  readonly resolveWorkspaceFileLocator: (path: string) => WorkspaceFileContentLocator | undefined;
  readonly resolveGeneratedOutputLocator?: (
    ref: ResourceRef,
  ) => Promise<GeneratedOutputContentLocator | undefined>;
  readonly resolveDocumentHostFilePath: (
    source: WorkspaceFileContentLocator,
  ) => Promise<string | undefined> | string | undefined;
  readonly contentRepresentation?: ContentRepresentationService;
}

export function createHostAgentContentAccessRuntime(
  options: CreateHostAgentContentAccessRuntimeOptions,
): AgentContentAccessRuntime {
  return new HostAgentContentAccessRuntime(options);
}

class HostAgentContentAccessRuntime implements AgentContentAccessRuntime {
  private readonly documentRuntime: DocumentContentAccessRuntime;

  constructor(private readonly services: CreateHostAgentContentAccessRuntimeOptions) {
    this.documentRuntime = new DocumentContentAccessRuntime({
      contentRead: services.contentRead,
      documentAccess: services.documentAccess,
      resolveHostFilePath: services.resolveDocumentHostFilePath,
    });
  }

  async resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult> {
    const providerAsset = await this.loadProviderAsset(input);
    const diagnostics = [...providerAsset.diagnostics];
    const metadata =
      providerAsset.bytes !== undefined ? probeImageMetadata(providerAsset.bytes) : undefined;
    if (providerAsset.status === 'ready' && !metadata) {
      diagnostics.push(
        createAgentContentAccessDiagnostic({
          code: 'unsupported-source',
          message: 'Unsupported or unreadable image bytes.',
        }),
      );
    }
    return {
      status:
        metadata !== undefined
          ? 'ready'
          : providerAsset.status === 'ready'
            ? 'unsupported-source'
            : providerAsset.status,
      source: providerAsset.source,
      diagnostics,
      ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
      ...(metadata?.width !== undefined ? { width: metadata.width } : {}),
      ...(metadata?.height !== undefined ? { height: metadata.height } : {}),
      sizeBytes: metadata?.byteSize ?? providerAsset.sizeBytes,
      ...(isResourceRef(input.source) ? { resourceRef: input.source } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  async resolveDocumentContent(
    input: AgentDocumentContentInput,
  ): Promise<AgentDocumentContentResult> {
    const sourcePath = readStableSourcePath(input.source);
    const source = sourcePath ? this.services.resolveWorkspaceFileLocator(sourcePath) : undefined;
    if (!source) {
      return documentFailure(input, 'Document source must be a workspace-file locator.');
    }
    try {
      const result = await this.documentRuntime.resolveDocumentContent({
        source,
        mode: input.mode,
        range: input.range,
        cursor: input.cursor,
        startBatch: input.startBatch,
        includeManifest: input.includeManifest,
        includeImages: input.includeImages,
        maxChars: input.maxChars,
        maxImages: input.maxImages,
        signal: input.signal,
      });
      if (result.status === 'unavailable') {
        return documentFailure(input, `Document content is unavailable: ${result.diagnostic.code}`);
      }
      const computedImages = await this.projectComputedDocumentImages(input, result);
      const imageInfo = computedImages.imageInfo ?? result.imageInfo;
      const imageCount = computedImages.imageCount ?? result.imageCount;
      const imagesTruncated = computedImages.imagesTruncated ?? result.imagesTruncated;
      return {
        status: 'ready',
        source: { kind: 'file', path: result.source.path },
        diagnostics: computedImages.diagnostics,
        ...(result.text !== undefined ? { text: result.text } : {}),
        ...(result.manifest ? { manifest: result.manifest } : {}),
        ...(result.range ? { range: result.range } : {}),
        ...(result.locator ? { locator: result.locator } : {}),
        ...(result.excerpt ? { excerpt: result.excerpt } : {}),
        ...(result.cursor ? { cursor: result.cursor } : {}),
        ...(imageInfo ? { imageInfo } : {}),
        ...(imageCount !== undefined ? { imageCount } : {}),
        ...(imagesTruncated !== undefined ? { imagesTruncated } : {}),
        ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
        ...(result.totalTextChars !== undefined ? { totalTextChars: result.totalTextChars } : {}),
        ...(result.returnedTextChars !== undefined
          ? { returnedTextChars: result.returnedTextChars }
          : {}),
        ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
      };
    } catch (error) {
      void error;
      return documentFailure(input, 'Document content could not be read.');
    }
  }

  async loadRepresentationAsset(input: {
    readonly locator: ContentRepresentationLocator;
    readonly maxBytes: number;
  }): Promise<AgentProviderAssetResult> {
    const service = this.services.contentRepresentation;
    if (!service) {
      return {
        status: 'failed',
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: 'agent-content-access-unavailable',
            message: 'Content representation access is unavailable.',
          }),
        ],
      };
    }
    const loaded = await service.readRepresentation(input.locator, { maxBytes: input.maxBytes });
    if (loaded.status !== 'ready') {
      return {
        status: 'failed',
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: loaded.diagnostic.code,
            message: loaded.diagnostic.message,
          }),
        ],
      };
    }
    return {
      status: 'ready',
      diagnostics: [],
      bytes: loaded.bytes,
      ...(loaded.metadata.mimeType ? { mimeType: loaded.metadata.mimeType } : {}),
      sizeBytes: loaded.totalByteLength,
    };
  }

  async loadContentAsset(input: {
    readonly locator: ContentLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentProviderAssetResult> {
    const loaded = await this.services.contentRead.read(input.locator, {
      maxBytes: input.maxBytes,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (loaded.status === 'unavailable') {
      return {
        status: 'failed',
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: loaded.diagnostic.code,
            message: `Content bytes are unavailable: ${loaded.diagnostic.code}`,
          }),
        ],
      };
    }
    return {
      status: 'ready',
      diagnostics: [],
      bytes: loaded.bytes,
      ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
      sizeBytes: loaded.totalByteLength ?? loaded.bytes.byteLength,
    };
  }

  private async projectComputedDocumentImages(
    input: AgentDocumentContentInput,
    result: Extract<
      Awaited<ReturnType<DocumentContentAccessRuntime['resolveDocumentContent']>>,
      { status: 'ready' }
    >,
  ): Promise<{
    readonly imageInfo?: readonly import('@neko/shared').DocumentImageInfo[];
    readonly imageCount?: number;
    readonly imagesTruncated?: boolean;
    readonly diagnostics: readonly AgentContentAccessDiagnostic[];
  }> {
    if (
      input.includeImages === false ||
      result.imageInfo?.length ||
      !result.pageCount ||
      !this.services.contentRepresentation
    ) {
      return { diagnostics: [] };
    }
    try {
      const source: ContentLocator = result.source;
      const contentRepresentation = this.services.contentRepresentation;
      if (!contentRepresentation) return { diagnostics: [] };
      const count = Math.min(result.pageCount, input.maxImages ?? 4);
      const imageInfo = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const page = index + 1;
          const represented = await contentRepresentation.getRepresentation({
            source,
            spec: { kind: 'raster-page', page, format: 'png' },
            ...(input.signal ? { signal: input.signal } : {}),
          });
          if (represented.status !== 'ready') throw new Error(represented.diagnostic.message);
          return {
            label: `page ${page}`,
            locator: { kind: 'page' as const, pageNumber: page, pageIndex: index },
            mimeType: represented.metadata.mimeType ?? 'image/png',
            ...(represented.metadata.width !== undefined
              ? { width: represented.metadata.width }
              : {}),
            ...(represented.metadata.height !== undefined
              ? { height: represented.metadata.height }
              : {}),
            ...(represented.metadata.byteLength !== undefined
              ? { byteSize: represented.metadata.byteLength }
              : {}),
            representationLocator: represented.locator,
          };
        }),
      );
      return {
        imageInfo,
        imageCount: result.pageCount,
        imagesTruncated: count < result.pageCount,
        diagnostics: [],
      };
    } catch {
      return {
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: 'document-representation-unavailable',
            severity: 'warning',
            message: 'Document page representations are unavailable.',
          }),
        ],
      };
    }
  }

  async loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    if (input.source.kind === 'runtime') {
      return {
        status: 'unsupported-source',
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: 'runtime-handle-rejected',
            message: 'Runtime handles cannot be used as durable Agent content identity.',
          }),
        ],
      };
    }

    const locator = await this.resolveContentLocator(input.source);
    if (!locator) {
      return {
        status: 'unsupported-source',
        diagnostics: [
          createAgentContentAccessDiagnostic({
            code: 'unsupported-source',
            message: 'Agent content source does not resolve to a stable content locator.',
          }),
        ],
      };
    }
    const loaded = await this.loadContentAsset({
      locator,
      maxBytes: DEFAULT_AGENT_CONTENT_READ_MAX_BYTES,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    return {
      ...loaded,
      ...(input.source.kind === 'runtime' ? {} : { source: input.source }),
      diagnostics: loaded.diagnostics,
      mimeType: loaded.mimeType ?? input.mimeTypeHint,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  private async resolveContentLocator(
    source: ContentSourceRef,
  ): Promise<ContentLocator | undefined> {
    if (source.kind === 'document' && source.entryPath) {
      const sourcePath = source.source.document?.filePath ?? source.source.filePath;
      const workspaceSource = sourcePath
        ? this.services.resolveWorkspaceFileLocator(sourcePath)
        : undefined;
      return workspaceSource
        ? {
            kind: 'document-entry',
            source: workspaceSource,
            entryPath: source.entryPath,
          }
        : undefined;
    }
    if (isResourceRef(source)) {
      if (source.source.kind === 'generated-asset') {
        return this.services.resolveGeneratedOutputLocator?.(source);
      }
      if (source.locator?.kind === 'document') {
        const sourcePath =
          readResourceSourceLocalPath(source.source) ??
          (source.source.kind === 'document'
            ? (source.source.document?.filePath ?? source.source.filePath)
            : undefined);
        const workspaceSource = sourcePath
          ? this.services.resolveWorkspaceFileLocator(sourcePath)
          : undefined;
        return workspaceSource
          ? {
              kind: 'document-entry',
              source: workspaceSource,
              entryPath: source.locator.entryPath,
            }
          : undefined;
      }
    }
    const sourcePath = readStableSourcePath(source);
    return sourcePath ? this.services.resolveWorkspaceFileLocator(sourcePath) : undefined;
  }
}

function readStableSourcePath(source: ContentSourceRef): string | undefined {
  if (isResourceRef(source)) {
    return source.locator?.kind === 'file'
      ? source.locator.path
      : readResourceSourceLocalPath(source.source);
  }
  switch (source.kind) {
    case 'file':
      return source.path;
    case 'document':
      return source.source.document?.filePath;
    case 'runtime':
      return source.source ? readStableSourcePath(source.source) : undefined;
    default:
      return undefined;
  }
}

function documentFailure(
  input: AgentDocumentContentInput,
  message: string,
): AgentDocumentContentResult {
  return {
    status: 'failed',
    diagnostics: [
      createAgentContentAccessDiagnostic({
        code: 'unsupported-source',
        message,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    ],
  };
}
