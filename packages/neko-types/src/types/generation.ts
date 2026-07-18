// =============================================================================
// Generation Types — output parameters and model configuration
// =============================================================================

// =============================================================================
// Output Parameters (model-agnostic)
// =============================================================================

export interface ImageGenerationParams {
  ratio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1';
  resolution: '512' | '720p' | '1080p' | '2K';
}

export interface VideoGenerationParams {
  ratio: '16:9' | '9:16' | '1:1';
  resolution: '480p' | '720p' | '1080p';
  /** Duration in seconds */
  duration: number;
  fps: 24 | 30;
}

export interface AudioGenerationParams {
  /** Duration in seconds */
  duration: number;
  audioType: 'music' | 'sfx' | 'ambient' | 'voice';
}

/** Project-level generation output parameters */
export interface GenerationParams {
  image: ImageGenerationParams;
  video: VideoGenerationParams;
  audio: AudioGenerationParams;
}

// =============================================================================
// Model Configuration (AI engine selection)
// =============================================================================

/** Which AI model to use for each generation modality */
export interface GenerationModelConfig {
  /** LLM model id, e.g. 'claude-sonnet-4-6' */
  llm: string;
  /** Image generation model id, e.g. 'flux-dev' */
  image?: string;
  /** Video generation model id, e.g. 'wan2.1' */
  video?: string;
  /** Audio generation model id, e.g. 'stable-audio' */
  audio?: string;
}

// =============================================================================
// Per-node override
// =============================================================================

/** Partial param overrides stored on a canvas node */
export interface NodeGenerationConfig {
  image?: Partial<ImageGenerationParams> & { model?: string };
  video?: Partial<VideoGenerationParams> & { model?: string };
  audio?: Partial<AudioGenerationParams> & { model?: string };
}

// =============================================================================
// Resolved params (runtime merge result)
// =============================================================================

/** Where a particular parameter value came from */
export type ParamSource = 'node' | 'project' | 'system';

/** Fully resolved params with source annotation for each modality */
export interface ResolvedGenerationParams {
  image: ImageGenerationParams & { model: string; modelSource: ParamSource };
  video: VideoGenerationParams & { model: string; modelSource: ParamSource };
  audio: AudioGenerationParams & { model: string; modelSource: ParamSource };
  /** Resolved LLM model id */
  llm: string;
}

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_IMAGE_PARAMS: ImageGenerationParams = {
  ratio: '16:9',
  resolution: '1080p',
};

export const DEFAULT_VIDEO_PARAMS: VideoGenerationParams = {
  ratio: '16:9',
  resolution: '720p',
  duration: 5,
  fps: 24,
};

export const DEFAULT_AUDIO_PARAMS: AudioGenerationParams = {
  duration: 10,
  audioType: 'music',
};

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  image: DEFAULT_IMAGE_PARAMS,
  video: DEFAULT_VIDEO_PARAMS,
  audio: DEFAULT_AUDIO_PARAMS,
};

export const DEFAULT_GENERATION_MODEL_CONFIG: GenerationModelConfig = {
  llm: 'claude-sonnet-4-6',
};

// =============================================================================
// Merge helper
// =============================================================================

/**
 * Merge node-level, project-level, and system defaults into
 * a single ResolvedGenerationParams with source annotation.
 */
export function resolveGenerationParams(
  node: NodeGenerationConfig | undefined,
  project: Partial<GenerationParams> | undefined,
  projectModels: Partial<GenerationModelConfig> | undefined,
  system:
    { params?: Partial<GenerationParams>; models?: Partial<GenerationModelConfig> } | undefined,
  llm: string,
): ResolvedGenerationParams {
  const resolveModel = (
    nodeModel: string | undefined,
    projectModel: string | undefined,
    fallback: string,
  ): { model: string; modelSource: ParamSource } => {
    if (nodeModel !== undefined) return { model: nodeModel, modelSource: 'node' };
    if (projectModel !== undefined) return { model: projectModel, modelSource: 'project' };
    if (fallback) return { model: fallback, modelSource: 'system' };
    return { model: fallback, modelSource: 'system' };
  };

  const systemParams = system?.params;
  const systemModels = system?.models;

  const imageBase: ImageGenerationParams = {
    ...DEFAULT_IMAGE_PARAMS,
    ...(systemParams?.image ?? {}),
    ...(project?.image ?? {}),
    ...(node?.image
      ? {
          ratio: node.image.ratio ?? DEFAULT_IMAGE_PARAMS.ratio,
          resolution: node.image.resolution ?? DEFAULT_IMAGE_PARAMS.resolution,
        }
      : {}),
  };

  const videoBase: VideoGenerationParams = {
    ...DEFAULT_VIDEO_PARAMS,
    ...(systemParams?.video ?? {}),
    ...(project?.video ?? {}),
    ...(node?.video
      ? {
          ratio: node.video.ratio ?? DEFAULT_VIDEO_PARAMS.ratio,
          resolution: node.video.resolution ?? DEFAULT_VIDEO_PARAMS.resolution,
          duration: node.video.duration ?? DEFAULT_VIDEO_PARAMS.duration,
          fps: node.video.fps ?? DEFAULT_VIDEO_PARAMS.fps,
        }
      : {}),
  };

  const audioBase: AudioGenerationParams = {
    ...DEFAULT_AUDIO_PARAMS,
    ...(systemParams?.audio ?? {}),
    ...(project?.audio ?? {}),
    ...(node?.audio
      ? {
          duration: node.audio.duration ?? DEFAULT_AUDIO_PARAMS.duration,
          audioType: node.audio.audioType ?? DEFAULT_AUDIO_PARAMS.audioType,
        }
      : {}),
  };

  return {
    image: {
      ...imageBase,
      ...resolveModel(node?.image?.model, projectModels?.image, systemModels?.image ?? ''),
    },
    video: {
      ...videoBase,
      ...resolveModel(node?.video?.model, projectModels?.video, systemModels?.video ?? ''),
    },
    audio: {
      ...audioBase,
      ...resolveModel(node?.audio?.model, projectModels?.audio, systemModels?.audio ?? ''),
    },
    llm,
  };
}
