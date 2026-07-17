import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import {
  PathResolver,
  resolveWorkspaceMediaPathAsync,
  type WorkspaceMediaPathContext,
  type WorkspaceMediaPathDiagnostic,
  type WorkspaceMediaPathResolution,
} from '../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  isOfflineContentAccessIntent,
  isPreviewLikeContentAccessIntent,
  isResourceRef,
  readResourceSourceLocalPath,
  type ContentAccessProvider,
  type ContentAccessProviderRequest,
  type ContentAccessDiagnostic,
  type ContentAccessRequest,
  type ContentAccessResult,
  type ContentAccessStatus,
  type ContentDocumentSourceRef,
  type ContentEngineSource,
  type ContentGeneratedAssetSourceRef,
  type ContentIngestProvider,
  type ContentIngestProviderRequest,
  type ContentIngestRequest,
  type ContentIngestResult,
  type ContentRuntimeStream,
  type ContentSourceRef,
  type ContentStableSourceRef,
  type ResourceCacheStatus,
  type ResourceRef,
  type ResourceVariantRequest,
} from '../../types';
import { resolveWorkspaceGeneratedAssetRelativeDirectory } from '../../types/generated-asset';
import type { LocalResourceAccessService } from './local-resource-access';
import type {
  GeneratedAssetResourceResolverResult,
  GeneratedAssetDerivativeResourceCacheProviderOptions,
} from './resource-cache-providers';
import { readStringMetadata } from './metadata';
import type { ResourceCacheService } from './resource-cache-service';

export interface ContentAccessFileOps {
  readFile(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, content: Uint8Array): Promise<void>;
  copyFile(sourcePath: string, targetPath: string): Promise<void>;
  mkdir(dirPath: string, options: { recursive: boolean }): Promise<void>;
}

export interface ContentAccessWebviewResolver {
  (request: ContentAccessRequest): vscode.Webview | undefined;
}

export interface ResourceCacheContentAccessProviderOptions {
  readonly id?: string;
  readonly resourceCache: ResourceCacheService;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly webviewResolver?: ContentAccessWebviewResolver;
}

export interface GeneratedAssetSourceContentAccessProviderOptions {
  readonly id?: string;
  readonly resolveAsset: NonNullable<
    GeneratedAssetDerivativeResourceCacheProviderOptions['resolveAsset']
  >;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: ContentAccessWebviewResolver;
}

export interface SourceFileContentAccessProviderOptions {
  readonly id?: string;
  readonly projectRoot: string;
  readonly mediaPathContext: WorkspaceMediaPathContext;
  readonly fileExists: ContentAccessFileExists;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: ContentAccessWebviewResolver;
  readonly engineSourceResolver?: (input: {
    readonly request: ContentAccessRequest;
    readonly path: string;
  }) => Promise<ContentEngineSource>;
  readonly bytesResolver?: (input: {
    readonly request: ContentAccessRequest;
    readonly path: string;
  }) => Promise<{
    readonly bytes: Uint8Array;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  }>;
}

export interface DocumentEntryContentAccessProviderOptions {
  readonly id?: string;
  readonly projectRoot: string;
  readonly mediaPathContext: WorkspaceMediaPathContext;
  readonly fileExists: ContentAccessFileExists;
  readonly resourceCache?: ResourceCacheService;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly webviewResolver?: ContentAccessWebviewResolver;
  readonly entryReader?: (input: {
    readonly request: ContentAccessRequest;
    readonly sourcePath: string;
    readonly entryPath?: string;
  }) => Promise<Uint8Array>;
}

export interface VideoProxyContentAccessProviderOptions {
  readonly id?: string;
  readonly proxyResolver: (request: ContentAccessRequest) => Promise<{
    readonly localPath?: string;
    readonly runtimeStream?: ContentRuntimeStream;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  }>;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: ContentAccessWebviewResolver;
}

export interface PreviewVariantContentAccessProviderOptions {
  readonly id?: string;
  readonly variantResolver: (request: ContentAccessRequest) => Promise<{
    readonly uri?: string;
    readonly localPath?: string;
    readonly bytes?: Uint8Array;
    readonly mimeType?: string;
    readonly width?: number;
    readonly height?: number;
    readonly sizeBytes?: number;
  }>;
}

export interface ContentIngestFileProviderOptions {
  readonly id?: string;
  readonly pathResolver?: PathResolver;
  readonly projectRoot: string;
  readonly fileOps?: ContentAccessFileOps;
}

export interface ContentAccessFileExists {
  (filePath: string): boolean | Promise<boolean>;
}

export interface CacheArtifactContentIngestProviderOptions {
  readonly id?: string;
  readonly resourceCache: ResourceCacheService;
}

const nodeFileOps: ContentAccessFileOps = {
  readFile: async (filePath) => fs.readFile(filePath),
  writeFile: async (filePath, content) => fs.writeFile(filePath, content),
  copyFile: async (sourcePath, targetPath) => fs.copyFile(sourcePath, targetPath),
  mkdir: async (dirPath, options) => {
    await fs.mkdir(dirPath, options);
  },
};

