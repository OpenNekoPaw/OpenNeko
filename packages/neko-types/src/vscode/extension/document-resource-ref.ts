import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  type DocumentArchiveResourceRef,
  type DocumentLocator,
  type DocumentSourceRef,
  type ResourceRef,
  type ResourceSourceRef,
} from '../../types';

const DOCUMENT_RESOURCE_PROVIDER_ID = 'document-archive';

export interface CreateDocumentResourceRefInput {
  readonly source: DocumentSourceRef;
  readonly entryPath?: string;
  readonly locator?: DocumentLocator;
  readonly scope?: ResourceRef['scope'];
}

export function createDocumentResourceRef(input: CreateDocumentResourceRefInput): ResourceRef {
  const entryPath = input.entryPath ?? readLocatorEntryName(input.locator);
  const source = createDocumentResourceSource(input.source);
  const identityValue = readDocumentSourceIdentityValue(input.source);
  const fingerprint = createResourceFingerprint({
    strategy: identityValue ? 'identity' : 'provider',
    value:
      identityValue ??
      hashStableValue({
        filePath: input.source.filePath,
        format: input.source.format,
      }),
    providerId: DOCUMENT_RESOURCE_PROVIDER_ID,
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
    provider: DOCUMENT_RESOURCE_PROVIDER_ID,
    kind: 'document',
    source,
    locator: createDocumentResourceLocator(entryPath, input.locator),
    fingerprint,
  });

  return ref;
}

function createDocumentResourceSource(source: DocumentSourceRef): ResourceSourceRef {
  return {
    kind: 'document',
    document: createStableDocumentSource(source),
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
    provider: DOCUMENT_RESOURCE_PROVIDER_ID,
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

function createDocumentSourceIdentityKey(source: DocumentSourceRef): unknown {
  const identityValue = readDocumentSourceIdentityValue(source);
  return {
    format: source.format,
    ...(identityValue ? { identity: identityValue } : { filePath: source.filePath }),
  };
}
