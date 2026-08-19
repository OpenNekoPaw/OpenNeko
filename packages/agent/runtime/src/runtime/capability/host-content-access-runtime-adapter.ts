import { DocumentContentAccessRuntime, type IDocumentAccessService } from '@neko/content/document';
import {
  type ContentReadService,
  type ContentLocator,
  type ContentRepresentationHandle,
  type ContentRepresentationService,
  isWorkspaceFileContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  createAgentContentAccessDiagnostic,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessRuntime,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentProviderAssetResult,
} from './agent-content-access-runtime';

export interface CreateHostAgentContentAccessRuntimeOptions {
  readonly contentRead: ContentReadService;
  readonly documentAccess: IDocumentAccessService;
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

  async resolveDocumentContent(
    input: AgentDocumentContentInput,
  ): Promise<AgentDocumentContentResult> {
    if (!isWorkspaceFileContentLocator(input.source)) {
      return documentFailure(input, 'Document source must be a workspace-file locator.');
    }
    const source = input.source;
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
        source: result.source,
        contentLocator: result.source,
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
    readonly handle: ContentRepresentationHandle;
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
    const loaded = await service.readRepresentation(input.handle, { maxBytes: input.maxBytes });
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
    readonly imageInfo?: readonly import('@neko/content').DocumentImageInfo[];
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
            contentLocator: source,
            representationHandle: represented.handle,
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