export class GeneratedAssetSourceContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly resolveAsset: GeneratedAssetSourceContentAccessProviderOptions['resolveAsset'];
  private readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
  private readonly localResourceAccess?: LocalResourceAccessService;
  private readonly webviewResolver?: ContentAccessWebviewResolver;

  constructor(options: GeneratedAssetSourceContentAccessProviderOptions) {
    this.id = options.id ?? 'generated-asset-source-content-access';
    this.resolveAsset = options.resolveAsset;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.localResourceAccess = options.localResourceAccess;
    this.webviewResolver = options.webviewResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    const role = request.variant?.role ?? request.role ?? 'preview';
    return (
      isGeneratedAssetResourceRef(request.ref) &&
      (request.intent === 'interactive-preview' || request.intent === 'agent-context') &&
      (role === 'preview' || role === 'source') &&
      (request.target === 'bytes' ||
        request.target === 'local-path' ||
        request.target === 'webview-uri')
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    if (!isGeneratedAssetResourceRef(request.ref)) {
      return unsupported(request, this.id, 'Generated source provider requires a generated asset.');
    }
    const resolved = await this.resolveAsset(request.ref);
    if (!resolved?.path) {
      return missingSource(request, this.id, 'Generated asset source could not be resolved.');
    }
    return this.resolveTarget(request, request.ref, resolved);
  }

  private async resolveTarget(
    request: ContentAccessRequest,
    source: ResourceRef,
    resolved: GeneratedAssetResourceResolverResult,
  ): Promise<ContentAccessResult> {
    const base = {
      status: 'ready' as const,
      request,
      providerId: this.id,
      source,
      role: request.variant?.role ?? request.role ?? 'preview',
      localPath: resolved.path,
      ...(resolved.mimeType ? { mimeType: resolved.mimeType } : {}),
      ...(resolved.width !== undefined ? { width: resolved.width } : {}),
      ...(resolved.height !== undefined ? { height: resolved.height } : {}),
      ...(resolved.sizeBytes !== undefined ? { sizeBytes: resolved.sizeBytes } : {}),
    };
    if (request.target === 'bytes') {
      return { ...base, bytes: await this.fileOps.readFile(resolved.path) };
    }
    if (request.target === 'local-path') {
      return base;
    }
    const webview = this.webviewResolver?.(request);
    if (!webview || !this.localResourceAccess) {
      return unsupportedDestination(
        request,
        this.id,
        'Generated source Webview projection requires local resource access and a Webview resolver.',
      );
    }
    const projection = await this.localResourceAccess.toWebviewUri(webview, resolved.path, {
      caller: request.caller,
    });
    if (!projection.ok) {
      return {
        ...base,
        status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
        error: projection.message,
      };
    }
    return { ...base, uri: projection.uri };
  }
}

function isGeneratedAssetResourceRef(ref: ContentSourceRef): ref is ResourceRef {
  return isResourceRef(ref) && ref.kind === 'generated' && ref.source.kind === 'generated-asset';
}

export class ResourceCacheContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly resourceCache: ResourceCacheService;
  private readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
  private readonly webviewResolver?: ContentAccessWebviewResolver;

  constructor(options: ResourceCacheContentAccessProviderOptions) {
    this.id = options.id ?? 'resource-cache-content-access';
    this.resourceCache = options.resourceCache;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.webviewResolver = options.webviewResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return (
      isResourceRef(request.ref) &&
      isPreviewLikeContentAccessIntent(request.intent) &&
      request.target !== 'engine-source' &&
      request.target !== 'runtime-stream'
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    if (!isResourceRef(request.ref)) {
      return unsupported(request, this.id, 'Resource cache provider requires a ResourceRef.');
    }

    const variant = resolveVariant(request);
    const materializeIfMissing =
      request.materialization === undefined ||
      request.materialization === 'if-missing' ||
      request.materialization === 'refresh';

    if (request.target === 'webview-uri') {
      const webview = this.webviewResolver?.(request);
      if (!webview) {
        return unsupportedDestination(
          request,
          this.id,
          'Webview URI content access requires a webview resolver.',
          'content-webview-resolver-missing',
        );
      }
      const projected = await this.resourceCache.project(webview, request.ref, variant, {
        materializeIfMissing,
      });
      if (projected.status !== 'ready') {
        return {
          status: mapCacheStatus(projected.status),
          request,
          providerId: this.id,
          source: request.ref,
          role: variant.role,
          uri: projected.uri,
          localPath: projected.absolutePath,
          mimeType: readCacheResultMimeType(projected),
          width: readCacheResultWidth(projected),
          height: readCacheResultHeight(projected),
          sizeBytes: projected.variantEntry?.sizeBytes,
          diagnostics: [createCacheDiagnostic(projected.status, this.id, request, projected.error)],
          error: projected.error,
        };
      }
      return {
        status: mapCacheStatus(projected.status),
        request,
        providerId: this.id,
        source: request.ref,
        role: variant.role,
        uri: projected.uri,
        localPath: projected.absolutePath,
        mimeType: readCacheResultMimeType(projected),
        width: readCacheResultWidth(projected),
        height: readCacheResultHeight(projected),
        sizeBytes: projected.variantEntry?.sizeBytes,
        error: projected.error,
      };
    }

    const result = await this.resourceCache.resolve(request.ref, variant, { materializeIfMissing });
    const status = mapCacheStatus(result.status);
    if (status !== 'ready') {
      return {
        status,
        request,
        providerId: this.id,
        source: request.ref,
        role: variant.role,
        localPath: result.absolutePath,
        mimeType: readCacheResultMimeType(result),
        width: readCacheResultWidth(result),
        height: readCacheResultHeight(result),
        sizeBytes: result.variantEntry?.sizeBytes,
        diagnostics: [createCacheDiagnostic(result.status, this.id, request, result.error)],
        error: result.error,
      };
    }
    if (request.target === 'bytes') {
      if (!result.absolutePath) {
        return {
          status: 'missing-cache',
          request,
          providerId: this.id,
          source: request.ref,
          role: variant.role,
          diagnostics: [
            createCacheDiagnostic(
              'missing',
              this.id,
              request,
              result.error ?? 'Cache materialization did not return a local path.',
            ),
          ],
          error: result.error ?? 'Cache materialization did not return a local path.',
        };
      }
      return {
        status,
        request,
        providerId: this.id,
        source: request.ref,
        role: variant.role,
        bytes: await this.fileOps.readFile(result.absolutePath),
        localPath: result.absolutePath,
        mimeType: readCacheResultMimeType(result),
        width: readCacheResultWidth(result),
        height: readCacheResultHeight(result),
        sizeBytes: result.variantEntry?.sizeBytes,
      };
    }

    return {
      status,
      request,
      providerId: this.id,
      source: request.ref,
      role: variant.role,
      localPath: result.absolutePath,
      mimeType: readCacheResultMimeType(result),
      width: readCacheResultWidth(result),
      height: readCacheResultHeight(result),
      sizeBytes: result.variantEntry?.sizeBytes,
      error: result.error,
    };
  }
}

