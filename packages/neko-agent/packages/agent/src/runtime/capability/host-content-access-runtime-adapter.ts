import {
  DocumentContentAccessRuntime,
  probeImageMetadata,
  type IDocumentAccessService,
} from '@neko/content/document';
import {
  isResourceRef,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessTarget,
  type ContentSourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';
import type { ContentAccessService } from '@neko/shared/content-access';
import {
  createAgentContentAccessDiagnostic,
  createAgentContentAccessFailureResult,
  toAgentContentAccessDiagnostics,
  type AgentContentAccessCaller,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from './agent-content-access-runtime';

export interface CreateHostAgentContentAccessRuntimeOptions {
  readonly contentAccess: ContentAccessService;
  readonly documentAccess: IDocumentAccessService;
  readonly resolveDocumentResourceScope: () => ResourceRef['scope'];
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
      contentAccess: services.contentAccess,
      documentAccess: services.documentAccess,
      resolveDocumentResourceScope: services.resolveDocumentResourceScope,
      loadProviderAsset: (input) => this.loadProviderAsset(input),
    });
  }

  resolve(input: AgentContentAccessRuntimeRequest): Promise<ContentAccessResult> {
    if (
      input.request.target === 'bytes' &&
      input.request.ref.kind !== 'runtime' &&
      !isResourceRef(input.request.ref)
    ) {
      return this.loadProviderAsset({
        caller: input.caller,
        source: input.request.ref,
        preferredTarget: 'bytes',
        signal: input.request.signal,
        metadata: input.request.metadata,
      }).then((asset) => ({
        status: asset.status,
        request: input.request,
        source: asset.source,
        bytes: asset.bytes,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        diagnostics: asset.diagnostics,
        error: asset.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message,
      }));
    }
    return this.services.contentAccess.resolve({
      ...input.request,
      caller: input.request.caller ?? input.caller,
    });
  }

  async resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult> {
    const caller = input.caller ?? 'read-image';
    const request = createRequest(input.source, {
      caller,
      intent: input.intent ?? 'verify',
      target: 'bytes',
      variant: input.variant,
      signal: input.signal,
      metadata: input.metadata,
    });
    const providerAsset = await this.loadProviderAsset({
      ...input,
      caller,
      preferredTarget: 'bytes',
    });
    const diagnostics = [...providerAsset.diagnostics];
    const metadata =
      providerAsset.bytes !== undefined ? probeImageMetadata(providerAsset.bytes) : undefined;
    if (providerAsset.status === 'ready' && !metadata) {
      diagnostics.push(
        createAgentContentAccessDiagnostic({
          code: 'unsupported-source',
          message: 'Unsupported or unreadable image bytes.',
          caller,
          request,
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
      contentAccess: providerAsset.contentAccess,
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
    const caller = input.caller ?? 'read-document';
    try {
      const result = await this.documentRuntime.resolveDocumentContent({
        ...input,
        caller,
      });
      return {
        ...operationFromContentAccess(result.contentAccess, caller),
        status: result.contentAccess.status,
        ...(result.source ? { source: result.source } : {}),
        ...(result.documentResourceRef ? { documentResourceRef: result.documentResourceRef } : {}),
        ...(result.resourceRef ? { resourceRef: result.resourceRef } : {}),
        ...(result.text !== undefined ? { text: result.text } : {}),
        ...(result.manifest ? { manifest: result.manifest } : {}),
        ...(result.range ? { range: result.range } : {}),
        ...(result.locator ? { locator: result.locator } : {}),
        ...(result.excerpt ? { excerpt: result.excerpt } : {}),
        ...(result.cursor ? { cursor: result.cursor } : {}),
        ...(result.imageInfo ? { imageInfo: result.imageInfo } : {}),
        ...(result.imageCount !== undefined ? { imageCount: result.imageCount } : {}),
        ...(result.imagesTruncated !== undefined
          ? { imagesTruncated: result.imagesTruncated }
          : {}),
        ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
        ...(result.totalTextChars !== undefined ? { totalTextChars: result.totalTextChars } : {}),
        ...(result.returnedTextChars !== undefined
          ? { returnedTextChars: result.returnedTextChars }
          : {}),
        ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
      };
    } catch (error) {
      const request = createRequest(input.source, {
        caller,
        intent: input.intent ?? 'agent-context',
        target: 'local-path',
        signal: input.signal,
        metadata: input.metadata,
      });
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'unsupported-source',
            message: error instanceof Error ? error.message : String(error),
            status: 'failed',
          }),
          caller,
        ),
      };
    }
  }

  async loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    const caller = input.caller ?? 'perception-asset-loader';
    if (input.source.kind === 'runtime') {
      const request = createRequest(input.source, {
        caller,
        intent: 'agent-context',
        target: input.preferredTarget ?? 'bytes',
        signal: input.signal,
        metadata: input.metadata,
      });
      return {
        ...operationFromContentAccess(
          createAgentContentAccessFailureResult({
            request,
            caller,
            code: 'runtime-handle-rejected',
            message: 'Runtime handles cannot be used as durable Agent content identity.',
            status: 'unsupported-source',
          }),
          caller,
        ),
      };
    }

    const request = createRequest(input.source, {
      caller,
      intent: 'agent-context',
      target: input.preferredTarget ?? 'bytes',
      variant: input.variant,
      materialization: isResourceRef(input.source) ? 'if-missing' : undefined,
      signal: input.signal,
      metadata: input.metadata,
    });
    const result = await this.services.contentAccess.resolve(request);
    return {
      ...operationFromContentAccess(result, caller),
      bytes: result.bytes,
      uri: result.localPath ?? result.uri,
      engineSourceToken: result.engineSource?.token,
      mimeType: result.mimeType ?? input.mimeTypeHint,
      sizeBytes: result.sizeBytes ?? result.bytes?.byteLength,
    };
  }

  async projectResource(
    input: AgentResourceProjectionInput,
  ): Promise<AgentResourceProjectionResult> {
    const caller = input.caller ?? 'message-resource-projection';
    const request = createRequest(input.source, {
      caller,
      intent: 'interactive-preview',
      target: input.target,
      variant: input.variant,
      signal: input.signal,
      metadata: input.metadata,
    });
    const result = await this.services.contentAccess.resolve(request);
    return {
      ...operationFromContentAccess(result, caller),
      target: input.target,
      uri: result.uri ?? result.localPath ?? result.runtimeStream?.url,
      runtimeOnly: true,
    };
  }
}

