import type { ResourceRef } from './resource-cache';
import {
  validateDurableResourceRef,
  type DurableResourceRefDiagnostic,
} from './durable-resource-ref';

export const CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION = 1 as const;

export const IMAGE_OPERATION_IDS = [
  'generate',
  'edit',
  'inpaint',
  'outpaint',
  'upscale',
  'colorize',
  'style-transfer',
  'composite',
  'split',
  'background-remove',
  'background-replace',
  'prepare-shot-reference',
] as const;

export const IMAGE_SPLIT_PROFILE_IDS = [
  'grid-crop',
  'comic-panel',
  'semantic-segmentation',
] as const;

export const VIDEO_OPERATION_IDS = [
  'generate-from-prompt',
  'generate-from-image',
  'generate-from-keyframes',
  'transform',
  'restyle',
  'extend',
  'enhance',
  'trim',
  'retime',
  'prepare-for-timeline',
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
  'outpaint-expansion',
  'split-profile',
] as const;

export const CREATIVE_MEDIA_SUPPORT_LEVELS = ['supported', 'degraded', 'unsupported'] as const;

export type ImageOperationId = (typeof IMAGE_OPERATION_IDS)[number];
export type ImageSplitProfileId = (typeof IMAGE_SPLIT_PROFILE_IDS)[number];
export type VideoOperationId = (typeof VIDEO_OPERATION_IDS)[number];
export type CreativeMediaOperationId = ImageOperationId | VideoOperationId;
export type CreativeMediaControlId = (typeof CREATIVE_MEDIA_CONTROL_IDS)[number];
export type CreativeMediaSupportLevel = (typeof CREATIVE_MEDIA_SUPPORT_LEVELS)[number];
export type CreativeMediaKind = 'image' | 'video';

export interface CreativeMediaOperationLimits {
  readonly maxInputCount?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxDurationSeconds?: number;
  readonly maxOutputCount?: number;
  readonly supportedMimeTypes?: readonly string[];
}

export interface CreativeMediaProviderRequirements {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly requiredInputRoles?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly requiresNetwork?: boolean;
  readonly requiresUserAuthorization?: boolean;
}

export interface ImageOutpaintExpansion {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly fillMode: 'generative' | 'edge-extend' | 'transparent';
}

export interface ImageGridCropProfile {
  readonly rows: number;
  readonly columns: number;
  readonly gapPixels?: number;
  readonly marginPixels?: number;
}

export interface ImageComicPanelProfile {
  readonly readingOrder?: 'left-to-right' | 'right-to-left' | 'top-to-bottom';
  readonly includeBleed?: boolean;
}

export interface ImageSemanticSegmentationProfile {
  readonly labels?: readonly string[];
  readonly minimumConfidence?: number;
}

export type ImageSplitProfileOptions =
  | { readonly profileId: 'grid-crop'; readonly grid: ImageGridCropProfile }
  | { readonly profileId: 'comic-panel'; readonly comic?: ImageComicPanelProfile }
  | {
      readonly profileId: 'semantic-segmentation';
      readonly segmentation?: ImageSemanticSegmentationProfile;
    };

export interface CreativeMediaMotionControl {
  readonly strength?: number;
  readonly description?: string;
}

export interface CreativeMediaCameraControl {
  readonly movement?: string;
  readonly angle?: string;
}

