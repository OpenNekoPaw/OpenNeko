/**
 * Media Generation Executor
 *
 * Keeps provider execution linked to the caller until a terminal result.
 */

import { sleepWithAbort } from '@neko/shared';
import { GenerationExecutionOutcomeUnknownError } from '../execution';
import type { MediaModel as Model, MediaProvider as Provider } from './types';
import type {
  MediaAdapter,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaGenerationType,
  MediaOutput,
  MediaAdapterResult,
  MediaTaskDescriber,
  MaterializedImageGenerationRequest,
  MaterializedVideoGenerationRequest,
} from '@neko/generation';
import { getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import {
  requireMediaAudioSubmitter,
  requireMediaImageSubmitter,
  requireMediaTaskDescriber,
  requireMediaTaskCanceller,
  requireMediaVideoSubmitter,
} from './media-adapter-capabilities';
import type { MediaExecutionProviderResolver, MediaGenerationConfigPort } from './types';
import { getLogger } from '../utils/logger';
import { resolveProvider, type ResolvedProvider } from '@neko/ai-sdk';
import { generateImage, experimental_generateVideo, experimental_generateSpeech } from 'ai';
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
  readonly onExternalTask?: (externalTaskId: string) => void | Promise<void>;
}

export interface LinkedMediaExecutionResult {
  readonly outputs: readonly MediaOutput[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface MediaExecutionContext {
  readonly signal?: AbortSignal;
  readonly onExternalTask?: (externalTaskId: string) => void | Promise<void>;
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

  async describeExternalTask(input: {
    readonly providerId: string;
    readonly externalTaskId: string;
  }): Promise<MediaAdapterResult> {
    const provider = await this.providerResolver.resolveProvider(input.providerId);
    if (!provider || provider.id !== input.providerId) {
      throw new Error(`Configured media provider ${input.providerId} is unavailable.`);
    }
    const adapter = getMediaAdapterRegistry().getForType(provider.type);
    if (!adapter) throw new Error(createUnsupportedProviderDiagnostic(provider.type));
    return requireMediaTaskDescriber(adapter).getTaskStatus(input.externalTaskId, provider);
  }

  async cancelExternalTask(input: {
    readonly providerId: string;
    readonly externalTaskId: string;
  }): Promise<void> {
    const provider = await this.providerResolver.resolveProvider(input.providerId);
    if (!provider || provider.id !== input.providerId) {
      throw new Error(`Configured media provider ${input.providerId} is unavailable.`);
    }
    const adapter = getMediaAdapterRegistry().getForType(provider.type);
    if (!adapter) throw new Error(createUnsupportedProviderDiagnostic(provider.type));
    await requireMediaTaskCanceller(adapter).cancelTask(input.externalTaskId, provider);
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
        onExternalTaskId: () => undefined,
      },
      { imageMode },
    );
    if (resolved) {
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

    const mediaAdapter = getMediaAdapterRegistry().getForType(provider.type);
    if (!mediaAdapter) return { error: createUnsupportedProviderDiagnostic(provider.type) };
    return this.executeMediaAdapter(
      generationType,
      request,
      model,
      provider,
      mediaAdapter,
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
      if (generationType === 'text-to-image' || generationType === 'image-to-image') {
        const imageModel = resolved.image(model.name);
        if (!imageModel) {
          return { error: `Provider ${provider.type} does not expose an image model runtime.` };
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

        const result = await runProviderCallWithTimeout({
          timeoutMs: this.imageTaskTimeoutMs,
          signal: context?.signal,
          timeoutMessage: `Image generation timed out after ${this.imageTaskTimeoutMs}ms`,
          run: (abortSignal) =>
            generateImage({
              model: imageModel,
              prompt: imgReq.prompt,
              n: imgReq.count ?? 1,
              size: size as `${number}x${number}` | undefined,
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
        generationType === 'video-to-video'
      ) {
        const videoModel = resolved.video(model.name);
        if (!videoModel) {
          return { error: `Provider ${provider.type} does not expose a video model runtime.` };
        }

        const vidReq = await materializeVideoRequestFileUris(
          request as VideoGenerationRequest,
          this.requestAssetMaterializer,
          { ...(context?.signal ? { signal: context.signal } : {}) },
        );
        const resolution = vidReq.resolution
          ? this.parseResolutionToSize(vidReq.resolution)
          : undefined;
        const prompt = this.buildVideoPrompt(vidReq);
        const videoProviderOptions = this.buildVideoProviderOptions(vidReq);

        const result = await runProviderCallWithTimeout({
          timeoutMs: this.videoTaskTimeoutMs,
          signal: context?.signal,
          timeoutMessage: `Video generation timed out after ${this.videoTaskTimeoutMs}ms`,
          run: (abortSignal) =>
            experimental_generateVideo({
              model: videoModel,
              prompt,
              aspectRatio: this.parseAspectRatio(vidReq.aspectRatio),
              resolution,
              duration: vidReq.duration,
              fps: vidReq.fps,
              ...(Object.keys(videoProviderOptions).length > 0
                ? { providerOptions: { neko: videoProviderOptions } }
                : {}),
              abortSignal,
              maxRetries: 0,
            }),
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        const video = result.video;
        // Handle both base64 (file type) and URL (url type) responses
        const videoUrl = video.base64
          ? `data:${video.mediaType};base64,${video.base64}`
          : ((video as { url?: string }).url ?? '');
        return {
          data: {
            outputs: [
              {
                type: 'video' as const,
                url: videoUrl,
                mimeType: video.mediaType,
              },
            ],
            metadata: createAiSdkMediaTaskMetadata(resolved.source),
          },
        };
      }

      // Audio (TTS + music) via AI SDK
      if (generationType === 'text-to-audio' || generationType === 'text-to-music') {
        const audioReq = request as AudioGenerationRequest;
        const speechModel = resolved.speech(model.name);
        if (!speechModel) {
          return { error: `Provider ${provider.type} does not expose a speech model runtime.` };
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

  private async executeMediaAdapter(
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
    model: Model,
    provider: Provider,
    adapter: MediaAdapter,
    onProgress: (progress: number) => void,
    context?: MediaExecutionContext,
  ): Promise<MediaExecutionOutput> {
    try {
      const preparedRequest =
        generationType === 'text-to-image' || generationType === 'image-to-image'
          ? await materializeImageRequestFileUris(
              request as ImageGenerationRequest,
              this.requestAssetMaterializer,
              { ...(context?.signal ? { signal: context.signal } : {}) },
            )
          : generationType === 'text-to-video' ||
              generationType === 'image-to-video' ||
              generationType === 'video-to-video'
            ? await materializeVideoRequestFileUris(
                request as VideoGenerationRequest,
                this.requestAssetMaterializer,
                { ...(context?.signal ? { signal: context.signal } : {}) },
              )
            : request;
      const timeoutMs =
        generationType === 'text-to-image' || generationType === 'image-to-image'
          ? this.imageTaskTimeoutMs
          : generationType === 'text-to-audio' || generationType === 'text-to-music'
            ? this.audioTaskTimeoutMs
            : this.videoTaskTimeoutMs;
      const timeoutKind =
        generationType === 'text-to-image' || generationType === 'image-to-image'
          ? 'Image'
          : generationType === 'text-to-audio' || generationType === 'text-to-music'
            ? 'Audio'
            : 'Video';
      const result = await runProviderCallWithTimeout({
        timeoutMs,
        signal: context?.signal,
        timeoutMessage: `${timeoutKind} generation timed out after ${timeoutMs}ms`,
        run: async () => {
          if (generationType === 'text-to-image' || generationType === 'image-to-image') {
            return requireMediaImageSubmitter(adapter).generateImage(
              preparedRequest as MaterializedImageGenerationRequest,
              model,
              provider,
            );
          }
          if (
            generationType === 'text-to-video' ||
            generationType === 'image-to-video' ||
            generationType === 'video-to-video'
          ) {
            return requireMediaVideoSubmitter(adapter).generateVideo(
              preparedRequest as MaterializedVideoGenerationRequest,
              model,
              provider,
            );
          }
          if (generationType === 'text-to-audio' || generationType === 'text-to-music') {
            return requireMediaAudioSubmitter(adapter).generateAudio(
              preparedRequest as AudioGenerationRequest,
              model,
              provider,
            );
          }
          throw new Error(`Unsupported media generation type ${generationType}.`);
        },
      });
      throwIfAborted(context?.signal);

      if (
        result.externalTaskId &&
        result.status !== 'completed' &&
        result.status !== 'failed' &&
        result.status !== 'cancelled'
      ) {
        await context?.onExternalTask?.(result.externalTaskId);
        return this.pollForCompletion(
          requireMediaTaskDescriber(adapter),
          result.externalTaskId,
          provider,
          onProgress,
          context?.signal,
        );
      }

      if (result.status === 'failed') {
        if (result.error?.retryable) throw new Error(result.error.message);
        return { error: result.error?.message ?? 'Media generation failed.' };
      }
      if (result.status === 'cancelled') return { error: 'Media generation was cancelled.' };
      if (result.status !== 'completed') {
        return {
          error: 'Media provider returned a non-terminal result without an external task id.',
        };
      }
      if (!result.outputs) {
        return { error: 'Media provider completed without outputs.' };
      }
      onProgress(100);
      return {
        data: {
          outputs: result.outputs,
          metadata: { ...result.metadata, providerResolutionSource: 'media-adapter' },
        },
      };
    } catch (error) {
      const errorSummary = summarizeMediaGenerationError(error);
      const errorContext = `[${provider.type}/${model.name}] ${formatMediaGenerationErrorSummary(errorSummary)}`;
      logger.error(`Media adapter generation failed: ${errorContext}`, {
        generationType,
        providerId: provider.id,
        providerType: provider.type,
        modelId: model.id,
        error: errorSummary,
      });
      if (isMediaGenerationOutcomeUnknown(errorSummary)) {
        throw new GenerationExecutionOutcomeUnknownError(errorContext);
      }
      if (this.isRetryableError(error, errorSummary)) throw new Error(errorContext);
      return { error: errorContext };
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

  private parseAspectRatio(aspectRatio: string | undefined): `${number}:${number}` | undefined {
    if (!aspectRatio) return undefined;
    return /^\d+:\d+$/.test(aspectRatio) ? (aspectRatio as `${number}:${number}`) : undefined;
  }

  private buildVideoPrompt(
    request: MaterializedVideoGenerationRequest,
  ): string | { image: string; text?: string } {
    const image = request.referenceImageUrl ?? request.referenceImageBase64;
    return image ? { image, text: request.prompt } : request.prompt;
  }

  private buildVideoProviderOptions(
    request: MaterializedVideoGenerationRequest,
  ): Record<string, string | number> {
    const options: Record<string, string | number> = {};
    if (request.referenceVideoUrl !== undefined) {
      options['referenceVideoUrl'] = request.referenceVideoUrl;
    }
    if (request.startFrameImageBase64 !== undefined)
      options['startFrameImageBase64'] = request.startFrameImageBase64;
    if (request.endFrameImageBase64 !== undefined)
      options['endFrameImageBase64'] = request.endFrameImageBase64;
    if (request.sourceVideoUrl !== undefined) options['sourceVideoUrl'] = request.sourceVideoUrl;
    if (request.cameraMovement !== undefined) options['cameraMovement'] = request.cameraMovement;
    if (request.cameraAngle !== undefined) options['cameraAngle'] = request.cameraAngle;
    if (request.shotScale !== undefined) options['shotScale'] = request.shotScale;
    if (request.editInstruction !== undefined) options['editInstruction'] = request.editInstruction;
    if (request.motionStrength !== undefined) options['motionStrength'] = request.motionStrength;
    return options;
  }

  /**
   * Poll for task completion (used for recovery polling).
   * Uses video preset since recovery tasks are typically long-running.
   */
  private async pollForCompletion(
    adapter: MediaTaskDescriber,
    externalTaskId: string,
    provider: Provider,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<MediaExecutionOutput> {
    const config = {
      initialIntervalMs: 5000,
      maxIntervalMs: 15000,
      backoffStepMs: 1000,
      timeoutMs: 30 * 60 * 1000,
    };
    const startTime = Date.now();
    let currentInterval = config.initialIntervalMs;

    while (Date.now() - startTime < config.timeoutMs) {
      await sleepWithAbort(currentInterval, signal);

      try {
        const result = await adapter.getTaskStatus(externalTaskId, provider);

        if (result.progress !== undefined) {
          onProgress(result.progress);
        }

        switch (result.status) {
          case 'completed':
            if (!result.outputs) {
              return { error: 'Media provider completed polling without outputs.' };
            }
            onProgress(100);
            return {
              data: {
                outputs: result.outputs,
                metadata: { ...result.metadata, providerResolutionSource: 'media-adapter' },
              },
            };

          case 'failed':
            return {
              error: result.error?.message || 'Generation failed',
            };

          case 'cancelled':
            return {
              error: 'Generation was cancelled',
            };

          case 'pending':
          case 'processing':
            break;
        }
      } catch {
        // Transient error, continue with next interval
      }

      currentInterval = Math.min(currentInterval + config.backoffStepMs, config.maxIntervalMs);
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    return {
      error: `Generation timed out after ${elapsedSec}s`,
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
