/**
 * Media Generation Executor
 *
 * Keeps provider execution linked to the caller until a terminal result.
 */

import { sleepWithAbort } from '@neko/shared';
import { GenerationExecutionOutcomeUnknownError } from '../execution';
import type { MediaModel as Model, MediaProvider as Provider } from './types';
import type {
  GenerationProviderTaskObservation,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaGenerationType,
  MediaOutput,
  MaterializedVideoGenerationRequest,
  GenerationProviderTaskBinding,
} from '@neko/generation-domain';
import type { MediaExecutionProviderResolver, MediaGenerationConfigPort } from './types';
import { getLogger } from '../utils/logger';
import {
  createVideoTaskOperation,
  decodeVideoTaskOperation,
  resolveProvider,
  type ResolvedProvider,
} from '@neko/ai-sdk';
import {
  generateImage,
  experimental_getVideoStatus,
  experimental_generateSpeech,
  experimental_startVideo,
} from 'ai';
import type {
  Experimental_VideoModelV4,
  Experimental_VideoModelV4VideoData,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  materializeImageRequestFileUris,
  materializeVideoRequestFileUris,
  type MediaRequestAssetMaterializer,
} from './media-request-assets';
import {
  formatMediaGenerationErrorSummary,
  getMediaGenerationHttpStatus,
  isMediaGenerationOutcomeUnknown,
  summarizeMediaGenerationError,
  type MediaGenerationErrorSummary,
} from './media-generation-error';
import type { ResolvedProviderSource } from '@neko/ai-sdk';
import { assertMediaModelType } from './media-generation-kind';

const logger = getLogger('MediaGenerationExecutor');
const DEFAULT_IMAGE_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_VIDEO_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_AUDIO_TASK_TIMEOUT_MS = 5 * 60 * 1000;

function createUnsupportedProviderDiagnostic(providerType: string): string {
  return `No owning media runtime is registered for provider type "${providerType}".`;
}

export interface MediaGenerationPayload {
  /** Generation type */
  generationType: MediaGenerationType;
  /** Provider ID */
  providerId: string;
  /** Model ID */
  modelId: string;
  /** Generation request */
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
}

export interface LinkedMediaExecutionInput extends MediaGenerationPayload {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: number) => void;
  readonly onExternalTask?: (
    externalTaskId: string,
  ) => GenerationProviderTaskObservation | void | Promise<GenerationProviderTaskObservation | void>;
}

