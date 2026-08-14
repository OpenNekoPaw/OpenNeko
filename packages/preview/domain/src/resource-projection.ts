import type { ContentLocator, ContentRepresentationLocator } from '@neko/content';
import {
  detectPreviewContentKind,
  parsePreviewMediaDescriptor,
  type PreviewContentKind,
  type PreviewMediaDescriptor,
} from './index.js';

export type PreviewResourceLocator = ContentLocator | ContentRepresentationLocator;

interface PreviewResourceSourceBase {
  readonly mediaType: string;
  readonly sourceFingerprint: string;
  readonly byteLength: number;
}

export type PreviewResourceSource =
  | (PreviewResourceSourceBase & {
      readonly kind: 'file';
      readonly absolutePath: string;
    })
  | (PreviewResourceSourceBase & {
      readonly kind: 'bytes';
      readonly bytes: Uint8Array;
    });

export interface PreviewResourceProjectionDiagnostic {
  readonly code: string;
  readonly message: string;
}

export type PreviewResourceSourceResolution =
  | { readonly status: 'ready'; readonly source: PreviewResourceSource }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: PreviewResourceProjectionDiagnostic;
    };

export interface PreviewResourceLease {
  readonly url: string;
  readonly resourceUris?: Readonly<Record<string, string>>;
  release(): void;
}

export type PreviewResourceRegistration =
  | { readonly status: 'ready'; readonly lease: PreviewResourceLease }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: PreviewResourceProjectionDiagnostic;
    };

export type PreviewResourceProjection =
  | {
      readonly status: 'ready';
      readonly descriptor: PreviewMediaDescriptor;
      readonly lease: PreviewResourceLease;
    }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: PreviewResourceProjectionDiagnostic;
    };

export interface PreviewResourceProjectionInput<Owner> {
  readonly descriptorId: string;
  readonly locator: PreviewResourceLocator;
  readonly displayName: string;
  readonly owner: Owner;
  readonly requestedMediaType?: string;
}

export interface PreviewResourceProjectionService<Owner> {
  project(input: PreviewResourceProjectionInput<Owner>): Promise<PreviewResourceProjection>;
  release(descriptorId: string): void;
  dispose(): void;
}

