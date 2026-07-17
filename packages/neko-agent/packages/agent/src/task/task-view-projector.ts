/**
 * Task view projection for observable background work.
 *
 * Extension hosts should provide only environment adapters, such as converting
 * local file paths into webview-safe URIs. Display and routing rules live here.
 */

import {
  validateChildRunScope,
  isPublicGeneratedAssetResultUri,
  stripRenderableGeneratedAssetPath,
  type Task,
  type TaskStatus,
  type TaskRunScope,
} from '@neko/shared';
import type { AgentBackgroundTask } from '@neko-agent/types';

export type BackgroundTaskViewType = 'image' | 'video' | 'audio';
export type BackgroundTaskViewStatus =
  'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundTaskView {
  scope: TaskRunScope;
  id: string;
  type: BackgroundTaskViewType;
  name: string;
  prompt: string;
  providerId: string;
  providerName: string;
  status: BackgroundTaskViewStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: AgentBackgroundTask['result'];
  error?: string;
}

export interface BackgroundTaskToolResultProjectionOptions {
  now?: () => number;
}

export interface BackgroundTaskProgressPatch {
  id: string;
  type?: BackgroundTaskViewType;
  status?: BackgroundTaskViewStatus;
  progress?: number;
  result?: AgentBackgroundTask['result'];
  error?: string;
  updatedAt?: string;
}

export interface BackgroundTaskFailureUpdateOptions {
  now?: () => number;
}

export function getTaskConversationId(task: Task | undefined): string | undefined {
  return task?.scope.conversationId;
}

export function matchesTaskConversation(task: Task, conversationId: string): boolean {
  return getTaskConversationId(task) === conversationId;
}

export function filterTasksForConversation(tasks: readonly Task[], conversationId: string): Task[] {
  return tasks.filter((task) => matchesTaskConversation(task, conversationId));
}

export function toBackgroundTaskView(task: Task): BackgroundTaskView {
  const payload = task.input.payload;
  const prompt = getStringValue(payload, 'prompt');

  return {
    scope: task.scope,
    id: task.id,
    type: toBackgroundTaskViewType(task),
    name: getDisplayName(task, payload, prompt),
    prompt: prompt ?? '',
    providerId: getStringValue(payload, 'providerId') ?? '',
    providerName: getStringValue(payload, 'providerName') ?? '',
    status: toBackgroundTaskViewStatus(task.status),
    progress: task.progress,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
    result: projectTaskResult(task.output?.data),
    error: task.error,
  };
}

export function toBackgroundTaskViewType(task: Task): BackgroundTaskViewType {
  if (task.type === 'video_generation') return 'video';
  if (task.type === 'audio_generation') return 'audio';

  const typeHint = getStringValue(task.input.payload, 'type') ?? '';
  if (typeHint.includes('video')) return 'video';
  if (typeHint.includes('audio') || typeHint.includes('music')) return 'audio';
  return 'image';
}

export function toBackgroundTaskViewStatus(status: TaskStatus): BackgroundTaskViewStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
  }
}

export function getTaskResultUrl(task: Task | undefined): string | undefined {
  const data = task?.output?.data;
  if (!isRecord(data)) return undefined;

  const firstUrl = getStringArray(data, 'urls').find(isStableTaskResultUrl);
  if (firstUrl) return firstUrl;

  const url = getStringValue(data, 'url');
  return url && isStableTaskResultUrl(url) ? url : undefined;
}

