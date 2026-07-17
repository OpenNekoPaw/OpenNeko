import type { ProviderType } from '@neko/shared';
import {
  CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
  type CreativeMediaControlId,
  type CreativeMediaOperationDiagnostic,
  type CreativeMediaOperationSupport,
  type ImageOperationId,
  type VideoOperationId,
} from '@neko/shared';
import type { ImageGenerationRequest, VideoGenerationRequest } from './types';

const PROMPT_VIDEO_CONTROLS = [
  'prompt',
  'duration',
  'aspect-ratio',
  'output-size',
] as const satisfies readonly CreativeMediaControlId[];
const IMAGE_VIDEO_CONTROLS = [
  ...PROMPT_VIDEO_CONTROLS,
  'start-frame',
] as const satisfies readonly CreativeMediaControlId[];
const FULL_VIDEO_CONTROLS = [
  ...IMAGE_VIDEO_CONTROLS,
  'end-frame',
  'reference-video',
  'edit-instruction',
  'motion-strength',
  'camera-movement',
  'camera-angle',
  'shot-scale',
] as const satisfies readonly CreativeMediaControlId[];

export interface AuditedImageCapability {
  readonly owner: 'media' | 'sketch' | 'canvas' | 'engine' | 'cut';
  readonly operationId: ImageOperationId;
  readonly level: CreativeMediaOperationSupport['level'];
  readonly supportedSplitProfiles?: CreativeMediaOperationSupport['supportedSplitProfiles'];
  readonly diagnostic?: string;
}

export const AUDITED_IMAGE_CAPABILITY_MATRIX: readonly AuditedImageCapability[] = [
  { owner: 'media', operationId: 'generate', level: 'supported' },
  { owner: 'media', operationId: 'edit', level: 'supported' },
  { owner: 'sketch', operationId: 'inpaint', level: 'supported' },
  { owner: 'sketch', operationId: 'upscale', level: 'supported' },
  { owner: 'sketch', operationId: 'colorize', level: 'supported' },
  { owner: 'sketch', operationId: 'style-transfer', level: 'supported' },
  { owner: 'sketch', operationId: 'composite', level: 'supported' },
  { owner: 'canvas', operationId: 'composite', level: 'supported' },
  {
    owner: 'media',
    operationId: 'outpaint',
    level: 'unsupported',
    diagnostic: 'No audited provider path currently preserves explicit canvas expansion semantics.',
  },
  {
    owner: 'engine',
    operationId: 'split',
    level: 'unsupported',
    supportedSplitProfiles: [],
    diagnostic:
      'Grid crop, comic-panel, and semantic segmentation require explicit owning adapters.',
  },
  {
    owner: 'cut',
    operationId: 'background-remove',
    level: 'degraded',
    diagnostic: 'Existing background removal is Webview-bound and is not a headless image adapter.',
  },
  {
    owner: 'media',
    operationId: 'background-replace',
    level: 'unsupported',
    diagnostic: 'No audited canonical background replacement adapter is registered.',
  },
  { owner: 'canvas', operationId: 'prepare-shot-reference', level: 'supported' },
];

export function getProviderVideoOperationSupport(
  providerType: ProviderType,
  operationId: VideoOperationId,
): CreativeMediaOperationSupport {
  const profile = providerVideoProfile(providerType, operationId);
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (profile.level === 'unsupported') {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message:
        profile.message ??
        `${providerType} does not support canonical video operation ${operationId}.`,
    });
  } else if (profile.level === 'degraded') {
    diagnostics.push({
      code: 'operation-degraded',
      severity: 'warning',
      message:
        profile.message ?? `${providerType} only supports ${operationId} with degraded behavior.`,
    });
  }
  return {
    version: CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION,
    mediaKind: 'video',
    operationId,
    level: profile.level,
    adapterId: `media-provider:${providerType}`,
    acceptedControls: profile.controls,
    ...(profile.degradedControls ? { degradedControls: profile.degradedControls } : {}),
    requirements: {
      providerId: providerType,
      requiredInputRoles: requiredVideoRoles(operationId),
      requiresNetwork: true,
      requiresUserAuthorization: true,
    },
    diagnostics,
  };
}

export function resolveCanonicalVideoOperation(request: VideoGenerationRequest): VideoOperationId {
  if (request.operation) return request.operation;
  if (request.referenceVideoRef || request.referenceVideoUrl || request.sourceVideoUrl) {
    return request.editInstruction ? 'transform' : 'restyle';
  }
  if (request.endFrameRef || request.endFrameImageBase64) return 'generate-from-keyframes';
  if (
    request.startFrameRef ||
    request.startFrameImageBase64 ||
    request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri
  ) {
    return 'generate-from-image';
  }
  return 'generate-from-prompt';
}

export function validateProviderVideoRequest(
  providerType: ProviderType,
  request: VideoGenerationRequest,
): readonly CreativeMediaOperationDiagnostic[] {
  const operationId = resolveCanonicalVideoOperation(request);
  const support = getProviderVideoOperationSupport(providerType, operationId);
  const requestedControls = requestedVideoControls(request);
  const diagnostics = [...support.diagnostics];
  for (const control of requestedControls) {
    if (!support.acceptedControls.includes(control)) {
      diagnostics.push({
        code: 'unsupported-operation-control',
        severity: 'error',
        message: `${providerType} does not declare support for requested video control ${control}.`,
        details: { providerType, operationId, control },
      });
    } else if (support.degradedControls?.includes(control)) {
      diagnostics.push({
        code: 'operation-degraded',
        severity: 'warning',
        message: `${providerType} only supports requested video control ${control} with degraded behavior.`,
        details: { providerType, operationId, control },
      });
    }
  }
  return diagnostics;
}

