import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PathResolver } from '../../path';
import {
  createResourceFingerprint,
  createResourceRef,
  createResourceVariantKey,
  hashStableValue,
  readResourceSourceLocalPath,
  type PreviewAssetKind,
  type PreviewManifest,
  type PreviewVariant,
  type PreviewVariantRequest,
  type ResourceRef,
  type ResourceSourceRef,
  type ResourceVariantRequest,
} from '../../types';
import type {
  ResourceCacheProvider,
  ResourceEnsureInput,
  ResourceEnsureResult,
} from './resource-cache-service';

export const THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID = 'media-thumbnail';
export const PREVIEW_RESOURCE_CACHE_PROVIDER_ID = 'preview-variant';
export const GENERATED_RESOURCE_CACHE_PROVIDER_ID = 'generated-asset';

export interface ResourceCacheFileOps {
  copyFile(source: string, target: string): Promise<void>;
  writeFile(filePath: string, content: Uint8Array): Promise<void>;
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number }>;
}

export interface ThumbnailResourceGenerator {
  generate(
    filePath: string,
    options: { readonly maxWidth?: number; readonly maxHeight?: number },
  ): Promise<ThumbnailResourceGeneratorResult | null>;
}

export type ThumbnailResourceGeneratorResult =
  ThumbnailResourceGeneratorPathResult | ThumbnailResourceGeneratorBytesResult;

