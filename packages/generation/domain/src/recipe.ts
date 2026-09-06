import type { ContentLocator } from '@neko/content-domain';
import type { ImageGenerationQuality } from './contracts';
import type { GenerationJobRequest } from './job/contracts';

export const GENERATION_RECIPE_KINDS = ['prompt', 'image', 'audio', 'video'] as const;
export type GenerationRecipeKind = (typeof GENERATION_RECIPE_KINDS)[number];

export const GENERATION_RECIPE_PURPOSES = [
  'canvas.prompt',
  'image.generate',
  'audio.generate',
  'video.generate',
] as const;
export type GenerationRecipePurpose = (typeof GENERATION_RECIPE_PURPOSES)[number];

export interface GenerationRecipeModelBinding {
  readonly purpose: GenerationRecipePurpose;
  readonly providerId: string;
  readonly modelId: string;
}

interface GenerationRecipeBase<TKind extends GenerationRecipeKind> {
  readonly kind: TKind;
  readonly prompt: string;
  readonly model?: GenerationRecipeModelBinding;
}

export interface PromptGenerationRecipe extends GenerationRecipeBase<'prompt'> {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface ImageGenerationRecipe extends GenerationRecipeBase<'image'> {
  readonly negativePrompt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
  readonly count?: number;
  readonly quality?: ImageGenerationQuality;
  readonly style?: string;
}

export interface AudioGenerationRecipe extends GenerationRecipeBase<'audio'> {
  readonly negativePrompt?: string;
  readonly duration?: number;
  readonly format?: 'mp3' | 'wav' | 'flac';
}

export interface VideoGenerationRecipe extends GenerationRecipeBase<'video'> {
  readonly negativePrompt?: string;
  readonly duration?: number;
  readonly resolution?: string;
  readonly fps?: number;
  readonly aspectRatio?: string;
  readonly generateAudio?: boolean;
  readonly motionStrength?: number;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
  readonly shotScale?: string;
  readonly editInstruction?: string;
}

export type GenerationRecipe =
  PromptGenerationRecipe | ImageGenerationRecipe | AudioGenerationRecipe | VideoGenerationRecipe;

export type GenerationRecipeResolvedInput =
  | {
      readonly kind: 'text';
      readonly sourceNodeId: string;
      readonly text: string;
      readonly digest: string;
    }
  | {
      readonly kind: 'image' | 'audio' | 'video';
      readonly sourceNodeId?: string;
      readonly locator: ContentLocator;
    };

export function isGenerationRecipeKind(value: unknown): value is GenerationRecipeKind {
  return (
    typeof value === 'string' && (GENERATION_RECIPE_KINDS as readonly string[]).includes(value)
  );
}

export function purposeForGenerationRecipeKind(
  kind: GenerationRecipeKind,
): GenerationRecipePurpose {
  switch (kind) {
    case 'prompt':
      return 'canvas.prompt';
    case 'image':
      return 'image.generate';
    case 'audio':
      return 'audio.generate';
    case 'video':
      return 'video.generate';
  }
}

export function purposeForGenerationRecipe(
  recipe: Pick<GenerationRecipe, 'kind'>,
): GenerationRecipePurpose {
  return purposeForGenerationRecipeKind(recipe.kind);
}

export function createGenerationRecipe(
  kind: GenerationRecipeKind,
  model?: GenerationRecipeModelBinding,
): GenerationRecipe {
  if (model && model.purpose !== purposeForGenerationRecipeKind(kind)) {
    throw new Error('Generation Recipe default model purpose does not match its kind.');
  }
  switch (kind) {
    case 'prompt':
      return {
        kind,
        prompt: '',
        temperature: 0.7,
        maxOutputTokens: 2048,
        ...(model ? { model } : {}),
      };
    case 'image':
      return {
        kind,
        prompt: '',
        aspectRatio: '1:1',
        width: 1024,
        height: 1024,
        count: 1,
        quality: 'auto',
        ...(model ? { model } : {}),
      };
    case 'audio':
      return {
        kind,
        prompt: '',
        duration: 10,
        format: 'mp3',
        ...(model ? { model } : {}),
      };
    case 'video':
      return {
        kind,
        prompt: '',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
        fps: 24,
        ...(model ? { model } : {}),
      };
  }
}

export function isGenerationRecipe(value: unknown): value is GenerationRecipe {
  if (!isRecord(value) || !isGenerationRecipeKind(value['kind'])) return false;
  if (typeof value['prompt'] !== 'string' || !hasOnlyKeys(value, recipeKeys(value['kind']))) {
    return false;
  }
  const model = value['model'];
  if (model !== undefined && !isGenerationRecipeModelBinding(model, { kind: value['kind'] })) {
    return false;
  }
  switch (value['kind']) {
    case 'prompt':
      return (
        isOptionalRange(value['temperature'], 0, 2) &&
        isOptionalPositiveInteger(value['maxOutputTokens'])
      );
    case 'image':
      return (
        isOptionalString(value['negativePrompt']) &&
        isOptionalPositiveInteger(value['width']) &&
        isOptionalPositiveInteger(value['height']) &&
        isOptionalNonEmptyString(value['aspectRatio']) &&
        isOptionalPositiveInteger(value['count']) &&
        (value['quality'] === undefined ||
          value['quality'] === 'auto' ||
          value['quality'] === 'low' ||
          value['quality'] === 'medium' ||
          value['quality'] === 'high' ||
          value['quality'] === 'standard' ||
          value['quality'] === 'hd') &&
        isOptionalNonEmptyString(value['style'])
      );
    case 'audio':
      return (
        isOptionalString(value['negativePrompt']) &&
        isOptionalPositiveNumber(value['duration']) &&
        (value['format'] === undefined ||
          value['format'] === 'mp3' ||
          value['format'] === 'wav' ||
          value['format'] === 'flac')
      );
    case 'video':
      return (
        isOptionalString(value['negativePrompt']) &&
        isOptionalPositiveNumber(value['duration']) &&
        isOptionalNonEmptyString(value['resolution']) &&
        isOptionalPositiveNumber(value['fps']) &&
        isOptionalNonEmptyString(value['aspectRatio']) &&
        (value['generateAudio'] === undefined || typeof value['generateAudio'] === 'boolean') &&
        isOptionalRange(value['motionStrength'], 0, 1) &&
        isOptionalNonEmptyString(value['cameraMovement']) &&
        isOptionalNonEmptyString(value['cameraAngle']) &&
        isOptionalNonEmptyString(value['shotScale']) &&
        isOptionalNonEmptyString(value['editInstruction'])
      );
  }
}

export function projectGenerationRecipeRequest(
  recipe: GenerationRecipe,
  inputs: readonly GenerationRecipeResolvedInput[],
): GenerationJobRequest {
  if (!isGenerationRecipe(recipe) || !recipe.prompt.trim() || !recipe.model) {
    throw new Error('Generation Recipe is not executable.');
  }
  const textInputs = inputs.filter(
    (entry): entry is Extract<GenerationRecipeResolvedInput, { kind: 'text' }> =>
      entry.kind === 'text',
  );
  const prompt = [recipe.prompt, ...textInputs.map((entry) => entry.text)]
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
  const binding = { providerId: recipe.model.providerId, modelId: recipe.model.modelId };
  switch (recipe.kind) {
    case 'prompt':
      return {
        generationType: 'prompt',
        ...binding,
        request: {
          prompt: recipe.prompt,
          ...(textInputs.length > 0 ? { context: textInputs } : {}),
          ...(recipe.temperature === undefined ? {} : { temperature: recipe.temperature }),
          ...(recipe.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: recipe.maxOutputTokens }),
        },
      };
    case 'image': {
      const image = uniqueLocator(inputs, 'image');
      return {
        generationType: image ? 'image-to-image' : 'text-to-image',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.width === undefined ? {} : { width: recipe.width }),
          ...(recipe.height === undefined ? {} : { height: recipe.height }),
          ...(recipe.aspectRatio === undefined ? {} : { aspectRatio: recipe.aspectRatio }),
          ...(recipe.count === undefined ? {} : { count: recipe.count }),
          ...(recipe.quality === undefined ? {} : { quality: recipe.quality }),
          ...(recipe.style === undefined ? {} : { style: recipe.style }),
          ...(image ? { referenceImageLocator: image } : {}),
        },
      };
    }
    case 'video': {
      const image = uniqueLocator(inputs, 'image');
      const video = uniqueLocator(inputs, 'video');
      return {
        generationType: video ? 'video-to-video' : image ? 'image-to-video' : 'text-to-video',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.duration === undefined ? {} : { duration: recipe.duration }),
          ...(recipe.resolution === undefined ? {} : { resolution: recipe.resolution }),
          ...(recipe.fps === undefined ? {} : { fps: recipe.fps }),
          ...(recipe.aspectRatio === undefined ? {} : { aspectRatio: recipe.aspectRatio }),
          ...(recipe.generateAudio === undefined ? {} : { generateAudio: recipe.generateAudio }),
          ...(recipe.motionStrength === undefined ? {} : { motionStrength: recipe.motionStrength }),
          ...(recipe.cameraMovement === undefined ? {} : { cameraMovement: recipe.cameraMovement }),
          ...(recipe.cameraAngle === undefined ? {} : { cameraAngle: recipe.cameraAngle }),
          ...(recipe.shotScale === undefined ? {} : { shotScale: recipe.shotScale }),
          ...(recipe.editInstruction === undefined
            ? {}
            : { editInstruction: recipe.editInstruction }),
          ...(video
            ? {
                inputs: [
                  { type: 'video' as const, role: 'reference-video' as const, locator: video },
                ],
              }
            : image
              ? {
                  inputs: [
                    { type: 'image' as const, role: 'first-frame' as const, locator: image },
                  ],
                }
              : {}),
        },
      };
    }
    case 'audio':
      if (inputs.some((entry) => entry.kind === 'audio')) {
        throw new Error('The selected Audio Recipe does not support an audio reference input.');
      }
      return {
        generationType: 'text-to-audio',
        ...binding,
        request: {
          prompt,
          ...binding,
          ...(recipe.negativePrompt === undefined ? {} : { negativePrompt: recipe.negativePrompt }),
          ...(recipe.duration === undefined ? {} : { duration: recipe.duration }),
          ...(recipe.format === undefined ? {} : { format: recipe.format }),
        },
      };
  }
}

