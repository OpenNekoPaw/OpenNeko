import { validateContentLocator, type GeneratedOutputContentLocator } from '@neko/content';
import { isJobRef, type JobRef } from '@neko/shared/job-lifecycle';

export const CANVAS_GENERATION_KINDS = ['prompt', 'image', 'audio', 'video'] as const;

export type CanvasGenerationKind = (typeof CANVAS_GENERATION_KINDS)[number];

export const CANVAS_GENERATION_PURPOSES = [
  'canvas.prompt',
  'image.generate',
  'audio.generate',
  'audio.music.generate',
  'video.generate',
] as const;
export type CanvasGenerationPurpose = (typeof CANVAS_GENERATION_PURPOSES)[number];

export interface CanvasGenerationModelBinding {
  readonly purpose: CanvasGenerationPurpose;
  readonly providerId: string;
  readonly modelId: string;
}

interface CanvasGenerationRecipeBase<TKind extends CanvasGenerationKind> {
  readonly kind: TKind;
  readonly prompt: string;
  readonly model?: CanvasGenerationModelBinding;
}

export interface CanvasPromptGenerationRecipe extends CanvasGenerationRecipeBase<'prompt'> {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface CanvasImageGenerationRecipe extends CanvasGenerationRecipeBase<'image'> {
  readonly negativePrompt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
  readonly count?: number;
  readonly quality?: 'standard' | 'hd';
  readonly style?: string;
}

export interface CanvasAudioGenerationRecipe extends CanvasGenerationRecipeBase<'audio'> {
  readonly negativePrompt?: string;
  readonly duration?: number;
  readonly isMusic?: boolean;
  readonly genre?: string;
  readonly format?: 'mp3' | 'wav' | 'flac';
}

export interface CanvasVideoGenerationRecipe extends CanvasGenerationRecipeBase<'video'> {
  readonly negativePrompt?: string;
  readonly duration?: number;
  readonly resolution?: string;
  readonly fps?: number;
  readonly aspectRatio?: string;
  readonly motionStrength?: number;
  readonly cameraMovement?: string;
}

export type CanvasGenerationRecipe =
  | CanvasPromptGenerationRecipe
  | CanvasImageGenerationRecipe
  | CanvasAudioGenerationRecipe
  | CanvasVideoGenerationRecipe;

export interface CanvasGenerationRunBinding {
  readonly submissionId: string;
  readonly recipeInputFingerprint: string;
  readonly jobRef?: JobRef<'generation'>;
}

export interface CanvasGenerationOutputBinding {
  readonly outputId: string;
  readonly jobRef: JobRef<'generation'>;
  readonly locator: GeneratedOutputContentLocator;
  readonly kind: CanvasGenerationKind;
  readonly recipeInputFingerprint: string;
}

export interface CanvasGenerationAuthoredText {
  readonly text: string;
  readonly sourceOutputId: string;
}

export interface CanvasGenerationNodeData {
  readonly recipe: CanvasGenerationRecipe;
  readonly latestRun?: CanvasGenerationRunBinding;
  readonly outputs: readonly CanvasGenerationOutputBinding[];
  readonly selectedOutputId?: string;
  readonly authoredText?: CanvasGenerationAuthoredText;
}

export interface CanvasGenerationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

export type CanvasGenerationAuthoringResult =
  | { readonly status: 'applied'; readonly data: CanvasGenerationNodeData }
  | { readonly status: 'rejected'; readonly diagnostic: CanvasGenerationDiagnostic };

export function isCanvasGenerationKind(value: unknown): value is CanvasGenerationKind {
  return (
    typeof value === 'string' && (CANVAS_GENERATION_KINDS as readonly string[]).includes(value)
  );
}

export function purposeForCanvasGenerationKind(
  kind: CanvasGenerationKind,
): CanvasGenerationPurpose {
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

export function purposeForCanvasGenerationRecipe(
  recipe: Pick<CanvasGenerationRecipe, 'kind'> &
    Partial<Pick<CanvasAudioGenerationRecipe, 'isMusic'>>,
): CanvasGenerationPurpose {
  return recipe.kind === 'audio' && recipe.isMusic
    ? 'audio.music.generate'
    : purposeForCanvasGenerationKind(recipe.kind);
}

export function createCanvasGenerationNodeData(
  kind: CanvasGenerationKind,
  model?: CanvasGenerationModelBinding,
): CanvasGenerationNodeData {
  if (model && model.purpose !== purposeForCanvasGenerationKind(kind)) {
    throw new Error('Canvas Generation default model purpose does not match the node kind.');
  }
  const recipe: CanvasGenerationRecipe = (() => {
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
          quality: 'standard',
          ...(model ? { model } : {}),
        };
      case 'audio':
        return {
          kind,
          prompt: '',
          duration: 10,
          isMusic: false,
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
  })();
  return { recipe, outputs: [] };
}

export function isCanvasGenerationRecipe(value: unknown): value is CanvasGenerationRecipe {
  if (!isRecord(value) || !isCanvasGenerationKind(value['kind'])) return false;
  if (typeof value['prompt'] !== 'string') return false;
  if (!hasOnlyKeys(value, recipeKeys(value['kind']))) return false;
  const model = value['model'];
  if (
    model !== undefined &&
    !isCanvasGenerationModelBinding(model, {
      kind: value['kind'],
      ...(typeof value['isMusic'] === 'boolean' ? { isMusic: value['isMusic'] } : {}),
    })
  ) {
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
          value['quality'] === 'standard' ||
          value['quality'] === 'hd') &&
        isOptionalNonEmptyString(value['style'])
      );
    case 'audio':
      return (
        isOptionalString(value['negativePrompt']) &&
        isOptionalPositiveNumber(value['duration']) &&
        (value['isMusic'] === undefined || typeof value['isMusic'] === 'boolean') &&
        isOptionalNonEmptyString(value['genre']) &&
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
        isOptionalRange(value['motionStrength'], 0, 1) &&
        isOptionalNonEmptyString(value['cameraMovement'])
      );
  }
}

