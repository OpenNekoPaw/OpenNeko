import {
  createResourceFingerprint,
  createResourceRef,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  type DocumentArchiveResourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';

export interface DocumentResourceProjection {
  readonly ref: DocumentArchiveResourceRef;
  readonly variant: ResourceVariantRequest;
}

export interface DocumentResourceProjectionProjector {
  project(
    ref: DocumentArchiveResourceRef,
    variant: ResourceVariantRequest,
  ): Promise<string | undefined>;
  onMissingProjection?(record: Record<string, unknown>, field: string): void;
}

export function createManagedDocumentResourceRef(
  ref: DocumentArchiveResourceRef,
  scope: ResourceRef['scope'] = 'project',
): ResourceRef {
  return createResourceRef({
    scope,
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

export function createDocumentEntryVariantFromMetadata(input: {
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly metadata?: Record<string, unknown>;
}): ResourceVariantRequest {
  const mimeType =
    input.mimeType ??
    (typeof input.metadata?.['mimeType'] === 'string' ? input.metadata['mimeType'] : undefined);
  const width =
    input.width ??
    (typeof input.metadata?.['width'] === 'number' ? input.metadata['width'] : undefined);
  const height =
    input.height ??
    (typeof input.metadata?.['height'] === 'number' ? input.metadata['height'] : undefined);
  return {
    role: 'document-entry',
    ...(mimeType ? { mimeType } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

export function readDocumentResourceDisplayId(
  resourceRef: DocumentArchiveResourceRef | ResourceRef | undefined,
): string | undefined {
  if (!resourceRef) return undefined;
  if (isResourceRef(resourceRef)) return resourceRef.id;
  return resourceRef.entryPath ?? resourceRef.source.fileId ?? resourceRef.source.filePath;
}

export function formatDocumentImageAlias(resourceRef: DocumentArchiveResourceRef): string {
  if (resourceRef.locator?.kind === 'page') return `page_${resourceRef.locator.pageNumber}`;
  if (resourceRef.locator?.kind === 'slide') return `slide_${resourceRef.locator.slideNumber}`;
  if (resourceRef.locator?.kind === 'chapter' && resourceRef.locator.spineIndex !== undefined) {
    return `page_${resourceRef.locator.spineIndex + 1}`;
  }
  const entryMatch = /(?:^|[^\d])(\d{1,4})(?:[^\d]|$)/.exec(resourceRef.entryPath ?? '');
  return entryMatch?.[1] ? `page_${Number.parseInt(entryMatch[1], 10)}` : 'image_1';
}

export function formatDocumentAliasScope(resourceRef: DocumentArchiveResourceRef): string {
  return `document:${formatDocumentSourceId(resourceRef)}`;
}

export function formatDocumentSourceId(resourceRef: DocumentArchiveResourceRef): string {
  const source = resourceRef.source;
  return source.identity?.hash ?? source.identity?.fileId ?? source.fileId ?? source.filePath;
}

export async function projectDocumentResourceRefsInValue(
  value: unknown,
  projector: DocumentResourceProjectionProjector,
): Promise<unknown> {
  return projectDocumentResourceRefsInValueInner(value, projector, new WeakSet<object>());
}

export function readDocumentArchiveResourceProjection(
  value: Record<string, unknown>,
): DocumentResourceProjection | undefined {
  const ref =
    parseDocumentArchiveResourceRef(value['documentResourceRef']) ??
    parseDocumentArchiveResourceRef(value['resourceRef']);
  if (!ref) return undefined;
  return {
    ref,
    variant: createDocumentEntryVariantFromMetadata({
      mimeType: typeof value['mimeType'] === 'string' ? value['mimeType'] : undefined,
      width: typeof value['width'] === 'number' ? value['width'] : undefined,
      height: typeof value['height'] === 'number' ? value['height'] : undefined,
    }),
  };
}

async function projectDocumentResourceRefsInValueInner(
  value: unknown,
  projector: DocumentResourceProjectionProjector,
  visited: WeakSet<object>,
): Promise<unknown> {
  if (!isRecordOrArray(value)) return value;
  if (visited.has(value)) return value;
  visited.add(value);

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => projectDocumentResourceRefsInValueInner(item, projector, visited)),
    );
  }

  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    projected[key] = await projectDocumentResourceRefsInValueInner(child, projector, visited);
  }

  const documentResource = readDocumentArchiveResourceProjection(projected);
  if (
    !documentResource ||
    typeof projected['renderUri'] === 'string' ||
    typeof projected['src'] === 'string'
  ) {
    return projected;
  }

  const renderUri = await projector.project(documentResource.ref, documentResource.variant);
  if (renderUri) {
    projected['renderUri'] = renderUri;
    projected['src'] = renderUri;
    return projected;
  }

  projector.onMissingProjection?.(projected, 'documentResourceRef');
  return projected;
}

function isRecordOrArray(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