function uniqueLocator(
  inputs: readonly GenerationRecipeResolvedInput[],
  kind: 'image' | 'video',
): ContentLocator | undefined {
  const matches = inputs.flatMap((entry) => (entry.kind === kind ? [entry.locator] : []));
  if (matches.length > 1) {
    throw new Error(`Generation Recipe accepts at most one ${kind} reference input.`);
  }
  return matches[0];
}

function isGenerationRecipeModelBinding(
  value: unknown,
  recipe: Pick<GenerationRecipe, 'kind'>,
): value is GenerationRecipeModelBinding {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, MODEL_BINDING_KEYS) &&
    value['purpose'] === purposeForGenerationRecipe(recipe) &&
    isNonEmptyString(value['providerId']) &&
    isNonEmptyString(value['modelId'])
  );
}

function recipeKeys(kind: GenerationRecipeKind): ReadonlySet<string> {
  switch (kind) {
    case 'prompt':
      return PROMPT_RECIPE_KEYS;
    case 'image':
      return IMAGE_RECIPE_KEYS;
    case 'audio':
      return AUDIO_RECIPE_KEYS;
    case 'video':
      return VIDEO_RECIPE_KEYS;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalPositiveNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) > 0);
}

function isOptionalRange(value: unknown, minimum: number, maximum: number): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum)
  );
}

const MODEL_BINDING_KEYS = new Set(['purpose', 'providerId', 'modelId']);
const BASE_RECIPE_KEYS = ['kind', 'prompt', 'model'] as const;
const PROMPT_RECIPE_KEYS = new Set([...BASE_RECIPE_KEYS, 'temperature', 'maxOutputTokens']);
const IMAGE_RECIPE_KEYS = new Set([
  ...BASE_RECIPE_KEYS,
  'negativePrompt',
  'width',
  'height',
  'aspectRatio',
  'count',
  'quality',
  'style',
]);
const AUDIO_RECIPE_KEYS = new Set([...BASE_RECIPE_KEYS, 'negativePrompt', 'duration', 'format']);
const VIDEO_RECIPE_KEYS = new Set([
  ...BASE_RECIPE_KEYS,
  'negativePrompt',
  'duration',
  'resolution',
  'fps',
  'aspectRatio',
  'generateAudio',
  'motionStrength',
  'cameraMovement',
  'cameraAngle',
  'shotScale',
  'editInstruction',
]);
