import type {
  ThreeReferenceCameraMediaReference,
  ThreeReferenceMediaOutputIdentity,
  ThreeReferencePanoramaOrientation,
} from '@neko/preview-domain';
import type { ModelConfig, ProviderConfig } from '@neko/ai-contracts';
import type { ContentLocator } from '@neko/content';
import type {
  ImageOperationId,
  ImageOutpaintExpansion,
  ImageSplitProfileOptions,
  VideoOperationId,
} from '@neko/generation';

// =============================================================================
// Generation Types
// =============================================================================

/**
 * Supported media generation types
 */
export type MediaGenerationType =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'video-to-video'
  | 'video-edit'
  | 'text-to-audio'
  | 'text-to-music'
  | 'workflow';

/**
 * Media task status
 */
export type MediaOperationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Media output type
 */
export type MediaOutputType = 'image' | 'video' | 'audio';

// =============================================================================
// ControlNet & IP-Adapter Types
// =============================================================================

/**
 * ControlNet conditioning mode
 */
export type ControlMode =
  'canny' | 'depth' | 'pose' | 'normal' | 'segment' | 'lineart' | 'softedge' | 'scribble';

/**
 * IP-Adapter reference for style/subject transfer
 */
export interface IPAdapterReference {
  /** Stable appearance image location, materialized by the authorized host before execution. */
  imageLocator: ContentLocator;
  /** Optional MIME type precondition/hint for provider materialization. */
  mimeType?: string;
  /** Influence strength 0.0–1.0 */
  strength?: number;
  /** Focus on style vs subject */
  mode?: 'style' | 'subject' | 'both';
}

export interface GenerationPanoramaReference {
  readonly imageLocator: ContentLocator;
  readonly orientation: ThreeReferencePanoramaOrientation;
  readonly identity: ThreeReferenceMediaOutputIdentity;
}

// =============================================================================
// Request Interfaces
// =============================================================================

/**
 * Base request for all media generation
 */
