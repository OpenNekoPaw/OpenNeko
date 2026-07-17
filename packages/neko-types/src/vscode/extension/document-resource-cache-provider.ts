import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { PathResolver } from '../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  readResourceSourceLocalPath,
  type DocumentArchiveResourceRef,
  type DocumentLocator,
  type DocumentSourceRef,
  type ResourceRef,
  type ResourceSourceRef,
  type ResourceVariantRequest,
} from '../../types';
import type {
  ResourceCacheProvider,
  ResourceEnsureInput,
  ResourceEnsureResult,
} from './resource-cache-service';

export const DOCUMENT_RESOURCE_CACHE_PROVIDER_ID = 'document-archive';

export interface DocumentEntryReader {
  readEntry(source: DocumentSourceRef, entryPath: string): Promise<Uint8Array | null>;
}

export interface DocumentResourceCacheProviderOptions {
  readonly entryReader?: DocumentEntryReader;
  readonly fsOps?: DocumentResourceCacheFsOps;
  readonly pathResolver?: PathResolver;
  readonly projectRoot?: string;
}

export interface DocumentResourceCacheFsOps {
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number }>;
}

export interface CreateDocumentResourceRefInput {
  readonly source: DocumentSourceRef;
  readonly entryPath?: string;
  readonly locator?: DocumentLocator;
  readonly scope?: ResourceRef['scope'];
}

export class DocumentResourceCacheProvider implements ResourceCacheProvider {
  readonly id = DOCUMENT_RESOURCE_CACHE_PROVIDER_ID;

  private readonly entryReader?: DocumentEntryReader;
  private readonly fsOps: DocumentResourceCacheFsOps;
  private readonly pathResolver?: PathResolver;
  private readonly projectRoot?: string;

  constructor(options: DocumentResourceCacheProviderOptions) {
    this.entryReader = options.entryReader;
    this.fsOps = options.fsOps ?? nodeFsOps;
    this.pathResolver = options.pathResolver;
    this.projectRoot = options.projectRoot;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return (
      ref.provider === this.id &&
      ref.kind === 'document' &&
      ref.source.kind === 'document' &&
      Boolean(ref.source.document) &&
      (variant.role === 'document-entry' ||
        variant.role === 'page-image' ||
        variant.role === 'thumbnail')
    );
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    if (!this.supports(input.ref, input.variant)) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Document resource provider does not support this resource variant.',
      };
    }

    const source = input.ref.source.document;
    const locator = input.ref.locator?.kind === 'document' ? input.ref.locator.locator : undefined;
    const entryPath =
      input.ref.locator?.kind === 'document'
        ? (input.ref.locator.entryPath ?? readLocatorEntryName(input.ref.locator.locator))
        : undefined;
    if (!source || (!locator && !entryPath)) {
      return {
        status: 'unsupported',
        ref: input.ref,
        variant: input.variant,
        error: 'Document resource ref requires a source and document locator or entry path.',
      };
    }

    const directEntry = entryPath
      ? await this.materializeDirectEntry(input, source, entryPath)
      : undefined;
    if (directEntry) {
      return directEntry;
    }

    return {
      status: 'missing',
      ref: input.ref,
      variant: input.variant,
      error: entryPath
        ? `Document image entry could not be materialized directly: ${entryPath}`
        : 'Document resource ref cannot be materialized without a direct entry.',
    };
  }

  private async materializeDirectEntry(
    input: ResourceEnsureInput,
    source: DocumentSourceRef,
    entryPath: string,
  ): Promise<ResourceEnsureResult | undefined> {
    if (!this.entryReader) {
      return undefined;
    }
    const bytes = await this.entryReader.readEntry(
      this.resolveDocumentSourceForRead(source),
      entryPath,
    );
    if (!bytes) {
      return undefined;
    }
    const targetRelativePath = createDocumentResourceRelativePath(input.ref, entryPath, entryPath, {
      contentMd5: createContentMd5(bytes),
    });
    const targetPath = path.join(input.cacheRoot, targetRelativePath);
    await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
    await this.fsOps.writeFile(targetPath, bytes);
    const stat = await this.fsOps.stat(targetPath);
    return {
      status: 'ready',
      ref: input.ref,
      variant: input.variant,
      absolutePath: targetPath,
      relativePath: targetRelativePath,
      mimeType: input.variant.mimeType ?? inferMimeType(entryPath),
      width: input.variant.width,
      height: input.variant.height,
      sizeBytes: stat.size || bytes.byteLength,
      rebuildable: true,
    };
  }

  private resolveDocumentSourceForRead(source: DocumentSourceRef): DocumentSourceRef {
    if (!this.pathResolver || !this.projectRoot) return source;
    const resolved = this.pathResolver.resolveSource(source.filePath, this.projectRoot);
    if (resolved.type !== 'local' || this.pathResolver.hasVariable(resolved.path)) {
      return source;
    }
    return {
      ...source,
      filePath: resolved.path,
    };
  }
}

export function createDocumentResourceRef(input: CreateDocumentResourceRefInput): ResourceRef {
  const entryPath = input.entryPath ?? readLocatorEntryName(input.locator);
  const source = createDocumentResourceSource(input);
  const identityValue = readDocumentSourceIdentityValue(input.source);
  const fingerprint = createResourceFingerprint({
    strategy: identityValue ? 'identity' : 'provider',
    value:
      identityValue ??
      hashStableValue({
        filePath: input.source.filePath,
        format: input.source.format,
      }),
    providerId: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  });

  const ref = createResourceRef({
    id: createStableDocumentResourceRefId({
      scope: input.scope ?? 'project',
      source: input.source,
      entryPath,
      locator: input.locator,
      fingerprint,
    }),
    scope: input.scope ?? 'project',
    provider: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'document',
    source,
    locator: createDocumentResourceLocator(entryPath, input.locator),
    fingerprint,
  });

  return ref;
}

