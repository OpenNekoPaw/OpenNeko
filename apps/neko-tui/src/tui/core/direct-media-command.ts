import type { ChatModelOption } from '@neko/shared';
import type {
  GenerationJobRef,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
} from '@neko/generation';
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
  readonly detached?: boolean;
}

export interface DirectMediaCommandConfig {
  readonly defaultProviderId: string;
  readonly defaultMediaModels: Partial<Record<DirectMediaKind, string>>;
}

export interface DirectMediaCommandRuntime {
  readonly submitGeneration: (input: SubmitGenerationJobInput) => Promise<GenerationJobSnapshot>;
  readonly observeGeneration: (
    ref: GenerationJobRef,
    afterRevision: number,
  ) => AsyncIterable<GenerationJobSnapshot>;
  readonly describeGeneration: (ref: GenerationJobRef) => Promise<GenerationJobSnapshot>;
  readonly cancelGeneration: (input: {
    readonly ref: GenerationJobRef;
    readonly expectedRevision: number;
  }) => Promise<GenerationJobSnapshot>;
  readonly retryGeneration: (input: {
    readonly ref: GenerationJobRef;
    readonly expectedRevision: number;
  }) => Promise<GenerationJobSnapshot>;
  readonly reconcileGeneration: (input: {
    readonly ref: GenerationJobRef;
    readonly expectedRevision: number;
  }) => Promise<GenerationJobSnapshot>;
}

export type DirectGenerationJobAction = 'describe' | 'cancel' | 'retry' | 'reconcile';

export interface DirectGenerationJobCommandInput {
  readonly action: DirectGenerationJobAction;
  readonly jobId: string;
  readonly expectedRevision?: number;
}

export async function executeDirectGenerationJobCommand(
  input: DirectGenerationJobCommandInput,
  runtime: DirectMediaCommandRuntime,
): Promise<GenerationJobSnapshot> {
  const jobId = input.jobId.trim();
  if (!jobId) throw new Error('Generation Job command requires a non-empty jobId.');
  const ref: GenerationJobRef = { kind: 'generation', jobId };
  if (input.action === 'describe') return runtime.describeGeneration(ref);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision === undefined) {
    throw new Error(`${input.action} requires an exact expectedRevision.`);
  }
  const command = { ref, expectedRevision: input.expectedRevision };
  switch (input.action) {
    case 'cancel':
      return runtime.cancelGeneration(command);
    case 'retry':
      return runtime.retryGeneration(command);
    case 'reconcile':
      return runtime.reconcileGeneration(command);
  }
}

export interface DirectMediaCommandResult {
  readonly kind: DirectMediaKind;
  readonly status: 'submitted' | 'completed';
  readonly providerId: string;
  readonly modelId: string;
  readonly operationId: string;
  readonly jobRevision: number;
  readonly assetRefs: readonly string[];
}

export type DirectMediaCommandDiagnosticCode =
  | 'direct-media-empty-prompt'
  | 'direct-media-model-unavailable'
  | 'direct-media-model-kind-mismatch'
  | 'direct-media-generation-failed'
  | 'direct-media-generation-cancelled'
  | 'direct-media-result-unavailable';

export class DirectMediaCommandError extends Error {
  constructor(
    readonly code: DirectMediaCommandDiagnosticCode,
    message: string,
    readonly operationId?: string,
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
  let submitted: GenerationJobSnapshot;
  try {
    submitted = await runtime.submitGeneration({
      ...toGenerationJobInput(input.kind, prompt, model),
      lifecycleMode: input.detached ? 'detached' : 'linked',
    });
  } catch (error) {
    throw new DirectMediaCommandError(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'direct-media-generation-cancelled'
        : 'direct-media-generation-failed',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (input.detached) {
    return {
      kind: input.kind,
      status: 'submitted',
      providerId: submitted.request.providerId,
      modelId: submitted.request.modelId,
      operationId: submitted.ref.jobId,
      jobRevision: submitted.revision,
      assetRefs: [],
    };
  }
  const terminal = await waitForTerminalGeneration(runtime, submitted);
  if (terminal.phase !== 'succeeded') {
    throw new DirectMediaCommandError(
      terminal.phase === 'cancelled'
        ? 'direct-media-generation-cancelled'
        : 'direct-media-generation-failed',
      terminal.failure?.message ?? `${input.kind} generation ended in phase ${terminal.phase}.`,
      terminal.ref.jobId,
    );
  }
  const assetRefs = terminal.resultRefs?.map((ref) => ref.id) ?? [];
  if (assetRefs.length === 0) {
    throw new DirectMediaCommandError(
      'direct-media-result-unavailable',
      `${input.kind} generation completed without a stable generated asset reference.`,
      terminal.ref.jobId,
    );
  }
  return {
    kind: input.kind,
    status: 'completed',
    providerId: terminal.request.providerId,
    modelId: terminal.request.modelId,
    operationId: terminal.ref.jobId,
    jobRevision: terminal.revision,
    assetRefs,
  };
}

function toGenerationJobInput(
  kind: DirectMediaKind,
  prompt: string,
  model: DirectMediaModelRef,
): SubmitGenerationJobInput {
  const base = {
    providerId: model.providerId,
    modelId: model.modelId,
    request: {
      prompt,
      providerId: model.providerId,
      modelId: model.modelId,
      metadata: { source: 'direct-media-cli' },
    },
  };
  switch (kind) {
    case 'image':
      return { ...base, generationType: 'text-to-image' };
    case 'video':
      return { ...base, generationType: 'text-to-video' };
    case 'audio':
      return { ...base, generationType: 'text-to-audio' };
  }
}

async function waitForTerminalGeneration(
  runtime: DirectMediaCommandRuntime,
  initial: GenerationJobSnapshot,
): Promise<GenerationJobSnapshot> {
  if (isDirectMediaTerminal(initial)) return initial;
  for await (const snapshot of runtime.observeGeneration(initial.ref, initial.revision)) {
    if (isDirectMediaTerminal(snapshot)) return snapshot;
  }
  throw new DirectMediaCommandError(
    'direct-media-generation-failed',
    `Generation Job ${initial.ref.jobId} observation ended before a terminal snapshot.`,
    initial.ref.jobId,
  );
}

function isDirectMediaTerminal(snapshot: GenerationJobSnapshot): boolean {
  return (
    snapshot.phase === 'succeeded' ||
    snapshot.phase === 'failed' ||
    snapshot.phase === 'cancelled' ||
    snapshot.phase === 'outcome-unknown'
  );
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
