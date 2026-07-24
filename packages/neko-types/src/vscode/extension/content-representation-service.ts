import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  isContentLocator,
  isContentRepresentationSpec,
  type ContentLocator,
  type ContentRepresentationDiagnostic,
  type ContentRepresentationBytes,
  type ContentRepresentationGenerator,
  type ContentRepresentationKind,
  type ContentRepresentationLocator,
  type ContentRepresentationMetadata,
  type ContentRepresentationReadOptions,
  type ContentRepresentationRequest,
  type ContentRepresentationResult,
  type ContentRepresentationService,
  type ResourceKind,
  type ResourceRef,
  type ResourceScope,
  type ResourceSourceKind,
  type ResourceSourceRef,
  type ResourceVariantRequest,
} from '../../types';
import type { ResourceCacheFileOps } from './resource-cache-providers';
import type {
  ResourceEnsureInput,
  ResourceEnsureResult,
  ResourceCacheLogger,
  ResourceCacheProvider,
  ResourceCacheService,
} from './resource-cache-service';

export const CONTENT_REPRESENTATION_RESOURCE_PROVIDER_ID = 'content-representation';

export interface HostContentRepresentationServiceOptions {
  readonly resourceCache: ResourceCacheService;
  readonly scope?: ResourceScope;
  readonly generators?: readonly ContentRepresentationGenerator[];
  readonly fileOps?: ContentRepresentationFileOps;
  readonly logger?: ResourceCacheLogger;
}

