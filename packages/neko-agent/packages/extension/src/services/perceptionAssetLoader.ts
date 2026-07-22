import type { PerceptionAssetLoader, ProviderReadyAssetPayload } from '@neko/ai-sdk';
import {
  getMimeType,
  type ContentDocumentSourceRef,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type PerceptualAssetRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

export function createLocalPerceptionAssetLoader(
  contentAccessRuntime?: AgentContentAccessRuntime,
): PerceptionAssetLoader {
  return {
    load: async (ref, _policy) => loadPerceptionAsset(ref, contentAccessRuntime),
  };
}

async function loadPerceptionAsset(
  ref: PerceptualAssetRef,
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): Promise<ProviderReadyAssetPayload> {
  const mimeType = ref.mimeType || getMimeType(ref.uri);
  const hasStableResourceRef =
    ref.resourceRef !== undefined || ref.documentResourceRef !== undefined;
  if (!hasStableResourceRef && ref.uri.startsWith('data:')) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }
  if (!hasStableResourceRef && (ref.uri.startsWith('http://') || ref.uri.startsWith('https://'))) {
    return { kind: resolveProviderPayloadKind(mimeType), url: ref.uri, mimeType };
  }

  if (!contentAccessRuntime) {
    throw new Error('Perception asset loading requires AgentContentAccessRuntime.');
  }

  const loaded = await contentAccessRuntime.loadProviderAsset({
    source: createPerceptionAssetSource(ref),
    mimeTypeHint: mimeType,
  });
  if (loaded.status !== 'ready' || !loaded.bytes) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Perception asset is not ready: ${loaded.status}`,
    );
  }

  return {
    kind: resolveProviderPayloadKind(loaded.mimeType ?? mimeType),
    url: `data:${loaded.mimeType ?? mimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`,
    mimeType: loaded.mimeType ?? mimeType,
  };
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
