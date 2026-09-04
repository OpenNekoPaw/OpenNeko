import type { ProviderType } from '@neko/ai-contracts';
import type {
  ImageGenerationQuality,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from './contracts';
import type {
  GenerationRecipeModelBinding,
  ImageGenerationRecipe,
  VideoGenerationRecipe,
} from './recipe';

export const VIDEO_GENERATION_PARAMETER_IDS = [
  'negativePrompt',
  'duration',
  'resolution',
  'fps',
  'aspectRatio',
  'generateAudio',
  'motionStrength',
  'cameraMovement',
] as const;

export type VideoGenerationParameterId = (typeof VIDEO_GENERATION_PARAMETER_IDS)[number];

export interface GenerationStringEnumParameterControl {
  readonly kind: 'string-enum';
  readonly required: boolean;
  readonly values: readonly string[];
  readonly defaultValue?: string;
}

export interface GenerationIntegerParameterControl {
  readonly kind: 'integer';
  readonly required: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue?: number;
  readonly suggestedValues?: readonly number[];
}

export interface GenerationBooleanParameterControl {
  readonly kind: 'boolean';
  readonly required: boolean;
  readonly defaultValue?: boolean;
}

export interface GenerationImageSizeOption {
  readonly id: string;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
}

export interface GenerationImageSizeParameterControl {
  readonly kind: 'image-size-enum';
  readonly values: readonly GenerationImageSizeOption[];
  readonly defaultValue: string;
}

export interface VideoGenerationModelParameterProfile {
  readonly kind: 'video';
  readonly supportedParameters: readonly VideoGenerationParameterId[];
  readonly controls: {
    readonly aspectRatio?: GenerationStringEnumParameterControl;
    readonly resolution?: GenerationStringEnumParameterControl;
    readonly duration?: GenerationIntegerParameterControl;
    readonly fps?: GenerationIntegerParameterControl;
    readonly generateAudio?: GenerationBooleanParameterControl;
  };
  readonly fixed: {
    readonly outputCount: 1;
    readonly fps?: number;
  };
}

export interface ImageGenerationModelParameterProfile {
  readonly kind: 'image';
  readonly controls: {
    readonly size: GenerationImageSizeParameterControl;
    readonly quality: GenerationStringEnumParameterControl;
  };
  readonly fixed: {
    readonly outputCount: 1;
  };
}

export const IMAGE_GENERATION_PARAMETER_IDS = ['size', 'quality', 'count'] as const;

export type ImageGenerationParameterId = (typeof IMAGE_GENERATION_PARAMETER_IDS)[number];

export interface ImageGenerationParameterDiagnostic {
  readonly parameter: ImageGenerationParameterId;
  readonly reason: 'invalid' | 'missing-required';
  readonly message: string;
}

export interface ImageGenerationParameterAdjustment {
  readonly parameter: ImageGenerationParameterId;
  readonly reason: 'invalid';
}

export type GenerationModelParameterProfile =
  ImageGenerationModelParameterProfile | VideoGenerationModelParameterProfile;

export interface GenerationParameterAdjustment {
  readonly parameter: VideoGenerationParameterId | ImageGenerationParameterId;
  readonly reason: 'unsupported' | 'invalid' | 'missing-required';
}

export interface GenerationParameterDiagnostic extends GenerationParameterAdjustment {
  readonly message: string;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;

const GPT_IMAGE_2_API_MODEL_NAMES = new Set(['gpt-image-2', 'gpt-image-2-pro-all']);

const GPT_IMAGE_2_PROFILE: ImageGenerationModelParameterProfile = Object.freeze({
  kind: 'image',
  controls: Object.freeze({
    size: imageSizeEnum(
      [
        { id: 'auto' },
        { id: '1024x1024', width: 1024, height: 1024, aspectRatio: '1:1' },
        { id: '1536x1024', width: 1536, height: 1024, aspectRatio: '3:2' },
        { id: '1024x1536', width: 1024, height: 1536, aspectRatio: '2:3' },
        { id: '2048x2048', width: 2048, height: 2048, aspectRatio: '1:1' },
        { id: '2048x1152', width: 2048, height: 1152, aspectRatio: '16:9' },
        { id: '3840x2160', width: 3840, height: 2160, aspectRatio: '16:9' },
        { id: '2160x3840', width: 2160, height: 3840, aspectRatio: '9:16' },
      ],
      'auto',
    ),
    quality: stringEnum(true, ['auto', 'low', 'medium', 'high'], 'auto'),
  }),
  fixed: Object.freeze({ outputCount: 1 }),
});

const MINIMAX_H3_PROFILE: VideoGenerationModelParameterProfile = Object.freeze({
  kind: 'video',
  supportedParameters: Object.freeze([
    'duration',
    'resolution',
    'aspectRatio',
  ] as const satisfies readonly VideoGenerationParameterId[]),
  controls: Object.freeze({
    aspectRatio: stringEnum(true, ASPECT_RATIOS, '16:9'),
    resolution: stringEnum(true, ['768P', '2K'], '768P'),
    duration: integerControl(true, 4, 15, 1, 5),
  }),
  fixed: Object.freeze({ outputCount: 1 }),
});

const SEEDANCE_2_PROFILE: VideoGenerationModelParameterProfile = Object.freeze({
  kind: 'video',
  supportedParameters: Object.freeze([
    'duration',
    'resolution',
    'aspectRatio',
    'generateAudio',
  ] as const satisfies readonly VideoGenerationParameterId[]),
  controls: Object.freeze({
    aspectRatio: stringEnum(
      true,
      ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      'adaptive',
    ),
    resolution: stringEnum(true, ['480p', '720p', '1080p', '4k'], '720p'),
    duration: integerControl(true, 4, 15, 1, 5),
    generateAudio: booleanControl(false),
  }),
  fixed: Object.freeze({ outputCount: 1, fps: 24 }),
});

export function resolveGenerationModelParameterProfile(input: {
  readonly providerType: ProviderType;
  readonly modelName: string;
}): GenerationModelParameterProfile | undefined {
  return (
    resolveImageGenerationModelParameterProfile(input) ??
    resolveVideoGenerationModelParameterProfile(input)
  );
}

export function resolveImageGenerationModelParameterProfile(input: {
  readonly providerType: ProviderType;
  readonly modelName: string;
}): ImageGenerationModelParameterProfile | undefined {
  return input.providerType === 'newapi' && GPT_IMAGE_2_API_MODEL_NAMES.has(input.modelName)
    ? structuredClone(GPT_IMAGE_2_PROFILE)
    : undefined;
}

export function resolveVideoGenerationModelParameterProfile(input: {
  readonly providerType: ProviderType;
  readonly modelName: string;
}): VideoGenerationModelParameterProfile | undefined {
  if (input.providerType === 'minimax' && input.modelName === 'MiniMax-H3') {
    return structuredClone(MINIMAX_H3_PROFILE);
  }
  if (input.providerType === 'bytedance' && input.modelName === 'doubao-seedance-2-0-260128') {
    return structuredClone(SEEDANCE_2_PROFILE);
  }
  return undefined;
}

export function createImageGenerationRecipeForProfile(
  model: GenerationRecipeModelBinding,
  profile: ImageGenerationModelParameterProfile,
): ImageGenerationRecipe {
  const size = requireImageSizeDefault(profile.controls.size);
  return {
    kind: 'image',
    prompt: '',
    model,
    ...imageSizeRecipeValues(size),
    count: profile.fixed.outputCount,
    ...(profile.controls.quality.defaultValue === undefined
      ? {}
      : { quality: requireImageQuality(profile.controls.quality.defaultValue) }),
  };
}

export function conformImageGenerationRecipeToProfile(
  recipe: ImageGenerationRecipe,
  profile: ImageGenerationModelParameterProfile,
): {
  readonly recipe: ImageGenerationRecipe;
  readonly adjustments: readonly ImageGenerationParameterAdjustment[];
} {
  const adjustments: ImageGenerationParameterAdjustment[] = [];
  const selectedSize = profile.controls.size.values.find((option) =>
    imageSizeMatches(option, recipe),
  );
  const size = selectedSize ?? requireImageSizeDefault(profile.controls.size);
  if (!selectedSize) adjustments.push({ parameter: 'size', reason: 'invalid' });
  const quality =
    recipe.quality && profile.controls.quality.values.includes(recipe.quality)
      ? recipe.quality
      : requireImageQuality(profile.controls.quality.defaultValue);
  if (recipe.quality !== undefined && recipe.quality !== quality) {
    adjustments.push({ parameter: 'quality', reason: 'invalid' });
  }
  if (recipe.count !== undefined && recipe.count !== profile.fixed.outputCount) {
    adjustments.push({ parameter: 'count', reason: 'invalid' });
  }
  return {
    recipe: {
      kind: 'image',
      prompt: recipe.prompt,
      ...(recipe.model ? { model: recipe.model } : {}),
      ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
      ...imageSizeRecipeValues(size),
      count: profile.fixed.outputCount,
      quality,
      ...(recipe.style === undefined ? {} : { style: recipe.style }),
    },
    adjustments,
  };
}

export function conformImageGenerationRequestToProfile(
  request: ImageGenerationRequest,
  profile: ImageGenerationModelParameterProfile,
): {
  readonly request: ImageGenerationRequest;
  readonly adjustments: readonly ImageGenerationParameterAdjustment[];
} {
  const {
    width: _width,
    height: _height,
    aspectRatio: _aspectRatio,
    count: _count,
    quality: _quality,
    ...base
  } = request;
  const selectedSize = profile.controls.size.values.find((option) =>
    imageSizeMatches(option, request),
  );
  const size = selectedSize ?? requireImageSizeDefault(profile.controls.size);
  const quality =
    request.quality && profile.controls.quality.values.includes(request.quality)
      ? request.quality
      : requireImageQuality(profile.controls.quality.defaultValue);
  const adjustments: ImageGenerationParameterAdjustment[] = [];
  if (!selectedSize) adjustments.push({ parameter: 'size', reason: 'invalid' });
  if (request.quality !== undefined && request.quality !== quality) {
    adjustments.push({ parameter: 'quality', reason: 'invalid' });
  }
  if (request.count !== undefined && request.count !== profile.fixed.outputCount) {
    adjustments.push({ parameter: 'count', reason: 'invalid' });
  }
  return {
    request: {
      ...base,
      ...imageSizeRecipeValues(size),
      count: profile.fixed.outputCount,
      quality,
    },
    adjustments,
  };
}

export function createVideoGenerationRecipeForProfile(
  model: GenerationRecipeModelBinding,
  profile: VideoGenerationModelParameterProfile,
): VideoGenerationRecipe {
  return {
    kind: 'video',
    prompt: '',
    model,
    ...defaultVideoParameters(profile),
  };
}

export function conformVideoGenerationRecipeToProfile(
  recipe: VideoGenerationRecipe,
  profile: VideoGenerationModelParameterProfile,
): {
  readonly recipe: VideoGenerationRecipe;
  readonly adjustments: readonly GenerationParameterAdjustment[];
} {
  const parameters = conformVideoGenerationParameters(recipe, profile);
  const resolved = {
    kind: recipe.kind,
    prompt: recipe.prompt,
    ...(recipe.model ? { model: recipe.model } : {}),
    ...(recipe.cameraAngle === undefined ? {} : { cameraAngle: recipe.cameraAngle }),
    ...(recipe.shotScale === undefined ? {} : { shotScale: recipe.shotScale }),
    ...(recipe.editInstruction === undefined ? {} : { editInstruction: recipe.editInstruction }),
  } satisfies VideoGenerationRecipe;

  return {
    recipe: {
      ...resolved,
      ...parameters.values,
    },
    adjustments: parameters.adjustments,
  };
}

export function conformVideoGenerationRequestToProfile(
  request: VideoGenerationRequest,
  profile: VideoGenerationModelParameterProfile,
): {
  readonly request: VideoGenerationRequest;
  readonly adjustments: readonly GenerationParameterAdjustment[];
} {
  const parameters = conformVideoGenerationParameters(request, profile);
  return {
    request: {
      prompt: request.prompt,
      ...(request.providerId === undefined ? {} : { providerId: request.providerId }),
      ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.operation === undefined ? {} : { operation: request.operation }),
      ...(request.inputs === undefined ? {} : { inputs: request.inputs }),
      ...(request.cameraAngle === undefined ? {} : { cameraAngle: request.cameraAngle }),
      ...(request.shotScale === undefined ? {} : { shotScale: request.shotScale }),
      ...(request.editInstruction === undefined
        ? {}
        : { editInstruction: request.editInstruction }),
      ...parameters.values,
    },
    adjustments: parameters.adjustments,
  };
}

function conformVideoGenerationParameters(
  values: Pick<
    VideoGenerationRequest,
    | 'negativePrompt'
    | 'duration'
    | 'resolution'
    | 'fps'
    | 'aspectRatio'
    | 'generateAudio'
    | 'motionStrength'
    | 'cameraMovement'
  >,
  profile: VideoGenerationModelParameterProfile,
): {
  readonly values: Partial<VideoGenerationRequest>;
  readonly adjustments: readonly GenerationParameterAdjustment[];
} {
  const adjustments: GenerationParameterAdjustment[] = [];
  const supported = new Set(profile.supportedParameters);
  return {
    values: {
      ...conformStringParameter('negativePrompt', values.negativePrompt, supported, adjustments),
      ...conformIntegerParameter(
        'duration',
        values.duration,
        profile.controls.duration,
        supported,
        adjustments,
      ),
      ...conformStringParameterWithControl(
        'resolution',
        values.resolution,
        profile.controls.resolution,
        supported,
        adjustments,
      ),
      ...conformIntegerParameter('fps', values.fps, profile.controls.fps, supported, adjustments),
      ...conformStringParameterWithControl(
        'aspectRatio',
        values.aspectRatio,
        profile.controls.aspectRatio,
        supported,
        adjustments,
      ),
      ...conformBooleanParameter(
        'generateAudio',
        values.generateAudio,
        profile.controls.generateAudio,
        supported,
        adjustments,
      ),
      ...conformNumberParameter('motionStrength', values.motionStrength, supported, adjustments),
      ...conformStringParameter('cameraMovement', values.cameraMovement, supported, adjustments),
    },
    adjustments,
  };
}

export function validateVideoGenerationParameters(
  profile: VideoGenerationModelParameterProfile,
  values: Pick<
    VideoGenerationRequest,
    | 'negativePrompt'
    | 'duration'
    | 'resolution'
    | 'fps'
    | 'aspectRatio'
    | 'generateAudio'
    | 'motionStrength'
    | 'cameraMovement'
  >,
): readonly GenerationParameterDiagnostic[] {
  const supported = new Set(profile.supportedParameters);
  const diagnostics: GenerationParameterDiagnostic[] = [];
  validatePresence('negativePrompt', values.negativePrompt, supported, diagnostics);
  validateInteger('duration', values.duration, profile.controls.duration, supported, diagnostics);
  validateStringEnum(
    'resolution',
    values.resolution,
    profile.controls.resolution,
    supported,
    diagnostics,
  );
  validateInteger('fps', values.fps, profile.controls.fps, supported, diagnostics);
  validateStringEnum(
    'aspectRatio',
    values.aspectRatio,
    profile.controls.aspectRatio,
    supported,
    diagnostics,
  );
  validateBoolean(
    'generateAudio',
    values.generateAudio,
    profile.controls.generateAudio,
    supported,
    diagnostics,
  );
  validatePresence('motionStrength', values.motionStrength, supported, diagnostics);
  validatePresence('cameraMovement', values.cameraMovement, supported, diagnostics);
  return diagnostics;
}

export function validateImageGenerationParameters(
  profile: ImageGenerationModelParameterProfile,
  values: Pick<ImageGenerationRequest, 'width' | 'height' | 'aspectRatio' | 'count' | 'quality'>,
): readonly ImageGenerationParameterDiagnostic[] {
  const diagnostics: ImageGenerationParameterDiagnostic[] = [];
  const { count, quality } = values;

  if (!profile.controls.size.values.some((option) => imageSizeMatches(option, values))) {
    diagnostics.push(invalidImageDiagnostic('size'));
  }

  if (count !== undefined && count !== profile.fixed.outputCount) {
    diagnostics.push(invalidImageDiagnostic('count'));
  }
  if (quality !== undefined && !profile.controls.quality.values.includes(quality)) {
    diagnostics.push(invalidImageDiagnostic('quality'));
  }
  return diagnostics;
}

export function parseGenerationModelParameterProfile(
  value: unknown,
): GenerationModelParameterProfile {
  const record = requireRecord(value, 'Generation model parameter profile must be an object.');
  if (record['kind'] === 'image') return parseImageGenerationModelParameterProfile(record);
  return parseVideoGenerationModelParameterProfile(record);
}

function parseImageGenerationModelParameterProfile(
  record: Record<string, unknown>,
): ImageGenerationModelParameterProfile {
  requireExactKeys(record, ['kind', 'controls', 'fixed']);
  const controlsRecord = requireRecord(
    record['controls'],
    'Generation image parameter controls must be an object.',
  );
  requireExactKeys(controlsRecord, ['size', 'quality']);
  const fixedRecord = requireRecord(
    record['fixed'],
    'Generation image fixed parameters must be an object.',
  );
  requireExactKeys(fixedRecord, ['outputCount']);
  if (fixedRecord['outputCount'] !== 1) {
    throw new Error('Generation image output count must be exactly one.');
  }
  const profile: ImageGenerationModelParameterProfile = {
    kind: 'image',
    controls: {
      size: parseImageSizeControl(controlsRecord['size']),
      quality: parseStringEnumControl(controlsRecord['quality']),
    },
    fixed: { outputCount: 1 },
  };
  if (profile.controls.quality.defaultValue === undefined) {
    throw new Error('Generation image quality control requires a default.');
  }
  if (
    profile.controls.quality.values.some(
      (value) =>
        value !== 'auto' &&
        value !== 'low' &&
        value !== 'medium' &&
        value !== 'high' &&
        value !== 'standard' &&
        value !== 'hd',
    )
  ) {
    throw new Error('Generation image quality control contains an unsupported value.');
  }
  return profile;
}

function parseVideoGenerationModelParameterProfile(
  record: Record<string, unknown>,
): VideoGenerationModelParameterProfile {
  requireExactKeys(record, ['kind', 'supportedParameters', 'controls', 'fixed']);
  if (record['kind'] !== 'video') {
    throw new Error('Generation model parameter profile kind is invalid.');
  }
  const supportedParameters = requireUniqueParameterIds(record['supportedParameters']);
  const controlsRecord = requireRecord(
    record['controls'],
    'Generation video parameter controls must be an object.',
  );
  requireAllowedKeys(controlsRecord, [
    'aspectRatio',
    'resolution',
    'duration',
    'fps',
    'generateAudio',
  ]);
  const fixedRecord = requireRecord(
    record['fixed'],
    'Generation video fixed parameters must be an object.',
  );
  requireAllowedKeys(fixedRecord, ['outputCount', 'fps']);
  if (fixedRecord['outputCount'] !== 1) {
    throw new Error('Generation video output count must be exactly one.');
  }
  const fixedFps = fixedRecord['fps'];
  if (fixedFps !== undefined && (!Number.isFinite(fixedFps) || Number(fixedFps) <= 0)) {
    throw new Error('Generation video fixed FPS must be positive.');
  }
  const profile: VideoGenerationModelParameterProfile = {
    kind: 'video',
    supportedParameters,
    controls: {
      ...(controlsRecord['aspectRatio'] === undefined
        ? {}
        : { aspectRatio: parseStringEnumControl(controlsRecord['aspectRatio']) }),
      ...(controlsRecord['resolution'] === undefined
        ? {}
        : { resolution: parseStringEnumControl(controlsRecord['resolution']) }),
      ...(controlsRecord['duration'] === undefined
        ? {}
        : { duration: parseIntegerControl(controlsRecord['duration']) }),
      ...(controlsRecord['fps'] === undefined
        ? {}
        : { fps: parseIntegerControl(controlsRecord['fps']) }),
      ...(controlsRecord['generateAudio'] === undefined
        ? {}
        : { generateAudio: parseBooleanControl(controlsRecord['generateAudio']) }),
    },
    fixed: {
      outputCount: 1,
      ...(fixedFps === undefined ? {} : { fps: Number(fixedFps) }),
    },
  };
  assertVideoProfileConsistency(profile);
  return profile;
}

function defaultVideoParameters(
  profile: VideoGenerationModelParameterProfile,
): Partial<VideoGenerationRecipe> {
  return {
    ...(profile.controls.aspectRatio?.defaultValue === undefined
      ? {}
      : { aspectRatio: profile.controls.aspectRatio.defaultValue }),
    ...(profile.controls.resolution?.defaultValue === undefined
      ? {}
      : { resolution: profile.controls.resolution.defaultValue }),
    ...(profile.controls.duration?.defaultValue === undefined
      ? {}
      : { duration: profile.controls.duration.defaultValue }),
    ...(profile.controls.fps?.defaultValue === undefined
      ? {}
      : { fps: profile.controls.fps.defaultValue }),
    ...(profile.controls.generateAudio?.defaultValue === undefined
      ? {}
      : { generateAudio: profile.controls.generateAudio.defaultValue }),
  };
}

function conformStringParameter<Key extends 'negativePrompt' | 'cameraMovement'>(
  parameter: Key,
  value: string | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  adjustments: GenerationParameterAdjustment[],
): Partial<Record<Key, string>> {
  if (value === undefined) return {};
  if (supported.has(parameter)) return { [parameter]: value } as Record<Key, string>;
  adjustments.push({ parameter, reason: 'unsupported' });
  return {};
}

function conformNumberParameter(
  parameter: 'motionStrength',
  value: number | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  adjustments: GenerationParameterAdjustment[],
): Partial<Record<'motionStrength', number>> {
  if (value === undefined) return {};
  if (supported.has(parameter)) return { motionStrength: value };
  adjustments.push({ parameter, reason: 'unsupported' });
  return {};
}

function conformStringParameterWithControl<Key extends 'resolution' | 'aspectRatio'>(
  parameter: Key,
  value: string | undefined,
  control: GenerationStringEnumParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  adjustments: GenerationParameterAdjustment[],
): Partial<Record<Key, string>> {
  if (!supported.has(parameter)) {
    if (value !== undefined) adjustments.push({ parameter, reason: 'unsupported' });
    return {};
  }
  if (value !== undefined && control?.values.includes(value)) {
    return { [parameter]: value } as Record<Key, string>;
  }
  if (value !== undefined) adjustments.push({ parameter, reason: 'invalid' });
  if (value === undefined && control?.required) {
    adjustments.push({ parameter, reason: 'missing-required' });
  }
  return control?.defaultValue === undefined
    ? {}
    : ({ [parameter]: control.defaultValue } as Record<Key, string>);
}

function conformIntegerParameter<Key extends 'duration' | 'fps'>(
  parameter: Key,
  value: number | undefined,
  control: GenerationIntegerParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  adjustments: GenerationParameterAdjustment[],
): Partial<Record<Key, number>> {
  if (!supported.has(parameter)) {
    if (value !== undefined) adjustments.push({ parameter, reason: 'unsupported' });
    return {};
  }
  if (value !== undefined && control && validIntegerControlValue(control, value)) {
    return { [parameter]: value } as Record<Key, number>;
  }
  if (value !== undefined) adjustments.push({ parameter, reason: 'invalid' });
  if (value === undefined && control?.required) {
    adjustments.push({ parameter, reason: 'missing-required' });
  }
  return control?.defaultValue === undefined
    ? {}
    : ({ [parameter]: control.defaultValue } as Record<Key, number>);
}

function conformBooleanParameter(
  parameter: 'generateAudio',
  value: boolean | undefined,
  control: GenerationBooleanParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  adjustments: GenerationParameterAdjustment[],
): Partial<Record<'generateAudio', boolean>> {
  if (!supported.has(parameter)) {
    if (value !== undefined) adjustments.push({ parameter, reason: 'unsupported' });
    return {};
  }
  if (value !== undefined) return { generateAudio: value };
  if (control?.required) adjustments.push({ parameter, reason: 'missing-required' });
  return control?.defaultValue === undefined ? {} : { generateAudio: control.defaultValue };
}

function validatePresence(
  parameter: VideoGenerationParameterId,
  value: unknown,
  supported: ReadonlySet<VideoGenerationParameterId>,
  diagnostics: GenerationParameterDiagnostic[],
): void {
  if (value !== undefined && !supported.has(parameter)) {
    diagnostics.push(unsupportedDiagnostic(parameter));
  }
}

function validateStringEnum(
  parameter: 'resolution' | 'aspectRatio',
  value: string | undefined,
  control: GenerationStringEnumParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  diagnostics: GenerationParameterDiagnostic[],
): void {
  if (!supported.has(parameter)) {
    if (value !== undefined) diagnostics.push(unsupportedDiagnostic(parameter));
    return;
  }
  if (value === undefined) {
    if (control?.required) diagnostics.push(missingDiagnostic(parameter));
    return;
  }
  if (!control?.values.includes(value)) diagnostics.push(invalidDiagnostic(parameter));
}

function validateInteger(
  parameter: 'duration' | 'fps',
  value: number | undefined,
  control: GenerationIntegerParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  diagnostics: GenerationParameterDiagnostic[],
): void {
  if (!supported.has(parameter)) {
    if (value !== undefined) diagnostics.push(unsupportedDiagnostic(parameter));
    return;
  }
  if (value === undefined) {
    if (control?.required) diagnostics.push(missingDiagnostic(parameter));
    return;
  }
  if (!control || !validIntegerControlValue(control, value)) {
    diagnostics.push(invalidDiagnostic(parameter));
  }
}

function validateBoolean(
  parameter: 'generateAudio',
  value: boolean | undefined,
  control: GenerationBooleanParameterControl | undefined,
  supported: ReadonlySet<VideoGenerationParameterId>,
  diagnostics: GenerationParameterDiagnostic[],
): void {
  if (!supported.has(parameter)) {
    if (value !== undefined) diagnostics.push(unsupportedDiagnostic(parameter));
    return;
  }
  if (value === undefined && control?.required) diagnostics.push(missingDiagnostic(parameter));
}

function validIntegerControlValue(
  control: GenerationIntegerParameterControl,
  value: number,
): boolean {
  return (
    Number.isInteger(value) &&
    value >= control.min &&
    value <= control.max &&
    (value - control.min) % control.step === 0
  );
}

function imageSizeEnum(
  values: readonly GenerationImageSizeOption[],
  defaultValue: string,
): GenerationImageSizeParameterControl {
  return Object.freeze({
    kind: 'image-size-enum',
    values: Object.freeze(values.map((value) => Object.freeze({ ...value }))),
    defaultValue,
  });
}

function imageSizeMatches(
  option: GenerationImageSizeOption,
  values: Pick<ImageGenerationRequest, 'width' | 'height' | 'aspectRatio'>,
): boolean {
  return (
    option.width === values.width &&
    option.height === values.height &&
    option.aspectRatio === values.aspectRatio
  );
}

function imageSizeRecipeValues(
  option: GenerationImageSizeOption,
): Pick<ImageGenerationRecipe, 'width' | 'height' | 'aspectRatio'> {
  return {
    ...(option.width === undefined ? {} : { width: option.width }),
    ...(option.height === undefined ? {} : { height: option.height }),
    ...(option.aspectRatio === undefined ? {} : { aspectRatio: option.aspectRatio }),
  };
}

function requireImageSizeDefault(
  control: GenerationImageSizeParameterControl,
): GenerationImageSizeOption {
  const option = control.values.find((value) => value.id === control.defaultValue);
  if (!option) throw new Error('Generation image size default is unavailable.');
  return option;
}

function requireImageQuality(value: string | undefined): ImageGenerationQuality {
  if (
    value === 'auto' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'standard' ||
    value === 'hd'
  ) {
    return value;
  }
  throw new Error('Generation image quality default is invalid.');
}

function invalidImageDiagnostic(
  parameter: ImageGenerationParameterId,
): ImageGenerationParameterDiagnostic {
  return {
    parameter,
    reason: 'invalid',
    message: `Selected generation model rejects parameter ${parameter}.`,
  };
}

function unsupportedDiagnostic(
  parameter: VideoGenerationParameterId,
): GenerationParameterDiagnostic {
  return {
    parameter,
    reason: 'unsupported',
    message: `Selected generation model does not support parameter ${parameter}.`,
  };
}

function invalidDiagnostic(parameter: VideoGenerationParameterId): GenerationParameterDiagnostic {
  return {
    parameter,
    reason: 'invalid',
    message: `Selected generation model rejects parameter ${parameter}.`,
  };
}

function missingDiagnostic(parameter: VideoGenerationParameterId): GenerationParameterDiagnostic {
  return {
    parameter,
    reason: 'missing-required',
    message: `Selected generation model requires parameter ${parameter}.`,
  };
}

function stringEnum(
  required: boolean,
  values: readonly string[],
  defaultValue?: string,
): GenerationStringEnumParameterControl {
  return Object.freeze({
    kind: 'string-enum',
    required,
    values: Object.freeze([...values]),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  });
}

function integerControl(
  required: boolean,
  min: number,
  max: number,
  step: number,
  defaultValue?: number,
  suggestedValues?: readonly number[],
): GenerationIntegerParameterControl {
  return Object.freeze({
    kind: 'integer',
    required,
    min,
    max,
    step,
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(suggestedValues === undefined
      ? {}
      : { suggestedValues: Object.freeze([...suggestedValues]) }),
  });
}

function booleanControl(
  required: boolean,
  defaultValue?: boolean,
): GenerationBooleanParameterControl {
  return Object.freeze({
    kind: 'boolean',
    required,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  });
}

function parseImageSizeControl(value: unknown): GenerationImageSizeParameterControl {
  const record = requireRecord(value, 'Generation image size control must be an object.');
  requireExactKeys(record, ['kind', 'values', 'defaultValue']);
  if (record['kind'] !== 'image-size-enum' || !Array.isArray(record['values'])) {
    throw new Error('Generation image size control is invalid.');
  }
  const values = record['values'].map((candidate) => {
    const option = requireRecord(candidate, 'Generation image size option must be an object.');
    requireAllowedKeys(option, ['id', 'width', 'height', 'aspectRatio']);
    const id = option['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Generation image size option identity is required.');
    }
    const width = option['width'];
    const height = option['height'];
    const aspectRatio = option['aspectRatio'];
    const automatic = width === undefined && height === undefined && aspectRatio === undefined;
    if (
      !automatic &&
      (!Number.isInteger(width) ||
        Number(width) <= 0 ||
        !Number.isInteger(height) ||
        Number(height) <= 0 ||
        typeof aspectRatio !== 'string' ||
        aspectRatio.length === 0)
    ) {
      throw new Error('Generation image size option must be automatic or fully specified.');
    }
    return {
      id,
      ...(width === undefined ? {} : { width: Number(width) }),
      ...(height === undefined ? {} : { height: Number(height) }),
      ...(aspectRatio === undefined ? {} : { aspectRatio }),
    } satisfies GenerationImageSizeOption;
  });
  if (values.length === 0 || new Set(values.map((option) => option.id)).size !== values.length) {
    throw new Error('Generation image size option identities must be unique.');
  }
  if (
    new Set(
      values.map(
        (option) => `${option.width ?? ''}x${option.height ?? ''}:${option.aspectRatio ?? ''}`,
      ),
    ).size !== values.length
  ) {
    throw new Error('Generation image size options must be unique.');
  }
  const defaultValue = record['defaultValue'];
  if (typeof defaultValue !== 'string' || !values.some((option) => option.id === defaultValue)) {
    throw new Error('Generation image size default must identify one option.');
  }
  return { kind: 'image-size-enum', values, defaultValue };
}