export function isCanvasGenerationNodeData(value: unknown): value is CanvasGenerationNodeData {
  if (!isRecord(value) || !hasOnlyKeys(value, GENERATION_NODE_DATA_KEYS)) return false;
  if (!isCanvasGenerationRecipe(value['recipe']) || !Array.isArray(value['outputs'])) return false;
  if (!value['outputs'].every(isCanvasGenerationOutputBinding)) return false;
  const outputIds = new Set<string>();
  for (const output of value['outputs']) {
    if (outputIds.has(output.outputId)) return false;
    outputIds.add(output.outputId);
  }
  if (value['latestRun'] !== undefined && !isCanvasGenerationRunBinding(value['latestRun'])) {
    return false;
  }
  if (
    value['selectedOutputId'] !== undefined &&
    (typeof value['selectedOutputId'] !== 'string' || !outputIds.has(value['selectedOutputId']))
  ) {
    return false;
  }
  if (value['authoredText'] !== undefined) {
    if (
      value['recipe'].kind !== 'prompt' ||
      !isCanvasGenerationAuthoredText(value['authoredText'])
    ) {
      return false;
    }
    if (!outputIds.has(value['authoredText'].sourceOutputId)) return false;
  }
  return true;
}

export function updateCanvasGenerationRecipe(
  current: CanvasGenerationNodeData,
  recipe: CanvasGenerationRecipe,
): CanvasGenerationNodeData {
  assertGenerationData(current);
  if (!isCanvasGenerationRecipe(recipe)) throw new Error('Canvas Generation Recipe is invalid.');
  if (current.recipe.kind !== recipe.kind) {
    throw new Error('Canvas Generation Recipe kind cannot change in place.');
  }
  return { ...current, recipe };
}