export class SourceFileContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly mediaPathContext: WorkspaceMediaPathContext;
  private readonly fileExists: ContentAccessFileExists;
  private readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
  private readonly localResourceAccess?: LocalResourceAccessService;
  private readonly webviewResolver?: ContentAccessWebviewResolver;
  private readonly engineSourceResolver?: SourceFileContentAccessProviderOptions['engineSourceResolver'];
  private readonly bytesResolver?: SourceFileContentAccessProviderOptions['bytesResolver'];

  constructor(options: SourceFileContentAccessProviderOptions) {
    this.id = options.id ?? 'source-file-content-access';
    this.mediaPathContext = options.mediaPathContext;
    this.fileExists = options.fileExists;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.localResourceAccess = options.localResourceAccess;
    this.webviewResolver = options.webviewResolver;
    this.engineSourceResolver = options.engineSourceResolver;
    this.bytesResolver = options.bytesResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    if (getDocumentRef(request.ref)) {
      return false;
    }
    const supportsRuntimeEngineAccess =
      request.target === 'engine-source' &&
      (isPreviewLikeContentAccessIntent(request.intent) || request.intent === 'verify');
    const supportsAgentBytesAccess =
      request.target === 'bytes' &&
      request.intent === 'agent-context' &&
      this.bytesResolver !== undefined;
    const supportsAgentLocalPathAccess =
      request.target === 'local-path' && request.intent === 'agent-context';
    return (
      extractSourcePath(request.ref) !== undefined &&
      (isOfflineContentAccessIntent(request.intent) ||
        request.intent === 'cache-materialize' ||
        supportsRuntimeEngineAccess ||
        supportsAgentBytesAccess ||
        supportsAgentLocalPathAccess)
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const sourcePath = extractSourcePath(request.ref);
    if (!sourcePath) {
      return missingSource(request, this.id, 'Source file provider requires a path-backed ref.');
    }

    const resolved = await resolveContentSourcePath(
      sourcePath,
      this.mediaPathContext,
      this.fileExists,
    );
    if (resolved.status === 'remote') {
      return this.resolveRemoteSource(request, resolved.url, resolved.diagnostics);
    }
    if (resolved.status !== 'resolved-local') {
      return createWorkspaceMediaPathFailure(request, this.id, resolved);
    }

    return this.resolveResolvedPath(request, resolved.path, resolved.diagnostics);
  }

  private resolveRemoteSource(
    request: ContentAccessRequest,
    url: string,
    diagnostics: readonly WorkspaceMediaPathDiagnostic[],
  ): ContentAccessResult {
    const result =
      request.target === 'local-path'
        ? unsupportedDestination(request, this.id, 'Remote URLs cannot resolve to local paths.')
        : unsupportedDestination(request, this.id, 'Remote source reads are not supported yet.');
    return appendWorkspaceMediaPathDiagnostics(result, this.id, diagnostics, request);
  }

  private async resolveResolvedPath(
    request: ContentAccessRequest,
    resolvedPath: string,
    diagnostics: readonly WorkspaceMediaPathDiagnostic[],
  ): Promise<ContentAccessResult> {
    switch (request.target) {
      case 'local-path':
        return withWorkspaceMediaPathDiagnostics(
          {
            status: 'ready',
            request,
            providerId: this.id,
            source: stableSourceOrUndefined(request.ref),
            localPath: resolvedPath,
            role: request.role ?? request.variant?.role,
          },
          this.id,
          diagnostics,
        );
      case 'bytes':
        try {
          const resolvedBytes = this.bytesResolver
            ? await this.bytesResolver({ request, path: resolvedPath })
            : { bytes: await this.fileOps.readFile(resolvedPath) };
          return withWorkspaceMediaPathDiagnostics(
            {
              status: 'ready',
              request,
              providerId: this.id,
              source: stableSourceOrUndefined(request.ref),
              localPath: resolvedPath,
              bytes: resolvedBytes.bytes,
              mimeType: resolvedBytes.mimeType,
              sizeBytes: resolvedBytes.sizeBytes ?? resolvedBytes.bytes.byteLength,
              role: request.role ?? request.variant?.role,
            },
            this.id,
            diagnostics,
          );
        } catch (error) {
          return missingSource(
            request,
            this.id,
            error instanceof Error
              ? `Source file cannot be read: ${error.message}`
              : 'Source file cannot be read.',
          );
        }
      case 'engine-source':
        if (!this.engineSourceResolver) {
          return unsupportedDestination(
            request,
            this.id,
            'Engine source target requires an engine source resolver.',
            'content-engine-source-resolver-missing',
          );
        }
        try {
          return withWorkspaceMediaPathDiagnostics(
            {
              status: 'ready',
              request,
              providerId: this.id,
              source: stableSourceOrUndefined(request.ref),
              localPath: resolvedPath,
              engineSource: await this.engineSourceResolver({ request, path: resolvedPath }),
              role: request.role ?? request.variant?.role,
            },
            this.id,
            diagnostics,
          );
        } catch (error) {
          return providerResolverFailure(request, this.id, error);
        }
      case 'webview-uri': {
        const webview = this.webviewResolver?.(request);
        if (!webview || !this.localResourceAccess) {
          return unsupportedDestination(
            request,
            this.id,
            'Webview URI source access requires local resource access and a webview resolver.',
          );
        }
        const projection = await this.localResourceAccess.toWebviewUri(webview, resolvedPath, {
          caller: request.caller,
        });
        if (projection.ok === false) {
          return {
            status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
            request,
            providerId: this.id,
            source: stableSourceOrUndefined(request.ref),
            localPath: resolvedPath,
            diagnostics: [
              createProjectionDiagnostic(projection.reason, this.id, request, projection.message),
            ],
            error: projection.message,
          };
        }
        return withWorkspaceMediaPathDiagnostics(
          {
            status: 'ready',
            request,
            providerId: this.id,
            source: stableSourceOrUndefined(request.ref),
            localPath: resolvedPath,
            uri: projection.uri,
          },
          this.id,
          diagnostics,
        );
      }
      case 'runtime-stream':
        return unsupportedDestination(
          request,
          this.id,
          'Source file provider does not create runtime streams.',
        );
      default:
        return unsupportedDestination(request, this.id, 'Unsupported source file target.');
    }
  }
}

