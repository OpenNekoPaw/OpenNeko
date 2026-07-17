import type { ChatModelOption, TaskRunScope } from '@neko/shared';
import type { MediaTask, MediaTaskView } from '@neko/platform';
import { buildTuiMediaModelMetadata } from './media-model-metadata';
import type { TuiMediaCategory } from './types';

export type DirectMediaKind = TuiMediaCategory;

export interface DirectMediaModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface DirectMediaCommandInput {
  readonly kind: DirectMediaKind;
  readonly prompt: string;
  readonly config: DirectMediaCommandConfig;
  readonly modelOptions: readonly ChatModelOption[];
  readonly model?: string;
}

export interface DirectMediaCommandConfig {
  readonly defaultProviderId: string;
  readonly defaultMediaModels: Partial<Record<DirectMediaKind, string>>;
}

export interface DirectMediaCommandRuntime {
  readonly submit: (input: {
    readonly kind: DirectMediaKind;
    readonly prompt: string;
    readonly model: DirectMediaModelRef;
  }) => Promise<MediaTask>;
  readonly waitForTask: (scope: TaskRunScope) => Promise<MediaTask>;
  readonly deliver: (task: MediaTask) => Promise<MediaTaskView>;
}

export interface DirectMediaCommandResult {
  readonly kind: DirectMediaKind;
  readonly status: 'completed';
  readonly providerId: string;
  readonly modelId: string;
  readonly taskScope: TaskRunScope;
  readonly assetRefs: readonly string[];
}

export type DirectMediaCommandDiagnosticCode =
  | 'direct-media-empty-prompt'
  | 'direct-media-model-unavailable'
  | 'direct-media-model-kind-mismatch'
  | 'direct-media-task-failed'
  | 'direct-media-task-cancelled'
  | 'direct-media-result-unavailable';

export class DirectMediaCommandError extends Error {
  constructor(
    readonly code: DirectMediaCommandDiagnosticCode,
    message: string,
    readonly taskScope?: TaskRunScope,
  ) {
    super(message);
    this.name = 'DirectMediaCommandError';
  }
}

export async function executeDirectMediaCommand(
  input: DirectMediaCommandInput,
  runtime: DirectMediaCommandRuntime,
): Promise<DirectMediaCommandResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new DirectMediaCommandError(
      'direct-media-empty-prompt',
      `The ${input.kind} command requires a non-empty prompt.`,
    );
  }

  const model = resolveDirectMediaModel(input);
  const submitted = await runtime.submit({ kind: input.kind, prompt, model });
  const terminal = await runtime.waitForTask(submitted.scope);
  if (terminal.status === 'failed') {
    throw new DirectMediaCommandError(
      'direct-media-task-failed',
      terminal.error?.message ?? `${input.kind} generation task failed.`,
      terminal.scope,
    );
  }
  if (terminal.status === 'cancelled') {
    throw new DirectMediaCommandError(
      'direct-media-task-cancelled',
      `${input.kind} generation task was cancelled.`,
      terminal.scope,
    );
  }
  if (terminal.status !== 'completed') {
    throw new DirectMediaCommandError(
      'direct-media-task-failed',
      `${input.kind} generation task returned non-terminal status ${terminal.status}.`,
      terminal.scope,
    );
  }

  const view = await runtime.deliver(terminal);
  const assetRefs = collectStableAssetRefs(view);
  if (assetRefs.length === 0) {
    throw new DirectMediaCommandError(
      'direct-media-result-unavailable',
      `${input.kind} generation completed without a stable generated asset reference.`,
      terminal.scope,
    );
  }
  return toResult(input.kind, terminal, assetRefs);
}

export function resolveDirectMediaModel(input: DirectMediaCommandInput): DirectMediaModelRef {
  const requested = input.model?.trim() || input.config.defaultMediaModels?.[input.kind];
  if (!requested || requested === 'none') {
    throw new DirectMediaCommandError(
      'direct-media-model-unavailable',
      `No default ${input.kind} model is configured.`,
    );
  }

  const matchingOption = input.modelOptions.find((option) => matchesModelRef(option, requested));
  if (matchingOption && matchingOption.category !== input.kind) {
    throw new DirectMediaCommandError(
      'direct-media-model-kind-mismatch',
      `Model ${requested} is ${matchingOption.category ?? 'uncategorized'}, not ${input.kind}.`,
    );
  }

  const models = buildTuiMediaModelMetadata(
    { [input.kind]: requested },
    input.config.defaultProviderId,
    input.modelOptions,
  );
  const resolved = models[input.kind];
  if (!resolved) {
    throw new DirectMediaCommandError(
      'direct-media-model-unavailable',
      `Unable to resolve ${input.kind} model ${requested}.`,
    );
  }
  return { providerId: resolved.providerId, modelId: resolved.modelId };
}

function matchesModelRef(option: ChatModelOption, ref: string): boolean {
  return (
    option.id === ref ||
    option.modelId === ref ||
    `${option.providerId}:${option.modelId}` === ref ||
    `${option.providerId}/${option.modelId}` === ref
  );
}

function collectStableAssetRefs(view: MediaTaskView): string[] {
  const refs = view.result?.assets
    ?.map((asset) => asset.assetRef?.uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  return refs && refs.length > 0 ? [...new Set(refs)] : [...new Set(view.result?.urls ?? [])];
}

function toResult(
  kind: DirectMediaKind,
  task: MediaTask,
  assetRefs: readonly string[],
): DirectMediaCommandResult {
  return {
    kind,
    status: 'completed',
    providerId: task.providerId,
    modelId: task.modelId,
    taskScope: task.scope,
    assetRefs,
  };
}
