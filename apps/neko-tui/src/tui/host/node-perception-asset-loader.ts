import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
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
): PerceptionAssetLoader {
  return {
    load: async (ref) => loadPerceptionAsset(ref, contentAccessRuntime, options),
  };
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
    return { kind: resolveProviderPayloadKind(mimeType), url: resolvedRef.uri, mimeType };
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
        caller: 'perception-asset-loader',
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
  return {
    kind: resolveProviderPayloadKind(loadedMimeType),
    url: `data:${loadedMimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`,
    mimeType: loadedMimeType,
  };
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
