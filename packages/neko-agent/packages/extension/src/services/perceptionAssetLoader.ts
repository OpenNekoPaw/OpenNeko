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
import {
  getMimeType,
  type ContentDocumentSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type PerceptualAssetRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

const MAX_PERCEPTION_ASSET_BYTES = 20 * 1024 * 1024;

export function createLocalPerceptionAssetLoader(
  contentAccessRuntime?: AgentContentAccessRuntime,
): PerceptionAssetLoader & PiToolResultAssetLoader {
  return {
    load: async (ref) => loadPerceptionAsset(ref, contentAccessRuntime),
    loadBatch: (refs, options) => loadPerceptionAssetBatch(refs, options, contentAccessRuntime),
  };
}

async function loadPerceptionAssetBatch(
  refs: readonly PerceptualAssetRef[],
  options: PiToolResultImageBatchOptions,
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): Promise<readonly PiToolResultImageBatchItem[]> {
  if (!contentAccessRuntime) {
    throw new Error('Perception asset batch loading requires AgentContentAccessRuntime.');
  }
  const sources = await mapWithConcurrency(refs, 3, async (ref) => ({
    ref,
    ...(await loadImageBytes(ref, contentAccessRuntime)),
  }));
  const batches = await composeProviderImageBatches(
    sources.map((source) => ({
      assetId: source.ref.assetId,
      ...(source.ref.label ? { label: source.ref.label } : {}),
      bytes: source.bytes,
      mimeType: source.mimeType,
    })),
    options.layout,
  );
  return batches.map((batch): PiToolResultImageBatchItem => ({
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
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): Promise<ProviderReadyAssetPayload> {
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  const hasStableResourceRef =
    ref.resourceRef !== undefined || ref.documentResourceRef !== undefined;
  const hasStableContentLocator = ref.contentLocator !== undefined;
  if (!hasStableResourceRef && !hasStableContentLocator && ref.uri.startsWith('data:')) {
    const kind = resolveProviderPayloadKind(mimeType);
    if (kind !== 'image') return { kind, url: ref.uri, mimeType };
    const normalized = await normalizeProviderImageDataUri(ref.uri);
    return { kind, ...normalized };
  }
  if (
    !hasStableResourceRef &&
    !hasStableContentLocator &&
    (ref.uri.startsWith('http://') || ref.uri.startsWith('https://'))
  ) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }

  if (!contentAccessRuntime) {
    throw new Error('Perception asset loading requires AgentContentAccessRuntime.');
  }

  const loaded = ref.contentLocator
    ? await contentAccessRuntime.loadContentAsset({
        locator: ref.contentLocator,
        maxBytes: MAX_PERCEPTION_ASSET_BYTES,
      })
    : await contentAccessRuntime.loadProviderAsset({
        source: createPerceptionAssetSource(ref),
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
      : { bytes: Buffer.from(loaded.bytes), mimeType: loadedMimeType };
  return {
    kind,
    url: `data:${normalized.mimeType};base64,${Buffer.from(normalized.bytes).toString('base64')}`,
    mimeType: normalized.mimeType,
  };
}

async function loadImageBytes(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime,
): Promise<{ readonly bytes: Buffer; readonly mimeType: string }> {
  const inline = /^data:(image\/[^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(ref.uri);
  if (!ref.contentLocator && !ref.resourceRef && !ref.documentResourceRef && inline) {
    return { bytes: Buffer.from(inline[2]!, 'base64'), mimeType: inline[1]! };
  }
  if (
    !ref.contentLocator &&
    !ref.resourceRef &&
    !ref.documentResourceRef &&
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
  const loadedMimeType = loaded.mimeType ?? ref.mimeType;
  if (!loadedMimeType.startsWith('image/')) {
    throw new Error(`Contact-sheet source ${ref.assetId} is not an image: ${loadedMimeType}.`);
  }
  return { bytes: Buffer.from(loaded.bytes), mimeType: loadedMimeType };
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

function createPerceptionAssetSource(ref: PerceptualAssetRef): ContentSourceRef {
  if (ref.resourceRef) return ref.resourceRef;
  if (ref.documentResourceRef) return createDocumentEntrySource(ref.documentResourceRef);
  return { kind: 'file', path: ref.uri };
}

function createDocumentEntrySource(ref: DocumentArchiveResourceRef): ContentDocumentSourceRef {
  return {
    kind: 'document',
    source: { kind: 'document', document: ref.source },
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