export function validateProviderImageRequest(
  providerType: ProviderType,
  request: ImageGenerationRequest,
): readonly CreativeMediaOperationDiagnostic[] {
  const operationId = resolveCanonicalImageOperation(request);
  if (['generate', 'edit', 'inpaint', 'style-transfer'].includes(operationId)) {
    return [];
  }
  return [
    {
      code: 'operation-unsupported',
      severity: 'error',
      message: `${providerType} media generation does not declare canonical image operation ${operationId}; use an owning Image adapter.`,
      details: { providerType, operationId },
    },
  ];
}

export function resolveCanonicalImageOperation(request: ImageGenerationRequest): ImageOperationId {
  if (request.operation) return request.operation;
  if (request.maskBase64 || request.maskUri) return 'inpaint';
  if (
    request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.editInstruction
  ) {
    return 'edit';
  }
  return 'generate';
}

function providerVideoProfile(
  providerType: ProviderType,
  operationId: VideoOperationId,
): {
  readonly level: CreativeMediaOperationSupport['level'];
  readonly controls: readonly CreativeMediaControlId[];
  readonly degradedControls?: readonly CreativeMediaControlId[];
  readonly message?: string;
} {
  if (['openai', 'generic', 'newapi', 'xai', 'kling'].includes(providerType)) {
    if (['extend', 'enhance', 'trim', 'retime', 'prepare-for-timeline'].includes(operationId)) {
      return unsupportedVideoProfile(operationId);
    }
    return { level: 'supported', controls: FULL_VIDEO_CONTROLS };
  }
  if (providerType === 'dashscope') {
    if (['generate-from-prompt', 'generate-from-image'].includes(operationId)) {
      return {
        level: 'supported',
        controls: [...IMAGE_VIDEO_CONTROLS, 'camera-movement', 'edit-instruction'],
      };
    }
    if (operationId === 'generate-from-keyframes') {
      return {
        level: 'supported',
        controls: [...IMAGE_VIDEO_CONTROLS, 'end-frame', 'camera-movement', 'edit-instruction'],
      };
    }
    if (operationId === 'transform' || operationId === 'restyle') {
      return {
        level: 'supported',
        controls: [
          ...PROMPT_VIDEO_CONTROLS,
          'reference-video',
          'edit-instruction',
          'camera-movement',
        ],
      };
    }
    return unsupportedVideoProfile(operationId);
  }
  if (providerType === 'runway') {
    if (operationId === 'generate-from-prompt' || operationId === 'generate-from-image') {
      return { level: 'supported', controls: IMAGE_VIDEO_CONTROLS };
    }
    return unsupportedVideoProfile(operationId);
  }
  if (providerType === 'luma') {
    if (operationId === 'generate-from-prompt' || operationId === 'generate-from-image') {
      return {
        level: 'supported',
        controls: ['prompt', 'aspect-ratio', 'start-frame'],
      };
    }
    return unsupportedVideoProfile(operationId);
  }
  if (providerType === 'vidu') {
    if (operationId === 'generate-from-prompt' || operationId === 'generate-from-image') {
      return {
        level: 'supported',
        controls: ['prompt', 'duration', 'aspect-ratio', 'start-frame'],
      };
    }
    return unsupportedVideoProfile(operationId);
  }
  if (providerType === 'liblib') {
    if (operationId === 'generate-from-prompt' || operationId === 'generate-from-image') {
      return {
        level: 'supported',
        controls: ['prompt', 'duration', 'output-size', 'start-frame'],
      };
    }
    return unsupportedVideoProfile(operationId);
  }
  if (providerType === 'minimax') {
    if (operationId === 'generate-from-prompt') {
      return { level: 'supported', controls: ['prompt'] };
    }
    return unsupportedVideoProfile(operationId);
  }
  return unsupportedVideoProfile(operationId);
}

function unsupportedVideoProfile(operationId: VideoOperationId): {
  readonly level: 'unsupported';
  readonly controls: readonly CreativeMediaControlId[];
  readonly message: string;
} {
  return {
    level: 'unsupported',
    controls: [],
    message: `No audited adapter path supports canonical video operation ${operationId}.`,
  };
}

function requiredVideoRoles(operationId: VideoOperationId): readonly string[] {
  switch (operationId) {
    case 'generate-from-image':
      return ['start-frame'];
    case 'generate-from-keyframes':
      return ['start-frame', 'end-frame'];
    case 'transform':
    case 'restyle':
    case 'extend':
    case 'enhance':
    case 'trim':
    case 'retime':
    case 'prepare-for-timeline':
      return ['reference-video'];
    case 'generate-from-prompt':
      return [];
  }
}

function requestedVideoControls(
  request: VideoGenerationRequest,
): readonly CreativeMediaControlId[] {
  const controls: CreativeMediaControlId[] = [];
  if (request.prompt) controls.push('prompt');
  if (
    request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.startFrameRef ||
    request.startFrameImageBase64
  ) {
    controls.push('start-frame');
  }
  if (request.endFrameRef || request.endFrameImageBase64) controls.push('end-frame');
  if (request.referenceVideoRef || request.referenceVideoUrl || request.sourceVideoUrl) {
    controls.push('reference-video');
  }
  if (request.editInstruction) controls.push('edit-instruction');
  if (request.motionStrength !== undefined) controls.push('motion-strength');
  if (request.cameraMovement) controls.push('camera-movement');
  if (request.cameraAngle) controls.push('camera-angle');
  if (request.shotScale) controls.push('shot-scale');
  if (request.duration !== undefined) controls.push('duration');
  if (request.aspectRatio) controls.push('aspect-ratio');
  if (request.resolution) controls.push('output-size');
  return controls;
}
