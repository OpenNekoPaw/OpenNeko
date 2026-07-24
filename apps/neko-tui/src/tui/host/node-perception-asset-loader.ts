import {
  composeProviderImageBatches,
  normalizeProviderImage,
  normalizeProviderImageDataUri,
  type PerceptionAssetLoader,
  type ProviderReadyAssetPayload,
} from '@neko/ai-sdk';
import type {
  PiToolResultAssetLoader,
  PiToolResultImageBatchItem,
  PiToolResultImageBatchOptions,
} from '@neko/agent/pi';
import type { GeneratedAssetIndex } from '@neko/platform';
import {
  getMimeType,
  type ContentDocumentSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type PerceptualAssetRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

const MAX_PERCEPTION_ASSET_BYTES = 20 * 1024 * 1024;

export function createNodePerceptionAssetLoader(
  contentAccessRuntime: AgentContentAccessRuntime,
  options: { readonly assetIndex?: GeneratedAssetIndex } = {},
): PerceptionAssetLoader & PiToolResultAssetLoader {
  return {
    load: async (ref) => loadPerceptionAsset(ref, contentAccessRuntime, options),
    loadBatch: (refs, batchOptions) =>
      loadPerceptionAssetBatch(refs, batchOptions, contentAccessRuntime, options),
  };
}

async function loadPerceptionAssetBatch(
  refs: readonly PerceptualAssetRef[],
  batchOptions: PiToolResultImageBatchOptions,
  contentAccessRuntime: AgentContentAccessRuntime,
  options: { readonly assetIndex?: GeneratedAssetIndex },
): Promise<readonly PiToolResultImageBatchItem[]> {
  const sources = await mapWithConcurrency(refs, 3, async (ref) => {
    const resolvedRef = await resolveGeneratedAssetPerceptualRef(ref, options.assetIndex);
    const loaded = await loadImageBytes(resolvedRef, contentAccessRuntime);
    return {
      assetId: resolvedRef.assetId,
      ...(resolvedRef.label ? { label: resolvedRef.label } : {}),
      bytes: loaded.bytes,
      mimeType: loaded.mimeType,
    };
  });
  const batches = await composeProviderImageBatches(sources, batchOptions.layout);
  return batches.map((batch) => ({
    payload: {
      kind: 'image',
      url: `data:${batch.mimeType};base64,${Buffer.from(batch.bytes).toString('base64')}`,
      mimeType: batch.mimeType,
    },
    sourceIndexes: batch.sourceIndexes,
  }));
}

async function loadPerceptionAsset(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime,
  options: { readonly assetIndex?: GeneratedAssetIndex },
): Promise<ProviderReadyAssetPayload> {
  const resolvedRef = await resolveGeneratedAssetPerceptualRef(ref, options.assetIndex);
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  const hasStableResourceRef = hasStableProviderResourceRef(resolvedRef);
  const hasStableContentLocator = resolvedRef.contentLocator !== undefined;
  if (!hasStableResourceRef && !hasStableContentLocator && resolvedRef.uri.startsWith('data:')) {
    const kind = resolveProviderPayloadKind(mimeType);
    if (kind !== 'image') return { kind, url: resolvedRef.uri, mimeType };
    const normalized = await normalizeProviderImageDataUri(resolvedRef.uri);
    return { kind, ...normalized };
  }
  if (
    !hasStableResourceRef &&
    !hasStableContentLocator &&
    (resolvedRef.uri.startsWith('http://') || resolvedRef.uri.startsWith('https://'))
  ) {
    return { kind: resolveProviderPayloadKind(mimeType), url: resolvedRef.uri, mimeType };
  }

  const loaded = resolvedRef.contentLocator
    ? await contentAccessRuntime.loadContentAsset({
        locator: resolvedRef.contentLocator,
        maxBytes: MAX_PERCEPTION_ASSET_BYTES,
      })
    : await contentAccessRuntime.loadProviderAsset({
        source: createPerceptionAssetSource(resolvedRef),
        mimeTypeHint: mimeType,
      });
  if (loaded.status !== 'ready' || !loaded.bytes) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Perception asset is not ready: ${loaded.status}`,
    );
  }

  const loadedMimeType = loaded.mimeType ?? mimeType;
  const kind = resolveProviderPayloadKind(loadedMimeType);
  const normalized =
    kind === 'image'
      ? await normalizeProviderImage(loaded.bytes, loadedMimeType)
      : { bytes: loaded.bytes, mimeType: loadedMimeType };
  return {
    kind,
    url: `data:${normalized.mimeType};base64,${Buffer.from(normalized.bytes).toString('base64')}`,
    mimeType: normalized.mimeType,
  };
}

async function loadImageBytes(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime,
): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }> {
  const inline = /^data:(image\/[^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(ref.uri);
  if (!hasStableProviderResourceRef(ref) && !ref.contentLocator && inline) {
    return { bytes: Buffer.from(inline[2]!, 'base64'), mimeType: inline[1]! };
  }
  if (
    !hasStableProviderResourceRef(ref) &&
    !ref.contentLocator &&
    (ref.uri.startsWith('http://') || ref.uri.startsWith('https://'))
  ) {
    throw new Error('Contact-sheet projection requires a ContentAccess-backed image reference.');
  }
  const loaded = ref.contentLocator
    ? await contentAccessRuntime.loadContentAsset({
        locator: ref.contentLocator,
        maxBytes: MAX_PERCEPTION_ASSET_BYTES,
      })
    : await contentAccessRuntime.loadProviderAsset({
        source: createPerceptionAssetSource(ref),
        mimeTypeHint: ref.mimeType,
      });
  if (loaded.status !== 'ready' || !loaded.bytes) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Perception asset is not ready: ${loaded.status}`,
    );
  }
  const mimeType = loaded.mimeType ?? ref.mimeType;
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Contact-sheet source ${ref.assetId} is not an image: ${mimeType}.`);
  }
  return { bytes: loaded.bytes, mimeType };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  project: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await project(values[index]!, index);
      }
    }),
  );
  return results;
}

async function resolveGeneratedAssetPerceptualRef(
  ref: PerceptualAssetRef,
  assetIndex: GeneratedAssetIndex | undefined,
): Promise<PerceptualAssetRef> {
  if (hasStableProviderResourceRef(ref) || !assetIndex) {
    return ref;
  }

  let asset = assetIndex.get(ref.assetId);
  if (!asset) {
    await assetIndex.load();
    asset = assetIndex.get(ref.assetId);
  }
  if (!asset) {
    return ref;
  }

  return {
    ...ref,
    uri: asset.path || asset.assetRef?.uri || ref.uri,
    mimeType: asset.assetRef?.mimeType ?? asset.mimeType ?? ref.mimeType,
    ...(asset.assetRef?.resourceRef ? { resourceRef: asset.assetRef.resourceRef } : {}),
    ...(asset.assetRef?.documentResourceRef
      ? { documentResourceRef: asset.assetRef.documentResourceRef }
      : {}),
  };
}

function hasStableProviderResourceRef(ref: PerceptualAssetRef): boolean {
  return ref.resourceRef !== undefined || ref.documentResourceRef !== undefined;
}

function createPerceptionAssetSource(ref: PerceptualAssetRef): ContentSourceRef {
  if (ref.resourceRef) {
    return ref.resourceRef;
  }
  if (ref.documentResourceRef) {
    return createDocumentEntrySource(ref.documentResourceRef);
  }
  return {
    kind: 'file',
    path: ref.uri,
  };
}

function createDocumentEntrySource(ref: DocumentArchiveResourceRef): ContentDocumentSourceRef {
  return {
    kind: 'document',
    source: {
      kind: 'document',
      document: ref.source,
    },
    ...(ref.entryPath ? { entryPath: ref.entryPath } : {}),
    ...(ref.entryPath || ref.locator
      ? {
          locator: {
            kind: 'document',
            ...(ref.entryPath ? { entryPath: ref.entryPath } : {}),
            ...(ref.locator ? { locator: ref.locator } : {}),
          },
        }
      : {}),
  };
}

function resolveProviderPayloadKind(mimeType: string): ProviderReadyAssetPayload['kind'] {
  if (mimeType.startsWith('audio/')) return 'audio';
  return mimeType.startsWith('video/') ? 'video' : 'image';
}
