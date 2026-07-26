import type { ImageGenerationRequest, VideoGenerationRequest } from '@neko/generation';

export function resolveImageGenerationType(
  request: ImageGenerationRequest,
): 'text-to-image' | 'image-to-image' | 'image-edit' {
  if (request.operation && request.operation !== 'generate') {
    return 'image-edit';
  }
  return request.referenceImageLocator || request.controlImageLocator
    ? 'image-to-image'
    : 'text-to-image';
}

export function resolveVideoGenerationType(
  request: VideoGenerationRequest,
): 'text-to-video' | 'image-to-video' | 'video-to-video' | 'video-edit' {
  if (
    request.operation &&
    request.operation !== 'generate-from-prompt' &&
    request.operation !== 'generate-from-image' &&
    request.operation !== 'generate-from-keyframes'
  ) {
    return 'video-edit';
  }
  if (request.referenceVideoLocator) {
    return 'video-to-video';
  }
  if (request.startFrameLocator) {
    return 'image-to-video';
  }
  return 'text-to-video';
}
