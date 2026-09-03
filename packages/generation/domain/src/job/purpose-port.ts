import type {
  GenerationJobCommandInput,
  GenerationJobPort,
  GenerationJobRef,
  PurposeGenerationBindingResolver,
  PurposeGenerationJobPort,
  SubmitPurposeGenerationJobInput,
} from './contracts';
import { conformVideoGenerationRequestToProfile } from '../model-parameter-profile';

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
        case 'prompt':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            providerId: binding.providerId,
            modelId: binding.modelId,
            request: request.request,
          });
        case 'text-to-image':
        case 'image-to-image':
        case 'image-edit':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            providerId: binding.providerId,
            modelId: binding.modelId,
            request: {
              ...request.request,
              providerId: binding.providerId,
              modelId: binding.modelId,
            },
          });
        case 'text-to-video':
        case 'image-to-video':
        case 'video-to-video':
        case 'video-edit': {
          const boundVideoRequest = {
            ...request.request,
            providerId: binding.providerId,
            modelId: binding.modelId,
          };
          const preparedVideo = binding.parameterProfile
            ? conformVideoGenerationRequestToProfile(boundVideoRequest, binding.parameterProfile)
            : { request: boundVideoRequest, adjustments: [] };
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            providerId: binding.providerId,
            modelId: binding.modelId,
            ...(preparedVideo.adjustments.length === 0
              ? {}
              : { parameterAdjustments: preparedVideo.adjustments }),
            request: preparedVideo.request,
          });
        }
        case 'text-to-audio':
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            providerId: binding.providerId,
            modelId: binding.modelId,
            request: {
              ...request.request,
              providerId: binding.providerId,
              modelId: binding.modelId,
            },
          });
      }
    },
    describeGeneration: (ref: GenerationJobRef) => input.jobs.describeGeneration(ref),
    observeGeneration: (ref: GenerationJobRef, signal?: AbortSignal) =>
      input.jobs.observeGeneration(ref, signal),
    cancelGeneration: (command: GenerationJobCommandInput) => input.jobs.cancelGeneration(command),
    retryGeneration: (command: GenerationJobCommandInput) => input.jobs.retryGeneration(command),
    regenerateGeneration: (command: GenerationJobCommandInput) =>
      input.jobs.regenerateGeneration(command),
    reconcileGeneration: (command: GenerationJobCommandInput) =>
      input.jobs.reconcileGeneration(command),
  });
}