export interface LinkedMediaExecutionResult {
  readonly outputs: readonly MediaOutput[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface MediaExecutionContext {
  readonly signal?: AbortSignal;
  readonly onExternalTask?: (
    externalTaskId: string,
  ) => GenerationProviderTaskObservation | void | Promise<GenerationProviderTaskObservation | void>;
}

interface MediaExecutionOutput {
  readonly data?: {
    readonly outputs: readonly MediaOutput[];
    readonly metadata?: Readonly<Record<string, unknown>>;
  };
  readonly error?: string;
}

/**
 * Media task executor options
 */
export interface MediaGenerationExecutorOptions {
  /** Polling interval in ms (default: 5000) */
  pollingIntervalMs?: number;
  /** Max polling attempts (default: 360 = 30 min at 5s interval) */
  maxPollingAttempts?: number;
  /** Max wall-clock time for one image provider call before the task fails visibly. */
  imageTaskTimeoutMs?: number;
  /** Max wall-clock time for one video provider call before the task fails visibly. */
  videoTaskTimeoutMs?: number;
  /** Max wall-clock time for one audio provider call before the task fails visibly. */
  audioTaskTimeoutMs?: number;
  /**
   * Host-owned content access adapter for request assets such as source images,
   * masks, and control images. Platform does not read these files directly.
   */
  requestAssetMaterializer?: MediaRequestAssetMaterializer;
}

/**
 * Media task executor for polling-based generation
 */
export class MediaGenerationExecutor {
  private readonly configManager: MediaGenerationConfigPort;
  private readonly providerResolver: MediaExecutionProviderResolver;
  private readonly requestAssetMaterializer?: MediaRequestAssetMaterializer;
  private readonly imageTaskTimeoutMs: number;
  private readonly videoTaskTimeoutMs: number;
  private readonly audioTaskTimeoutMs: number;
  private readonly pollingIntervalMs: number;
  private readonly maxPollingAttempts: number;

  constructor(
    configManager: MediaGenerationConfigPort,
    providerResolver: MediaExecutionProviderResolver,
    options: MediaGenerationExecutorOptions = {},
  ) {
    this.configManager = configManager;
    this.providerResolver = providerResolver;
    this.requestAssetMaterializer = options.requestAssetMaterializer;
    this.imageTaskTimeoutMs = options.imageTaskTimeoutMs ?? DEFAULT_IMAGE_TASK_TIMEOUT_MS;
    this.videoTaskTimeoutMs = options.videoTaskTimeoutMs ?? DEFAULT_VIDEO_TASK_TIMEOUT_MS;
    this.audioTaskTimeoutMs = options.audioTaskTimeoutMs ?? DEFAULT_AUDIO_TASK_TIMEOUT_MS;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5_000;
    this.maxPollingAttempts = options.maxPollingAttempts ?? 360;
    if (!Number.isSafeInteger(this.pollingIntervalMs) || this.pollingIntervalMs <= 0) {
      throw new RangeError('Media polling interval must be a positive integer.');
    }
    if (!Number.isSafeInteger(this.maxPollingAttempts) || this.maxPollingAttempts <= 0) {
      throw new RangeError('Media max polling attempts must be a positive integer.');
    }
  }

  async executeLinked(input: LinkedMediaExecutionInput): Promise<LinkedMediaExecutionResult> {
    const output = await this.executePayload(input, input.onProgress ?? (() => undefined), {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.onExternalTask === undefined ? {} : { onExternalTask: input.onExternalTask }),
    });
    if (output.error) {
      throw new Error(output.error);
    }
    const data = output.data;
    if (!isMediaExecutionOutput(data)) {
      throw new Error('Media execution completed without structured outputs.');
    }
    return Object.freeze({
      outputs: Object.freeze(data.outputs.map((item) => Object.freeze({ ...item }))),
      ...(data.metadata === undefined ? {} : { metadata: Object.freeze({ ...data.metadata }) }),
    });
  }

  async describeExternalTask(
    input: GenerationProviderTaskBinding,
  ): Promise<GenerationProviderTaskObservation> {
    const provider = await this.providerResolver.resolveProvider(input.providerId);
    const model = this.configManager.getModel(input.modelId);
    if (
      !provider ||
      provider.id !== input.providerId ||
      !model ||
      model.id !== input.modelId ||
      model.providerId !== input.providerId
    ) {
      throw new Error(`Configured media provider ${input.providerId} is unavailable.`);
    }
    const resolved = resolveProvider(provider.type, {
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey ?? '',
    });
    if (!resolved) throw new Error(createUnsupportedProviderDiagnostic(provider.type));
    const videoModel = requireAsyncVideoModel(resolved, model.name, provider.type);
    const status = await experimental_getVideoStatus(videoModel, {
      operation: createVideoTaskOperation(input.externalTaskId),
      maxRetries: 0,
    });
    return mapAiSdkVideoStatus(status);
  }

  async cancelExternalTask(input: GenerationProviderTaskBinding): Promise<void> {
    const provider = await this.providerResolver.resolveProvider(input.providerId);
    const model = this.configManager.getModel(input.modelId);
    if (
      !provider ||
      provider.id !== input.providerId ||
      !model ||
      model.id !== input.modelId ||
      model.providerId !== input.providerId
    ) {
      throw new Error(`Configured media provider ${input.providerId} is unavailable.`);
    }
    const resolved = resolveProvider(provider.type, {
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey ?? '',
    });
    if (!resolved) throw new Error(createUnsupportedProviderDiagnostic(provider.type));
    if (!resolved.cancelVideoTask) {
      throw new Error(`Provider ${provider.type} does not expose remote video task cancellation.`);
    }
    await resolved.cancelVideoTask(model.name, input.externalTaskId);
  }

  private async executePayload(
    payload: MediaGenerationPayload,
    onProgress: (progress: number) => void,
    context?: MediaExecutionContext,
  ): Promise<MediaExecutionOutput> {
    const { generationType, providerId, modelId, request } = payload;

    // Resolve current execution credentials separately from secret-free model configuration.
    const provider = await this.providerResolver.resolveProvider(providerId);
    const model = this.configManager.getModel(modelId);

    if (!provider || provider.id !== providerId || !model || model.providerId !== providerId) {
      return {
        error: `Provider or model not found: ${providerId}/${modelId}`,
      };
    }
    assertMediaModelType(model, generationType);

    throwIfAborted(context?.signal);
    const capabilities = model.capabilities ?? [];
    const imageMode =
      capabilities.includes('chat') && capabilities.includes('text_to_image')
        ? ('chat' as const)
        : ('standard' as const);
    const resolved = resolveProvider(
      provider.type,
      {
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey ?? '',
      },
      { imageMode },
    );
    if (!resolved) return { error: createUnsupportedProviderDiagnostic(provider.type) };
    return this.executeAiSdk(
      generationType,
      request,
      model,
      provider,
      resolved,
      onProgress,
      context,
    );
  }

  /**
   * Execute a provider through its native AI SDK media model.
   */
  private async executeAiSdk(
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
    model: Model,
    provider: Provider,
    resolved: ResolvedProvider,
    onProgress: (progress: number) => void,
    context?: MediaExecutionContext,
  ): Promise<MediaExecutionOutput> {
    try {
      // Image generation via AI SDK
      if (
        generationType === 'text-to-image' ||
        generationType === 'image-to-image' ||
        generationType === 'image-edit'
      ) {
        const imageModel = resolved.image(model.name);
        if (!imageModel) {
          return {
            error: `Provider ${provider.type} does not expose an AI SDK image model runtime.`,
          };
        }

        const imgReq = await materializeImageRequestFileUris(
          request as ImageGenerationRequest,
          this.requestAssetMaterializer,
          { ...(context?.signal ? { signal: context.signal } : {}) },
        );
        const size =
          imgReq.width && imgReq.height ? (`${imgReq.width}x${imgReq.height}` as const) : undefined;

        // Carry ControlNet / IP-Adapter / inpaint / edit fields through providerOptions.
        // Provider implementations that understand the neko namespace consume them;
        // standard AI SDK providers ignore unknown namespaces.
        const nekoProviderOptions: Record<string, unknown> = {};
        if (imgReq.negativePrompt !== undefined)
          nekoProviderOptions['negativePrompt'] = imgReq.negativePrompt;
        if (imgReq.controlImageBase64 !== undefined)
          nekoProviderOptions['controlImageBase64'] = imgReq.controlImageBase64;
        if (imgReq.controlMode !== undefined)
          nekoProviderOptions['controlMode'] = imgReq.controlMode;
        if (imgReq.controlStrength !== undefined)
          nekoProviderOptions['controlStrength'] = imgReq.controlStrength;
        if (imgReq.ipAdapterRefs !== undefined)
          nekoProviderOptions['ipAdapterRefs'] = imgReq.ipAdapterRefs;
        if (imgReq.referenceImageBase64 !== undefined)
          nekoProviderOptions['referenceImageBase64'] = imgReq.referenceImageBase64;
        if (imgReq.referenceImageUrl !== undefined)
          nekoProviderOptions['referenceImageUrl'] = imgReq.referenceImageUrl;
        if (imgReq.maskBase64 !== undefined) nekoProviderOptions['maskBase64'] = imgReq.maskBase64;
        if (imgReq.inpaintStrength !== undefined)
          nekoProviderOptions['inpaintStrength'] = imgReq.inpaintStrength;
        if (imgReq.editInstruction !== undefined)
          nekoProviderOptions['editInstruction'] = imgReq.editInstruction;
        if (imgReq.style !== undefined) nekoProviderOptions['style'] = imgReq.style;
        if (imgReq.aspectRatio !== undefined)
          nekoProviderOptions['aspectRatio'] = imgReq.aspectRatio;
        if (imgReq.quality !== undefined) nekoProviderOptions['quality'] = imgReq.quality;
        if (imgReq.cameraReference !== undefined)
          nekoProviderOptions['cameraReference'] = imgReq.cameraReference;
        if (imgReq.panoramaReference !== undefined)
          nekoProviderOptions['panoramaReference'] = imgReq.panoramaReference;

        const editPrompt = [imgReq.prompt, imgReq.editInstruction]
          .filter((value): value is string => Boolean(value?.trim()))
          .join('\n\n');
        const imagePrompt =
          imgReq.referenceImageBase64 || imgReq.referenceImageUrl || imgReq.maskBase64
            ? {
                images: [imgReq.referenceImageBase64, imgReq.referenceImageUrl].filter(
                  (value): value is string => Boolean(value),
                ),
                text: editPrompt,
                ...(imgReq.maskBase64 ? { mask: imgReq.maskBase64 } : {}),
              }
            : editPrompt;

        const result = await runProviderCallWithTimeout({
          timeoutMs: this.imageTaskTimeoutMs,
          signal: context?.signal,
          timeoutMessage: `Image generation timed out after ${this.imageTaskTimeoutMs}ms`,
          run: (abortSignal) =>
            generateImage({
              model: imageModel,
              prompt: imagePrompt,
              n: imgReq.count ?? 1,
              ...(size
                ? { size: size as `${number}x${number}` }
                : imgReq.aspectRatio
                  ? { aspectRatio: imgReq.aspectRatio as `${number}:${number}` }
                  : {}),
              abortSignal,
              maxRetries: 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...(Object.keys(nekoProviderOptions).length > 0
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ({ providerOptions: { neko: nekoProviderOptions } } as any)
                : {}),
            }),
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        return {
          data: {
            outputs: result.images.map((img) => ({
              type: 'image' as const,
              url: img.base64 ? `data:${img.mediaType};base64,${img.base64}` : '',
              mimeType: img.mediaType,
            })),
            metadata: createAiSdkMediaTaskMetadata(resolved.source),
          },
        };
      }

      // Video generation via AI SDK
      if (
        generationType === 'text-to-video' ||
        generationType === 'image-to-video' ||
        generationType === 'video-to-video' ||
        generationType === 'video-edit'
      ) {
        const videoModel = resolved.video(model.name);
        if (!videoModel) {
          return {
            error: `Provider ${provider.type} does not expose an AI SDK video model runtime.`,
          };
        }
        if (videoModel.specificationVersion !== 'v4') {
          return {
            error: `Provider ${provider.type} video model does not expose the required start/status lifecycle.`,
          };
        }

        const vidReq = await materializeVideoRequestFileUris(
          request as VideoGenerationRequest,
          this.requestAssetMaterializer,
          { ...(context?.signal ? { signal: context.signal } : {}) },
        );
        const resolution =
          provider.type === 'minimax'
            ? undefined
            : vidReq.resolution
              ? this.parseResolutionToSize(vidReq.resolution)
              : undefined;
        const videoProviderOptions = this.buildVideoProviderOptions(vidReq);
        const frameImages: Array<{
          image: string;
          frameType: 'first_frame' | 'last_frame';
        }> = [];
        const inputReferences: Array<{ data: string; mediaType: string }> = [];
        const referenceAudioUrls: string[] = [];
        for (const input of vidReq.inputs ?? []) {
          if (input.role === 'first-frame' || input.role === 'last-frame') {
            frameImages.push({
              image: input.url,
              frameType: input.role === 'first-frame' ? 'first_frame' : 'last_frame',
            });
            continue;
          }
          const mediaType =
            input.mimeType ??
            (input.type === 'image'
              ? 'image/png'
              : input.type === 'video'
                ? 'video/mp4'
                : 'audio/mpeg');
          if (input.role === 'reference-audio' && provider.type === 'bytedance') {
            referenceAudioUrls.push(input.url);
          } else {
            inputReferences.push({ data: input.url, mediaType });
          }
        }

        const providerOptions: SharedV4ProviderOptions = {};
        if (provider.type === 'minimax') {
          providerOptions['minimax'] = { resolution: vidReq.resolution };
        } else if (provider.type === 'bytedance') {
          providerOptions['bytedance'] = {
            ...videoProviderOptions,
            ...(referenceAudioUrls.length > 0 ? { referenceAudio: referenceAudioUrls } : {}),
          };
        } else if (Object.keys(videoProviderOptions).length > 0) {
          providerOptions['neko'] = videoProviderOptions;
        }

        const started = await runProviderCallWithTimeout({
          timeoutMs: this.videoTaskTimeoutMs,
          signal: context?.signal,
          timeoutMessage: `Video task submission timed out after ${this.videoTaskTimeoutMs}ms`,
          run: (abortSignal) =>
            experimental_startVideo({
              model: videoModel,
              prompt: [vidReq.prompt, vidReq.editInstruction]
                .filter((value): value is string => Boolean(value?.trim()))
                .join('\n\n'),
              aspectRatio: this.parseAspectRatio(vidReq.aspectRatio),
              resolution,
              duration: vidReq.duration,
              fps: vidReq.fps,
              generateAudio: vidReq.generateAudio,
              ...(frameImages.length > 0 ? { frameImages } : {}),
              ...(inputReferences.length > 0 ? { inputReferences } : {}),
              ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
              abortSignal,
              maxRetries: 0,
            }),
        });
        const { taskId } = decodeVideoTaskOperation(started.operation);
        const observed = await context?.onExternalTask?.(taskId);
        const completed = observed
          ? requireCompletedProviderOutputs(observed)
          : await this.pollAiSdkVideoForCompletion(videoModel, taskId, onProgress, context?.signal);

        throwIfAborted(context?.signal);
        onProgress(100);
        return {
          data: {
            outputs: completed,
            metadata: createAiSdkMediaTaskMetadata(resolved.source),
          },
        };
      }

      // Speech audio via AI SDK
      if (generationType === 'text-to-audio') {
        const audioReq = request as AudioGenerationRequest;
        const speechModel = resolved.speech(model.name);
        if (!speechModel) {
          return {
            error: `Provider ${provider.type} does not expose an AI SDK speech model runtime.`,
          };
        }

        const result = await runProviderCallWithTimeout({
          timeoutMs: this.audioTaskTimeoutMs,
          signal: context?.signal,
          timeoutMessage: `Audio generation timed out after ${this.audioTaskTimeoutMs}ms`,
          run: (abortSignal) =>
            experimental_generateSpeech({
              model: speechModel,
              text: audioReq.prompt,
              voice: audioReq.metadata?.voice as string | undefined,
              speed: audioReq.metadata?.speed as number | undefined,
              outputFormat: audioReq.format,
              abortSignal,
              maxRetries: 0,
            }),
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        const audio = result.audio;
        return {
          data: {
            outputs: [
              {
                type: 'audio' as const,
                url: audio.base64 ? `data:${audio.mediaType};base64,${audio.base64}` : '',
                mimeType: audio.mediaType,
              },
            ],
            metadata: createAiSdkMediaTaskMetadata(resolved.source),
          },
        };
      }

      return { error: `Unsupported media generation type ${generationType}.` };
    } catch (error) {
      const errorSummary = summarizeMediaGenerationError(error);
      const retryable = this.isRetryableError(error, errorSummary);
      const rawMessage = formatMediaGenerationErrorSummary(errorSummary);
      const errorContext = `[${provider.type}/${model.name}] ${rawMessage}`;
      logger.error(`AI SDK generation failed: ${errorContext}`, {
        generationType,
        providerId: provider.id,
        providerType: provider.type,
        modelId: model.id,
        modelName: model.name,
        retryable,
        error: errorSummary,
      });

      if (isMediaGenerationOutcomeUnknown(errorSummary)) {
        throw new GenerationExecutionOutcomeUnknownError(errorContext);
      }

      // Determine if the error is retryable (network, rate limit, server errors)
      if (retryable) {
        throw new Error(errorContext);
      }

      // Non-retryable errors (auth, invalid request, content filter, or an
      // ambiguous paid submission) fail immediately and retain their policy.
      return {
        error: errorContext,
      };
    }
  }

  /**
   * Check if an error is retryable (network, rate limit, server errors)
   */
  private isRetryableError(
    error: unknown,
    summary: MediaGenerationErrorSummary = summarizeMediaGenerationError(error),
  ): boolean {
    if (summary.isRetryable !== undefined) return summary.isRetryable;

    const message = summary.message.toLowerCase();
    const status = summary.status ?? getMediaGenerationHttpStatus(error);

    if (status !== undefined) {
      return status === 429 || (status >= 500 && status < 600);
    }
    // Rate limit errors
    if (message.includes('rate limit')) {
      return true;
    }
    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      message.includes('etimedout') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
    // "No video/image generated" — may be transient model issue, worth retrying
    if (message.includes('no video generated') || message.includes('no image generated')) {
      return true;
    }
    return false;
  }

  /**
   * Parse resolution string (e.g., "720p") to "WxH" format
   */
  private parseResolutionToSize(resolution: string): `${number}x${number}` | undefined {
    const presets: Record<string, `${number}x${number}`> = {
      '480p': '854x480',
      '720p': '1280x720',
      '1080p': '1920x1080',
    };
    const preset = presets[resolution];
    if (preset) return preset;
    // If already in WxH format
    const match = resolution.match(/^(\d+)x(\d+)$/);
    if (match) return resolution as `${number}x${number}`;
    return undefined;
  }

  private parseAspectRatio(
    aspectRatio: string | undefined,
  ): `${number}:${number}` | 'adaptive' | undefined {
    if (!aspectRatio) return undefined;
    if (aspectRatio === 'adaptive') return 'adaptive';
    return /^\d+:\d+$/.test(aspectRatio) ? (aspectRatio as `${number}:${number}`) : undefined;
  }

  private buildVideoProviderOptions(
    request: MaterializedVideoGenerationRequest,
  ): Record<string, string | number> {
    const options: Record<string, string | number> = {};
    if (request.cameraMovement !== undefined) options['cameraMovement'] = request.cameraMovement;
    if (request.cameraAngle !== undefined) options['cameraAngle'] = request.cameraAngle;
    if (request.shotScale !== undefined) options['shotScale'] = request.shotScale;
    if (request.editInstruction !== undefined) options['editInstruction'] = request.editInstruction;
    if (request.motionStrength !== undefined) options['motionStrength'] = request.motionStrength;
    return options;
  }

  private async pollAiSdkVideoForCompletion(
    model: Experimental_VideoModelV4,
    externalTaskId: string,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<MediaOutput[]> {
    const startedAt = Date.now();
    let intervalMs = this.pollingIntervalMs;
    let attempts = 0;
    while (Date.now() - startedAt < this.videoTaskTimeoutMs && attempts < this.maxPollingAttempts) {
      await sleepWithAbort(intervalMs, signal);
      attempts += 1;
      const status = await experimental_getVideoStatus(model, {
        operation: createVideoTaskOperation(externalTaskId),
        abortSignal: signal,
        maxRetries: 0,
      });
      const result = mapAiSdkVideoStatus(status);
      if (result.status === 'completed') {
        if (!result.outputs?.length) {
          throw new Error('AI SDK video provider completed without outputs.');
        }
        onProgress(100);
        return result.outputs;
      }
      if (result.status === 'failed') {
        throw new Error(result.error?.message ?? 'AI SDK video provider task failed.');
      }
      if (result.status === 'cancelled') {
        throw new Error('AI SDK video provider task was cancelled.');
      }
      intervalMs = Math.min(intervalMs + this.pollingIntervalMs, 15_000);
    }
    throw new Error(`Video generation timed out after ${this.videoTaskTimeoutMs}ms.`);
  }
}

function requireAsyncVideoModel(
  resolved: ResolvedProvider,
  modelName: string,
  providerType: string,
): Experimental_VideoModelV4 {
  const model = resolved.video(modelName);
  if (!model) {
    throw new Error(`Provider ${providerType} does not expose an AI SDK video model runtime.`);
  }
  if (model.specificationVersion !== 'v4' || !model.doStart || !model.doStatus) {
    throw new Error(
      `Provider ${providerType} video model does not expose the required start/status lifecycle.`,
    );
  }
  return model;
}

function mapAiSdkVideoStatus(
  status: Awaited<ReturnType<typeof experimental_getVideoStatus>>,
): GenerationProviderTaskObservation {
  switch (status.status) {
    case 'pending':
      return { status: 'processing' };
    case 'error':
      return {
        status: status.error.toLowerCase().includes('cancel') ? 'cancelled' : 'failed',
        error: {
          code: 'ai-sdk-video-task-failed',
          message: status.error,
          retryable: false,
        },
      };
    case 'completed':
      return {
        status: 'completed',
        outputs: status.videos.map(videoDataToMediaOutput),
        metadata: { providerResolutionSource: 'ai-sdk' },
      };
  }
}

function requireCompletedProviderOutputs(result: GenerationProviderTaskObservation): MediaOutput[] {
  if (result.status === 'completed') {
    if (!result.outputs?.length) {
      throw new Error('Video provider completed without outputs.');
    }
    return result.outputs;
  }
  if (result.status === 'failed') {
    throw new Error(result.error?.message ?? 'Video provider task failed.');
  }
  if (result.status === 'cancelled') {
    throw new Error('Video provider task was cancelled.');
  }
  throw new Error('Generation Job observation returned a non-terminal video provider result.');
}

function videoDataToMediaOutput(video: Experimental_VideoModelV4VideoData): MediaOutput {
  switch (video.type) {
    case 'url':
      return { type: 'video', url: video.url, mimeType: video.mediaType };
    case 'base64':
      return {
        type: 'video',
        url: `data:${video.mediaType};base64,${video.data}`,
        mimeType: video.mediaType,
      };
    case 'binary':
      return {
        type: 'video',
        url: `data:${video.mediaType};base64,${Buffer.from(video.data).toString('base64')}`,
        mimeType: video.mediaType,
      };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Task aborted');
  }
}

async function runProviderCallWithTimeout<T>(input: {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly timeoutMessage: string;
  readonly run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  throwIfAborted(input.signal);

  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onParentAbort: (() => void) | undefined;
  const providerCall = input.run(controller.signal);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error(input.timeoutMessage));
    }, input.timeoutMs);
  });
  const parentSignal = input.signal;
  const parentAbortPromise = parentSignal
    ? new Promise<never>((_, reject) => {
        onParentAbort = () => {
          controller.abort();
          reject(new Error('Task aborted'));
        };
        parentSignal.addEventListener('abort', onParentAbort, { once: true });
      })
    : undefined;

  try {
    return await Promise.race(
      parentAbortPromise
        ? [providerCall, timeoutPromise, parentAbortPromise]
        : [providerCall, timeoutPromise],
    );
  } catch (error) {
    if (controller.signal.aborted && !input.signal?.aborted) {
      throw new Error(timedOut ? input.timeoutMessage : 'Task aborted');
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onParentAbort) input.signal?.removeEventListener('abort', onParentAbort);
  }
}

function createAiSdkMediaTaskMetadata(
  providerResolutionSource: ResolvedProviderSource,
): Record<string, unknown> {
  return {
    providerResolutionSource,
  };
}

function isMediaExecutionOutput(
  value: unknown,
): value is { outputs: MediaOutput[]; metadata?: Record<string, unknown> } {
  if (!isRecord(value) || !Array.isArray(value.outputs)) return false;
  return value.outputs.every(
    (output) =>
      isRecord(output) &&
      (output.type === 'image' || output.type === 'video' || output.type === 'audio') &&
      typeof output.url === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