function createDocumentResourceSource(input: CreateDocumentResourceRefInput): ResourceSourceRef {
  const extensionPrivateMetadata =
    input.scope === 'extension-private'
      ? {
          cacheScope: 'extension-private',
          nonPortable: true,
          nonPortableReason: 'no-workspace-or-extension-private-scratch',
        }
      : undefined;
  return {
    kind: 'document',
    document: createStableDocumentSource(input.source),
    ...(extensionPrivateMetadata ? { metadata: extensionPrivateMetadata } : {}),
  };
}

function createStableDocumentResourceRefId(input: {
  readonly scope: ResourceRef['scope'];
  readonly source: DocumentSourceRef;
  readonly entryPath: string | undefined;
  readonly locator?: DocumentLocator;
  readonly fingerprint: ReturnType<typeof createResourceFingerprint>;
}): string {
  return `res_${hashStableValue({
    scope: input.scope,
    provider: DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'document',
    source: createDocumentSourceIdentityKey(input.source),
    locator: createDocumentResourceIdentityLocator(input.entryPath, input.locator),
    fingerprint: input.fingerprint,
  })}`;
}

function createStableDocumentSource(source: DocumentSourceRef): DocumentSourceRef {
  return {
    filePath: source.filePath,
    format: source.format,
    ...(source.fileId ? { fileId: source.fileId } : {}),
    ...(source.identity
      ? {
          identity: {
            fileId: source.identity.fileId,
            sizeBytes: source.identity.sizeBytes,
            mtimeMs: source.identity.mtimeMs,
            hash: source.identity.hash,
          },
        }
      : {}),
  };
}

function readDocumentSourceIdentityValue(source: DocumentSourceRef): string | undefined {
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId;
}

function createDocumentResourceLocator(
  entryPath: string | undefined,
  locator?: DocumentLocator,
): ResourceRef['locator'] | undefined {
  return locator || entryPath
    ? {
        kind: 'document',
        ...(locator ? { locator } : {}),
        ...(entryPath ? { entryPath } : {}),
      }
    : undefined;
}

function createDocumentResourceIdentityLocator(
  entryPath: string | undefined,
  locator?: DocumentLocator,
): ResourceRef['locator'] | undefined {
  if (entryPath) {
    return createDocumentResourceLocator(entryPath);
  }
  return createDocumentResourceLocator(undefined, locator);
}

export function createDocumentResourceRefFromArchiveRef(
  ref: DocumentArchiveResourceRef,
  scope: ResourceRef['scope'] = 'project',
): ResourceRef {
  return createDocumentResourceRef({
    source: ref.source,
    entryPath: ref.entryPath,
    locator: ref.locator,
    scope,
  });
}

function readLocatorEntryName(locator: DocumentLocator | undefined): string | undefined {
  if (!locator) return undefined;
  if (locator.kind === 'page' || locator.kind === 'region') {
    return locator.entryName;
  }
  return undefined;
}

function createDocumentResourceRelativePath(
  ref: ResourceRef,
  sourcePath: string,
  entryPath: string | undefined,
  options: { readonly contentMd5: string },
): string {
  const ext = path.extname(sourcePath) || path.extname(entryPath ?? '') || '.bin';
  const documentDirectory = createDocumentCacheDirectoryName(ref);
  const entryRelativePath = createDocumentEntryRelativePath(options.contentMd5, ext);
  return path.join('documents', documentDirectory, entryRelativePath);
}

function createDocumentCacheDirectoryName(ref: ResourceRef): string {
  return `doc_${hashStableValue({
    scope: ref.scope,
    provider: ref.provider,
    source: createResourceSourceDirectoryKey(ref.source),
    fingerprint: ref.fingerprint,
  })}`;
}

function createResourceSourceDirectoryKey(source: ResourceSourceRef): unknown {
  if (source.document) {
    return createDocumentSourceIdentityKey(source.document);
  }
  const identityValue = source.identity?.hash ?? source.identity?.fileId;
  if (identityValue) {
    return {
      kind: source.kind,
      identity: identityValue,
      format: source.metadata?.format,
    };
  }
  return {
    kind: source.kind,
    filePath: readResourceSourceLocalPath(source),
    uri: source.uri,
    projectRelativePath: source.projectRelativePath,
    mediaLibraryId: source.mediaLibraryId,
    generatedAssetId: source.generatedAssetId,
    previewAssetId: source.previewAssetId,
    format: source.metadata?.format,
  };
}

function createDocumentSourceIdentityKey(source: DocumentSourceRef): unknown {
  const identityValue = readDocumentSourceIdentityValue(source);
  return {
    format: source.format,
    ...(identityValue ? { identity: identityValue } : { filePath: source.filePath }),
  };
}

function createDocumentEntryRelativePath(contentMd5: string, ext: string): string {
  return `${contentMd5}${ext}`;
}

function createContentMd5(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

function inferMimeType(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return undefined;
  }
}

const nodeFsOps: DocumentResourceCacheFsOps = {
  writeFile: (filePath, data) => fs.writeFile(filePath, data),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  },
};