export class DocumentEntryContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly mediaPathContext: WorkspaceMediaPathContext;
  private readonly fileExists: ContentAccessFileExists;
  private readonly sourceProvider: SourceFileContentAccessProvider;
  private readonly resourceCacheProvider?: ResourceCacheContentAccessProvider;
  private readonly entryReader?: DocumentEntryContentAccessProviderOptions['entryReader'];

  constructor(options: DocumentEntryContentAccessProviderOptions) {
    this.id = options.id ?? 'document-entry-content-access';
    this.mediaPathContext = options.mediaPathContext;
    this.fileExists = options.fileExists;
    this.sourceProvider = new SourceFileContentAccessProvider({
      id: `${this.id}:source`,
      mediaPathContext: this.mediaPathContext,
      projectRoot: options.projectRoot,
      fileExists: this.fileExists,
      fileOps: options.fileOps,
    });
    this.entryReader = options.entryReader;
    this.resourceCacheProvider = options.resourceCache
      ? new ResourceCacheContentAccessProvider({
          id: `${this.id}:cache`,
          resourceCache: options.resourceCache,
          fileOps: options.fileOps,
          webviewResolver: options.webviewResolver,
        })
      : undefined;
  }

  supports(request: ContentAccessRequest): boolean {
    const documentRef = getDocumentRef(request.ref);
    if (!documentRef) return false;
    if (
      request.intent === 'agent-context' &&
      request.target === 'bytes' &&
      documentRef.entryPath !== undefined
    ) {
      return true;
    }
    if (
      request.intent === 'agent-context' &&
      request.target === 'local-path' &&
      documentRef.entryPath === undefined
    ) {
      return true;
    }
    if (isPreviewLikeContentAccessIntent(request.intent) && this.resourceCacheProvider) {
      return isResourceRef(request.ref) || documentRef.resource !== undefined;
    }
    return request.intent === 'package' && request.target === 'bytes';
  }

  async resolve(input: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    const { request } = input;
    const documentRef = getDocumentRef(request.ref);
    if (!documentRef) {
      return missingSource(request, this.id, 'Document entry provider requires a document ref.');
    }

    if (isPreviewLikeContentAccessIntent(request.intent) && this.resourceCacheProvider) {
      const resource = isResourceRef(request.ref) ? request.ref : documentRef.resource;
      if (resource) {
        return this.resourceCacheProvider.resolve({
          request: { ...request, ref: resource },
        });
      }
    }

    if (
      request.intent === 'agent-context' &&
      request.target === 'local-path' &&
      !documentRef.entryPath
    ) {
      return this.sourceProvider.resolve(input);
    }

    if (
      request.target === 'bytes' &&
      (request.intent === 'package' || request.intent === 'agent-context')
    ) {
      if (!documentRef.entryPath) {
        if (request.intent === 'agent-context') {
          return unsupportedDestination(
            request,
            this.id,
            'Document archive sources cannot be resolved as whole-file provider assets. Use a ResourceRef with a stable document entry path.',
            'content-document-whole-archive-read-rejected',
          );
        }
        return unsupportedDestination(
          request,
          this.id,
          'Document package entry bytes require a stable document entry path.',
          'content-document-entry-path-missing',
        );
      }
      if (!this.entryReader) {
        return unsupportedDestination(
          request,
          this.id,
          'Document package entry bytes require an entry reader.',
        );
      }
      const sourcePath = extractSourcePath(request.ref);
      if (!sourcePath) {
        return missingSource(request, this.id, 'Document entry source path is missing.');
      }
      const resolved = await resolveContentSourcePath(
        sourcePath,
        this.mediaPathContext,
        this.fileExists,
      );
      if (resolved.status !== 'resolved-local') {
        return createWorkspaceMediaPathFailure(request, this.id, resolved);
      }
      let bytes: Uint8Array;
      try {
        bytes = await this.entryReader({
          request,
          sourcePath: resolved.path,
          entryPath: documentRef.entryPath,
        });
      } catch (error) {
        return providerResolverFailure(request, this.id, error);
      }
      return withWorkspaceMediaPathDiagnostics(
        {
          status: 'ready',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.path,
          bytes,
        },
        this.id,
        resolved.diagnostics,
      );
    }

    return unsupportedDestination(
      request,
      this.id,
      'Document archive sources cannot be resolved as whole-file provider assets. Use a ResourceRef with a stable document entry path.',
      'content-document-whole-archive-read-rejected',
    );
  }
}

