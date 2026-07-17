import { fileURLToPath } from 'node:url';
import type { ResourceRef } from '@neko/shared';
import type { ImageGenerationRequest, VideoGenerationRequest } from './types';

export interface MediaRequestAssetMaterializer {
  readAsBase64(uriOrPath: string): Promise<string>;
  readResourceAsBase64?(resourceRef: ResourceRef): Promise<string>;
  resolveResourceUrl?(resourceRef: ResourceRef): Promise<string>;
}

export async function materializeImageRequestFileUris(
  request: ImageGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
): Promise<ImageGenerationRequest> {
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri, materializer),
    };
  }

  if (request.maskUri && !request.maskBase64) {
    next = {
      ...next,
      maskBase64: await readFileAsBase64(request.maskUri, materializer),
    };
  }

  if (request.controlImageUri && !request.controlImageBase64) {
    next = {
      ...next,
      controlImageBase64: await readFileAsBase64(request.controlImageUri, materializer),
    };
  }

  return next;
}

export async function materializeVideoRequestFileUris(
  request: VideoGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
): Promise<VideoGenerationRequest> {
  assertUnambiguousStableVideoRefs(request);
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri, materializer),
    };
  }

  if (request.startFrameRef) {
    next = {
      ...next,
      startFrameImageBase64: await readResourceAsBase64(request.startFrameRef, materializer),
    };
  }

  if (request.endFrameRef) {
    next = {
      ...next,
      endFrameImageBase64: await readResourceAsBase64(request.endFrameRef, materializer),
    };
  }

  if (request.referenceVideoRef) {
    next = {
      ...next,
      sourceVideoUrl: await resolveResourceUrl(request.referenceVideoRef, materializer),
    };
  }

  return next;
}

function assertUnambiguousStableVideoRefs(request: VideoGenerationRequest): void {
  if (
    request.startFrameRef &&
    (request.startFrameImageBase64 ||
      request.referenceImageBase64 ||
      request.referenceImageUri ||
      request.referenceImageUrl)
  ) {
    throw new Error(
      'Stable startFrameRef cannot be combined with legacy start/reference image inputs.',
    );
  }
  if (request.endFrameRef && request.endFrameImageBase64) {
    throw new Error('Stable endFrameRef cannot be combined with legacy end-frame bytes.');
  }
  if (request.referenceVideoRef && (request.referenceVideoUrl || request.sourceVideoUrl)) {
    throw new Error(
      'Stable referenceVideoRef cannot be combined with legacy reference video URLs.',
    );
  }
}

async function readResourceAsBase64(
  resourceRef: ResourceRef,
  materializer: MediaRequestAssetMaterializer | undefined,
): Promise<string> {
  if (!materializer?.readResourceAsBase64) {
    throw new Error(
      `Media request ResourceRef requires authorized host materialization: ${resourceRef.id}`,
    );
  }
  return materializer.readResourceAsBase64(resourceRef);
}

async function resolveResourceUrl(
  resourceRef: ResourceRef,
  materializer: MediaRequestAssetMaterializer | undefined,
): Promise<string> {
  if (!materializer?.resolveResourceUrl) {
    throw new Error(
      `Media request video ResourceRef requires authorized URL materialization: ${resourceRef.id}`,
    );
  }
  return materializer.resolveResourceUrl(resourceRef);
}

async function readFileAsBase64(
  uriOrPath: string,
  materializer: MediaRequestAssetMaterializer | undefined,
): Promise<string> {
  if (!materializer) {
    throw new Error(
      `Media request asset requires host content access materialization: ${uriOrPath}`,
    );
  }
  return materializer.readAsBase64(toFilePath(uriOrPath));
}

function toFilePath(uriOrPath: string): string {
  if (uriOrPath.startsWith('file:')) {
    return fileURLToPath(uriOrPath);
  }
  if (uriOrPath.startsWith('/')) {
    return uriOrPath;
  }
  throw new Error(`Only local file URIs are supported for media request assets: ${uriOrPath}`);
}
