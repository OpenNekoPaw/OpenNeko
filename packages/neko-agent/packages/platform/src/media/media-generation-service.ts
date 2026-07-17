/**
 * Media Generation Service
 *
 * High-level API for media generation (images, videos, audio)
 *
 * NOTE: TaskManager has been moved to @neko/agent package.
 * This service now accepts ITaskManager interface for flexibility.
 */

import type { Task, ITaskManager, TaskRunOwnerScope, TaskRunScope } from '@neko/shared';
import type {
  MediaGenerationType,
  MediaTask,
  MediaProgressCallback,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaOutput,
  MediaAdapterError,
} from './types';
import { downloadMediaOutputs, type DownloadMediaOptions } from './media-file-downloader';
import type { ConfigManager } from '../config/config-manager';
import { MediaRoutingManager } from './routing/media-routing-manager';
import { createMediaTaskInput } from './media-task-executor';
import { resolveImageGenerationType, resolveVideoGenerationType } from './media-generation-kind';
import {
  validateProviderImageRequest,
  validateProviderVideoRequest,
} from './media-operation-capabilities';

/**
 * Extended task manager interface with updateOutputData support
 */
export interface IMediaTaskManager extends ITaskManager {
  /** Update task output data (e.g., to store local file paths) */
  updateOutputData?(scope: TaskRunScope, outputData: Record<string, unknown>): Promise<boolean>;
}

/**
 * Media generation service options
 */
export interface MediaGenerationServiceOptions {
  /** Default timeout for generation in ms (default: 10 min) */
  defaultTimeoutMs?: number;
}

/**
 * Media generation service - unified API for all media generation
 */
export class MediaGenerationService {
  private taskManager: IMediaTaskManager;
  private configManager: ConfigManager;
  private routingManager: MediaRoutingManager;
  private defaultTimeoutMs: number;

  constructor(
    taskManager: IMediaTaskManager,
    configManager: ConfigManager,
    routingManager: MediaRoutingManager,
    options: MediaGenerationServiceOptions = {},
  ) {
    this.taskManager = taskManager;
    this.configManager = configManager;
    this.routingManager = routingManager;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000;
  }

  /**
   * Generate an image
   */
  async generateImage(request: ImageGenerationRequest): Promise<MediaTask> {
    return this.submitGeneration(resolveImageGenerationType(request), request);
  }

  /**
   * Generate a video
   */
  async generateVideo(request: VideoGenerationRequest): Promise<MediaTask> {
    return this.submitGeneration(resolveVideoGenerationType(request), request);
  }