export class VideoProxyContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly proxyResolver: VideoProxyContentAccessProviderOptions['proxyResolver'];
  private readonly localResourceAccess?: LocalResourceAccessService;
  private readonly webviewResolver?: ContentAccessWebviewResolver;

  constructor(options: VideoProxyContentAccessProviderOptions) {
    this.id = options.id ?? 'video-proxy-content-access';
    this.proxyResolver = options.proxyResolver;
    this.localResourceAccess = options.localResourceAccess;
    this.webviewResolver = options.webviewResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return (
      (request.intent === 'interactive-preview' || request.intent === 'edit-playback') &&
      (request.role === 'proxy' || request.variant?.role === 'proxy')
    );
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    let resolved: Awaited<ReturnType<VideoProxyContentAccessProviderOptions['proxyResolver']>>;
    try {
      resolved = await this.proxyResolver(request);
    } catch (error) {
      return providerResolverFailure(request, this.id, error);
    }
    if (request.target === 'runtime-stream' && resolved.runtimeStream) {
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        runtimeStream: resolved.runtimeStream,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    if (request.target === 'webview-uri' && resolved.localPath) {
      const webview = this.webviewResolver?.(request);
      if (!webview || !this.localResourceAccess) {
        return unsupportedDestination(
          request,
          this.id,
          'Proxy Webview URI content access requires local resource access and a webview resolver.',
          'content-webview-resolver-missing',
        );
      }
      const projection = await this.localResourceAccess.toWebviewUri(webview, resolved.localPath, {
        caller: request.caller,
      });
      if (projection.ok === false) {
        return {
          status: projection.reason === 'unauthorized' ? 'unauthorized' : 'failed',
          request,
          providerId: this.id,
          source: stableSourceOrUndefined(request.ref),
          localPath: resolved.localPath,
          diagnostics: [
            createProjectionDiagnostic(projection.reason, this.id, request, projection.message),
          ],
          error: projection.message,
        };
      }
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        localPath: resolved.localPath,
        uri: projection.uri,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    if (request.target === 'local-path' && resolved.localPath) {
      return {
        status: 'ready',
        request,
        providerId: this.id,
        source: stableSourceOrUndefined(request.ref),
        localPath: resolved.localPath,
        mimeType: resolved.mimeType,
        sizeBytes: resolved.sizeBytes,
      };
    }
    return unsupportedDestination(request, this.id, 'Proxy resolver did not return the target.');
  }
}

export class PreviewVariantContentAccessProvider implements ContentAccessProvider {
  readonly id: string;
  private readonly variantResolver: PreviewVariantContentAccessProviderOptions['variantResolver'];

  constructor(options: PreviewVariantContentAccessProviderOptions) {
    this.id = options.id ?? 'preview-variant-content-access';
    this.variantResolver = options.variantResolver;
  }

  supports(request: ContentAccessRequest): boolean {
    return isPreviewLikeContentAccessIntent(request.intent);
  }

  async resolve({ request }: ContentAccessProviderRequest): Promise<ContentAccessResult> {
    let resolved: Awaited<
      ReturnType<PreviewVariantContentAccessProviderOptions['variantResolver']>
    >;
    try {
      resolved = await this.variantResolver(request);
    } catch (error) {
      return providerResolverFailure(request, this.id, error);
    }
    if (!hasPreviewVariantTargetData(resolved)) {
      return missingSource(request, this.id, 'Preview variant resolver did not return content.');
    }
    return {
      status: 'ready',
      request,
      providerId: this.id,
      source: stableSourceOrUndefined(request.ref),
      uri: resolved.uri,
      localPath: resolved.localPath,
      bytes: resolved.bytes,
      mimeType: resolved.mimeType,
      width: resolved.width,
      height: resolved.height,
      sizeBytes: resolved.sizeBytes,
    };
  }
}

export class ImportSourceContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly fileOps: ContentAccessFileOps;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'import-source-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.fileOps = options.fileOps ?? nodeFileOps;
  }

  supports(request: ContentIngestRequest): boolean {
    return request.mode === 'import-source' && request.sourcePath !== undefined;
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.sourcePath) {
      return ingestFailure(request, this.id, 'Import source path is required.');
    }
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    if (request.destination.copyMode === undefined || request.destination.copyMode === 'copy') {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.copyFile(request.sourcePath, outputPath);
    }
    return createFileIngestResult(
      request,
      this.id,
      outputPath,
      this.pathResolver,
      this.projectRoot,
    );
  }
}

