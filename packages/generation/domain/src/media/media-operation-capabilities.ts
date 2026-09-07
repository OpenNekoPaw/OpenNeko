import type { ProviderType } from '@neko/ai-contracts';
import {
  type CreativeMediaControlId,
  type CreativeMediaOperationDiagnostic,
  type CreativeMediaOperationSupport,
  type ImageOperationId,
  type VideoOperationId,
} from '@neko/generation-domain';
import type { ImageGenerationRequest, VideoGenerationRequest } from '@neko/generation-domain';

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
    mediaKind: 'video',
    operationId,
    level: profile.level,
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
  if (
    request.inputs?.some(
      (input) => input.role === 'reference-video' || input.role === 'reference-audio',
    )
  ) {
    return request.editInstruction ? 'transform' : 'restyle';
  }
  if (request.inputs?.some((input) => input.role === 'last-frame')) {
    return 'generate-from-keyframes';
  }
  if (
    request.inputs?.some(
      (input) => input.role === 'first-frame' || input.role === 'reference-image',
    )
  ) {
    return 'generate-from-image';
  }
  return 'generate-from-prompt';
}

export function validateProviderVideoRequest(
  providerType: ProviderType,
  request: VideoGenerationRequest,
  modelCapabilities?: readonly string[],
): readonly CreativeMediaOperationDiagnostic[] {
  const operationId = resolveCanonicalVideoOperation(request);
  const support = getProviderVideoOperationSupport(providerType, operationId);
  const requestedControls = requestedVideoControls(request);
  const diagnostics = [...support.diagnostics];
  for (const role of requiredVideoRoles(operationId)) {
    const inputRole =
      role === 'start-frame' ? 'first-frame' : role === 'end-frame' ? 'last-frame' : role;
    if (!request.inputs?.some((input) => input.role === inputRole)) {
      diagnostics.push({
        code: 'missing-required-input',
        severity: 'error',
        message: `Video operation ${operationId} requires a ${role} input.`,
        details: { providerType, operationId, role },
      });
    }
  }
  const requiredModelCapabilities = requiredVideoModelCapabilities(operationId);
  if (
    requiredModelCapabilities.length > 0 &&
    modelCapabilities !== undefined &&
    !requiredModelCapabilities.some((capability) => modelCapabilities.includes(capability))
  ) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: `Selected model does not declare a capability required by video operation ${operationId}.`,
      details: {
        providerType,
        operationId,
        requiredCapabilities: requiredModelCapabilities,
        owner: 'model',
      },
    });
  }
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
  modelCapabilities?: readonly string[],
): readonly CreativeMediaOperationDiagnostic[] {
  const operationId = resolveCanonicalImageOperation(request);
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (operationId !== 'generate' && !providerSupportsImageOperation(providerType, operationId)) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: `${providerType} does not expose an AI SDK path for image operation ${operationId}.`,
      details: { providerType, operationId, owner: 'provider' },
    });
  }
  if (
    operationId !== 'generate' &&
    modelCapabilities !== undefined &&
    !requiredImageModelCapabilities(operationId).some((capability) =>
      modelCapabilities.includes(capability),
    )
  ) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: `Selected model does not declare a capability required by image operation ${operationId}.`,
      details: {
        providerType,
        operationId,
        requiredCapabilities: requiredImageModelCapabilities(operationId),
        owner: 'model',
      },
    });
  }
  if (
    (operationId === 'edit' || operationId === 'inpaint' || operationId === 'style-transfer') &&
    !request.referenceImageLocator
  ) {
    diagnostics.push({
      code: 'missing-required-input',
      severity: 'error',
      message: `Image operation ${operationId} requires a source image.`,
      details: { providerType, operationId, role: 'source-image' },
    });
  }
  if (operationId === 'inpaint' && !request.maskLocator) {
    diagnostics.push({
      code: 'missing-required-input',
      severity: 'error',
      message: 'Image operation inpaint requires a mask.',
      details: { providerType, operationId, role: 'mask' },
    });
  }
  if (
    request.controlImageLocator &&
    request.controlMode !== 'pose' &&
    request.controlMode !== 'depth'
  ) {
    diagnostics.push({
      code: 'unsupported-operation-control',
      severity: 'error',
      message: 'Stable 3D controlImageLocator requires an exact pose or depth control mode.',
      details: { providerType, operationId, control: request.controlMode, owner: 'request' },
    });
  }
  const stableAppearanceReferences = request.ipAdapterRefs ?? [];
  const providerControls = providerThreeReferenceImageControls(
    providerType,
    modelCapabilities ?? [],
  );
  for (const requirement of requestedThreeReferenceImageControls(request)) {
    if (!providerControls.includes(requirement.control)) {
      diagnostics.push({
        code: 'unsupported-operation-control',
        severity: 'error',
        message: `${providerType} does not declare audited support for requested image control ${requirement.control}.`,
        details: { providerType, operationId, control: requirement.control, owner: 'provider' },
      });
    }
    if (!modelCapabilities?.includes(requirement.modelCapability)) {
      diagnostics.push({
        code: 'unsupported-operation-control',
        severity: 'error',
        message: `Selected model does not declare required capability ${requirement.modelCapability}.`,
        details: {
          providerType,
          operationId,
          control: requirement.control,
          requiredCapability: requirement.modelCapability,
          owner: 'model',
        },
      });
    }
  }
  if (stableAppearanceReferences.length > 0 && (request.ipAdapterRefs?.length ?? 0) > 1) {
    diagnostics.push({
      code: 'operation-limit-exceeded',
      severity: 'error',
      message: 'Audited image providers accept exactly one stable appearance reference.',
      details: { providerType, operationId, control: 'appearance-reference', maxInputCount: 1 },
    });
  }
  return diagnostics;
}