export interface ContentRepresentationFileOps extends ResourceCacheFileOps {
  readFile(
    filePath: string,
    range: { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array>;
}

interface PendingRepresentation {
  readonly request: ContentRepresentationRequest;
  readonly generator: ContentRepresentationGenerator;
}

export class HostContentRepresentationService implements ContentRepresentationService {
  private readonly resourceCache: ResourceCacheService;
  private readonly generators = new Map<
    ContentRepresentationKind,
    ContentRepresentationGenerator
  >();
  private readonly pending = new Map<string, PendingRepresentation>();
  private readonly provider: ContentRepresentationResourceCacheProvider;
  private readonly fileOps: ContentRepresentationFileOps;
  private readonly logger?: ResourceCacheLogger;
  private readonly scope: ResourceScope;

  constructor(options: HostContentRepresentationServiceOptions) {
    this.resourceCache = options.resourceCache;
    this.logger = options.logger;
    this.scope = options.scope ?? 'project';
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.provider = new ContentRepresentationResourceCacheProvider({
      pending: this.pending,
      fileOps: this.fileOps,
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.resourceCache.registerProvider(this.provider);
    for (const generator of options.generators ?? []) {
      this.registerGenerator(generator);
    }
  }

  registerGenerator(generator: ContentRepresentationGenerator): void {
    if (!generator.id.trim() || !generator.revision.trim() || generator.kinds.length === 0) {
      throw new Error('Content representation generators require id, revision, and kinds.');
    }
    for (const kind of generator.kinds) {
      if (this.generators.has(kind)) {
        throw new Error(`Content representation generator is already registered for ${kind}.`);
      }
      this.generators.set(kind, generator);
    }
  }

  async getRepresentation(
    request: ContentRepresentationRequest,
  ): Promise<ContentRepresentationResult> {
    if (request.signal?.aborted) {
      return unavailable('representation-cancelled', 'Content representation was cancelled.');
    }
    if (!isContentLocator(request.source) || !isContentRepresentationSpec(request.spec)) {
      return unavailable(
        'representation-unsupported',
        'Content representation request is invalid.',
      );
    }

    const generator = this.generators.get(request.spec.kind);
    if (!generator) {
      return unavailable(
        'representation-unsupported',
        `Content representation kind is not registered: ${request.spec.kind}.`,
      );
    }

    const sourceFingerprint =
      request.expectedSourceFingerprint ?? representationSourceFingerprint(request.source);
    const specFingerprint = hashStableValue(request.spec);
    const ref = createRepresentationResourceRef(
      request.source,
      sourceFingerprint,
      specFingerprint,
      generator,
      this.scope,
    );
    const variant = representationVariant(request.spec);
    this.pending.set(ref.id, { request, generator });

    try {
      const materialized = await this.resourceCache.resolve(ref, variant, {
        materializeIfMissing: true,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const resolved =
        materialized.status === 'ready' && !materialized.variantEntry
          ? await this.resourceCache.resolve(ref, variant, {
              ...(request.signal ? { signal: request.signal } : {}),
            })
          : materialized;
      if (resolved.status !== 'ready') {
        this.logger?.warn('Content representation could not be resolved.', {
          representationId: ref.id,
          representationKind: request.spec.kind,
          cacheStatus: resolved.status,
          ...(resolved.error ? { error: resolved.error } : {}),
        });
        return unavailableForCacheStatus(resolved.status);
      }

      return {
        status: 'ready',
        locator: {
          kind: 'content-representation',
          id: ref.id,
          representationKind: request.spec.kind,
          source: request.source,
          spec: request.spec,
          generatorId: generator.id,
          sourceFingerprint,
          specFingerprint,
          revision: generator.revision,
        },
        metadata: representationMetadata(resolved),
      };
    } catch (error) {
      if (request.signal?.aborted || isAbortError(error)) {
        return unavailable('representation-cancelled', 'Content representation was cancelled.');
      }
      this.logger?.error?.('Content representation failed.', {
        representationId: ref.id,
        representationKind: request.spec.kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return unavailable('representation-failed', 'Content representation generation failed.');
    } finally {
      this.pending.delete(ref.id);
    }
  }

  async readRepresentation(
    locator: ContentRepresentationLocator,
    options: ContentRepresentationReadOptions = {},
  ): Promise<ContentRepresentationBytes> {
    if (options.signal?.aborted) {
      return unavailableBytes(
        locator,
        'representation-cancelled',
        'Content representation read was cancelled.',
      );
    }
    const resolvedIdentity = this.resolveRepresentationIdentity(locator);
    if ('diagnostic' in resolvedIdentity) {
      return { status: 'unavailable', locator, diagnostic: resolvedIdentity.diagnostic };
    }

    try {
      const resolved = await this.resourceCache.resolve(
        resolvedIdentity.ref,
        resolvedIdentity.variant,
        options.signal ? { signal: options.signal } : undefined,
      );
      if (resolved.status !== 'ready' || !resolved.absolutePath) {
        return unavailableBytes(
          locator,
          'representation-missing',
          'Content representation is no longer available.',
        );
      }
      const totalByteLength =
        resolved.variantEntry?.sizeBytes ?? (await this.fileOps.stat(resolved.absolutePath)).size;
      const range = resolveRepresentationReadRange(totalByteLength, options);
      if ('diagnostic' in range) {
        return { status: 'unavailable', locator, diagnostic: range.diagnostic };
      }
      const bytes = await this.fileOps.readFile(resolved.absolutePath, range);
      return {
        status: 'ready',
        locator,
        bytes,
        offset: range.offset,
        totalByteLength,
        metadata: representationMetadata(resolved),
      };
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        return unavailableBytes(
          locator,
          'representation-cancelled',
          'Content representation read was cancelled.',
        );
      }
      this.logger?.error?.('Content representation read failed.', {
        representationId: locator.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return unavailableBytes(
        locator,
        'representation-failed',
        'Content representation read failed.',
      );
    }
  }

  private resolveRepresentationIdentity(locator: ContentRepresentationLocator):
    | {
        readonly ref: ResourceRef;
        readonly variant: ResourceVariantRequest;
      }
    | { readonly diagnostic: ContentRepresentationDiagnostic } {
    if (
      locator.kind !== 'content-representation' ||
      !isContentLocator(locator.source) ||
      !isContentRepresentationSpec(locator.spec) ||
      locator.representationKind !== locator.spec.kind ||
      locator.specFingerprint !== hashStableValue(locator.spec)
    ) {
      return {
        diagnostic: representationDiagnostic(
          'representation-unsupported',
          'Content representation locator is invalid.',
        ),
      };
    }
    const generator = this.generators.get(locator.representationKind);
    if (
      !generator ||
      generator.id !== locator.generatorId ||
      generator.revision !== locator.revision
    ) {
      return {
        diagnostic: representationDiagnostic(
          'representation-source-changed',
          'Content representation generator revision is no longer current.',
        ),
      };
    }
    const ref = createRepresentationResourceRef(
      locator.source,
      locator.sourceFingerprint,
      locator.specFingerprint,
      generator,
      this.scope,
    );
    if (ref.id !== locator.id) {
      return {
        diagnostic: representationDiagnostic(
          'representation-source-changed',
          'Content representation locator identity does not match its source.',
        ),
      };
    }
    return { ref, variant: representationVariant(locator.spec) };
  }
}

interface ContentRepresentationResourceCacheProviderOptions {
  readonly pending: ReadonlyMap<string, PendingRepresentation>;
  readonly fileOps?: ResourceCacheFileOps;
  readonly logger?: ResourceCacheLogger;
}

class ContentRepresentationResourceCacheProvider implements ResourceCacheProvider {
  readonly id = CONTENT_REPRESENTATION_RESOURCE_PROVIDER_ID;

  private readonly pending: ReadonlyMap<string, PendingRepresentation>;
  private readonly fileOps: ResourceCacheFileOps;
  private readonly logger?: ResourceCacheLogger;

  constructor(options: ContentRepresentationResourceCacheProviderOptions) {
    this.pending = options.pending;
    this.fileOps = options.fileOps ?? nodeFileOps;
    this.logger = options.logger;
  }

  supports(ref: ResourceRef): boolean {
    return ref.provider === this.id;
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    const pending = this.pending.get(input.ref.id);
    if (!pending || !this.supports(input.ref)) {
      return failedEnsure(input, 'Content representation request context is unavailable.');
    }

    try {
      const generated = await pending.generator.generate({
        source: pending.request.source,
        spec: pending.request.spec,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (generated.bytes.byteLength === 0) {
        return failedEnsure(input, 'Content representation generator returned empty bytes.');
      }

      const relativePath = representationRelativePath(
        input.ref,
        pending.request.spec.kind,
        generated.metadata.mimeType,
      );
      const targetPath = path.join(input.cacheRoot, relativePath);
      await this.fileOps.mkdir(path.dirname(targetPath), { recursive: true });
      await this.fileOps.writeFile(targetPath, generated.bytes);
      const stat = await this.fileOps.stat(targetPath);
      return {
        status: 'ready',
        ref: input.ref,
        variant: input.variant,
        absolutePath: targetPath,
        relativePath,
        ...(generated.metadata.mimeType ? { mimeType: generated.metadata.mimeType } : {}),
        ...(generated.metadata.width !== undefined ? { width: generated.metadata.width } : {}),
        ...(generated.metadata.height !== undefined ? { height: generated.metadata.height } : {}),
        sizeBytes: generated.metadata.byteLength ?? stat.size,
        rebuildable: true,
      };
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) {
        throw error;
      }
      this.logger?.error?.('Content representation generator failed.', {
        representationId: input.ref.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return failedEnsure(input, 'Content representation generator failed.');
    }
  }
}

function createRepresentationResourceRef(
  source: ContentLocator,
  sourceFingerprint: string,
  specFingerprint: string,
  generator: ContentRepresentationGenerator,
  scope: ResourceScope,
): ResourceRef {
  const sourceRef = representationResourceSource(source, specFingerprint, generator);
  return createResourceRef({
    scope,
    provider: CONTENT_REPRESENTATION_RESOURCE_PROVIDER_ID,
    kind: representationResourceKind(source),
    source: sourceRef,
    ...(representationResourceLocator(source)
      ? { locator: representationResourceLocator(source) }
      : {}),
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: hashStableValue({ sourceFingerprint, specFingerprint, revision: generator.revision }),
      providerId: CONTENT_REPRESENTATION_RESOURCE_PROVIDER_ID,
    }),
  });
}

function representationResourceSource(
  source: ContentLocator,
  specFingerprint: string,
  generator: ContentRepresentationGenerator,
): ResourceSourceRef {
  return {
    kind: representationSourceKind(source),
    ...(representationSourcePath(source) ? { filePath: representationSourcePath(source) } : {}),
    metadata: {
      stableSource: source,
      representationSpecFingerprint: specFingerprint,
      representationGeneratorId: generator.id,
      representationGeneratorRevision: generator.revision,
    },
  };
}

function representationSourceKind(source: ContentLocator): ResourceSourceKind {
  switch (source.kind) {
    case 'document-entry':
      return 'document';
    case 'generated-output':
      return 'generated-asset';
    case 'package-resource':
    case 'workspace-file':
      return 'file';
  }
}

function representationSourcePath(source: ContentLocator): string | undefined {
  switch (source.kind) {
    case 'workspace-file':
      return source.path;
    case 'document-entry':
      return source.source.path;
    case 'generated-output':
      return source.path;
    case 'package-resource':
      return source.manifestPath;
  }
}

function representationResourceKind(source: ContentLocator): ResourceKind {
  switch (source.kind) {
    case 'document-entry':
      return 'document';
    case 'generated-output':
      return 'generated';
    case 'package-resource':
    case 'workspace-file':
      return 'media';
  }
}

function representationResourceLocator(source: ContentLocator): ResourceRef['locator'] | undefined {
  switch (source.kind) {
    case 'workspace-file':
      return { kind: 'file', path: source.path };
    case 'document-entry':
      return { kind: 'document', entryPath: source.entryPath };
    case 'generated-output':
      return { kind: 'generated-asset', assetId: source.outputId };
    case 'package-resource':
      return source.manifestPath ? { kind: 'file', path: source.manifestPath } : undefined;
  }
}

function representationSourceFingerprint(source: ContentLocator): string {
  switch (source.kind) {
    case 'workspace-file':
    case 'document-entry':
      return source.fingerprint
        ? `${source.fingerprint.strategy}:${source.fingerprint.value}`
        : `identity:${hashStableValue(source)}`;
    case 'generated-output':
      return source.digest;
    case 'package-resource':
      return source.digest ?? `identity:${hashStableValue(source)}`;
  }
}

function representationVariant(spec: ContentRepresentationRequest['spec']): ResourceVariantRequest {
  switch (spec.kind) {
    case 'thumbnail':
      return {
        role: 'thumbnail',
        ...(spec.format ? { format: spec.format } : {}),
        ...(spec.maxWidth !== undefined ? { width: spec.maxWidth } : {}),
        ...(spec.maxHeight !== undefined ? { height: spec.maxHeight } : {}),
      };
    case 'proxy':
      return { role: 'proxy', format: spec.profile };
    case 'preview':
      return {
        role: 'preview',
        ...(spec.format ? { format: spec.format } : {}),
        ...(spec.maxWidth !== undefined ? { width: spec.maxWidth } : {}),
        ...(spec.maxHeight !== undefined ? { height: spec.maxHeight } : {}),
      };
    case 'raster-page':
      return { role: 'page-image', format: spec.format ?? 'png' };
    case 'fov-crop':
      return {
        role: 'fov-crop',
        format: spec.format ?? 'png',
        width: spec.width,
        height: spec.height,
      };
    case 'waveform':
      return { role: 'preview', format: 'waveform', width: spec.width, height: spec.height };
    case 'loudness':
      return { role: 'preview', format: `loudness-${spec.standard}` };
    case 'semantic-sidecar':
      return { role: 'preview', format: `${spec.modality}-${spec.profile}` };
  }
}

function representationMetadata(input: {
  readonly variant: {
    readonly mimeType?: string;
    readonly width?: number;
    readonly height?: number;
  };
  readonly variantEntry?: {
    readonly mimeType?: string;
    readonly sizeBytes?: number;
    readonly width?: number;
    readonly height?: number;
  };
}): ContentRepresentationMetadata {
  return {
    ...((input.variantEntry?.mimeType ?? input.variant.mimeType)
      ? { mimeType: input.variantEntry?.mimeType ?? input.variant.mimeType }
      : {}),
    ...(input.variantEntry?.sizeBytes !== undefined
      ? { byteLength: input.variantEntry.sizeBytes }
      : {}),
    ...((input.variantEntry?.width ?? input.variant.width) !== undefined
      ? { width: input.variantEntry?.width ?? input.variant.width }
      : {}),
    ...((input.variantEntry?.height ?? input.variant.height) !== undefined
      ? { height: input.variantEntry?.height ?? input.variant.height }
      : {}),
  };
}

function unavailableForCacheStatus(status: string): ContentRepresentationResult {
  switch (status) {
    case 'missing':
    case 'stale':
      return unavailable(
        'representation-source-missing',
        'Content representation source is unavailable.',
      );
    case 'unauthorized':
    case 'non-portable':
      return unavailable(
        'representation-unauthorized',
        'Content representation source is unauthorized.',
      );
    case 'unsupported':
      return unavailable('representation-unsupported', 'Content representation is unsupported.');
    default:
      return unavailable('representation-failed', 'Content representation generation failed.');
  }
}

function unavailable(
  code: ContentRepresentationDiagnostic['code'],
  message: string,
): ContentRepresentationResult {
  return { status: 'unavailable', diagnostic: { code, severity: 'error', message } };
}

function unavailableBytes(
  locator: ContentRepresentationLocator,
  code: ContentRepresentationDiagnostic['code'],
  message: string,
): ContentRepresentationBytes {
  return { status: 'unavailable', locator, diagnostic: representationDiagnostic(code, message) };
}

function representationDiagnostic(
  code: ContentRepresentationDiagnostic['code'],
  message: string,
): ContentRepresentationDiagnostic {
  return { code, severity: 'error', message };
}

function resolveRepresentationReadRange(
  totalByteLength: number,
  options: ContentRepresentationReadOptions,
):
  | { readonly offset: number; readonly length: number }
  | { readonly diagnostic: ContentRepresentationDiagnostic } {
  if (!Number.isSafeInteger(totalByteLength) || totalByteLength < 0) {
    return {
      diagnostic: representationDiagnostic(
        'representation-failed',
        'Content representation byte length is invalid.',
      ),
    };
  }
  const offset = options.range?.offset ?? 0;
  const requestedLength = options.range?.length ?? totalByteLength - offset;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > totalByteLength ||
    !Number.isSafeInteger(requestedLength) ||
    requestedLength < 0
  ) {
    return {
      diagnostic: representationDiagnostic(
        'representation-range-invalid',
        'Content representation read range is invalid.',
      ),
    };
  }
  const length = Math.min(requestedLength, totalByteLength - offset);
  if (
    options.maxBytes !== undefined &&
    (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0 || length > options.maxBytes)
  ) {
    return {
      diagnostic: representationDiagnostic(
        'representation-too-large',
        'Content representation exceeds the requested byte limit.',
      ),
    };
  }
  return { offset, length };
}

function failedEnsure(input: ResourceEnsureInput, error: string): ResourceEnsureResult {
  return {
    status: 'failed',
    ref: input.ref,
    variant: input.variant,
    error,
  };
}

function representationRelativePath(
  ref: ResourceRef,
  kind: ContentRepresentationKind,
  mimeType: string | undefined,
): string {
  return path.join('representations', kind, `${ref.id}.${extensionForMimeType(mimeType)}`);
}

function extensionForMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/json':
      return 'json';
    default:
      return 'bin';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const nodeFileOps: ContentRepresentationFileOps = {
  copyFile: async (source, target) => fs.copyFile(source, target),
  writeFile: async (filePath, content) => fs.writeFile(filePath, content),
  mkdir: async (filePath, options) => {
    await fs.mkdir(filePath, options);
  },
  stat: async (filePath) => fs.stat(filePath),
  readFile: async (filePath, range) => {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = new Uint8Array(range.length);
      const { bytesRead } = await handle.read(buffer, 0, range.length, range.offset);
      return bytesRead === buffer.byteLength ? buffer : buffer.slice(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};