export class RegisterExistingSourceContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'register-existing-source-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
  }

  supports(request: ContentIngestRequest): boolean {
    return (
      (request.mode === 'register-existing-source' ||
        request.mode === 'link' ||
        request.mode === 'add') &&
      request.sourcePath !== undefined
    );
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.sourcePath) {
      return ingestFailure(request, this.id, 'Existing source path is required.');
    }
    return createFileIngestResult(
      request,
      this.id,
      request.sourcePath,
      this.pathResolver,
      this.projectRoot,
    );
  }
}

export class GeneratedOutputContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly pathResolver: PathResolver;
  private readonly projectRoot: string;
  private readonly fileOps: ContentAccessFileOps;

  constructor(options: ContentIngestFileProviderOptions) {
    this.id = options.id ?? 'generated-output-content-ingest';
    this.pathResolver = options.pathResolver ?? new PathResolver();
    this.projectRoot = options.projectRoot;
    this.fileOps = options.fileOps ?? nodeFileOps;
  }

  supports(request: ContentIngestRequest): boolean {
    if (request.mode === 'create-asset') return request.bytes !== undefined;
    return (
      request.mode === 'generated-output' &&
      (request.sourcePath !== undefined || request.bytes !== undefined)
    );
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    if (request.bytes !== undefined) {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.writeFile(outputPath, request.bytes);
    } else if (request.sourcePath && request.sourcePath !== outputPath) {
      await this.fileOps.mkdir(path.dirname(outputPath), { recursive: true });
      await this.fileOps.copyFile(request.sourcePath, outputPath);
    }
    const contractedPath = contractDurableSourcePath(
      outputPath,
      this.pathResolver,
      this.projectRoot,
    );
    if (isAbsoluteLocalPath(contractedPath)) {
      return ingestFailure(
        request,
        this.id,
        'Generated asset output path must be contracted before promotion.',
      );
    }
    const assetId = readStringMetadata(request.metadata, 'assetId') ?? path.basename(outputPath);
    const source: ContentGeneratedAssetSourceRef = {
      kind: 'generated-asset',
      assetId,
      path: contractedPath,
      promoted: true,
      metadata: request.metadata,
    };
    return {
      status: 'ready',
      request,
      providerId: this.id,
      source,
      outputPath,
      contractedPath,
      prewarm: request.prewarm,
    };
  }
}

export class ExportStagingContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly projectRoot: string;

  constructor(options: Pick<ContentIngestFileProviderOptions, 'id' | 'projectRoot'>) {
    this.id = options.id ?? 'export-staging-content-ingest';
    this.projectRoot = options.projectRoot;
  }

  supports(request: ContentIngestRequest): boolean {
    return request.mode === 'stage-export';
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    const outputPath = resolveIngestOutputPath(request, this.projectRoot);
    return {
      status: 'ready',
      request,
      providerId: this.id,
      outputPath,
      stagedOutput: {
        path: outputPath,
        kind: request.destination.kind === 'export-output' ? 'export' : 'package',
      },
    };
  }
}

export class CacheArtifactContentIngestProvider implements ContentIngestProvider {
  readonly id: string;
  private readonly resourceCache: ResourceCacheService;

  constructor(options: CacheArtifactContentIngestProviderOptions) {
    this.id = options.id ?? 'cache-artifact-content-ingest';
    this.resourceCache = options.resourceCache;
  }

  supports(request: ContentIngestRequest): boolean {
    return (
      request.mode === 'cache-artifact' &&
      request.resource !== undefined &&
      request.variant !== undefined
    );
  }

  async ingest({ request }: ContentIngestProviderRequest): Promise<ContentIngestResult> {
    if (!request.resource || !request.variant) {
      return ingestFailure(
        request,
        this.id,
        'Cache artifact ingest requires resource and variant.',
      );
    }
    const result = await this.resourceCache.ensure(request.resource, request.variant, {
      materializeIfMissing: true,
    });
    return {
      status: mapCacheStatus(result.status),
      request,
      providerId: this.id,
      source: request.resource,
      outputPath: result.absolutePath,
      prewarm: request.prewarm,
      error: result.error,
    };
  }
}

function resolveVariant(request: ContentAccessRequest): ResourceVariantRequest {
  return request.variant ?? { role: request.role ?? 'preview' };
}

function readCacheResultMimeType(result: {
  readonly variant: { readonly mimeType?: string };
  readonly variantEntry?: { readonly mimeType?: string };
}): string | undefined {
  return result.variantEntry?.mimeType ?? result.variant.mimeType;
}

function readCacheResultWidth(result: {
  readonly variant: { readonly width?: number };
  readonly variantEntry?: { readonly width?: number };
}): number | undefined {
  return result.variantEntry?.width ?? result.variant.width;
}

function readCacheResultHeight(result: {
  readonly variant: { readonly height?: number };
  readonly variantEntry?: { readonly height?: number };
}): number | undefined {
  return result.variantEntry?.height ?? result.variant.height;
}

function mapCacheStatus(status: ResourceCacheStatus): ContentAccessStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'missing':
    case 'materializing':
      return 'missing-cache';
    case 'stale':
      return 'stale-source';
    case 'unsupported':
      return 'unsupported-source';
    case 'unauthorized':
      return 'unauthorized';
    case 'non-portable':
      return 'non-portable';
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

function extractSourcePath(ref: ContentSourceRef): string | undefined {
  if (isResourceRef(ref)) {
    const fileLocatorPath = ref.locator?.kind === 'file' ? ref.locator.path : undefined;
    return readResourceSourceLocalPath(ref.source) ?? fileLocatorPath;
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
      return ref.source ? extractSourcePath(ref.source) : undefined;
    default:
      return assertNever(ref);
  }
}

