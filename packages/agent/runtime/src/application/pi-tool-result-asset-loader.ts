import { AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES } from '@neko/agent-contracts';
import { probeImageMetadata } from '@neko/content/document';
import type { PerceptualAssetRef } from '@neko/media';

import {
  composeProviderImageBatches,
  normalizeProviderImage,
  type ProviderImageBatchSource,
} from '../provider/image-batch-transport';
import type { PiToolResultAssetLoader, PiToolResultAssetPayload } from '../pi/openneko-tool';
import type {
  AgentContentAccessRuntime,
  AgentProviderAssetResult,
} from '../runtime/capability/agent-content-access-runtime';

export function createPiToolResultAssetLoader(
  contentAccessRuntime: AgentContentAccessRuntime,
  loadTransientImage?: (input: {
    readonly receiptId: string;
    readonly sessionId: string;
    readonly actionId: string;
  }) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>,
): PiToolResultAssetLoader {
  const loadSource = (ref: PerceptualAssetRef): Promise<ProviderImageBatchSource> =>
    loadProviderImageSource(contentAccessRuntime, ref);

  return {
    async load(ref): Promise<PiToolResultAssetPayload> {
      const source = await loadSource(ref);
      const normalized = await normalizeProviderImage(source.bytes, source.mimeType);
      return {
        kind: 'image',
        url: toImageDataUrl(normalized.bytes, normalized.mimeType),
        mimeType: normalized.mimeType,
      };
    },
    ...(loadTransientImage === undefined
      ? {}
      : {
          async loadTransientImage(ref) {
            const source = await loadTransientImage(ref);
            const normalized = await normalizeProviderImage(source.bytes, source.mimeType);
            return {
              kind: 'image' as const,
              url: toImageDataUrl(normalized.bytes, normalized.mimeType),
              mimeType: normalized.mimeType,
            };
          },
        }),
    async loadBatch(refs, options) {
      const sources = await Promise.all(refs.map(loadSource));
      return (await composeProviderImageBatches(sources, options.layout)).map((batch) => ({
        payload: {
          kind: 'image',
          url: toImageDataUrl(batch.bytes, batch.mimeType),
          mimeType: batch.mimeType,
        },
        sourceIndexes: batch.sourceIndexes,
      }));
    },
  };
}

async function loadProviderImageSource(
  contentAccessRuntime: AgentContentAccessRuntime,
  ref: PerceptualAssetRef,
): Promise<ProviderImageBatchSource> {
  let loaded: AgentProviderAssetResult;
  if (ref.representationLocator) {
    if (!contentAccessRuntime.loadRepresentationAsset) {
      throw new Error('Pi Tool result representation access is unavailable.');
    }
    loaded = await contentAccessRuntime.loadRepresentationAsset({
      locator: ref.representationLocator,
      maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
    });
  } else if (ref.contentLocator) {
    loaded = await contentAccessRuntime.loadContentAsset({
      locator: ref.contentLocator,
      maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
    });
  } else {
    throw new Error('Pi image Tool result requires an exact content or representation locator.');
  }
  if (loaded.status !== 'ready' || !loaded.bytes) {
    const diagnostic =
      loaded.diagnostics.find((entry) => entry.severity === 'error')?.code ?? loaded.status;
    throw new Error(`Pi image Tool result content could not be loaded: ${diagnostic}.`);
  }
  const metadata = probeImageMetadata(loaded.bytes);
  if (!metadata?.mimeType?.startsWith('image/')) {
    throw new Error('Pi image Tool result content is not a supported image.');
  }
  if (loaded.mimeType !== undefined && !loaded.mimeType.startsWith('image/')) {
    throw new Error(`Pi image Tool result content has non-image MIME type '${loaded.mimeType}'.`);
  }
  return {
    assetId: ref.assetId,
    ...(ref.label ? { label: ref.label } : {}),
    bytes: loaded.bytes,
    mimeType: metadata.mimeType,
  };
}

function toImageDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
