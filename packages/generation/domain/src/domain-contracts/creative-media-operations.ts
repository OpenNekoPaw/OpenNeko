/**
 * Provider-executable operations owned by Generation.
 *
 * Editorial, compositing, segmentation, upscaling, and timeline preparation
 * belong to their respective media domains and are intentionally absent here.
 */
export const IMAGE_OPERATION_IDS = ['generate', 'edit', 'inpaint', 'style-transfer'] as const;

export const VIDEO_OPERATION_IDS = [
  'generate-from-prompt',
  'generate-from-image',
  'generate-from-keyframes',
  'transform',
  'restyle',
] as const;

export const CREATIVE_MEDIA_CONTROL_IDS = [
  'prompt',
  'mask',
  'start-frame',
  'end-frame',
  'reference-video',
  'edit-instruction',
  'motion-strength',
  'camera-movement',
  'camera-angle',
  'shot-scale',
  'duration',
  'aspect-ratio',
  'output-size',
  'output-count',
  'pose-control',
  'depth-control',
  'appearance-reference',
  'camera-reference',
  'panorama-reference',
] as const;

export type ImageOperationId = (typeof IMAGE_OPERATION_IDS)[number];
export type VideoOperationId = (typeof VIDEO_OPERATION_IDS)[number];
export type CreativeMediaOperationId = ImageOperationId | VideoOperationId;
export type CreativeMediaControlId = (typeof CREATIVE_MEDIA_CONTROL_IDS)[number];
export type CreativeMediaSupportLevel = 'supported' | 'degraded' | 'unsupported';
export type CreativeMediaKind = 'image' | 'video';

export interface CreativeMediaProviderRequirements {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly requiredInputRoles?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly requiresNetwork?: boolean;
  readonly requiresUserAuthorization?: boolean;
}

export interface CreativeMediaOperationDiagnostic {
  readonly code:
    | 'operation-unsupported'
    | 'operation-degraded'
    | 'missing-required-input'
    | 'unsupported-operation-control'
    | 'operation-limit-exceeded';
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationSupport {
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly level: CreativeMediaSupportLevel;
  readonly acceptedControls: readonly CreativeMediaControlId[];
  readonly degradedControls?: readonly CreativeMediaControlId[];
  readonly requirements?: CreativeMediaProviderRequirements;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export function isImageOperationId(value: unknown): value is ImageOperationId {
  return typeof value === 'string' && IMAGE_OPERATION_IDS.some((id) => id === value);
}

export function isVideoOperationId(value: unknown): value is VideoOperationId {
  return typeof value === 'string' && VIDEO_OPERATION_IDS.some((id) => id === value);
}
