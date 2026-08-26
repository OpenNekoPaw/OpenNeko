/**
 * Media Generation Service
 *
 * High-level API for media generation (images, videos, audio)
 *
 * Calls remain linked to their caller and resolve only at a terminal provider
 * result. Detached/recoverable work belongs to a separate Generation Job owner.
 */

import type {
  AudioGenerationRequest,
  MediaGenerationExecutionPort,
  ImageGenerationRequest,
  MediaGenerationExecutionOptions,
  MediaGenerationResult,
  MediaGenerationType,
  GenerationProviderTaskBinding,
  VideoGenerationRequest,
} from '@neko/generation-domain';
import { MediaRoutingManager } from './routing/media-routing-manager';
import type { MediaGenerationExecutor } from './media-generation-executor';
import type { MediaGenerationConfigPort } from './types';
import { resolveImageGenerationType, resolveVideoGenerationType } from './media-generation-kind';
import {
  validateProviderImageRequest,
  validateProviderVideoRequest,
} from './media-operation-capabilities';
import {
  resolveGenerationModelParameterProfile,
  validateVideoGenerationParameters,
} from '../model-parameter-profile';

function hasThreeReferenceImageControls(
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
): request is ImageGenerationRequest {
  if (!(
    'controlImageLocator' in request ||
    'ipAdapterRefs' in request ||
    'cameraReference' in request ||
    'panoramaReference' in request
  )) {
    return false;
  }
  return Boolean(
    request.controlImageLocator ||
    request.ipAdapterRefs?.some((reference) => reference.imageLocator) ||
    request.cameraReference ||
    request.panoramaReference,
  );
}

interface PreparedMediaGeneration {
  readonly request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
  readonly providerId: string;
  readonly modelId: string;
}

/**
 * Media generation service - unified API for all media generation
 */
export class MediaGenerationService implements MediaGenerationExecutionPort {
  private readonly configManager: MediaGenerationConfigPort;
  private readonly routingManager: MediaRoutingManager;
  private readonly executor: MediaGenerationExecutor;

  constructor(
    configManager: MediaGenerationConfigPort,
    routingManager: MediaRoutingManager,
    executor: MediaGenerationExecutor,
  ) {
    this.configManager = configManager;
    this.routingManager = routingManager;
    this.executor = executor;
  }

  generateImage(
    request: ImageGenerationRequest,
    options: MediaGenerationExecutionOptions = {},
  ): Promise<MediaGenerationResult> {
    return this.generate(resolveImageGenerationType(request), request, options);
  }

  generateVideo(
    request: VideoGenerationRequest,
    options: MediaGenerationExecutionOptions = {},
  ): Promise<MediaGenerationResult> {
    return this.generate(resolveVideoGenerationType(request), request, options);
  }

  generateAudio(
    request: AudioGenerationRequest,
    options: MediaGenerationExecutionOptions = {},
  ): Promise<MediaGenerationResult> {
    return this.generate(request.isMusic ? 'text-to-music' : 'text-to-audio', request, options);
  }

  private async generate(
    generationType: Exclude<MediaGenerationType, 'workflow'>,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
    options: MediaGenerationExecutionOptions,
  ): Promise<MediaGenerationResult> {
    const prepared = await this.prepareGeneration(generationType, request);
    const result = await this.executor.executeLinked({
      generationType,
      providerId: prepared.providerId,
      modelId: prepared.modelId,
      request: prepared.request,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.onExternalTask === undefined
        ? {}
        : {
            onExternalTask: (externalTaskId: string) =>
              options.onExternalTask?.({
                providerId: prepared.providerId,
                externalTaskId,
              }),
          }),
    });
    return Object.freeze({
      type: generationType,
      providerId: prepared.providerId,
      modelId: prepared.modelId,
      outputs: result.outputs,
      ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
      request: prepared.request,
    });
  }

  describeExternalTask(input: GenerationProviderTaskBinding) {
    return this.executor.describeExternalTask(input);
  }

  cancelExternalTask(input: GenerationProviderTaskBinding): Promise<void> {
    return this.executor.cancelExternalTask(input);
  }

  private async prepareGeneration(
    generationType: Exclude<MediaGenerationType, 'workflow'>,
    initialRequest: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
  ): Promise<PreparedMediaGeneration> {
    let request = initialRequest;
    // Route to best provider
    const routing = await this.routingManager.selectProvider(
      generationType,
      request.providerId,
      request.modelId,
    );

    if (!routing) {
      throw new Error(`No available provider for ${generationType}`);
    }

    const provider = this.configManager.getProvider(routing.providerId);
    if (!provider) {
      throw new Error(`Configured media provider ${routing.providerId} is unavailable.`);
    }
    const isVideoGeneration = generationType.includes('video');
    const requiresPreciseImageCapabilities =
      generationType.includes('image') && hasThreeReferenceImageControls(request);
    const requiresModel = isVideoGeneration || requiresPreciseImageCapabilities;
    const model = requiresModel ? this.configManager.getModel(routing.modelId) : undefined;
    if (requiresModel && !model) {
      throw new Error(`Configured media model ${routing.modelId} is unavailable.`);
    }
    const capabilityDiagnostics = isVideoGeneration
      ? validateProviderVideoRequest(provider.type, request as VideoGenerationRequest)
      : generationType.includes('image')
        ? validateProviderImageRequest(
            provider.type,
            request as ImageGenerationRequest,
            model?.capabilities ?? [],
          )
        : [];
    const modelParameterProfile =
      isVideoGeneration && model
        ? resolveGenerationModelParameterProfile({
            providerType: provider.type,
            modelName: model.name,
          })
        : undefined;
    const modelParameterDiagnostics = modelParameterProfile
      ? validateVideoGenerationParameters(modelParameterProfile, request as VideoGenerationRequest)
      : [];
    const capabilityErrors = [
      ...capabilityDiagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.message),
      ...modelParameterDiagnostics.map((diagnostic) => diagnostic.message),
    ];
    if (capabilityErrors.length > 0) {
      throw new Error(
        `Media provider capability negotiation failed: ${capabilityErrors.join('; ')}`,
      );
    }
    if (capabilityDiagnostics.length > 0) {
      request = {
        ...request,
        metadata: {
          ...request.metadata,
          capabilityDiagnostics,
        },
      };
    }

    return {
      request,
      providerId: routing.providerId,
      modelId: routing.modelId,
    };
  }
}
