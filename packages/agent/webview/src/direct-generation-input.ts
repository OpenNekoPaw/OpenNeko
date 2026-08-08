import type { DirectGenerationOperationInput } from '@neko/generation';
import type { SessionMode } from '@neko/agent-contracts';
import type { GenerationParams } from './components/ChatView/InputArea/types';

export function projectDirectGenerationOperationInput(input: {
  readonly sessionMode: Exclude<SessionMode, 'agent'>;
  readonly prompt: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly params: GenerationParams;
}): DirectGenerationOperationInput {
  const base = {
    prompt: input.prompt,
    providerId: input.providerId,
    modelId: input.modelId,
  };
  switch (input.sessionMode) {
    case 'image': {
      const dimensions = projectImageDimensions(input.params.resolution, input.params.ratio);
      return {
        ...base,
        mediaKind: 'image',
        aspectRatio: input.params.ratio,
        ...dimensions,
      };
    }
    case 'video':
      return {
        ...base,
        mediaKind: 'video',
        aspectRatio: input.params.ratio,
        resolution: input.params.resolution,
        ...(input.params.videoDuration === 'auto' ? {} : { duration: input.params.videoDuration }),
        fps: input.params.videoFps,
      };
    case 'audio':
      return {
        ...base,
        mediaKind: 'audio',
        ...(input.params.audioDuration === 'auto' ? {} : { duration: input.params.audioDuration }),
        audioType: input.params.audioType,
      };
  }
}

function projectImageDimensions(
  resolution: GenerationParams['resolution'],
  ratio: GenerationParams['ratio'],
): { readonly width: number; readonly height: number } {
  const shortEdge = {
    '512': 512,
    '720p': 720,
    '1080p': 1080,
    '2K': 1440,
    '4K': 2160,
  }[resolution];
  const [widthRatio, heightRatio] = ratio.split(':').map(Number);
  if (!widthRatio || !heightRatio) {
    throw new Error(`Direct image Generation ratio '${ratio}' is invalid.`);
  }
  if (widthRatio >= heightRatio) {
    return {
      width: Math.round((shortEdge * widthRatio) / heightRatio),
      height: shortEdge,
    };
  }
  return {
    width: shortEdge,
    height: Math.round((shortEdge * heightRatio) / widthRatio),
  };
}