export function createBackgroundTaskViewFromToolResultData(
  data: unknown,
  options: BackgroundTaskToolResultProjectionOptions = {},
): BackgroundTaskView | null {
  if (!isRecord(data) || data.backgroundMode !== true || typeof data.taskId !== 'string') {
    return null;
  }
  const scopeResult = validateChildRunScope(data.taskScope);
  if (
    !scopeResult.ok ||
    scopeResult.scope.childKind !== 'task' ||
    scopeResult.scope.childRunId !== data.taskId
  ) {
    return null;
  }
  const scope = scopeResult.scope as TaskRunScope;

  const type = toBackgroundTaskViewTypeHint(getStringValue(data, 'type'));
  const message = getStringValue(data, 'message') ?? '';
  const routedTo = isRecord(data.routedTo) ? data.routedTo : undefined;
  const provider = getStringValue(routedTo, 'provider');
  const timestamp = new Date(options.now?.() ?? Date.now()).toISOString();

  return {
    scope,
    id: data.taskId,
    type,
    name: message.slice(0, 50) || `${type} generation`,
    prompt: message,
    providerId: provider ?? 'unknown',
    providerName: provider ?? 'AI Provider',
    status: 'queued',
    progress: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mergeBackgroundTaskProgressView(
  task: BackgroundTaskView,
  progress: BackgroundTaskProgressPatch,
): BackgroundTaskView {
  if (progress.id !== task.id) {
    return task;
  }

  return {
    ...task,
    type: progress.type ?? task.type,
    status: progress.status ?? task.status,
    progress: progress.progress ?? task.progress,
    result: sanitizeBackgroundTaskResult(progress.result ?? task.result),
    error: progress.error ?? task.error,
    updatedAt: progress.updatedAt ?? task.updatedAt,
  };
}

export function buildBackgroundTaskFailureUpdateView(
  task: Task,
  error: unknown,
  options: BackgroundTaskFailureUpdateOptions = {},
): BackgroundTaskView {
  return {
    ...toBackgroundTaskView(task),
    status: 'failed',
    error: formatTaskFailureMessage(error),
    updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
  };
}

function toBackgroundTaskViewTypeHint(typeHint: string | undefined): BackgroundTaskViewType {
  if (typeHint === 'video') return 'video';
  if (typeHint === 'audio') return 'audio';
  return 'image';
}

function getDisplayName(
  task: Task,
  payload: Record<string, unknown>,
  prompt: string | undefined,
): string {
  if (prompt && prompt.length > 0) {
    return prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
  }

  const name = getStringValue(payload, 'name');
  if (name) return name;

  const content = getStringValue(payload, 'content');
  if (content) return content;

  return formatTaskType(task.type);
}

function projectTaskResult(resultData: unknown): AgentBackgroundTask['result'] | undefined {
  if (!isRecord(resultData)) return undefined;

  const persistedUrls = getStringArray(resultData, 'urls').filter(isStableTaskResultUrl);
  const singleUrl = getStringValue(resultData, 'url');
  const outputUrls = persistedUrls.length > 0 ? persistedUrls : [];
  if (singleUrl && isStableTaskResultUrl(singleUrl) && outputUrls.length === 0) {
    outputUrls.push(singleUrl);
  }

  const rawThumbnailUrl = getStringValue(resultData, 'thumbnailUrl');
  const thumbnailUrl =
    rawThumbnailUrl && isStableTaskResultUrl(rawThumbnailUrl) ? rawThumbnailUrl : undefined;
  const width = getNumberValue(resultData, 'width');
  const height = getNumberValue(resultData, 'height');
  const duration = getNumberValue(resultData, 'duration');
  const assets = getRenderableGeneratedAssets(resultData, 'assets');

  return sanitizeBackgroundTaskResult({
    urls: outputUrls,
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(assets !== undefined ? { assets } : {}),
  });
}

function formatTaskType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatTaskFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Retry failed: ${message}`;
}

function getStringValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getNumberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function getRenderableGeneratedAssets(
  record: Record<string, unknown>,
  key: string,
): NonNullable<AgentBackgroundTask['result']>['assets'] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;

  const assets = value.filter(isRenderableGeneratedAsset).map(stripRenderableAssetPath);
  return assets.length > 0 ? assets : undefined;
}

function isRenderableGeneratedAsset(
  value: unknown,
): value is NonNullable<NonNullable<AgentBackgroundTask['result']>['assets']>[number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.generatedAt === 'string' &&
    typeof value.renderUri === 'string'
  );
}

function sanitizeBackgroundTaskResult(
  result: AgentBackgroundTask['result'] | undefined,
): AgentBackgroundTask['result'] | undefined {
  if (!result) return undefined;

  const urls = result.urls.filter(isStableTaskResultUrl);
  const thumbnailUrl =
    result.thumbnailUrl && isStableTaskResultUrl(result.thumbnailUrl)
      ? result.thumbnailUrl
      : undefined;
  const assets = result.assets?.map(stripRenderableAssetPath) ?? [];
  if (urls.length === 0 && !thumbnailUrl && assets.length === 0) {
    return undefined;
  }

  return {
    urls,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(result.width !== undefined ? { width: result.width } : {}),
    ...(result.height !== undefined ? { height: result.height } : {}),
    ...(result.duration !== undefined ? { duration: result.duration } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}

function stripRenderableAssetPath(
  asset: NonNullable<NonNullable<AgentBackgroundTask['result']>['assets']>[number],
): NonNullable<NonNullable<AgentBackgroundTask['result']>['assets']>[number] {
  return stripRenderableGeneratedAssetPath(asset);
}

function isStableTaskResultUrl(value: string): boolean {
  return isPublicGeneratedAssetResultUri(value) && !isWebviewRenderUri(value);
}

function isWebviewRenderUri(value: string): boolean {
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return Boolean(scheme?.includes('webview')) || /^webview-/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
