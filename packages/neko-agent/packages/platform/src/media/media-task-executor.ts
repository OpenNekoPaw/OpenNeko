/**
 * Media Task Executor
 *
 * Handles async media generation tasks with polling and recovery support
 */

import type {
  AgentTaskResultDeliveryPolicy,
  TaskResultDeliveryGroupMetadata,
  TaskInput,
  TaskOutput,
  TaskRecoveryInfo,
  TaskExecutor,
  TaskExecutionContext,
  SerializableTask,
  ITaskRecoveryStorage,
  TaskRunScope,
} from '@neko/shared';
import { sleepWithAbort } from '@neko/shared';
import type { Provider, Model } from '../types/provider';
import type {
  MediaAdapter,
  MediaAdapterResult,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaGenerationType,
} from './types';
import { getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import type { ConfigManager } from '../config/config-manager';
import type { MediaTaskManagerDeps } from './types';
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
  summarizeMediaGenerationError,
  type MediaGenerationErrorSummary,
} from './media-generation-error';
import type { ResolvedProviderSource } from '@neko/ai-sdk';

const logger = getLogger('MediaTaskExecutor');
const DEFAULT_IMAGE_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_VIDEO_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_AUDIO_TASK_TIMEOUT_MS = 5 * 60 * 1000;

function createUnsupportedProviderDiagnostic(providerType: string): string {
  return `No owning media runtime is registered for provider type "${providerType}".`;
}

/**
 * Media task input payload
 */
export interface MediaTaskPayload {
  /** Generation type */
  generationType: MediaGenerationType;
  /** Provider ID */
  providerId: string;
  /** Model ID */
  modelId: string;
  /** Generation request */
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
}

/**
 * Media task executor options
 */
export interface MediaTaskExecutorOptions {
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
export class MediaTaskExecutor {
  private configManager: ConfigManager;
  private taskManager?: MediaTaskManagerDeps;
  private readonly requestAssetMaterializer?: MediaRequestAssetMaterializer;
  private readonly imageTaskTimeoutMs: number;
  private readonly videoTaskTimeoutMs: number;
  private readonly audioTaskTimeoutMs: number;

  constructor(configManager: ConfigManager, options: MediaTaskExecutorOptions = {}) {
    this.configManager = configManager;
    this.requestAssetMaterializer = options.requestAssetMaterializer;
    this.imageTaskTimeoutMs = options.imageTaskTimeoutMs ?? DEFAULT_IMAGE_TASK_TIMEOUT_MS;
    this.videoTaskTimeoutMs = options.videoTaskTimeoutMs ?? DEFAULT_VIDEO_TASK_TIMEOUT_MS;
    this.audioTaskTimeoutMs = options.audioTaskTimeoutMs ?? DEFAULT_AUDIO_TASK_TIMEOUT_MS;
  }

  /**
   * Register this executor with a TaskManager
   */
  registerWith(taskManager: MediaTaskManagerDeps): void {
    this.taskManager = taskManager;
    if (taskManager.registerExecutor) {
      taskManager.registerExecutor('image_generation', this.createExecutor());
      taskManager.registerExecutor('video_generation', this.createExecutor());
      taskManager.registerExecutor('audio_generation', this.createExecutor());
    }
  }