export interface CreativeMediaOperationDiagnostic {
  readonly code:
    | 'invalid-operation-request'
    | 'unknown-operation'
    | 'invalid-operation-result'
    | 'operation-unsupported'
    | 'operation-degraded'
    | 'missing-required-input'
    | 'unsupported-operation-control'
    | 'unsupported-split-profile'
    | 'operation-limit-exceeded'
    | 'adapter-already-registered'
    | 'adapter-unavailable'
    | 'adapter-extension-unsupported'
    | DurableResourceRefDiagnostic['code'];
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationSupport {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly level: CreativeMediaSupportLevel;
  readonly adapterId: string;
  readonly acceptedControls: readonly CreativeMediaControlId[];
  readonly degradedControls?: readonly CreativeMediaControlId[];
  readonly supportedSplitProfiles?: readonly ImageSplitProfileId[];
  readonly extensionFields?: readonly string[];
  readonly requirements?: CreativeMediaProviderRequirements;
  readonly limits?: CreativeMediaOperationLimits;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export interface CreativeMediaAdapterExtensions {
  readonly adapterId: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationRequest {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly inputRefs: readonly ResourceRef[];
  readonly prompt?: string;
  readonly maskRef?: ResourceRef;
  readonly startFrameRef?: ResourceRef;
  readonly endFrameRef?: ResourceRef;
  readonly referenceVideoRef?: ResourceRef;
  readonly editInstruction?: string;
  readonly motion?: CreativeMediaMotionControl;
  readonly camera?: CreativeMediaCameraControl;
  readonly shotScale?: string;
  readonly requestedAspectRatio?: string;
  readonly outpaintExpansion?: ImageOutpaintExpansion;
  readonly splitProfile?: ImageSplitProfileId;
  readonly splitOptions?: ImageSplitProfileOptions;
  readonly requestedOutputCount?: number;
  readonly requestedWidth?: number;
  readonly requestedHeight?: number;
  readonly requestedDurationSeconds?: number;
  readonly adapterExtensions?: CreativeMediaAdapterExtensions;
  readonly intent?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationResult {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly status: 'succeeded' | 'failed';
  readonly outputRefs: readonly ResourceRef[];
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
  readonly provider?: { readonly providerId: string; readonly modelId?: string };
  readonly provenance?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export function isImageOperationId(value: unknown): value is ImageOperationId {
  return typeof value === 'string' && IMAGE_OPERATION_IDS.some((id) => id === value);
}

export function isVideoOperationId(value: unknown): value is VideoOperationId {
  return typeof value === 'string' && VIDEO_OPERATION_IDS.some((id) => id === value);
}

export function validateCreativeMediaOperationSupport(
  support: CreativeMediaOperationSupport,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  validateOperationIdentity(support.mediaKind, support.operationId, diagnostics);
  if (support.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !support.adapterId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message:
        'Operation support must use the current contract version and a non-empty adapter id.',
    });
  }
  if (!Array.isArray(support.acceptedControls)) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Operation support must declare accepted controls explicitly.',
      path: ['acceptedControls'],
    });
  } else if (new Set(support.acceptedControls).size !== support.acceptedControls.length) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Operation support must not declare duplicate accepted controls.',
      path: ['acceptedControls'],
    });
  }
  const acceptedControls = Array.isArray(support.acceptedControls) ? support.acceptedControls : [];
  const invalidDegradedControl = support.degradedControls?.find(
    (control) => !acceptedControls.includes(control),
  );
  if (invalidDegradedControl) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: `Degraded control ${invalidDegradedControl} must also be accepted.`,
      path: ['degradedControls'],
    });
  }
  if (
    support.supportedSplitProfiles &&
    (support.mediaKind !== 'image' || support.operationId !== 'split')
  ) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'supportedSplitProfiles is only valid for the image split operation.',
      path: ['supportedSplitProfiles'],
    });
  }
  if (
    support.level === 'unsupported' &&
    !hasDiagnostic(support.diagnostics, 'operation-unsupported')
  ) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Unsupported operation declarations require an explicit unsupported diagnostic.',
    });
  }
  if (support.level === 'degraded' && !hasDiagnostic(support.diagnostics, 'operation-degraded')) {
    diagnostics.push({
      code: 'operation-degraded',
      severity: 'error',
      message: 'Degraded operation declarations require an explicit degraded diagnostic.',
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateCreativeMediaOperationRequest(
  request: CreativeMediaOperationRequest,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (request.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Operation request has an unsupported version or empty request id.',
    });
  }
  validateOperationIdentity(request.mediaKind, request.operationId, diagnostics);
  validateRefs(request.inputRefs, ['inputRefs'], diagnostics);
  for (const [name, ref] of [
    ['maskRef', request.maskRef],
    ['startFrameRef', request.startFrameRef],
    ['endFrameRef', request.endFrameRef],
    ['referenceVideoRef', request.referenceVideoRef],
  ] as const) {
    if (ref) validateRefs([ref], [name], diagnostics);
  }
  validateRequestFieldOwnership(request, diagnostics);
  validateOperationRequiredInputs(request, diagnostics);
  validateRequestValues(request, diagnostics);
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateCreativeMediaOperationDispatch(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [
    ...validateCreativeMediaOperationRequest(request).diagnostics,
    ...validateCreativeMediaOperationSupport(support).diagnostics,
  ];
  if (request.mediaKind !== support.mediaKind || request.operationId !== support.operationId) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Selected adapter support does not match the requested media operation.',
      path: ['operationId'],
    });
  }
  if (support.level === 'unsupported') {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Requested operation cannot be dispatched to an unsupported adapter.',
    });
  } else if (support.level === 'degraded') {
    diagnostics.push({
      code: 'operation-degraded',
      severity: 'warning',
      message: 'Requested operation can only be dispatched with declared degraded behavior.',
    });
  }
  validateRequestedControls(request, support, diagnostics);
  validateSplitProfileSupport(request, support, diagnostics);
  validateAdapterExtensions(request, support, diagnostics);
  validateLimits(request, support, diagnostics);
  const requiredRoles = support.requirements?.requiredInputRoles ?? [];
  const missingRole = requiredRoles.find((role) => !hasRequiredInputRole(request, role));
  if (missingRole) {
    diagnostics.push({
      code: 'missing-required-input',
      severity: 'error',
      message: `Requested operation is missing required input role: ${missingRole}.`,
      details: { role: missingRole },
    });
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
}

