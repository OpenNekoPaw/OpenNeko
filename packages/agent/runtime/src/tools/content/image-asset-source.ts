import { probeImageMetadata, type ImageMetadata } from '@neko/content/document';
import type { ContentLocator, ContentRepresentationLocator } from '@neko/content';

export type AgentImageAssetStatus =
  'ready' | 'missing-source' | 'unsupported-source' | 'unauthorized' | 'failed';

export interface AgentImageAssetDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface AgentImageAssetResult {
  readonly status: AgentImageAssetStatus;
  readonly diagnostics: readonly AgentImageAssetDiagnostic[];
  readonly bytes?: Uint8Array;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface AgentImageAssetAccessRuntime {
  loadContentAsset?(input: {
    readonly locator: ContentLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentImageAssetResult>;
  loadRepresentationAsset?(input: {
    readonly locator: ContentRepresentationLocator;
    readonly maxBytes: number;
  }): Promise<AgentImageAssetResult>;
}

export interface AgentImageAssetBinding {
  readonly contentLocator?: ContentLocator;
  readonly representationLocator?: ContentRepresentationLocator;
}

export interface LoadedAgentImageAsset {
  readonly bytes: Uint8Array;
  readonly metadata: ImageMetadata;
  readonly mimeType: string;
}

export async function loadAgentImageAsset(input: {
  readonly binding: AgentImageAssetBinding;
  readonly contentAccessRuntime: AgentImageAssetAccessRuntime | undefined;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  readonly operationName: string;
}): Promise<LoadedAgentImageAsset> {
  const runtime = input.contentAccessRuntime;
  if (!runtime) {
    throw new Error(`${input.operationName} requires AgentContentAccessRuntime.`);
  }

  const loaded = input.binding.representationLocator
    ? await loadRepresentation(runtime, input.binding.representationLocator, input)
    : input.binding.contentLocator
      ? await loadContent(runtime, input.binding.contentLocator, input)
      : undefined;
  if (!loaded) {
    throw new Error(
      `${input.operationName} requires images[].contentLocator or images[].representationLocator.`,
    );
  }
  if (loaded.status !== 'ready' || !loaded.bytes) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `${input.operationName} could not load image bytes: ${loaded.status}`,
    );
  }
  const metadata = probeImageMetadata(loaded.bytes);
  if (!metadata) {
    throw new Error(`${input.operationName} source is not a supported image.`);
  }
  const mimeType = metadata.mimeType ?? loaded.mimeType;
  if (!mimeType?.startsWith('image/')) {
    throw new Error(`${input.operationName} source has no supported image MIME type.`);
  }
  return { bytes: loaded.bytes, metadata, mimeType };
}

async function loadRepresentation(
  runtime: AgentImageAssetAccessRuntime,
  locator: ContentRepresentationLocator,
  input: { readonly maxBytes: number; readonly operationName: string },
) {
  if (!runtime.loadRepresentationAsset) {
    throw new Error(`${input.operationName} representation access is unavailable.`);
  }
  return runtime.loadRepresentationAsset({ locator, maxBytes: input.maxBytes });
}

async function loadContent(
  runtime: AgentImageAssetAccessRuntime,
  locator: ContentLocator,
  input: {
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
    readonly operationName: string;
  },
) {
  if (!runtime.loadContentAsset) {
    throw new Error(`${input.operationName} content read access is unavailable.`);
  }
  return runtime.loadContentAsset({
    locator,
    maxBytes: input.maxBytes,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
