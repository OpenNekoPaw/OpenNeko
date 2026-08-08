import {
  parseDirectGenerationOperationInput,
  purposeForMediaKind,
  type DirectGenerationOperationInput,
  type DirectGenerationOperationPort,
  type DirectGenerationOperationProjection,
} from '../direct-operation';
import type { GenerationJobPort, GenerationJobSnapshot } from './contracts';

export interface DirectGenerationBindingValidator {
  validate(input: {
    readonly purpose: ReturnType<typeof purposeForMediaKind>;
    readonly providerId: string;
    readonly modelId: string;
  }): void | Promise<void>;
}

export function createDirectGenerationOperationPort(input: {
  readonly jobs: GenerationJobPort;
  readonly bindings: DirectGenerationBindingValidator;
}): DirectGenerationOperationPort {
  return Object.freeze({
    async submit(rawInput: DirectGenerationOperationInput) {
      const operation = parseDirectGenerationOperationInput(rawInput);
      const purpose = purposeForMediaKind(operation.mediaKind);
      await input.bindings.validate({
        purpose,
        providerId: operation.providerId,
        modelId: operation.modelId,
      });
      const initial = await input.jobs.submitGeneration(projectJobInput(operation));
      const terminal = await waitForDirectTerminal(input.jobs, initial);
      return projectDirectGenerationOperation(terminal, operation.mediaKind, purpose);
    },
  });
}

function projectJobInput(input: DirectGenerationOperationInput) {
  const binding = { providerId: input.providerId, modelId: input.modelId };
  switch (input.mediaKind) {
    case 'image':
      return {
        lifecycleMode: 'detached' as const,
        generationType: 'text-to-image' as const,
        ...binding,
        request: {
          prompt: input.prompt,
          ...binding,
          ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }),
          ...(input.width === undefined ? {} : { width: input.width }),
          ...(input.height === undefined ? {} : { height: input.height }),
        },
      };
    case 'video':
      return {
        lifecycleMode: 'detached' as const,
        generationType: 'text-to-video' as const,
        ...binding,
        request: {
          prompt: input.prompt,
          ...binding,
          ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }),
          ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
          ...(input.duration === undefined ? {} : { duration: input.duration }),
          ...(input.fps === undefined ? {} : { fps: input.fps }),
        },
      };
    case 'audio':
      return {
        lifecycleMode: 'detached' as const,
        generationType: 'text-to-audio' as const,
        ...binding,
        request: {
          prompt: input.prompt,
          ...binding,
          ...(input.duration === undefined ? {} : { duration: input.duration }),
          ...(input.audioType === undefined ? {} : { metadata: { audioType: input.audioType } }),
        },
      };
  }
}

async function waitForDirectTerminal(
  jobs: GenerationJobPort,
  initial: GenerationJobSnapshot,
): Promise<GenerationJobSnapshot> {
  if (isDirectTerminal(initial.phase)) return initial;
  for await (const snapshot of jobs.observeGeneration(initial.ref)) {
    if (isDirectTerminal(snapshot.phase)) return snapshot;
  }
  throw new Error(
    `Direct Generation Job '${initial.ref.jobId}' observation ended before a visible terminal state.`,
  );
}

function isDirectTerminal(
  phase: GenerationJobSnapshot['phase'],
): phase is DirectGenerationOperationProjection['phase'] {
  return (
    phase === 'succeeded' ||
    phase === 'failed' ||
    phase === 'cancelled' ||
    phase === 'outcome-unknown'
  );
}

function projectDirectGenerationOperation(
  snapshot: GenerationJobSnapshot,
  mediaKind: DirectGenerationOperationInput['mediaKind'],
  purpose: ReturnType<typeof purposeForMediaKind>,
): DirectGenerationOperationProjection {
  if (!isDirectTerminal(snapshot.phase)) {
    throw new Error(`Generation Job '${snapshot.ref.jobId}' is not terminal.`);
  }
  if (snapshot.request.providerId !== snapshot.request.request.providerId) {
    throw new Error(`Generation Job '${snapshot.ref.jobId}' provider binding is inconsistent.`);
  }
  if (snapshot.request.modelId !== snapshot.request.request.modelId) {
    throw new Error(`Generation Job '${snapshot.ref.jobId}' model binding is inconsistent.`);
  }
  const resultLocators = snapshot.resultLocators ?? [];
  if (snapshot.phase === 'succeeded' && resultLocators.length === 0) {
    throw new Error(`Generation Job '${snapshot.ref.jobId}' succeeded without committed outputs.`);
  }
  return Object.freeze({
    jobId: snapshot.ref.jobId,
    mediaKind,
    purpose,
    providerId: snapshot.request.providerId,
    modelId: snapshot.request.modelId,
    phase: snapshot.phase,
    resultLocators: Object.freeze(resultLocators.map((locator) => Object.freeze({ ...locator }))),
    ...(snapshot.failure === undefined
      ? {}
      : {
          diagnostic: Object.freeze({
            code: snapshot.failure.code,
            message: snapshot.failure.message,
            ...(snapshot.failure.retryable === undefined
              ? {}
              : { retryable: snapshot.failure.retryable }),
          }),
        }),
  });
}
