import {
  isWorkspaceFileContentLocator,
  validateContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import {
  GENERATION_RECIPE_KINDS,
  GENERATION_RECIPE_PURPOSES,
  conformVideoGenerationRecipeToProfile,
  createGenerationRecipe,
  createVideoGenerationRecipeForProfile,
  isGenerationRecipe,
  isGenerationRecipeKind,
  purposeForGenerationRecipe,
  purposeForGenerationRecipeKind,
  type AudioGenerationRecipe,
  type GenerationRecipe,
  type GenerationRecipeKind,
  type GenerationRecipeModelBinding,
  type GenerationRecipePurpose,
  type GenerationParameterAdjustment,
  type GenerationModelParameterProfile,
  type ImageGenerationRecipe,
  type PromptGenerationRecipe,
  type VideoGenerationRecipe,
} from '@neko/generation-domain';
import { isJobRef, type JobRef } from '@neko/shared/job-lifecycle';

export const CANVAS_GENERATION_KINDS = GENERATION_RECIPE_KINDS;
export type CanvasGenerationKind = GenerationRecipeKind;
export const CANVAS_GENERATION_PURPOSES = GENERATION_RECIPE_PURPOSES;
export type CanvasGenerationPurpose = GenerationRecipePurpose;
export type CanvasGenerationModelBinding = GenerationRecipeModelBinding;
export type CanvasPromptGenerationRecipe = PromptGenerationRecipe;
export type CanvasImageGenerationRecipe = ImageGenerationRecipe;
export type CanvasAudioGenerationRecipe = AudioGenerationRecipe;
export type CanvasVideoGenerationRecipe = VideoGenerationRecipe;
export type CanvasGenerationRecipe = GenerationRecipe;

export type CanvasGenerationRunBinding =
  | {
      readonly submissionId: string;
      readonly recipeInputFingerprint: string;
      readonly jobRef?: undefined;
    }
  | {
      readonly jobRef: JobRef<'generation'>;
      readonly recipeInputFingerprint: string;
      readonly submissionId?: string;
    };

export interface CanvasGenerationOutputBinding {
  readonly outputId: string;
  readonly jobRef: JobRef<'generation'>;
  readonly locator: WorkspaceFileContentLocator;
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
  return isGenerationRecipeKind(value);
}

export function purposeForCanvasGenerationKind(
  kind: CanvasGenerationKind,
): CanvasGenerationPurpose {
  return purposeForGenerationRecipeKind(kind);
}

export function purposeForCanvasGenerationRecipe(
  recipe: Pick<CanvasGenerationRecipe, 'kind'> &
    Partial<Pick<CanvasAudioGenerationRecipe, 'isMusic'>>,
): CanvasGenerationPurpose {
  return purposeForGenerationRecipe(recipe);
}

export function createCanvasGenerationNodeData(
  kind: CanvasGenerationKind,
  model?: CanvasGenerationModelBinding,
  parameterProfile?: GenerationModelParameterProfile,
): CanvasGenerationNodeData {
  if (parameterProfile && kind !== 'video') {
    throw new Error('Canvas Generation parameter profile does not match the node kind.');
  }
  return {
    recipe:
      kind === 'video' && model
        ? parameterProfile
          ? createVideoGenerationRecipeForProfile(model, parameterProfile)
          : { kind: 'video', prompt: '', model }
        : createGenerationRecipe(kind, model),
    outputs: [],
  };
}

export function conformCanvasVideoGenerationRecipeToProfile(
  recipe: CanvasVideoGenerationRecipe,
  parameterProfile: GenerationModelParameterProfile,
): {
  readonly recipe: CanvasVideoGenerationRecipe;
  readonly adjustments: readonly GenerationParameterAdjustment[];
} {
  return conformVideoGenerationRecipeToProfile(recipe, parameterProfile);
}

export function isCanvasGenerationRecipe(value: unknown): value is CanvasGenerationRecipe {
  return isGenerationRecipe(value);
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

function isCanvasGenerationRunBinding(value: unknown): value is CanvasGenerationRunBinding {
  if (!isRecord(value) || !hasOnlyKeys(value, RUN_BINDING_KEYS)) return false;
  const submissionId = value['submissionId'];
  const jobRef = value['jobRef'];
  return (
    isNonEmptyString(value['recipeInputFingerprint']) &&
    (submissionId === undefined || isNonEmptyString(submissionId)) &&
    (jobRef === undefined || isGenerationJobRef(jobRef)) &&
    (submissionId !== undefined || jobRef !== undefined)
  );
}

function isCanvasGenerationOutputBinding(value: unknown): value is CanvasGenerationOutputBinding {
  if (!isRecord(value) || !hasOnlyKeys(value, OUTPUT_BINDING_KEYS)) return false;
  const locator = validateContentLocator(value['locator']);
  return (
    isNonEmptyString(value['outputId']) &&
    isGenerationJobRef(value['jobRef']) &&
    locator.ok &&
    isWorkspaceFileContentLocator(locator.locator) &&
    locator.locator.selector === undefined &&
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