function createRequest(
  ref: ContentSourceRef,
  options: {
    readonly caller: AgentContentAccessCaller;
    readonly intent: ContentAccessRequest['intent'];
    readonly target: ContentAccessTarget;
    readonly variant?: ResourceVariantRequest;
    readonly materialization?: ContentAccessRequest['materialization'];
    readonly signal?: AbortSignal;
    readonly metadata?: Record<string, unknown>;
  },
): ContentAccessRequest {
  return {
    ref,
    intent: options.intent,
    target: options.target,
    caller: options.caller,
    ...(options.variant ? { variant: options.variant, role: options.variant.role } : {}),
    ...(options.materialization ? { materialization: options.materialization } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

function operationFromContentAccess(
  result: ContentAccessResult,
  caller: AgentContentAccessCaller,
): {
  readonly status: ContentAccessResult['status'];
  readonly source?: Exclude<ContentSourceRef, { readonly kind: 'runtime' }>;
  readonly contentAccess: ContentAccessResult;
  readonly diagnostics: readonly AgentContentAccessDiagnostic[];
  readonly metadata?: Record<string, unknown>;
} {
  const diagnostics = toAgentContentAccessDiagnostics(result.diagnostics, caller);
  return {
    status: result.status,
    ...(result.source ? { source: result.source } : {}),
    contentAccess: result,
    diagnostics,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}