export function beginCanvasGenerationRun(
  current: CanvasGenerationNodeData,
  input: { readonly submissionId: string; readonly recipeInputFingerprint: string },
): CanvasGenerationNodeData {
  assertGenerationData(current);
  requireNonEmpty(input.submissionId, 'Canvas Generation submission identity');
  requireNonEmpty(input.recipeInputFingerprint, 'Canvas Generation Recipe/input fingerprint');
  if (!current.recipe.prompt.trim()) {
    throw new Error('Canvas Generation Recipe prompt must be non-empty before running.');
  }
  if (!current.recipe.model) {
    throw new Error('Canvas Generation Recipe requires an exact model binding before running.');
  }
  return {
    ...current,
    latestRun: {
      submissionId: input.submissionId,
      recipeInputFingerprint: input.recipeInputFingerprint,
    },
  };
}

export function bindCanvasGenerationJob(
  current: CanvasGenerationNodeData,
  input: {
    readonly submissionId: string;
    readonly recipeInputFingerprint: string;
    readonly jobRef: JobRef<'generation'>;
  },
): CanvasGenerationAuthoringResult {
  if (!isCanvasGenerationNodeData(current)) {
    return rejected('invalid-node', 'Canvas Generation node data is invalid.');
  }
  const run = current.latestRun;
  if (
    !run ||
    run.submissionId !== input.submissionId ||
    run.recipeInputFingerprint !== input.recipeInputFingerprint
  ) {
    return rejected('stale-run', 'Canvas Generation Job binding does not match the latest run.');
  }
  if (!isGenerationJobRef(input.jobRef)) {
    return rejected('invalid-job', 'Canvas Generation Job reference is invalid.');
  }
  if (run.jobRef && run.jobRef.jobId !== input.jobRef.jobId) {
    return rejected('job-conflict', 'Canvas Generation run is already bound to another Job.');
  }
  return {
    status: 'applied',
    data: { ...current, latestRun: { ...run, jobRef: input.jobRef } },
  };
}

export function applyCanvasGenerationOutputs(
  current: CanvasGenerationNodeData,
  input: {
    readonly submissionId: string;
    readonly jobRef: JobRef<'generation'>;
    readonly recipeInputFingerprint: string;
    readonly outputs: readonly CanvasGenerationOutputBinding[];
  },
): CanvasGenerationAuthoringResult {
  if (!isCanvasGenerationNodeData(current)) {
    return rejected('invalid-node', 'Canvas Generation node data is invalid.');
  }
  const run = current.latestRun;
  if (
    !run ||
    run.submissionId !== input.submissionId ||
    run.recipeInputFingerprint !== input.recipeInputFingerprint ||
    run.jobRef?.jobId !== input.jobRef.jobId
  ) {
    return rejected(
      'stale-result',
      'Canvas Generation result does not belong to the latest bound run.',
    );
  }
  if (input.outputs.length === 0 || !input.outputs.every(isCanvasGenerationOutputBinding)) {
    return rejected('invalid-output', 'Canvas Generation result requires valid committed outputs.');
  }
  if (
    input.outputs.some(
      (output) =>
        output.jobRef.jobId !== input.jobRef.jobId ||
        output.recipeInputFingerprint !== input.recipeInputFingerprint ||
        output.kind !== current.recipe.kind,
    )
  ) {
    return rejected(
      'output-binding-mismatch',
      'Canvas Generation output binding does not match the submitted run.',
    );
  }
  const merged = new Map(current.outputs.map((output) => [output.outputId, output]));
  for (const output of input.outputs) {
    const existing = merged.get(output.outputId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(output)) {
      return rejected(
        'output-conflict',
        `Canvas Generation output identity "${output.outputId}" conflicts with an existing output.`,
      );
    }
    merged.set(output.outputId, output);
  }
  const selected = input.outputs.at(-1);
  if (!selected) return rejected('invalid-output', 'Canvas Generation result requires an output.');
  return {
    status: 'applied',
    data: {
      ...current,
      outputs: [...merged.values()],
      selectedOutputId: selected.outputId,
      authoredText: undefined,
    },
  };
}

export function selectCanvasGenerationOutput(
  current: CanvasGenerationNodeData,
  outputId: string,
): CanvasGenerationNodeData {
  assertGenerationData(current);
  if (!current.outputs.some((output) => output.outputId === outputId)) {
    throw new Error(`Canvas Generation output "${outputId}" does not exist.`);
  }
  return { ...current, selectedOutputId: outputId, authoredText: undefined };
}

