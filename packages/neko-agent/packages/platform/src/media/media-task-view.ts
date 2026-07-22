import {
  isPublicGeneratedAssetResultUri,
  type RenderableGeneratedAsset,
  type TaskRunScope,
} from '@neko/shared';
import type { MediaGenerationType, MediaOutput, MediaTask, MediaTaskStatus } from './types';

export type MediaBackgroundTaskType = 'image' | 'video' | 'audio';
export type MediaBackgroundTaskStatus =
  'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export function toMediaBackgroundTaskType(type: MediaGenerationType): MediaBackgroundTaskType {
  switch (type) {
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return 'video';
    case 'text-to-audio':
    case 'text-to-music':
      return 'audio';
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
    case 'workflow':
      return 'image';
  }
}

export function toMediaBackgroundTaskStatus(status: MediaTaskStatus): MediaBackgroundTaskStatus {
  return status === 'pending' ? 'queued' : status;
}

function isStableMediaTaskResultUrl(value: string): boolean {
  return isPublicGeneratedAssetResultUri(value);
}

export function getMediaTaskConversationId(task: MediaTask | undefined): string | undefined {
  const value = task?.request.metadata?.conversationId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function matchesMediaTaskConversation(
  task: MediaTask | undefined,
  conversationId: string,
): boolean {
  return getMediaTaskConversationId(task) === conversationId;
}

export interface MediaTaskProgressViewInput {
  task: MediaTask;
  urls?: readonly string[];
  thumbnailUrl?: string;
  assets?: readonly RenderableGeneratedAsset[];
  now?: () => Date;
}

export interface MediaTaskProgressView {
  scope: TaskRunScope;
  id: string;
  type: MediaBackgroundTaskType;
  status: MediaBackgroundTaskStatus;
  progress: number;
  result?: {
    urls: string[];
    thumbnailUrl?: string;
    assets?: RenderableGeneratedAsset[];
  };
  error?: string;
  updatedAt: string;
}

export interface MediaTaskOutputView {
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface MediaTaskResultView {
  urls: string[];
  thumbnailUrl?: string;
  assets?: RenderableGeneratedAsset[];
}

export interface MediaTaskViewOptions {
  urls?: readonly string[];
  thumbnailUrl?: string;
  assets?: readonly RenderableGeneratedAsset[];
}

export interface MediaTaskView {
  scope: TaskRunScope;
  id: string;
  type: MediaBackgroundTaskType;
  status: MediaBackgroundTaskStatus;
  progress: number;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  outputs?: MediaTaskOutputView[];
  result?: MediaTaskResultView;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  request: {
    prompt: string;
  };
}

export function createMediaTaskView(
  task: MediaTask,
  options: MediaTaskViewOptions = {},
): MediaTaskView {
  const outputs = task.outputs
    ?.map(toMediaTaskOutputView)
    .filter((output): output is MediaTaskOutputView => output !== undefined);
  const result = createMediaTaskResultView(task, options);

  return {
    scope: task.scope,
    id: task.id,
    type: toMediaBackgroundTaskType(task.type),
    status: toMediaBackgroundTaskStatus(task.status),
    progress: task.progress,
    providerId: task.providerId ?? '',
    modelId: task.modelId ?? '',
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
    ...(outputs && outputs.length > 0 ? { outputs } : {}),
    ...(result ? { result } : {}),
    ...(task.error
      ? {
          error: {
            code: task.error.code,
            message: task.error.message,
            retryable: task.error.retryable,
          },
        }
      : {}),
    request: {
      prompt: task.request?.prompt ?? '',
    },
  };
}

function createMediaTaskResultView(
  task: MediaTask,
  options: MediaTaskViewOptions,
): MediaTaskResultView | undefined {
  const urls = options.urls?.filter(isStableMediaTaskResultUrl) ?? [];
  const assets = stripRenderableAssetPaths(options.assets ?? []);

  if (urls.length === 0 && assets.length === 0) return undefined;

  return {
    urls: [...urls],
    ...(options.thumbnailUrl && isStableMediaTaskResultUrl(options.thumbnailUrl)
      ? { thumbnailUrl: options.thumbnailUrl }
      : {}),
    ...(assets.length > 0 ? { assets: [...assets] } : {}),
  };
}

export function createMediaTaskProgressView(
  input: MediaTaskProgressViewInput,
): MediaTaskProgressView {
  const urls = input.urls?.filter(isStableMediaTaskResultUrl) ?? [];
  const assets = stripRenderableAssetPaths(input.assets ?? []);

  return {
    scope: input.task.scope,
    id: input.task.id,
    type: toMediaBackgroundTaskType(input.task.type),
    status: toMediaBackgroundTaskStatus(input.task.status),
    progress: input.task.progress,
    result:
      urls.length > 0 || assets.length > 0
        ? {
            urls: [...urls],
            ...(input.thumbnailUrl && isStableMediaTaskResultUrl(input.thumbnailUrl)
              ? { thumbnailUrl: input.thumbnailUrl }
              : {}),
            ...(assets.length > 0 ? { assets: [...assets] } : {}),
          }
        : undefined,
    error: input.task.error?.message,
    updatedAt: (input.now?.() ?? new Date()).toISOString(),
  };
}

function toMediaTaskOutputView(output: MediaOutput): MediaTaskOutputView | undefined {
  if (!isStableMediaTaskResultUrl(output.url)) return undefined;
  const thumbnailUrl =
    output.thumbnailUrl && isStableMediaTaskResultUrl(output.thumbnailUrl)
      ? output.thumbnailUrl
      : undefined;
  return {
    url: output.url,
    ...(output.width !== undefined ? { width: output.width } : {}),
    ...(output.height !== undefined ? { height: output.height } : {}),
    ...(output.duration !== undefined ? { duration: output.duration } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function toIsoString(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function stripRenderableAssetPaths(
  assets: readonly RenderableGeneratedAsset[],
): RenderableGeneratedAsset[] {
  return assets.map((asset) => {
    if (!('path' in asset)) return asset;
    const { path: _path, ...assetWithoutPath } = asset as RenderableGeneratedAsset & {
      readonly path?: unknown;
    };
    return assetWithoutPath;
  });
}
