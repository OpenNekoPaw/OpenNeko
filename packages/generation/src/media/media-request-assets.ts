import type { ContentLocator, ContentReadService } from '@neko/content';
import type {
  ImageGenerationRequest,
  MaterializedImageGenerationRequest,
  MaterializedVideoGenerationRequest,
  VideoGenerationRequest,
} from '@neko/generation';

export interface MediaRequestAssetMaterializer {
  readAsBase64(locator: ContentLocator, signal?: AbortSignal): Promise<string>;
  resolveAsUrl?(locator: ContentLocator, signal?: AbortSignal): Promise<string>;
}

export interface ContentReadMediaRequestAssetMaterializerOptions {
  readonly contentRead: ContentReadService;
  readonly encodeBase64: (bytes: Uint8Array) => string;
  readonly maxBytes?: number;
}

export interface MediaRequestMaterializationOptions {
  readonly signal?: AbortSignal;
}

const DEFAULT_MEDIA_REQUEST_ASSET_MAX_BYTES = 32 * 1024 * 1024;

export function createContentReadMediaRequestAssetMaterializer(
  options: ContentReadMediaRequestAssetMaterializerOptions,
): MediaRequestAssetMaterializer {
  const maxBytes = options.maxBytes ?? DEFAULT_MEDIA_REQUEST_ASSET_MAX_BYTES;
  const load = async (locator: ContentLocator, signal?: AbortSignal) => {
    const result = await options.contentRead.read(locator, {
      maxBytes,
      ...(signal ? { signal } : {}),
    });
    if (result.status === 'unavailable') {
      throw new Error(
        `Media request content materialization failed: ${result.diagnostic.code} (${locator.kind}).`,
      );
    }
    return result;
  };
  return {
    readAsBase64: async (locator, signal) =>
      options.encodeBase64((await load(locator, signal)).bytes),
    resolveAsUrl: async (locator, signal) => {
      const loaded = await load(locator, signal);
      const mimeType = loaded.mimeType ?? 'application/octet-stream';
      return `data:${mimeType};base64,${options.encodeBase64(loaded.bytes)}`;
    },
  };
}

export async function materializeImageRequestFileUris(
  request: ImageGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
  options: MediaRequestMaterializationOptions = {},
): Promise<MaterializedImageGenerationRequest> {
  const {
    referenceImageLocator,
    maskLocator,
    controlImageLocator,
    ipAdapterRefs,
    panoramaReference,
    ...stable
  } = request;
  return {
    ...stable,
    ...(referenceImageLocator
      ? {
          referenceImageBase64: await readAsBase64(
            referenceImageLocator,
            materializer,
            options.signal,
          ),
        }
      : {}),
    ...(maskLocator
      ? { maskBase64: await readAsBase64(maskLocator, materializer, options.signal) }
      : {}),
    ...(controlImageLocator
      ? {
          controlImageBase64: await readAsBase64(controlImageLocator, materializer, options.signal),
        }
      : {}),
    ...(ipAdapterRefs
      ? {
          ipAdapterRefs: await Promise.all(
            ipAdapterRefs.map(async ({ imageLocator, ...reference }) => ({
              ...reference,
              imageBase64: await readAsBase64(imageLocator, materializer, options.signal),
            })),
          ),
        }
      : {}),
    ...(panoramaReference
      ? {
          panoramaReference: {
            orientation: panoramaReference.orientation,
            identity: panoramaReference.identity,
            imageBase64: await readAsBase64(
              panoramaReference.imageLocator,
              materializer,
              options.signal,
            ),
          },
        }
      : {}),
  };
}

export async function materializeVideoRequestFileUris(
  request: VideoGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
  options: MediaRequestMaterializationOptions = {},
): Promise<MaterializedVideoGenerationRequest> {
  const { startFrameLocator, endFrameLocator, referenceVideoLocator, referenceImages, ...stable } =
    request;
  return {
    ...stable,
    ...(startFrameLocator
      ? {
          startFrameImageBase64: await readAsBase64(
            startFrameLocator,
            materializer,
            options.signal,
          ),
        }
      : {}),
    ...(endFrameLocator
      ? {
          endFrameImageBase64: await readAsBase64(endFrameLocator, materializer, options.signal),
        }
      : {}),
    ...(referenceVideoLocator
      ? {
          sourceVideoUrl: await resolveAsUrl(referenceVideoLocator, materializer, options.signal),
        }
      : {}),
    ...(referenceImages
      ? {
          referenceImages: await Promise.all(
            referenceImages.map(async ({ imageLocator, ...reference }) => ({
              ...reference,
              imageBase64: await readAsBase64(imageLocator, materializer, options.signal),
            })),
          ),
        }
      : {}),
  };
}

async function resolveAsUrl(
  locator: ContentLocator,
  materializer: MediaRequestAssetMaterializer | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (!materializer?.resolveAsUrl) {
    throw new Error(
      `Media request video locator requires authorized URL materialization: ${locator.kind}`,
    );
  }
  return signal ? materializer.resolveAsUrl(locator, signal) : materializer.resolveAsUrl(locator);
}

async function readAsBase64(
  locator: ContentLocator,
  materializer: MediaRequestAssetMaterializer | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (!materializer) {
    throw new Error(`Media request locator requires host content access: ${locator.kind}`);
  }
  return signal ? materializer.readAsBase64(locator, signal) : materializer.readAsBase64(locator);
}