export interface MediaGenerationRequestBase {
  /** Text prompt for generation */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Specific provider ID (optional, for routing) */
  providerId?: string;
  /** Specific model ID (optional, for routing) */
  modelId?: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Image generation request
 */
export interface ImageGenerationRequest extends MediaGenerationRequestBase {
  /** Canonical image operation. Omit only for legacy request inference. */
  operation?: ImageOperationId;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Aspect ratio (e.g., "16:9", "1:1") */
  aspectRatio?: string;
  /** Number of images to generate */
  count?: number;
  /** Stable reference image location for image-to-image/edit operations. */
  referenceImageLocator?: ContentLocator;
  /** Stable inpaint mask location. */
  maskLocator?: ContentLocator;
  /** Inpaint strength 0.0–1.0 (only meaningful when maskLocator is set) */
  inpaintStrength?: number;
  /** Image quality setting */
  quality?: 'standard' | 'hd';
  /** Style preset */
  style?: string;
  /** Stable ControlNet conditioning image location, materialized before provider execution. */
  controlImageLocator?: ContentLocator;
  /** ControlNet mode (canny, depth, pose, etc.) */
  controlMode?: ControlMode;
  /** ControlNet conditioning strength 0.0–1.0 */
  controlStrength?: number;
  /** IP-Adapter references for style/subject transfer */
  ipAdapterRefs?: IPAdapterReference[];
  /** Structured 3D camera reference; never flattened into prompt text. */
  cameraReference?: ThreeReferenceCameraMediaReference;
  /** Structured panoramic-scene reference; never flattened into prompt text. */
  panoramaReference?: GenerationPanoramaReference;
  /** Natural language instruction for edit (e.g., "make it night time") */
  editInstruction?: string;
  /** Explicit outpaint canvas expansion; required for the canonical outpaint operation. */
  outpaintExpansion?: ImageOutpaintExpansion;
  /** Explicit split profile and profile-specific options. */
  splitOptions?: ImageSplitProfileOptions;
}

/**
 * Video generation request
 */
export interface VideoGenerationRequest extends MediaGenerationRequestBase {
  /** Canonical single-clip video operation. Omit only for legacy request inference. */
  operation?: VideoOperationId;
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution (e.g., "1920x1080") */
  resolution?: string;
  /** Frame rate */
  fps?: number;
  /** Aspect ratio (e.g., "16:9") */
  aspectRatio?: string;
  /** Stable start frame location, materialized by the host before provider execution. */
  startFrameLocator?: ContentLocator;
  /** Stable end frame location, materialized by the host before provider execution. */
  endFrameLocator?: ContentLocator;
  /** Stable reference video location, materialized by the host before provider execution. */
  referenceVideoLocator?: ContentLocator;
  /** Motion strength (0-1) */
  motionStrength?: number;
  /** Camera movement directive (matches @neko/shared CameraMovement values) */
  cameraMovement?: string;
  /** Camera angle (matches @neko/shared CameraAngle values) */
  cameraAngle?: string;
  /** Shot scale (matches @neko/shared ShotScale values) */
  shotScale?: string;
  /** Reference images for subject consistency (IP-Adapter) */
  referenceImages?: IPAdapterReference[];
  /** Natural language edit instruction */
  editInstruction?: string;
}

export interface MaterializedIPAdapterReference extends Omit<IPAdapterReference, 'imageLocator'> {
  /** Provider-ready base64 bytes without a data URI prefix. */
  imageBase64: string;
}

export interface MaterializedGenerationPanoramaReference extends Omit<
  GenerationPanoramaReference,
  'imageLocator'
> {
  readonly imageBase64: string;
}

export interface MaterializedImageGenerationRequest extends Omit<
  ImageGenerationRequest,
  | 'referenceImageLocator'
  | 'maskLocator'
  | 'controlImageLocator'
  | 'ipAdapterRefs'
  | 'panoramaReference'
> {
  readonly referenceImageBase64?: string;
  readonly referenceImageUrl?: string;
  readonly maskBase64?: string;
  readonly controlImageBase64?: string;
  readonly ipAdapterRefs?: readonly MaterializedIPAdapterReference[];
  readonly panoramaReference?: MaterializedGenerationPanoramaReference;
}

export interface MaterializedVideoGenerationRequest extends Omit<
  VideoGenerationRequest,
  'startFrameLocator' | 'endFrameLocator' | 'referenceVideoLocator' | 'referenceImages'
> {
  readonly referenceImageBase64?: string;
  readonly referenceImageUrl?: string;
  readonly startFrameImageBase64?: string;
  readonly endFrameImageBase64?: string;
  readonly referenceVideoUrl?: string;
  readonly sourceVideoUrl?: string;
  readonly referenceImages?: readonly MaterializedIPAdapterReference[];
}

/**
 * Audio generation request
 */
export interface AudioGenerationRequest extends MediaGenerationRequestBase {
  /** Audio duration in seconds */
  duration?: number;
  /** Whether this is music generation */
  isMusic?: boolean;
  /** Music genre (for music generation) */
  genre?: string;
  /** Audio format */
  format?: 'mp3' | 'wav' | 'flac';
}

// =============================================================================
// Output Interfaces
// =============================================================================

/**
 * Media output result
 */
export interface MediaOutput {
  /** Output type */
  type: MediaOutputType;
  /** Output URL */
  url: string;
  /** Width in pixels (for image/video) */
  width?: number;
  /** Height in pixels (for image/video) */
  height?: number;
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Thumbnail URL */
  thumbnailUrl?: string;
}

// =============================================================================
// Adapter Interfaces
// =============================================================================

/**
 * Result from media adapter operations
 */
export interface MediaAdapterResult {
  /** External task ID from the platform */
  externalTaskId?: string;
  /** Current task status */
  status: MediaOperationStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Generated outputs */
  outputs?: MediaOutput[];
  /** Error information */
  error?: MediaAdapterError;
  /** Estimated completion time */
  estimatedCompletionTime?: Date;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error from media adapter
 */
export interface MediaAdapterError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Retry delay in milliseconds (if retryable) */
  retryAfterMs?: number;
}

/**
 * Media adapter interface
 */
export interface MediaAdapter {
  /** Adapter type identifier */
  readonly type: string;

  /** Supported generation types */
  getSupportedTypes(): MediaGenerationType[];

  /** Check if adapter supports the given generation type */
  supportsType(type: MediaGenerationType): boolean;
}

export interface MediaImageSubmitter {
  generateImage(
    request: MaterializedImageGenerationRequest,
    model: ModelConfig,
    provider: ProviderConfig,
  ): Promise<MediaAdapterResult>;
}

export interface MediaVideoSubmitter {
  generateVideo(
    request: MaterializedVideoGenerationRequest,
    model: ModelConfig,
    provider: ProviderConfig,
  ): Promise<MediaAdapterResult>;
}

export interface MediaAudioSubmitter {
  generateAudio(
    request: AudioGenerationRequest,
    model: ModelConfig,
    provider: ProviderConfig,
  ): Promise<MediaAdapterResult>;
}

export interface MediaTaskDescriber {
  getTaskStatus(externalTaskId: string, provider: ProviderConfig): Promise<MediaAdapterResult>;
}

export interface MediaTaskCanceller {
  cancelTask(externalTaskId: string, provider: ProviderConfig): Promise<void>;
}
