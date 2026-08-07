import type {
  GenerationJobCommandInput,
  GenerationJobPort,
  GenerationJobRef,
  PurposeGenerationBindingResolver,
  PurposeGenerationJobPort,
  SubmitPurposeGenerationJobInput,
} from './contracts';

export function createPurposeGenerationJobPort(input: {
  readonly jobs: GenerationJobPort;
  readonly bindings: PurposeGenerationBindingResolver;
}): PurposeGenerationJobPort {
  return Object.freeze({
    submitGeneration: async (request: SubmitPurposeGenerationJobInput) => {
      const binding = await input.bindings.resolveGenerationBinding(request.purpose);
      if (!binding) {
        throw new Error(
          `No explicit generation model binding is configured for ${request.purpose}.`,
        );
      }
      switch (request.generationType) {
        case 'text-to-image':
        case 'image-to-image':
        case 'image-edit':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            ...binding,
            request: { ...request.request, ...binding },
          });
        case 'text-to-video':
        case 'image-to-video':
        case 'video-to-video':
        case 'video-edit':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            ...binding,
            request: { ...request.request, ...binding },
          });
        case 'text-to-audio':
        case 'text-to-music':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            ...binding,
            request: { ...request.request, ...binding },
          });
      }
    },
    describeGeneration: (ref: GenerationJobRef) => input.jobs.describeGeneration(ref),
    observeGeneration: (ref: GenerationJobRef) => input.jobs.observeGeneration(ref),
    cancelGeneration: (command: GenerationJobCommandInput) => input.jobs.cancelGeneration(command),
    retryGeneration: (command: GenerationJobCommandInput) => input.jobs.retryGeneration(command),
    regenerateGeneration: (command: GenerationJobCommandInput) =>
      input.jobs.regenerateGeneration(command),
    reconcileGeneration: (command: GenerationJobCommandInput) =>
      input.jobs.reconcileGeneration(command),
  });
}