export function validateCreativeMediaOperationResult(
  result: CreativeMediaOperationResult,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (result.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !result.requestId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message: 'Operation result has an unsupported version or empty request id.',
    });
  }
  validateOperationIdentity(result.mediaKind, result.operationId, diagnostics);
  validateRefs(result.outputRefs, ['outputRefs'], diagnostics);
  if (result.status === 'succeeded' && result.outputRefs.length === 0) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message:
        'A successful operation result must include at least one durable output ResourceRef.',
      path: ['outputRefs'],
    });
  }
  if (
    result.status === 'succeeded' &&
    result.diagnostics.some((item) => item.severity === 'error')
  ) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message: 'A successful operation result cannot contain error diagnostics.',
      path: ['diagnostics'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function getRequestedCreativeMediaControls(
  request: CreativeMediaOperationRequest,
): readonly CreativeMediaControlId[] {
  const controls: CreativeMediaControlId[] = [];
  if (request.prompt !== undefined) controls.push('prompt');
  if (request.maskRef !== undefined) controls.push('mask');
  if (request.startFrameRef !== undefined) controls.push('start-frame');
  if (request.endFrameRef !== undefined) controls.push('end-frame');
  if (request.referenceVideoRef !== undefined) controls.push('reference-video');
  if (request.editInstruction !== undefined) controls.push('edit-instruction');
  if (request.motion?.strength !== undefined || request.motion?.description !== undefined) {
    controls.push('motion-strength');
  }
  if (request.camera?.movement !== undefined) controls.push('camera-movement');
  if (request.camera?.angle !== undefined) controls.push('camera-angle');
  if (request.shotScale !== undefined) controls.push('shot-scale');
  if (request.requestedDurationSeconds !== undefined) controls.push('duration');
  if (request.requestedAspectRatio !== undefined) controls.push('aspect-ratio');
  if (request.requestedWidth !== undefined || request.requestedHeight !== undefined) {
    controls.push('output-size');
  }
  if (request.requestedOutputCount !== undefined) controls.push('output-count');
  if (request.outpaintExpansion !== undefined) controls.push('outpaint-expansion');
  if (request.splitProfile !== undefined || request.splitOptions !== undefined) {
    controls.push('split-profile');
  }
  return controls;
}

function validateOperationIdentity(
  mediaKind: CreativeMediaKind,
  operationId: CreativeMediaOperationId,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const valid =
    mediaKind === 'image' ? isImageOperationId(operationId) : isVideoOperationId(operationId);
  if (!valid) {
    diagnostics.push({
      code: 'unknown-operation',
      severity: 'error',
      message: `Operation ${operationId} is not valid for media kind ${mediaKind}.`,
      path: ['operationId'],
    });
  }
}

function validateRefs(
  refs: readonly ResourceRef[],
  path: readonly (string | number)[],
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  refs.forEach((ref, index) => {
    const validation = validateDurableResourceRef(ref, [...path, index]);
    diagnostics.push(...validation.diagnostics);
  });
}

function validateRequestFieldOwnership(
  request: CreativeMediaOperationRequest,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  if ((request.splitProfile || request.splitOptions) && request.operationId !== 'split') {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Split profile fields are only valid for the image split operation.',
      path: ['splitProfile'],
    });
  }
  if (request.outpaintExpansion && request.operationId !== 'outpaint') {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'outpaintExpansion is only valid for the image outpaint operation.',
      path: ['outpaintExpansion'],
    });
  }
  const hasVideoControl =
    request.referenceVideoRef !== undefined ||
    request.motion !== undefined ||
    request.camera !== undefined ||
    request.shotScale !== undefined;
  if (request.mediaKind === 'image' && hasVideoControl) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Video controls are not valid for image operations.',
    });
  }
}