export interface ThumbnailResourceGeneratorPathResult {
  readonly path: string;
  readonly bytes?: never;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface ThumbnailResourceGeneratorBytesResult {
  readonly bytes: Uint8Array;
  readonly path?: never;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface ThumbnailResourceCacheProviderOptions {
  readonly generator: ThumbnailResourceGenerator;
  readonly fsOps?: ResourceCacheFileOps;
}

export interface PreviewVariantResourceApi {
  registerPreviewAsset(request: {
    readonly source: string;
    readonly kind?: PreviewAssetKind;
    readonly explicitOpen?: boolean;
  }): Promise<PreviewManifest>;
  requestPreviewVariant(assetId: string, request: PreviewVariantRequest): Promise<PreviewVariant>;
  unregisterPreviewAsset?(assetIdOrToken: string): Promise<void>;
}

export interface PreviewVariantResourceCacheProviderOptions {
  readonly preview: PreviewVariantResourceApi;
  readonly fsOps?: ResourceCacheFileOps;
}

export interface GeneratedAssetResourceResolverResult {
  readonly path: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
}

export interface GeneratedAssetDerivativeResourceCacheProviderOptions {
  readonly resolveAsset?: (
    ref: ResourceRef,
  ) => Promise<GeneratedAssetResourceResolverResult | undefined>;
  readonly fsOps?: ResourceCacheFileOps;
  readonly generator?: GeneratedImageVariantGenerator;
  readonly pathResolver?: PathResolver;
  readonly projectRoot?: string;
}

export interface GeneratedImageVariantGeneratorResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

export interface GeneratedImageVariantGenerator {
  generate(
    sourcePath: string,
    request: {
      readonly role: 'thumbnail';
      readonly width?: number;
      readonly height?: number;
      readonly mimeType?: string;
    },
  ): Promise<GeneratedImageVariantGeneratorResult | undefined>;
}

export interface CreateFileThumbnailResourceRefInput {
  readonly filePath: string;
  readonly scope?: ResourceRef['scope'];
  readonly mediaLibraryId?: string;
  readonly projectRelativePath?: string;
  readonly identity?: ResourceSourceRef['identity'];
}

export interface CreateGeneratedAssetResourceRefInput {
  readonly assetId: string;
  readonly path: string;
  readonly mimeType?: string;
  readonly scope?: ResourceRef['scope'];
  readonly variantId?: string;
  readonly identity?: ResourceSourceRef['identity'];
}

export interface CreatePreviewAssetResourceRefInput {
  readonly assetId: string;
  readonly sourcePath: string;
  readonly scope?: ResourceRef['scope'];
  readonly kind?: PreviewAssetKind;
  readonly route?: string;
  readonly identity?: ResourceSourceRef['identity'];
}

export class ThumbnailResourceCacheProvider implements ResourceCacheProvider {
  readonly id = THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID;

  private readonly generator: ThumbnailResourceGenerator;
  private readonly fsOps: ResourceCacheFileOps;

  constructor(options: ThumbnailResourceCacheProviderOptions) {
    this.generator = options.generator;
    this.fsOps = options.fsOps ?? nodeFileOps;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return ref.provider === this.id && ref.kind === 'media' && variant.role === 'thumbnail';
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    const sourcePath = readLocalSourcePath(input.ref);
    if (!this.supports(input.ref, input.variant) || !sourcePath) {
      return unsupported(input, 'Thumbnail resource requires a local media source path.');
    }

    const generated = await this.generator.generate(sourcePath, {
      maxWidth: input.variant.width,
      maxHeight: input.variant.height,
    });
    if (!generated) {
      return unsupported(input, 'Thumbnail generator did not produce a thumbnail.');
    }

    const artifact = {
      input,
      fsOps: this.fsOps,
      directory: 'thumbnails',
      mimeType: generated.mimeType ?? input.variant.mimeType ?? 'image/jpeg',
      width: generated.width ?? input.variant.width,
      height: generated.height ?? input.variant.height,
      sizeBytes: generated.sizeBytes,
      rebuildable: true,
    } as const;
    return generated.bytes !== undefined
      ? writeProviderArtifact({ ...artifact, bytes: generated.bytes, sourcePath })
      : copyProviderArtifact({ ...artifact, sourcePath: generated.path });
  }
}

export class PreviewVariantResourceCacheProvider implements ResourceCacheProvider {
  readonly id = PREVIEW_RESOURCE_CACHE_PROVIDER_ID;

  private readonly preview: PreviewVariantResourceApi;
  private readonly fsOps: ResourceCacheFileOps;

  constructor(options: PreviewVariantResourceCacheProviderOptions) {
    this.preview = options.preview;
    this.fsOps = options.fsOps ?? nodeFileOps;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return (
      ref.provider === this.id &&
      ref.kind === 'preview' &&
      (variant.role === 'preview' ||
        variant.role === 'thumbnail' ||
        variant.role === 'proxy' ||
        variant.role === 'fov-crop')
    );
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    const sourcePath = readLocalSourcePath(input.ref);
    if (!this.supports(input.ref, input.variant) || !sourcePath) {
      return unsupported(input, 'Preview resource requires a local preview source path.');
    }

    const manifest = await this.preview.registerPreviewAsset({
      source: sourcePath,
      kind: readPreviewKind(input.ref),
      explicitOpen: false,
    });
    const previewVariant = await this.preview.requestPreviewVariant(manifest.assetId, {
      role: toPreviewVariantRole(input.variant.role),
      width: input.variant.width,
      height: input.variant.height,
      format: toPreviewFormat(input.variant.format),
    });
    const variantPath = readLocalVariantPath(previewVariant);
    if (!variantPath) {
      return unsupported(input, 'Preview variant did not resolve to a local cache artifact.');
    }

    return copyProviderArtifact({
      input,
      fsOps: this.fsOps,
      sourcePath: variantPath,
      directory: 'previews',
      mimeType: previewVariant.mimeType ?? input.variant.mimeType,
      width: previewVariant.dimensions?.width ?? input.variant.width,
      height: previewVariant.dimensions?.height ?? input.variant.height,
      sizeBytes: previewVariant.fileSizeBytes,
      rebuildable: true,
    });
  }
}

export class GeneratedAssetDerivativeResourceCacheProvider implements ResourceCacheProvider {
  readonly id = GENERATED_RESOURCE_CACHE_PROVIDER_ID;

  private readonly resolveAsset?: GeneratedAssetDerivativeResourceCacheProviderOptions['resolveAsset'];
  private readonly fsOps: ResourceCacheFileOps;
  private readonly generator?: GeneratedImageVariantGenerator;
  private readonly pathResolver?: PathResolver;
  private readonly projectRoot?: string;

  constructor(options: GeneratedAssetDerivativeResourceCacheProviderOptions = {}) {
    this.resolveAsset = options.resolveAsset;
    this.fsOps = options.fsOps ?? nodeFileOps;
    this.generator = options.generator;
    this.pathResolver = options.pathResolver;
    this.projectRoot = options.projectRoot;
  }

  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean {
    return (
      ref.provider === this.id &&
      ref.kind === 'generated' &&
      ref.source.kind === 'generated-asset' &&
      variant.role === 'thumbnail' &&
      isPositiveDimension(variant.width, variant.height)
    );
  }

  async ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult> {
    if (!this.supports(input.ref, input.variant)) {
      return unsupported(input, 'Generated asset provider does not support this variant.');
    }

    const resolved =
      (await this.resolveAsset?.(input.ref)) ??
      resolveGeneratedAssetResourceRef(input.ref, this.pathResolver, this.projectRoot);
    if (!resolved?.path) {
      return unsupported(
        input,
        'Generated asset resource requires local generated asset metadata.',
      );
    }
    if (resolved.mimeType && !resolved.mimeType.startsWith('image/')) {
      return unsupported(input, 'Generated asset preview is only supported for image metadata.');
    }
    if (!this.generator) {
      return unsupported(input, 'Generated image thumbnail requires an image variant generator.');
    }
    const generated = await this.generator.generate(resolved.path, {
      role: 'thumbnail',
      width: input.variant.width,
      height: input.variant.height,
      mimeType: input.variant.mimeType,
    });
    if (!generated || generated.bytes.byteLength === 0) {
      return unsupported(input, 'Generated image thumbnail generator did not produce an artifact.');
    }
    const relativePath = createProviderRelativePath(
      'generated',
      input.ref,
      { ...input.variant, mimeType: generated.mimeType },
      resolved.path,
    );
    const targetPath = path.join(input.cacheRoot, relativePath);
    await this.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
    await this.fsOps.writeFile(targetPath, generated.bytes);
    return {
      status: 'ready',
      ref: input.ref,
      variant: input.variant,
      absolutePath: targetPath,
      relativePath,
      mimeType: generated.mimeType,
      width: generated.width,
      height: generated.height,
      sizeBytes: generated.bytes.byteLength,
      rebuildable: true,
    };
  }
}

function isPositiveDimension(width: number | undefined, height: number | undefined): boolean {
  return (width !== undefined && width > 0) || (height !== undefined && height > 0);
}

export function createFileThumbnailResourceRef(
  input: CreateFileThumbnailResourceRefInput,
): ResourceRef {
  const source: ResourceSourceRef = {
    kind: input.mediaLibraryId ? 'media-library' : 'file',
    filePath: input.filePath,
    ...(input.projectRelativePath ? { projectRelativePath: input.projectRelativePath } : {}),
    ...(input.mediaLibraryId ? { mediaLibraryId: input.mediaLibraryId } : {}),
    ...(input.identity ? { identity: input.identity } : {}),
  };
  return createResourceRef({
    scope: input.scope ?? 'project',
    provider: THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'media',
    source,
    locator: { kind: 'file', path: input.filePath },
    fingerprint: createResourceFingerprint({
      strategy: input.identity ? 'mtime-size' : 'provider',
      value: input.identity
        ? hashStableValue(input.identity)
        : hashStableValue({ filePath: input.filePath }),
      providerId: THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID,
    }),
  });
}

export function createGeneratedAssetResourceRef(
  input: CreateGeneratedAssetResourceRefInput,
): ResourceRef {
  const source: ResourceSourceRef = {
    kind: 'generated-asset',
    generatedAssetId: input.assetId,
    filePath: input.path,
    ...(input.identity ? { identity: input.identity } : {}),
    metadata: {
      path: input.path,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    },
  };
  return createResourceRef({
    scope: input.scope ?? 'project',
    provider: GENERATED_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'generated',
    source,
    locator: {
      kind: 'generated-asset',
      assetId: input.assetId,
      ...(input.variantId ? { variantId: input.variantId } : {}),
    },
    fingerprint: createResourceFingerprint({
      strategy: input.identity ? 'mtime-size' : 'provider',
      value: input.identity
        ? hashStableValue(input.identity)
        : hashStableValue({ assetId: input.assetId, path: input.path }),
      providerId: GENERATED_RESOURCE_CACHE_PROVIDER_ID,
    }),
  });
}

export function createPreviewAssetResourceRef(
  input: CreatePreviewAssetResourceRefInput,
): ResourceRef {
  const source: ResourceSourceRef = {
    kind: 'preview-asset',
    previewAssetId: input.assetId,
    filePath: input.sourcePath,
    ...(input.identity ? { identity: input.identity } : {}),
    metadata: {
      sourcePath: input.sourcePath,
      ...(input.kind ? { kind: input.kind } : {}),
    },
  };
  return createResourceRef({
    scope: input.scope ?? 'project',
    provider: PREVIEW_RESOURCE_CACHE_PROVIDER_ID,
    kind: 'preview',
    source,
    locator: {
      kind: 'preview-asset',
      assetId: input.assetId,
      ...(input.route ? { route: input.route } : {}),
    },
    fingerprint: createResourceFingerprint({
      strategy: input.identity ? 'mtime-size' : 'provider',
      value: input.identity
        ? hashStableValue(input.identity)
        : hashStableValue({ assetId: input.assetId, sourcePath: input.sourcePath }),
      providerId: PREVIEW_RESOURCE_CACHE_PROVIDER_ID,
    }),
  });
}

async function copyProviderArtifact(input: {
  readonly input: ResourceEnsureInput;
  readonly fsOps: ResourceCacheFileOps;
  readonly sourcePath: string;
  readonly directory: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly rebuildable: boolean;
}): Promise<ResourceEnsureResult> {
  const relativePath = createProviderRelativePath(
    input.directory,
    input.input.ref,
    input.input.variant,
    input.sourcePath,
  );
  const targetPath = path.join(input.input.cacheRoot, relativePath);
  await input.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
  if (path.resolve(input.sourcePath) !== path.resolve(targetPath)) {
    await input.fsOps.copyFile(input.sourcePath, targetPath);
  }
  const stat = await input.fsOps.stat(targetPath);
  return {
    status: 'ready',
    ref: input.input.ref,
    variant: input.input.variant,
    absolutePath: targetPath,
    relativePath,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    sizeBytes: input.sizeBytes ?? stat.size,
    rebuildable: input.rebuildable,
  };
}

async function writeProviderArtifact(input: {
  readonly input: ResourceEnsureInput;
  readonly fsOps: ResourceCacheFileOps;
  readonly bytes: Uint8Array;
  readonly sourcePath: string;
  readonly directory: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly rebuildable: boolean;
}): Promise<ResourceEnsureResult> {
  const relativePath = createProviderRelativePath(
    input.directory,
    input.input.ref,
    input.input.variant,
    input.sourcePath,
  );
  const targetPath = path.join(input.input.cacheRoot, relativePath);
  await input.fsOps.mkdir(path.dirname(targetPath), { recursive: true });
  await input.fsOps.writeFile(targetPath, input.bytes);
  return {
    status: 'ready',
    ref: input.input.ref,
    variant: input.input.variant,
    absolutePath: targetPath,
    relativePath,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
    rebuildable: input.rebuildable,
  };
}

function unsupported(input: ResourceEnsureInput, error: string): ResourceEnsureResult {
  return {
    status: 'unsupported',
    ref: input.ref,
    variant: input.variant,
    error,
  };
}

function createProviderRelativePath(
  directory: string,
  ref: ResourceRef,
  variant: ResourceVariantRequest,
  sourcePath: string,
): string {
  const variantKey = createResourceVariantKey({ resource: ref, ...variant });
  const ext = extensionForVariant(sourcePath, variant);
  return path.join(directory, ref.provider, ref.id, `${variantKey}${ext}`);
}

function extensionForVariant(sourcePath: string, variant: ResourceVariantRequest): string {
  if (variant.format) return `.${variant.format.replace(/^\./, '')}`;
  if (variant.mimeType === 'image/png') return '.png';
  if (variant.mimeType === 'image/webp') return '.webp';
  if (variant.mimeType === 'image/jpeg') return '.jpg';
  return path.extname(sourcePath) || '.bin';
}

function readLocalSourcePath(ref: ResourceRef): string | undefined {
  const locatorPath = ref.locator?.kind === 'file' ? ref.locator.path : undefined;
  const metadataPath =
    readString(ref.source.metadata?.['path']) ?? readString(ref.source.metadata?.['sourcePath']);
  return readLocalPath(locatorPath ?? readResourceSourceLocalPath(ref.source) ?? metadataPath);
}

export function resolveGeneratedAssetResourceRef(
  ref: ResourceRef,
  pathResolver?: PathResolver,
  projectRoot?: string,
): GeneratedAssetResourceResolverResult | undefined {
  const filePath = resolveGeneratedAssetLocalPath(
    readLocalSourcePath(ref),
    pathResolver,
    projectRoot,
  );
  if (!filePath) return undefined;
  return {
    path: filePath,
    ...(readString(ref.source.metadata?.['mimeType'])
      ? { mimeType: readString(ref.source.metadata?.['mimeType']) }
      : {}),
  };
}

function resolveGeneratedAssetLocalPath(
  filePath: string | undefined,
  pathResolver?: PathResolver,
  projectRoot?: string,
): string | undefined {
  if (!filePath || !pathResolver || !projectRoot) return filePath;
  const resolved = pathResolver.resolveSource(filePath, projectRoot);
  if (resolved.type !== 'local' || pathResolver.hasVariable(resolved.path)) return filePath;
  return resolved.path;
}

function readLocalVariantPath(variant: PreviewVariant): string | undefined {
  return readLocalPath(variant.url);
}

function readLocalPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^https?:/i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) return undefined;
  if (value.startsWith('file://')) {
    try {
      return new URL(value).pathname;
    } catch {
      return undefined;
    }
  }
  return value;
}

function readPreviewKind(ref: ResourceRef): PreviewAssetKind | undefined {
  const kind = ref.source.metadata?.['kind'];
  return kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'document' ||
    kind === 'unknown'
    ? kind
    : undefined;
}

function toPreviewVariantRole(role: ResourceVariantRequest['role']): PreviewVariantRequest['role'] {
  if (role === 'preview') return 'thumbnail';
  if (role === 'document-entry') return 'thumbnail';
  if (role === 'page-image') return 'thumbnail';
  if (role === 'proxy' || role === 'fov-crop' || role === 'thumbnail') return role;
  return 'thumbnail';
}

function toPreviewFormat(format: string | undefined): PreviewVariantRequest['format'] | undefined {
  return format === 'jpeg' || format === 'jpg'
    ? 'jpeg'
    : format === 'png' || format === 'webp'
      ? format
      : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const nodeFileOps: ResourceCacheFileOps = {
  copyFile: (source, target) => fs.copyFile(source, target),
  writeFile: (filePath, content) => fs.writeFile(filePath, content),
  mkdir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
  stat: async (filePath) => {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  },
};