function readOptionalResourceSourcePath(resource: ResourceRef | undefined): string | undefined {
  return resource ? readResourceSourceLocalPath(resource.source) : undefined;
}

function getDocumentRef(ref: ContentSourceRef): ContentDocumentSourceRef | undefined {
  if (isResourceRef(ref)) {
    if (ref.source.kind !== 'document') return undefined;
    return {
      kind: 'document',
      source: ref.source,
      resource: ref,
      entryPath: ref.locator?.kind === 'document' ? ref.locator.entryPath : undefined,
      locator: ref.locator,
    };
  }
  return ref.kind === 'document' ? ref : undefined;
}

function stableSourceOrUndefined(ref: ContentSourceRef): ContentStableSourceRef | undefined {
  return ref.kind === 'runtime' ? ref.source : ref;
}

async function resolveContentSourcePath(
  source: string,
  context: WorkspaceMediaPathContext,
  fileExists: ContentAccessFileExists,
): Promise<WorkspaceMediaPathResolution> {
  return resolveWorkspaceMediaPathAsync({
    source,
    context,
    fileExists,
    isPathAuthorized: (filePath) => isPathInsideAnyRoot(filePath, context.allowedRoots),
  });
}

function createWorkspaceMediaPathFailure(
  request: ContentAccessRequest,
  providerId: string,
  result: WorkspaceMediaPathResolution,
): ContentAccessResult {
  if (result.status === 'remote') {
    return unsupportedDestination(
      request,
      providerId,
      'Remote source reads are not supported yet.',
    );
  }
  const diagnostics = mapWorkspaceMediaPathDiagnostics(providerId, request, result.diagnostics);
  const errorDiagnostic =
    diagnostics.find((diagnostic) => diagnostic.severity === 'error') ?? diagnostics[0];
  return {
    status: result.status === 'unauthorized' ? 'unauthorized' : 'missing-source',
    request,
    providerId,
    source: stableSourceOrUndefined(request.ref),
    ...(result.status === 'unauthorized' ? { localPath: result.path } : {}),
    diagnostics,
    error: errorDiagnostic?.message ?? 'Content source path could not be resolved.',
  };
}

function appendWorkspaceMediaPathDiagnostics(
  result: ContentAccessResult,
  providerId: string,
  diagnostics: readonly WorkspaceMediaPathDiagnostic[],
  request: ContentAccessRequest,
): ContentAccessResult {
  return {
    ...result,
    diagnostics: [
      ...(result.diagnostics ?? []),
      ...mapWorkspaceMediaPathDiagnostics(providerId, request, diagnostics),
    ],
  };
}

function withWorkspaceMediaPathDiagnostics(
  result: ContentAccessResult,
  providerId: string,
  diagnostics: readonly WorkspaceMediaPathDiagnostic[],
): ContentAccessResult {
  const mapped = mapWorkspaceMediaPathDiagnostics(providerId, result.request, diagnostics);
  if (mapped.length === 0) return result;
  return {
    ...result,
    diagnostics: [...(result.diagnostics ?? []), ...mapped],
  };
}

function mapWorkspaceMediaPathDiagnostics(
  providerId: string,
  request: ContentAccessRequest,
  diagnostics: readonly WorkspaceMediaPathDiagnostic[],
): ContentAccessDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: `content-source-${diagnostic.code}`,
    severity: diagnostic.code === 'multi-root-ambiguity' ? 'warning' : 'error',
    message: diagnostic.message,
    providerId,
    intent: request.intent,
    target: request.target,
    metadata: {
      ...(diagnostic.path ? { path: diagnostic.path } : {}),
      ...(diagnostic.variable ? { variable: diagnostic.variable } : {}),
    },
  }));
}

function isPathInsideAnyRoot(filePath: string, roots: readonly string[] | undefined): boolean {
  if (!roots || roots.length === 0) return false;
  return roots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const candidate = path.normalize(candidatePath);
  const root = path.normalize(rootPath);
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function unsupported(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
): ContentAccessResult {
  return {
    status: 'unsupported-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-provider-unsupported-source', severity: 'error', message, providerId },
    ],
  };
}

function unsupportedDestination(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
  code = 'content-provider-unsupported-destination',
): ContentAccessResult {
  return {
    status: 'unsupported-destination',
    request,
    providerId,
    error: message,
    diagnostics: [
      {
        code,
        severity: 'error',
        message,
        providerId,
        intent: request.intent,
        target: request.target,
      },
    ],
  };
}

function createProjectionDiagnostic(
  reason: 'invalid-path' | 'unauthorized',
  providerId: string,
  request: ContentAccessRequest,
  message: string,
): ContentAccessDiagnostic {
  return {
    code:
      reason === 'unauthorized' ? 'content-projection-unauthorized' : 'content-projection-failed',
    severity: 'error',
    message,
    providerId,
    intent: request.intent,
    target: request.target,
  };
}

function createCacheDiagnostic(
  status: ResourceCacheStatus,
  providerId: string,
  request: ContentAccessRequest,
  message?: string,
): ContentAccessDiagnostic {
  return {
    code: cacheDiagnosticCode(status),
    severity: 'error',
    message: message ?? cacheDiagnosticMessage(status),
    providerId,
    intent: request.intent,
    target: request.target,
    role: request.variant?.role ?? request.role,
    materialization:
      status === 'ready'
        ? 'resolved-existing'
        : status === 'materializing'
          ? 'materialized'
          : status === 'unsupported'
            ? 'rejected'
            : 'none',
  };
}