function validateOperationRequiredInputs(
  request: CreativeMediaOperationRequest,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const missing = (role: string, path?: readonly (string | number)[]): void => {
    diagnostics.push({
      code: 'missing-required-input',
      severity: 'error',
      message: `Operation ${request.operationId} requires ${role}.`,
      ...(path ? { path } : {}),
      details: { role },
    });
  };
  if (request.operationId === 'outpaint') {
    if (request.inputRefs.length === 0) missing('source');
    if (!request.outpaintExpansion) missing('outpaint-expansion', ['outpaintExpansion']);
  }
  if (request.operationId === 'split' && !request.splitProfile) {
    missing('split-profile', ['splitProfile']);
  }
  if (request.operationId === 'generate-from-image' && !request.startFrameRef) {
    missing('start-frame', ['startFrameRef']);
  }
  if (request.operationId === 'generate-from-keyframes') {
    if (!request.startFrameRef) missing('start-frame', ['startFrameRef']);
    if (!request.endFrameRef) missing('end-frame', ['endFrameRef']);
  }
  if (
    [
      'transform',
      'restyle',
      'extend',
      'enhance',
      'trim',
      'retime',
      'prepare-for-timeline',
    ].includes(request.operationId) &&
    !request.referenceVideoRef &&
    request.inputRefs.length === 0
  ) {
    missing('reference-video', ['referenceVideoRef']);
  }
}

function validateRequestValues(
  request: CreativeMediaOperationRequest,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const positiveFields = [
    ['requestedOutputCount', request.requestedOutputCount],
    ['requestedWidth', request.requestedWidth],
    ['requestedHeight', request.requestedHeight],
    ['requestedDurationSeconds', request.requestedDurationSeconds],
  ] as const;
  for (const [field, value] of positiveFields) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      diagnostics.push({
        code: 'invalid-operation-request',
        severity: 'error',
        message: `${field} must be a positive finite number.`,
        path: [field],
      });
    }
  }
  if (
    request.motion?.strength !== undefined &&
    (!Number.isFinite(request.motion.strength) ||
      request.motion.strength < 0 ||
      request.motion.strength > 1)
  ) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Motion strength must be between 0 and 1.',
      path: ['motion', 'strength'],
    });
  }
  if (request.outpaintExpansion) {
    const sides = [
      request.outpaintExpansion.left,
      request.outpaintExpansion.right,
      request.outpaintExpansion.top,
      request.outpaintExpansion.bottom,
    ];
    if (
      sides.some((value) => !Number.isInteger(value) || value < 0) ||
      sides.every((value) => value === 0)
    ) {
      diagnostics.push({
        code: 'invalid-operation-request',
        severity: 'error',
        message:
          'Outpaint expansion requires non-negative integer sides and at least one expanded side.',
        path: ['outpaintExpansion'],
      });
    }
  }
  if (request.splitOptions && request.splitOptions.profileId !== request.splitProfile) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'splitOptions profile must match splitProfile.',
      path: ['splitOptions', 'profileId'],
    });
  }
  if (request.splitOptions?.profileId === 'grid-crop') {
    if (
      !Number.isInteger(request.splitOptions.grid.rows) ||
      request.splitOptions.grid.rows <= 0 ||
      !Number.isInteger(request.splitOptions.grid.columns) ||
      request.splitOptions.grid.columns <= 0
    ) {
      diagnostics.push({
        code: 'invalid-operation-request',
        severity: 'error',
        message: 'Grid crop requires positive integer rows and columns.',
        path: ['splitOptions', 'grid'],
      });
    }
  }
}

