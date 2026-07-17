import type { ImageGenerationRequest, MediaGenerationType, VideoGenerationRequest } from './types';

export function resolveImageGenerationType(request: ImageGenerationRequest): MediaGenerationType {
  return request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.controlImageBase64 ||
    request.controlImageUri
    ? 'image-to-image'
    : 'text-to-image';
}

export function resolveVideoGenerationType(request: VideoGenerationRequest): MediaGenerationType {
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