function cacheDiagnosticCode(status: ResourceCacheStatus): string {
  switch (status) {
    case 'unauthorized':
      return 'content-cache-unauthorized-root';
    case 'non-portable':
      return 'content-cache-non-portable-resource';
    case 'missing':
    case 'materializing':
      return 'content-cache-materialization-missing';
    case 'stale':
      return 'content-cache-stale-source';
    case 'unsupported':
      return 'content-cache-unsupported-source';
    case 'failed':
      return 'content-cache-materialization-failed';
    case 'ready':
      return 'content-cache-ready';
    default:
      return 'content-cache-materialization-failed';
  }
}

function cacheDiagnosticMessage(status: ResourceCacheStatus): string {
  switch (status) {
    case 'unauthorized':
      return 'Resource cache path is outside authorized roots.';
    case 'non-portable':
      return 'Resource cache result is not portable.';
    case 'missing':
    case 'materializing':
      return 'Resource cache artifact is missing or not materialized.';
    case 'stale':
      return 'Resource cache source is stale.';
    case 'unsupported':
      return 'Resource cache provider does not support this source or variant.';
    case 'failed':
      return 'Resource cache materialization failed.';
    case 'ready':
      return 'Resource cache artifact is ready.';
    default:
      return 'Resource cache materialization failed.';
  }
}

function missingSource(
  request: ContentAccessRequest,
  providerId: string,
  message: string,
): ContentAccessResult {
  return {
    status: 'missing-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-provider-missing-source', severity: 'error', message, providerId },
    ],
  };
}

function providerResolverFailure(
  request: ContentAccessRequest,
  providerId: string,
  error: unknown,
): ContentAccessResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'failed',
    request,
    providerId,
    error: message,
    diagnostics: [
      {
        code: 'content-provider-resolver-failed',
        severity: 'error',
        message,
        providerId,
        intent: request.intent,
        target: request.target,
      },
    ],
  };
}

function hasPreviewVariantTargetData(
  resolved: Awaited<ReturnType<PreviewVariantContentAccessProviderOptions['variantResolver']>>,
): boolean {
  return (
    resolved.uri !== undefined || resolved.localPath !== undefined || resolved.bytes !== undefined
  );
}

function ingestFailure(
  request: ContentIngestRequest,
  providerId: string,
  message: string,
): ContentIngestResult {
  return {
    status: 'missing-source',
    request,
    providerId,
    error: message,
    diagnostics: [
      { code: 'content-ingest-missing-source', severity: 'error', message, providerId },
    ],
  };
}

function resolveIngestOutputPath(request: ContentIngestRequest, projectRoot: string): string {
  if (request.destination.copyMode === 'register' && request.sourcePath) return request.sourcePath;
  const fileName = resolveIngestFileName(request);
  if (request.destination.directory) {
    return path.join(request.destination.directory, fileName);
  }
  if (request.sourcePath) return request.sourcePath;
  if (
    request.mode === 'generated-output' ||
    request.mode === 'create-asset' ||
    request.destination.kind === 'generated-assets'
  ) {
    return path.join(
      projectRoot,
      resolveWorkspaceGeneratedAssetRelativeDirectory({
        mediaKind: readStringMetadata(request.metadata, 'mediaKind'),
        mimeType: request.mimeType ?? readStringMetadata(request.metadata, 'mimeType'),
      }),
      fileName,
    );
  }
  if (request.mode === 'stage-export' || request.destination.kind === 'export-output') {
    return path.join(projectRoot, '.neko', '.cache', 'exports', fileName);
  }
  return path.join(projectRoot, '.neko', '.cache', 'content', fileName);
}

function resolveIngestFileName(request: ContentIngestRequest): string {
  if (request.fileName) return request.fileName;
  if (request.sourcePath) return path.basename(request.sourcePath);
  if (request.bytes)
    return `content-${createHash('sha256').update(request.bytes).digest('hex').slice(0, 16)}.bin`;
  return 'content.bin';
}

function createFileIngestResult(
  request: ContentIngestRequest,
  providerId: string,
  outputPath: string,
  pathResolver: PathResolver,
  projectRoot: string,
): ContentIngestResult {
  const contractedPath = contractDurableSourcePath(outputPath, pathResolver, projectRoot);
  const source = createResourceRef({
    scope: request.destination.kind === 'media-library' ? 'global' : 'project',
    provider: providerId,
    kind: 'media',
    source: {
      kind: request.destination.kind === 'media-library' ? 'media-library' : 'file',
      filePath: contractedPath,
      projectRelativePath: toProjectRelativePath(outputPath, projectRoot),
      mediaLibraryId: request.destination.mediaLibraryId,
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: `${providerId}:${contractedPath}`,
    }),
  });
  return {
    status: 'ready',
    request,
    providerId,
    source,
    outputPath,
    contractedPath,
    prewarm: request.prewarm,
  };
}

function toProjectRelativePath(filePath: string, projectRoot: string): string | undefined {
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedPath = normalizePath(filePath);
  if (normalizedPath === normalizedRoot) return '';
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return undefined;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

function contractDurableSourcePath(
  filePath: string,
  pathResolver: PathResolver,
  projectRoot: string,
): string {
  const variablePath = pathResolver.contract(filePath);
  if (variablePath !== filePath) return variablePath;
  return toProjectRelativePath(filePath, projectRoot) ?? filePath;
}

function isAbsoluteLocalPath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/g, '');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled content source ref kind: ${JSON.stringify(value)}`);
}
