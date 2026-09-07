import type { MediaModelType, ModelConfig } from '@neko/ai-contracts';
import type {
  ImageGenerationRequest,
  MediaGenerationType,
  VideoGenerationRequest,
} from '@neko/generation-domain';

const MEDIA_MODEL_TYPE_BY_GENERATION_TYPE: Record<MediaGenerationType, MediaModelType> = {
  'text-to-image': 'image',
  'image-to-image': 'image',
  'image-edit': 'image',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'video-to-video': 'video',
  'video-edit': 'video',
  'text-to-audio': 'audio',
};

export function resolveMediaModelType(generationType: MediaGenerationType): MediaModelType {
  return MEDIA_MODEL_TYPE_BY_GENERATION_TYPE[generationType];
}

export function assertMediaModelType(
  model: Pick<ModelConfig, 'id' | 'providerId' | 'type'>,
  generationType: MediaGenerationType,
): void {
  const requiredModelType = resolveMediaModelType(generationType);
  if (model.type !== requiredModelType) {
    throw new Error(
      `Model ${model.providerId}/${model.id} has type "${model.type ?? 'unset'}", but ${generationType} requires type "${requiredModelType}".`,
    );
  }
}

export function resolveImageGenerationType(
  request: ImageGenerationRequest,
): 'text-to-image' | 'image-to-image' | 'image-edit' {
  if (
    (request.operation && request.operation !== 'generate') ||
    request.maskLocator ||
    request.editInstruction
  ) {
    return 'image-edit';
  }
  return request.referenceImageLocator ||
    request.controlImageLocator ||
    request.ipAdapterRefs?.length ||
    request.panoramaReference
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
  if (
    request.inputs?.some(
      (input) => input.role === 'reference-video' || input.role === 'reference-audio',
    )
  ) {
    return 'video-to-video';
  }
  if (
    request.inputs?.some(
      (input) =>
        input.role === 'first-frame' ||
        input.role === 'last-frame' ||
        input.role === 'reference-image',
    )
  ) {
    return 'image-to-video';
  }
  return 'text-to-video';
}