function parseStringEnumControl(value: unknown): GenerationStringEnumParameterControl {
  const record = requireRecord(value, 'Generation string enum control must be an object.');
  requireAllowedKeys(record, ['kind', 'required', 'values', 'defaultValue']);
  if (record['kind'] !== 'string-enum' || typeof record['required'] !== 'boolean') {
    throw new Error('Generation string enum control is invalid.');
  }
  const values = requireUniqueStrings(record['values'], 'Generation string enum values');
  const defaultValue = record['defaultValue'];
  if (
    defaultValue !== undefined &&
    (typeof defaultValue !== 'string' || !values.includes(defaultValue))
  ) {
    throw new Error('Generation string enum default must be one of its values.');
  }
  return {
    kind: 'string-enum',
    required: record['required'],
    values,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function parseIntegerControl(value: unknown): GenerationIntegerParameterControl {
  const record = requireRecord(value, 'Generation integer control must be an object.');
  requireAllowedKeys(record, [
    'kind',
    'required',
    'min',
    'max',
    'step',
    'defaultValue',
    'suggestedValues',
  ]);
  if (record['kind'] !== 'integer' || typeof record['required'] !== 'boolean') {
    throw new Error('Generation integer control is invalid.');
  }
  const min = requireFiniteNumber(record['min'], 'Generation integer minimum');
  const max = requireFiniteNumber(record['max'], 'Generation integer maximum');
  const step = requireFiniteNumber(record['step'], 'Generation integer step');
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    !Number.isInteger(step) ||
    min > max ||
    step < 1
  ) {
    throw new Error('Generation integer control range is invalid.');
  }
  const defaultValue = record['defaultValue'];
  const suggestedValues =
    record['suggestedValues'] === undefined
      ? undefined
      : requireUniqueFiniteNumbers(record['suggestedValues'], 'Generation suggested values');
  const control: GenerationIntegerParameterControl = {
    kind: 'integer',
    required: record['required'],
    min,
    max,
    step,
    ...(defaultValue === undefined
      ? {}
      : { defaultValue: requireFiniteNumber(defaultValue, 'Generation integer default') }),
    ...(suggestedValues === undefined ? {} : { suggestedValues }),
  };
  if (
    control.defaultValue !== undefined &&
    !validIntegerControlValue(control, control.defaultValue)
  ) {
    throw new Error('Generation integer default is outside its range.');
  }
  if (control.suggestedValues?.some((entry) => !validIntegerControlValue(control, entry))) {
    throw new Error('Generation suggested value is outside its range.');
  }
  return control;
}

function parseBooleanControl(value: unknown): GenerationBooleanParameterControl {
  const record = requireRecord(value, 'Generation boolean control must be an object.');
  requireAllowedKeys(record, ['kind', 'required', 'defaultValue']);
  if (record['kind'] !== 'boolean' || typeof record['required'] !== 'boolean') {
    throw new Error('Generation boolean control is invalid.');
  }
  const defaultValue = record['defaultValue'];
  if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
    throw new Error('Generation boolean default must be a boolean.');
  }
  return {
    kind: 'boolean',
    required: record['required'],
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function assertVideoProfileConsistency(profile: VideoGenerationModelParameterProfile): void {
  const supported = new Set(profile.supportedParameters);
  const controlledParameters = [
    'aspectRatio',
    'resolution',
    'duration',
    'fps',
    'generateAudio',
  ] as const;
  for (const parameter of controlledParameters) {
    const control = profile.controls[parameter];
    if (control && !supported.has(parameter)) {
      throw new Error(`Generation control ${parameter} must be declared as supported.`);
    }
    if (supported.has(parameter) && !control) {
      throw new Error(`Generation supported parameter ${parameter} requires a control.`);
    }
    if (control?.required && control.defaultValue === undefined) {
      throw new Error(`Generation required control ${parameter} requires a default.`);
    }
  }
  if (profile.fixed.fps !== undefined && supported.has('fps')) {
    throw new Error('Generation fixed FPS cannot also be editable.');
  }
}

function requireUniqueParameterIds(value: unknown): readonly VideoGenerationParameterId[] {
  if (!Array.isArray(value)) throw new Error('Generation supported parameters must be an array.');
  const parameters = value.map((entry) => {
    const parameter = VIDEO_GENERATION_PARAMETER_IDS.find((candidate) => candidate === entry);
    if (!parameter) throw new Error('Generation supported parameter identity is invalid.');
    return parameter;
  });
  if (new Set(parameters).size !== parameters.length) {
    throw new Error('Generation supported parameter identities must be unique.');
  }
  return parameters;
}

function requireUniqueStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be non-empty.`);
  const values = value.map((entry) => {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry !== entry.trim()) {
      throw new Error(`${label} must contain non-empty strings.`);
    }
    return entry;
  });
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  return values;
}

function requireUniqueFiniteNumbers(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be non-empty.`);
  const values = value.map((entry) => requireFiniteNumber(entry, label));
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  return values;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Generation model parameter profile contains unexpected fields.');
  }
}

function requireAllowedKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Generation model parameter profile contains unexpected fields.');
  }
}
