import type {
  ThreeReferenceCameraMediaReference,
  ThreeReferenceMediaOutputIdentity,
  ThreeReferencePanoramaOrientation,
} from '@neko/model-domain';
import type { ContentLocator } from '@neko/content-domain';
import type { ImageOperationId, VideoOperationId } from '@neko/generation-domain';

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
  | 'text-to-audio';

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
  /** Canonical image operation. When absent, semantic request inputs determine the operation. */
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
}

/**
 * Video generation request
 */
export type VideoGenerationInput =
  | {
      readonly type: 'image';
      readonly role: 'first-frame' | 'last-frame' | 'reference-image';
      readonly locator: ContentLocator;
      readonly mimeType?: string;
    }
  | {
      readonly type: 'video';
      readonly role: 'reference-video';
      readonly locator: ContentLocator;
      readonly mimeType?: string;
    }
  | {
      readonly type: 'audio';
      readonly role: 'reference-audio';
      readonly locator: ContentLocator;
      readonly mimeType?: string;
    };

export interface VideoGenerationRequest extends MediaGenerationRequestBase {
  /** Canonical single-clip video operation. When absent, semantic request inputs determine the operation. */
  operation?: VideoOperationId;
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution (e.g., "1920x1080") */
  resolution?: string;
  /** Frame rate */
  fps?: number;
  /** Aspect ratio (e.g., "16:9") */
  aspectRatio?: string;
  /** Whether the video model should generate synchronized audio. */
  generateAudio?: boolean;
  /** Stable, role-typed media inputs materialized by the authorized host. */
  inputs?: readonly VideoGenerationInput[];
  /** Motion strength (0-1) */
  motionStrength?: number;
  /** Camera movement directive (matches @neko/shared CameraMovement values) */
  cameraMovement?: string;
  /** Camera angle (matches @neko/shared CameraAngle values) */
  cameraAngle?: string;
  /** Shot scale (matches @neko/shared ShotScale values) */
  shotScale?: string;
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

export type MaterializedVideoGenerationInput = Omit<VideoGenerationInput, 'locator'> & {
  readonly url: string;
};

export interface MaterializedVideoGenerationRequest extends Omit<VideoGenerationRequest, 'inputs'> {
  readonly inputs?: readonly MaterializedVideoGenerationInput[];
}

/**
 * Audio generation request
 */
export interface AudioGenerationRequest extends MediaGenerationRequestBase {
  /** Audio duration in seconds */
  duration?: number;
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
// Provider Task Observation
// =============================================================================

/**
 * Current state returned by an asynchronous AI SDK provider model.
 */
export interface GenerationProviderTaskObservation {
  /** External task ID from the platform */
  externalTaskId?: string;
  /** Current task status */
  status: MediaOperationStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Generated outputs */
  outputs?: MediaOutput[];
  /** Error information */
  error?: GenerationProviderTaskError;
  /** Estimated completion time */
  estimatedCompletionTime?: Date;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error reported for one exact provider task.
 */
export interface GenerationProviderTaskError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Retry delay in milliseconds (if retryable) */
  retryAfterMs?: number;
}