export function authorCanvasGeneratedText(
  current: CanvasGenerationNodeData,
  text: string,
): CanvasGenerationNodeData {
  assertGenerationData(current);
  if (current.recipe.kind !== 'prompt') {
    throw new Error('Only a Prompt Generation Node can own authored text.');
  }
  const sourceOutputId = current.selectedOutputId;
  if (!sourceOutputId) {
    throw new Error('Authored Canvas text requires a selected generated source output.');
  }
  return { ...current, authoredText: { text, sourceOutputId } };
}

export function selectedCanvasGenerationOutput(
  data: CanvasGenerationNodeData,
): CanvasGenerationOutputBinding | undefined {
  return data.outputs.find((output) => output.outputId === data.selectedOutputId);
}

function isCanvasGenerationModelBinding(
  value: unknown,
  recipe: Pick<CanvasGenerationRecipe, 'kind'> &
    Partial<Pick<CanvasAudioGenerationRecipe, 'isMusic'>>,
): value is CanvasGenerationModelBinding {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, MODEL_BINDING_KEYS) &&
    value['purpose'] === purposeForCanvasGenerationRecipe(recipe) &&
    isNonEmptyString(value['providerId']) &&
    isNonEmptyString(value['modelId'])
  );
}

function isCanvasGenerationRunBinding(value: unknown): value is CanvasGenerationRunBinding {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RUN_BINDING_KEYS) &&
    isNonEmptyString(value['submissionId']) &&
    isNonEmptyString(value['recipeInputFingerprint']) &&
    (value['jobRef'] === undefined || isGenerationJobRef(value['jobRef']))
  );
}

function isCanvasGenerationOutputBinding(value: unknown): value is CanvasGenerationOutputBinding {
  if (!isRecord(value) || !hasOnlyKeys(value, OUTPUT_BINDING_KEYS)) return false;
  const locator = validateContentLocator(value['locator']);
  return (
    isNonEmptyString(value['outputId']) &&
    isGenerationJobRef(value['jobRef']) &&
    locator.ok &&
    locator.locator.kind === 'generated-output' &&
    isCanvasGenerationKind(value['kind']) &&
    isNonEmptyString(value['recipeInputFingerprint'])
  );
}

function isCanvasGenerationAuthoredText(value: unknown): value is CanvasGenerationAuthoredText {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, AUTHORED_TEXT_KEYS) &&
    typeof value['text'] === 'string' &&
    isNonEmptyString(value['sourceOutputId'])
  );
}

function isGenerationJobRef(value: unknown): value is JobRef<'generation'> {
  return isJobRef(value) && value.kind === 'generation';
}

function recipeKeys(kind: CanvasGenerationKind): ReadonlySet<string> {
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

function assertGenerationData(value: CanvasGenerationNodeData): void {
  if (!isCanvasGenerationNodeData(value)) {
    throw new Error('Canvas Generation node data is invalid.');
  }
}

function rejected(code: string, message: string): CanvasGenerationAuthoringResult {
  return { status: 'rejected', diagnostic: { code, message } };
}

function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty.`);
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
const RUN_BINDING_KEYS = new Set(['submissionId', 'recipeInputFingerprint', 'jobRef']);
const OUTPUT_BINDING_KEYS = new Set([
  'outputId',
  'jobRef',
  'locator',
  'kind',
  'recipeInputFingerprint',
]);
const AUTHORED_TEXT_KEYS = new Set(['text', 'sourceOutputId']);
const GENERATION_NODE_DATA_KEYS = new Set([
  'recipe',
  'latestRun',
  'outputs',
  'selectedOutputId',
  'authoredText',
]);
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
const AUDIO_RECIPE_KEYS = new Set([
  ...BASE_RECIPE_KEYS,
  'negativePrompt',
  'duration',
  'isMusic',
  'genre',
  'format',
]);
const VIDEO_RECIPE_KEYS = new Set([
  ...BASE_RECIPE_KEYS,
  'negativePrompt',
  'duration',
  'resolution',
  'fps',
  'aspectRatio',
  'motionStrength',
  'cameraMovement',
]);