function providerSupportsImageOperation(
  providerType: ProviderType,
  operationId: ImageOperationId,
): boolean {
  if (operationId === 'generate') {
    return ['openai', 'bytedance', 'newapi', 'oneapi', 'generic'].includes(providerType);
  }
  if (operationId === 'inpaint') {
    return ['openai', 'newapi', 'oneapi', 'generic'].includes(providerType);
  }
  return ['openai', 'bytedance', 'newapi', 'oneapi', 'generic'].includes(providerType);
}

function requiredImageModelCapabilities(operationId: ImageOperationId): readonly string[] {
  return operationId === 'generate'
    ? ['image.generate', 'text_to_image']
    : ['image.edit', 'image_edit', 'image_to_image'];
}

function requiredVideoModelCapabilities(operationId: VideoOperationId): readonly string[] {
  switch (operationId) {
    case 'generate-from-prompt':
    case 'generate-from-image':
    case 'generate-from-keyframes':
      return [];
    case 'transform':
    case 'restyle':
      return ['video_edit', 'video_to_video'];
  }
}

interface ThreeReferenceImageControlRequirement {
  readonly control: Extract<
    CreativeMediaControlId,
    | 'pose-control'
    | 'depth-control'
    | 'appearance-reference'
    | 'camera-reference'
    | 'panorama-reference'
  >;
  readonly modelCapability:
    | 'image.control.pose'
    | 'image.control.depth'
    | 'image.reference.ip-adapter'
    | 'image.control.camera'
    | 'image.control.panorama';
}

function requestedThreeReferenceImageControls(
  request: ImageGenerationRequest,
): readonly ThreeReferenceImageControlRequirement[] {
  const requirements: ThreeReferenceImageControlRequirement[] = [];
  if (request.controlImageLocator && request.controlMode === 'pose') {
    requirements.push({ control: 'pose-control', modelCapability: 'image.control.pose' });
  }
  if (request.controlImageLocator && request.controlMode === 'depth') {
    requirements.push({ control: 'depth-control', modelCapability: 'image.control.depth' });
  }
  if (request.ipAdapterRefs?.some((reference) => reference.imageLocator)) {
    requirements.push({
      control: 'appearance-reference',
      modelCapability: 'image.reference.ip-adapter',
    });
  }
  if (request.cameraReference) {
    requirements.push({ control: 'camera-reference', modelCapability: 'image.control.camera' });
  }
  if (request.panoramaReference) {
    requirements.push({
      control: 'panorama-reference',
      modelCapability: 'image.control.panorama',
    });
  }
  return requirements;
}

function providerThreeReferenceImageControls(
  providerType: ProviderType,
  modelCapabilities: readonly string[],
): readonly ThreeReferenceImageControlRequirement['control'][] {
  const usesChatImageRuntime =
    modelCapabilities.includes('chat') && modelCapabilities.includes('text_to_image');
  if (!usesChatImageRuntime && ['generic', 'newapi', 'oneapi'].includes(providerType)) {
    return ['pose-control', 'depth-control', 'appearance-reference'];
  }
  return [];
}

export function resolveCanonicalImageOperation(request: ImageGenerationRequest): ImageOperationId {
  if (request.operation) return request.operation;
  if (request.maskLocator) return 'inpaint';
  if (request.referenceImageLocator || request.editInstruction) {
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
  if (providerType === 'minimax' || providerType === 'bytedance') {
    if (
      [
        'generate-from-prompt',
        'generate-from-image',
        'generate-from-keyframes',
        'transform',
        'restyle',
      ].includes(operationId)
    ) {
      return { level: 'supported', controls: FULL_VIDEO_CONTROLS };
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
    message: `No audited AI SDK provider path supports canonical video operation ${operationId}.`,
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
  if (request.inputs?.some((input) => input.role === 'first-frame')) {
    controls.push('start-frame');
  }
  if (request.inputs?.some((input) => input.role === 'last-frame')) controls.push('end-frame');
  if (
    request.inputs?.some(
      (input) => input.role === 'reference-video' || input.role === 'reference-audio',
    )
  ) {
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