export function createPreviewResourceProjectionService<Owner>(ports: {
  readonly resolveSource: (input: {
    readonly locator: PreviewResourceLocator;
    readonly displayName: string;
    readonly owner: Owner;
    readonly requestedMediaType?: string;
  }) => Promise<PreviewResourceSourceResolution>;
  readonly registerSource: (input: {
    readonly owner: Owner;
    readonly source: PreviewResourceSource;
  }) => Promise<PreviewResourceRegistration>;
}): PreviewResourceProjectionService<Owner> {
  const projections = new Map<
    string,
    {
      readonly descriptor: PreviewMediaDescriptor;
      readonly lease: PreviewResourceLease;
    }
  >();
  const operationTails = new Map<string, Promise<void>>();
  const releaseFences = new Map<string, symbol>();
  let disposed = false;

  const releaseStoredProjection = (descriptorId: string): void => {
    const current = projections.get(descriptorId);
    if (!current) return;
    current.lease.release();
    projections.delete(descriptorId);
  };

  const projectNow = async (
    input: PreviewResourceProjectionInput<Owner>,
    releaseFence: symbol | undefined,
  ): Promise<PreviewResourceProjection> => {
    if (disposed) throw new Error('Preview resource projection service is disposed.');
    if (releaseFences.get(input.descriptorId) !== releaseFence) {
      return releasedProjection();
    }
    const resolved = await ports.resolveSource({
      locator: input.locator,
      displayName: requireDisplayName(input.displayName),
      owner: input.owner,
      ...(input.requestedMediaType
        ? { requestedMediaType: requireMediaType(input.requestedMediaType) }
        : {}),
    });
    if (disposed || releaseFences.get(input.descriptorId) !== releaseFence) {
      return releasedProjection();
    }
    if (resolved.status === 'unavailable') {
      releaseStoredProjection(input.descriptorId);
      return resolved;
    }
    validateSource(resolved.source);

    const current = projections.get(input.descriptorId);
    if (
      current?.descriptor.sourceFingerprint === resolved.source.sourceFingerprint &&
      current.descriptor.mediaType === resolved.source.mediaType &&
      current.descriptor.byteLength === resolved.source.byteLength
    ) {
      return { status: 'ready', descriptor: current.descriptor, lease: current.lease };
    }
    releaseStoredProjection(input.descriptorId);

    const registered = await ports.registerSource({
      owner: input.owner,
      source: resolved.source,
    });
    if (registered.status === 'unavailable') return registered;
    if (disposed || releaseFences.get(input.descriptorId) !== releaseFence) {
      registered.lease.release();
      return releasedProjection();
    }

    const contentKind =
      previewContentKindFromMediaType(resolved.source.mediaType) ??
      detectPreviewContentKind(input.displayName);
    if (!contentKind) {
      registered.lease.release();
      return {
        status: 'unavailable',
        diagnostic: {
          code: 'preview-unsupported-kind',
          message: `Preview does not support '${input.displayName}'.`,
        },
      };
    }

    try {
      const descriptor = parsePreviewMediaDescriptor({
        descriptorId: input.descriptorId,
        sourceFingerprint: resolved.source.sourceFingerprint,
        contentLocator:
          input.locator.kind === 'content-representation' ? input.locator.source : input.locator,
        url: registered.lease.url,
        ...(registered.lease.resourceUris ? { resourceUris: registered.lease.resourceUris } : {}),
        contentKind,
        mediaType: resolved.source.mediaType,
        displayName: input.displayName,
        byteLength: resolved.source.byteLength,
      });
      projections.set(input.descriptorId, { descriptor, lease: registered.lease });
      return { status: 'ready', descriptor, lease: registered.lease };
    } catch (error) {
      registered.lease.release();
      throw error;
    }
  };

  const service: PreviewResourceProjectionService<Owner> = {
    project(input): Promise<PreviewResourceProjection> {
      if (disposed) throw new Error('Preview resource projection service is disposed.');
      const previous = operationTails.get(input.descriptorId) ?? Promise.resolve();
      const releaseFence = releaseFences.get(input.descriptorId);
      const operation = previous.then(
        () => projectNow(input, releaseFence),
        () => projectNow(input, releaseFence),
      );
      const tail = operation.then(
        () => undefined,
        () => undefined,
      );
      operationTails.set(input.descriptorId, tail);
      void tail.finally(() => {
        if (operationTails.get(input.descriptorId) === tail) {
          operationTails.delete(input.descriptorId);
        }
      });
      return operation;
    },
    release(descriptorId) {
      if (disposed) return;
      releaseFences.set(descriptorId, Symbol(descriptorId));
      releaseStoredProjection(descriptorId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const projection of projections.values()) projection.lease.release();
      projections.clear();
      releaseFences.clear();
    },
  };
  return Object.freeze(service);
}

export function previewContentKindFromMediaType(mediaType: string): PreviewContentKind | undefined {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  if (mediaType.startsWith('text/')) return 'text';
  if (mediaType.startsWith('model/')) return 'model';
  if (
    mediaType === 'application/pdf' ||
    mediaType.includes('document') ||
    mediaType.includes('epub')
  ) {
    return 'document';
  }
  return undefined;
}

function releasedProjection(): PreviewResourceProjection {
  return {
    status: 'unavailable',
    diagnostic: {
      code: 'preview-projection-released',
      message: 'Preview resource projection was released before registration completed.',
    },
  };
}

function validateSource(source: PreviewResourceSource): void {
  requireMediaType(source.mediaType);
  if (!source.sourceFingerprint.trim()) {
    throw new Error('Preview resource source fingerprint is required.');
  }
  if (!Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
    throw new Error('Preview resource byte length is invalid.');
  }
  if (source.kind === 'file') {
    if (!source.absolutePath.trim()) throw new Error('Preview resource file path is required.');
    return;
  }
  if (source.bytes.byteLength !== source.byteLength) {
    throw new Error('Preview resource byte source length does not match its metadata.');
  }
}

function requireDisplayName(value: string): string {
  const displayName = value.trim();
  if (!displayName) throw new Error('Preview resource display name is required.');
  return displayName;
}

function requireMediaType(value: string): string {
  const mediaType = value.trim().toLocaleLowerCase();
  if (!mediaType || !mediaType.includes('/')) {
    throw new Error('Preview resource media type is invalid.');
  }
  return mediaType;
}