function validateRequestedControls(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  for (const control of getRequestedCreativeMediaControls(request)) {
    if (!support.acceptedControls?.includes(control)) {
      diagnostics.push({
        code: 'unsupported-operation-control',
        severity: 'error',
        message: `Adapter ${support.adapterId} does not support requested control ${control}.`,
        details: { adapterId: support.adapterId, control },
      });
    } else if (support.degradedControls?.includes(control)) {
      diagnostics.push({
        code: 'operation-degraded',
        severity: 'warning',
        message: `Adapter ${support.adapterId} only supports control ${control} with degraded behavior.`,
        details: { adapterId: support.adapterId, control },
      });
    }
  }
}

function validateSplitProfileSupport(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  if (
    request.operationId === 'split' &&
    request.splitProfile &&
    !support.supportedSplitProfiles?.includes(request.splitProfile)
  ) {
    diagnostics.push({
      code: 'unsupported-split-profile',
      severity: 'error',
      message: `Adapter ${support.adapterId} does not support split profile ${request.splitProfile}.`,
      path: ['splitProfile'],
      details: { adapterId: support.adapterId, splitProfile: request.splitProfile },
    });
  }
}

function validateAdapterExtensions(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const extensions = request.adapterExtensions;
  if (!extensions) return;
  if (extensions.adapterId !== support.adapterId) {
    diagnostics.push({
      code: 'adapter-extension-unsupported',
      severity: 'error',
      message: `Adapter extensions for ${extensions.adapterId} cannot be dispatched to ${support.adapterId}.`,
      path: ['adapterExtensions', 'adapterId'],
    });
    return;
  }
  const declared = new Set(support.extensionFields ?? []);
  const unknownField = Object.keys(extensions.values).find((field) => !declared.has(field));
  if (unknownField) {
    diagnostics.push({
      code: 'adapter-extension-unsupported',
      severity: 'error',
      message: `Adapter ${support.adapterId} does not declare extension field ${unknownField}.`,
      path: ['adapterExtensions', 'values', unknownField],
      details: { adapterId: support.adapterId, field: unknownField },
    });
  }
}

function validateLimits(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const limits = support.limits;
  if (
    (limits?.maxInputCount !== undefined && request.inputRefs.length > limits.maxInputCount) ||
    (limits?.maxOutputCount !== undefined &&
      request.requestedOutputCount !== undefined &&
      request.requestedOutputCount > limits.maxOutputCount) ||
    (limits?.maxWidth !== undefined &&
      request.requestedWidth !== undefined &&
      request.requestedWidth > limits.maxWidth) ||
    (limits?.maxHeight !== undefined &&
      request.requestedHeight !== undefined &&
      request.requestedHeight > limits.maxHeight) ||
    (limits?.maxDurationSeconds !== undefined &&
      request.requestedDurationSeconds !== undefined &&
      request.requestedDurationSeconds > limits.maxDurationSeconds)
  ) {
    diagnostics.push({
      code: 'operation-limit-exceeded',
      severity: 'error',
      message: 'Requested operation exceeds the selected adapter limits.',
    });
  }
}

function hasRequiredInputRole(request: CreativeMediaOperationRequest, role: string): boolean {
  switch (role) {
    case 'source':
      return request.inputRefs.length > 0;
    case 'mask':
      return request.maskRef !== undefined;
    case 'start-frame':
      return request.startFrameRef !== undefined;
    case 'end-frame':
      return request.endFrameRef !== undefined;
    case 'reference-video':
      return request.referenceVideoRef !== undefined || request.inputRefs.length > 0;
    case 'split-profile':
      return request.splitProfile !== undefined;
    case 'outpaint-expansion':
      return request.outpaintExpansion !== undefined;
    default:
      return false;
  }
}

function hasDiagnostic(
  diagnostics: readonly CreativeMediaOperationDiagnostic[],
  code: CreativeMediaOperationDiagnostic['code'],
): boolean {
  return diagnostics.some((item) => item.code === code);
}
