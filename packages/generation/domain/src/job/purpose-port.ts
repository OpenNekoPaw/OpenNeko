import type {
  GenerationJobCommandInput,
  GenerationJobPort,
  GenerationJobRef,
  PurposeGenerationBindingResolver,
  PurposeGenerationJobPort,
  SubmitPurposeGenerationJobInput,
} from './contracts';
import {
  conformImageGenerationRequestToProfile,
  conformVideoGenerationRequestToProfile,
} from '../model-parameter-profile';
import {
  resolveImageGenerationType,
  resolveVideoGenerationType,
} from '../media/media-generation-kind';
import {
  validateProviderImageRequest,
  validateProviderVideoRequest,
} from '../media/media-operation-capabilities';

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
        case 'image-edit': {
          const expectedType = resolveImageGenerationType(request.request);
          if (request.generationType !== expectedType) {
            throw new Error(
              `Generation type ${request.generationType} does not match image request inputs; expected ${expectedType}.`,
            );
          }
          const boundImageRequest = {
            ...request.request,
            providerId: binding.providerId,
            modelId: binding.modelId,
          };
          if (binding.parameterProfile?.kind === 'video') {
            throw new Error('Generation model parameter profile does not match image purpose.');
          }
          const preparedImage = binding.parameterProfile
            ? conformImageGenerationRequestToProfile(boundImageRequest, binding.parameterProfile)
            : { request: boundImageRequest, adjustments: [] };
          if (binding.providerType) {
            assertNoCapabilityErrors(
              validateProviderImageRequest(
                binding.providerType,
                preparedImage.request,
                binding.modelCapabilities,
              ),
            );
          }
          return input.jobs.submitGeneration({
            lifecycleMode: request.lifecycleMode,
            generationType: request.generationType,
            providerId: binding.providerId,
            modelId: binding.modelId,
            ...(preparedImage.adjustments.length === 0
              ? {}
              : { parameterAdjustments: preparedImage.adjustments }),
            request: preparedImage.request,
          });
        }
        case 'text-to-video':
        case 'image-to-video':
        case 'video-to-video':
        case 'video-edit': {
          const expectedType = resolveVideoGenerationType(request.request);
          if (request.generationType !== expectedType) {
            throw new Error(
              `Generation type ${request.generationType} does not match video request inputs; expected ${expectedType}.`,
            );
          }
          const boundVideoRequest = {
            ...request.request,
            providerId: binding.providerId,
            modelId: binding.modelId,
          };
          if (binding.parameterProfile?.kind === 'image') {
            throw new Error('Generation model parameter profile does not match video purpose.');
          }
          const preparedVideo = binding.parameterProfile
            ? conformVideoGenerationRequestToProfile(boundVideoRequest, binding.parameterProfile)
            : { request: boundVideoRequest, adjustments: [] };
          if (binding.providerType) {
            assertNoCapabilityErrors(
              validateProviderVideoRequest(
                binding.providerType,
                preparedVideo.request,
                binding.modelCapabilities,
              ),
            );
          }
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

function assertNoCapabilityErrors(
  diagnostics: readonly { readonly severity: string; readonly message: string }[],
): void {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length === 0) return;
  throw new Error(
    `Media provider capability negotiation failed: ${errors.map(({ message }) => message).join('; ')}`,
  );
}