  /**
   * Resume tasks from recovery info after restart
   * Returns number of resumed tasks
   */
  async resumeFromRecovery(taskManager: MediaTaskManagerDeps): Promise<number> {
    if (!taskManager.getRecoveryStorage) {
      return 0;
    }
    const recoveryStorage: ITaskRecoveryStorage | undefined = taskManager.getRecoveryStorage();
    if (!recoveryStorage) {
      return 0;
    }
    const recoveryInfos = await recoveryStorage.loadAll();
    let resumed = 0;

    for (const info of recoveryInfos) {
      try {
        const task = await taskManager.get(info.scope);
        if (task?.lifecycle?.recoverPolicy && task.lifecycle.recoverPolicy !== 'resume-polling') {
          logger.debug('Skipping recovery polling for task recover policy', {
            taskId: info.taskId,
            recoverPolicy: task.lifecycle.recoverPolicy,
          });
          continue;
        }

        // Get provider
        const provider = this.configManager.getProvider(info.providerId);
        if (!provider) {
          logger.warn('Provider not found for recovery', { providerId: info.providerId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.scope);
          }
          continue;
        }

        // Get adapter
        const adapter = getMediaAdapterRegistry().getForType(provider.type);
        if (!adapter) {
          logger.warn('Adapter not found for recovery', { providerType: provider.type });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.scope);
          }
          continue;
        }

        // Check task status on external platform
        const result = await adapter.getTaskStatus(info.externalTaskId, provider);

        if (result.status === 'completed') {
          await this.completeRecoveredTask(taskManager, info, {
            data: {
              outputs: result.outputs,
              metadata: result.metadata,
            },
          });
          logger.debug('Recovered task already completed', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.scope);
          }
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          await this.completeRecoveredTask(taskManager, info, {
            error:
              result.status === 'cancelled'
                ? 'Generation was cancelled'
                : result.error?.message || 'Generation failed',
          });
          logger.debug('Recovered task failed/cancelled', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.scope);
          }
        } else {
          // Task still pending/processing, resume polling
          logger.debug('Resuming polling for task', { taskId: info.taskId });
          this.resumePolling(taskManager, info, adapter, provider);
          resumed++;
        }
      } catch (error) {
        logger.error('Recovery failed for task', { taskId: info.taskId, error });
        // Clean up invalid recovery info
        if (taskManager.deleteRecoveryInfo) {
          await taskManager.deleteRecoveryInfo(info.scope);
        }
      }
    }

    return resumed;
  }

  /**
   * Resume polling for an external task
   */
  private resumePolling(
    taskManager: MediaTaskManagerDeps,
    info: TaskRecoveryInfo,
    adapter: MediaAdapter,
    provider: Provider,
  ): void {
    // Run polling in background
    this.pollForCompletionWithRecovery(
      adapter,
      info.externalTaskId,
      provider,
      info.scope,
      taskManager,
      () => {}, // No progress callback for resumed tasks
    )
      .then((output) => {
        void this.completeRecoveredTask(taskManager, info, output);
        // Clean up recovery info on completion
        if (taskManager.deleteRecoveryInfo) {
          taskManager.deleteRecoveryInfo(info.scope).catch((err) => {
            logger.error('Failed to delete recovery info', { error: err });
          });
        }
      })
      .catch((err) => {
        logger.error('Resumed polling failed', { taskId: info.taskId, error: err });
        if (taskManager.deleteRecoveryInfo) {
          taskManager.deleteRecoveryInfo(info.scope).catch(() => {});
        }
      });
  }

  /**
   * Create the executor function
   */
  private createExecutor(): TaskExecutor {
    return async (
      input: TaskInput,
      onProgress: (progress: number) => void,
      context?: TaskExecutionContext,
    ): Promise<TaskOutput> => {
      const payload = input.payload as unknown as MediaTaskPayload;
      const { generationType, providerId, modelId, request } = payload;

      // Get provider and model (uses configManager for config data)
      const provider = this.configManager.getProvider(providerId);
      const model = this.configManager.getModel(modelId);

      if (!provider || !model) {
        return {
          error: `Provider or model not found: ${providerId}/${modelId}`,
        };
      }

      throwIfAborted(context?.signal);
      const capabilities = model.capabilities ?? [];
      const imageMode =
        capabilities.includes('chat') &&
        (capabilities.includes('image_generation') || capabilities.includes('text_to_image'))
          ? ('chat' as const)
          : ('standard' as const);
      const resolved = resolveProvider(
        provider.type,
        {
          apiUrl: provider.apiUrl,
          apiKey: provider.apiKey ?? '',
          onExternalTaskId: async (externalTaskId) => {
            if (context?.scope && this.taskManager?.saveRecoveryInfo) {
              await this.taskManager.saveRecoveryInfo(context.scope, externalTaskId, provider.id);
            }
            context?.reportLifecycle({
              lifecycle: {
                costPhase: 'external-wait',
                recoverPolicy: 'resume-polling',
                interruptPolicy: 'detach-and-continue',
              },
            });
          },
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
    };
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
    context?: TaskExecutionContext,
  ): Promise<TaskOutput> {
    try {
      context?.reportLifecycle({ lifecycle: { costPhase: 'token-active' } });
      // Image generation via AI SDK
      if (generationType === 'text-to-image' || generationType === 'image-to-image') {
        const imageModel = resolved.image(model.name);
        if (!imageModel) {
          return { error: `Provider ${provider.type} does not expose an image model runtime.` };
        }

        const imgReq = await materializeImageRequestFileUris(
          request as ImageGenerationRequest,
          this.requestAssetMaterializer,
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
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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

      // Determine if the error is retryable (network, rate limit, server errors)
      if (retryable) {
        // Throw to let TaskManager's retry loop handle it
        throw new Error(errorContext);
      }

      // Non-retryable errors (auth, invalid request, content filter, or an
      // ambiguous paid submission) fail immediately and retain their policy.
      return {
        error: errorContext,
        failure: {
          ...(errorSummary.code ? { code: errorSummary.code } : {}),
          retryable: false,
        },
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
    context?: TaskExecutionContext,
  ): Promise<TaskOutput> {
    try {
      context?.reportLifecycle({ lifecycle: { costPhase: 'token-active' } });
      const preparedRequest =
        generationType === 'text-to-image' || generationType === 'image-to-image'
          ? await materializeImageRequestFileUris(
              request as ImageGenerationRequest,
              this.requestAssetMaterializer,
            )
          : generationType === 'text-to-video' ||
              generationType === 'image-to-video' ||
              generationType === 'video-to-video'
            ? await materializeVideoRequestFileUris(
                request as VideoGenerationRequest,
                this.requestAssetMaterializer,
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
            return adapter.generateImage(
              preparedRequest as ImageGenerationRequest,
              model,
              provider,
            );
          }
          if (
            generationType === 'text-to-video' ||
            generationType === 'image-to-video' ||
            generationType === 'video-to-video'
          ) {
            return adapter.generateVideo(
              preparedRequest as VideoGenerationRequest,
              model,
              provider,
            );
          }
          if (generationType === 'text-to-audio' || generationType === 'text-to-music') {
            return adapter.generateAudio(
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
        if (context?.scope && this.taskManager?.saveRecoveryInfo) {
          await this.taskManager.saveRecoveryInfo(
            context.scope,
            result.externalTaskId,
            provider.id,
          );
        }
        if (context?.scope && this.taskManager) {
          return this.pollForCompletionWithRecovery(
            adapter,
            result.externalTaskId,
            provider,
            context.scope,
            this.taskManager,
            onProgress,
            context.signal,
          );
        }
        context?.reportLifecycle({
          lifecycle: {
            costPhase: 'external-wait',
            recoverPolicy: 'resume-polling',
            interruptPolicy: 'detach-and-continue',
          },
        });
        const output = await this.pollForCompletion(
          adapter,
          result.externalTaskId,
          provider,
          onProgress,
          context?.signal,
        );
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
        return output;
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
      onProgress(100);
      context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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
    request: VideoGenerationRequest,
  ): string | { image: string; text?: string } {
    const image = request.referenceImageUrl ?? request.referenceImageBase64;
    return image ? { image, text: request.prompt } : request.prompt;
  }

  private buildVideoProviderOptions(
    request: VideoGenerationRequest,
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
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<TaskOutput> {
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
      } catch (_error) {
        // Transient error, continue with next interval
      }

      currentInterval = Math.min(currentInterval + config.backoffStepMs, config.maxIntervalMs);
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    return {
      error: `Generation timed out after ${elapsedSec}s`,
    };
  }

  /**
   * Poll for completion with recovery cleanup
   * Used when resuming tasks after restart
   */
  private async pollForCompletionWithRecovery(
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    taskScope: TaskRunScope,
    taskManager: MediaTaskManagerDeps,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<TaskOutput> {
    try {
      if (taskManager.updateLifecycle) {
        await taskManager.updateLifecycle(taskScope, {
          costPhase: 'external-wait',
          recoverPolicy: 'resume-polling',
          interruptPolicy: 'detach-and-continue',
        });
      }
      const output = await this.pollForCompletion(
        adapter,
        externalTaskId,
        provider,
        onProgress,
        signal,
      );
      if (taskManager.updateLifecycle) {
        await taskManager.updateLifecycle(taskScope, { costPhase: 'local-finalize' });
      }

      // Clean up recovery info on completion
      if (taskManager.deleteRecoveryInfo) {
        await taskManager.deleteRecoveryInfo(taskScope).catch((err) => {
          logger.error('Failed to delete recovery info', { error: err });
        });
      }

      return output;
    } catch (error) {
      // Detach-and-continue cancellation represents Host shutdown, so retain
      // recovery ownership for the next process instead of orphaning the task.
      if (signal?.aborted) {
        throw error;
      }
      if (taskManager.deleteRecoveryInfo) {
        await taskManager.deleteRecoveryInfo(taskScope).catch(() => {});
      }
      throw error;
    }
  }

  private async completeRecoveredTask(
    taskManager: MediaTaskManagerDeps,
    info: TaskRecoveryInfo,
    output: TaskOutput,
  ): Promise<void> {
    const existing = await taskManager.get(info.scope);
    if (!existing || !taskManager.upsertExternalTask) {
      return;
    }

    const terminalStatus = output.error ? 'failed' : 'completed';
    const nextTask: SerializableTask = {
      ...existing,
      status: terminalStatus,
      progress: output.error ? existing.progress : 100,
      output,
      ...(output.error ? { error: output.error } : {}),
      lifecycle: {
        ...(existing.lifecycle ?? {
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        }),
        costPhase: 'idle',
      },
      updatedAt: Date.now(),
    };

    await taskManager.upsertExternalTask(nextTask);
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

/**
 * Create media task input
 */
export function createMediaTaskInput(
  generationType: MediaGenerationType,
  providerId: string,
  modelId: string,
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
): TaskInput {
  const typeMap: Record<string, 'image_generation' | 'video_generation' | 'audio_generation'> = {
    'text-to-image': 'image_generation',
    'image-to-image': 'image_generation',
    'text-to-video': 'video_generation',
    'image-to-video': 'video_generation',
    'video-to-video': 'video_generation',
    'text-to-audio': 'audio_generation',
    'text-to-music': 'audio_generation',
  };
  const ownerConversationId = readMediaRequestOwnerConversationId(request.metadata);
  const ownerRunId = readMediaRequestOwnerRunId(request.metadata);
  const ownerRunStartedAt = readMediaRequestOwnerRunStartedAt(request.metadata);
  const resultDeliveryPolicy = readMediaRequestResultDeliveryPolicy(request.metadata);
  const resultDeliveryGroup = readMediaRequestResultDeliveryGroup(request.metadata);

  return {
    type: typeMap[generationType] || 'image_generation',
    lifecycle: {
      ...(ownerConversationId ? { ownerConversationId } : {}),
      ...(ownerRunId ? { ownerRunId } : {}),
      ...(ownerRunStartedAt !== undefined ? { ownerRunStartedAt } : {}),
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'resume-polling',
      ...(resultDeliveryPolicy ? { resultDeliveryPolicy } : {}),
      ...(resultDeliveryGroup ? { resultDeliveryGroup } : {}),
    },
    payload: {
      generationType,
      providerId,
      modelId,
      request,
    } as unknown as Record<string, unknown>,
    options: {
      retry: {
        maxRetries: 0,
        backoffMs: 3000,
      },
    },
  };
}

function readMediaRequestOwnerConversationId(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const value = metadata?.['conversationId'];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readMediaRequestOwnerRunId(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const value = metadata?.['runId'];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readMediaRequestOwnerRunStartedAt(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  const value = metadata?.['runStartedAt'];
  return typeof value === 'number' ? value : undefined;
}

function readMediaRequestResultDeliveryGroup(
  metadata: Record<string, unknown> | undefined,
): TaskResultDeliveryGroupMetadata | undefined {
  if (!metadata) return undefined;
  const value = metadata['resultDeliveryGroup'] ?? metadata['agentTaskResultDeliveryGroup'];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('Media task result delivery group must be an object.');
  }
  const taskGroupId = value['taskGroupId'];
  const resultDeliveryPolicy = value['resultDeliveryPolicy'];
  if (typeof taskGroupId !== 'string' || !taskGroupId.trim()) {
    throw new Error('Media task result delivery group taskGroupId must be a non-empty string.');
  }
  if (
    resultDeliveryPolicy !== 'wait-all' &&
    resultDeliveryPolicy !== 'continue-on-each' &&
    resultDeliveryPolicy !== 'continue-on-threshold'
  ) {
    throw new Error('Unknown media task result delivery group policy.');
  }
  return {
    taskGroupId,
    resultDeliveryPolicy,
    ...(Array.isArray(value['expectedTaskIds'])
      ? {
          expectedTaskIds: value['expectedTaskIds'].filter(
            (id): id is string => typeof id === 'string',
          ),
        }
      : {}),
    ...(typeof value['parentMessageId'] === 'string'
      ? { parentMessageId: value['parentMessageId'] }
      : {}),
    ...(typeof value['parentToolCallId'] === 'string'
      ? { parentToolCallId: value['parentToolCallId'] }
      : {}),
    ...(typeof value['thresholdCount'] === 'number'
      ? { thresholdCount: value['thresholdCount'] }
      : {}),
  };
}

function readMediaRequestResultDeliveryPolicy(
  metadata: Record<string, unknown> | undefined,
): AgentTaskResultDeliveryPolicy | undefined {
  if (!metadata) return undefined;
  const value = metadata['resultDeliveryPolicy'] ?? metadata['agentTaskResultDeliveryPolicy'];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('Media task result delivery policy must be an object.');
  }

  const kind = value['kind'];
  switch (kind) {
    case 'notify-only':
      return { kind };
    case 'append-observation':
      return { kind };
    case 'ask-user-to-continue':
    case 'auto-resume-agent':
      return {
        kind,
        ...(typeof value['prompt'] === 'string' ? { prompt: value['prompt'] } : {}),
      };
    default:
      throw new Error('Unknown media task result delivery policy.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
