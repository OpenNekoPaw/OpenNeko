import type { ImageGenerationRequest, VideoGenerationRequest } from '@neko/generation';

export function resolveImageGenerationType(
  request: ImageGenerationRequest,
): 'text-to-image' | 'image-to-image' | 'image-edit' {
  if (request.operation && request.operation !== 'generate') {
    return 'image-edit';
  }
  return request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.controlImageBase64 ||
    request.controlImageUri
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
  if (request.referenceVideoRef || request.referenceVideoUrl || request.sourceVideoUrl) {
    return 'video-to-video';
  }
  if (
    request.startFrameRef ||
    request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.startFrameImageBase64
  ) {
    return 'image-to-video';
  }
  return 'text-to-video';
}