  /**
   * Generate audio/music
   */
  async generateAudio(request: AudioGenerationRequest): Promise<MediaTask> {
    const generationType: MediaGenerationType = request.isMusic ? 'text-to-music' : 'text-to-audio';

    return this.submitGeneration(generationType, request);
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(taskScope: TaskRunScope, timeoutMs?: number): Promise<MediaTask> {
    const task = await this.taskManager.waitForCompletion(
      taskScope,
      timeoutMs ?? this.defaultTimeoutMs,
    );
    return this.convertToMediaTask(task);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskScope: TaskRunScope): Promise<boolean> {
    return this.taskManager.cancel(taskScope);
  }

  /**
   * Delete a task (remove from storage)
   */
  async deleteTask(taskScope: TaskRunScope): Promise<boolean> {
    if (this.taskManager.delete) {
      return this.taskManager.delete(taskScope);
    }
    return false;
  }

  /**
   * Update task outputs with local file paths
   * Call this after downloading remote outputs to local storage
   */
  async updateTaskOutputs(taskScope: TaskRunScope, outputs: MediaOutput[]): Promise<boolean> {
    if (this.taskManager.updateOutputData) {
      return this.taskManager.updateOutputData(taskScope, { outputs });
    }
    return false;
  }

  /**
   * Download completed task outputs to a local directory.
   *
   * Retrieves outputs from the task and calls the shared downloader. The
   * returned filesystem paths are host-internal side-effect data for reveal/open
   * flows; task output URLs keep their provider or stable result identity.
   *
   * @param taskId    - Task whose outputs should be saved
   * @param outputDir - Absolute path to target directory (created if absent)
   * @param options   - Optional transcoding callback (needed for Electron webview compat)
   * @returns Local file paths (same length/order as task outputs)
   */
  async saveOutputs(
    taskScope: TaskRunScope,
    outputDir: string,
    options?: DownloadMediaOptions,
  ): Promise<string[]> {
    const task = await this.getTask(taskScope);
    if (!task?.outputs || task.outputs.length === 0) return [];

    return downloadMediaOutputs(taskScope.childRunId, task.type, task.outputs, outputDir, options);
  }

  /**
   * Get task status
   */
  async getTask(taskScope: TaskRunScope): Promise<MediaTask | undefined> {
    const task = await this.taskManager.get(taskScope);
    return task ? this.convertToMediaTask(task) : undefined;
  }

  /**
   * Subscribe to task progress
   */
  onProgress(taskScope: TaskRunScope, callback: MediaProgressCallback): () => void {
    return this.taskManager.onProgress(taskScope, (task) => {
      callback(this.convertToMediaTask(task));
    });
  }

  /**
   * Submit a generation request
   */
  private async submitGeneration(
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
  ): Promise<MediaTask> {
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
    const capabilityDiagnostics = generationType.includes('video')
      ? validateProviderVideoRequest(provider.type, request as VideoGenerationRequest)
      : generationType.includes('image')
        ? validateProviderImageRequest(provider.type, request as ImageGenerationRequest)
        : [];
    const capabilityErrors = capabilityDiagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    );
    if (capabilityErrors.length > 0) {
      throw new Error(
        `Media provider capability negotiation failed: ${capabilityErrors
          .map((diagnostic) => diagnostic.message)
          .join('; ')}`,
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

    // Create task input
    const taskInput = createMediaTaskInput(
      generationType,
      routing.providerId,
      routing.modelId,
      request,
    );

    // Submit to task manager
    const owner = this.readMediaTaskOwner(request.metadata);
    const taskScope = await this.taskManager.submit(taskInput, owner);

    // Return initial task state
    return {
      scope: taskScope,
      id: taskScope.childRunId,
      type: generationType,
      status: 'pending',
      progress: 0,
      providerId: routing.providerId,
      modelId: routing.modelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      request,
    };
  }

  /**
   * Convert internal task to MediaTask
   */
  private convertToMediaTask(task: Task): MediaTask {
    const payload = task.input.payload as {
      generationType: MediaGenerationType;
      providerId: string;
      modelId: string;
      request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
    };

    const outputs: MediaOutput[] | undefined =
      task.output?.data && typeof task.output.data === 'object'
        ? (task.output.data as { outputs?: MediaOutput[] }).outputs
        : undefined;

    const error: MediaAdapterError | undefined =
      task.error || task.output?.error
        ? {
            code: task.output?.failure?.code ?? 'TASK_ERROR',
            message: task.error || task.output?.error || 'Unknown error',
            retryable: task.output?.failure?.retryable ?? false,
          }
        : undefined;

    return {
      scope: task.scope,
      id: task.id,
      type: payload.generationType,
      status: this.mapTaskStatus(task.status),
      progress: task.progress,
      providerId: payload.providerId,
      modelId: payload.modelId,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
      outputs,
      error,
      request: payload.request,
    };
  }

  private readMediaTaskOwner(metadata: Record<string, unknown> | undefined): TaskRunOwnerScope {
    const conversationId = this.readRequiredMetadataString(metadata, 'conversationId');
    const runId = this.readRequiredMetadataString(metadata, 'runId');
    return { conversationId, runId, parentRunId: runId };
  }

  private readRequiredMetadataString(
    metadata: Record<string, unknown> | undefined,
    key: 'conversationId' | 'runId',
  ): string {
    const value = metadata?.[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Media generation requires non-empty metadata.${key} task ownership`);
    }
    return value.trim();
  }

  /**
   * Map task status to media task status
   */
  private mapTaskStatus(
    status: string,
  ): 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'running':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }
}
