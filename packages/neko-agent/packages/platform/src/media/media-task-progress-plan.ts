import type { GeneratedAsset } from '@neko/shared';
import type { GeneratedMediaTaskType } from './media-generated-asset';
import type { FinalizedMediaTaskOutputs } from './media-task-result';
import type { MediaTaskStatus } from './types';

export const MEDIA_TASK_SAVE_NOTIFICATION_ACTION = 'Show in Folder';

export interface MediaTaskSaveNotificationPlan {
  label: string;
  filePath: string;
  displayRef: string;
  message: string;
  actionLabel: typeof MEDIA_TASK_SAVE_NOTIFICATION_ACTION;
}

export interface MediaTaskProgressDeliveryPlan {
  resultUrls: string[];
  thumbnailUrl?: string;
  hostOutputPaths: string[];
  generatedAssets: GeneratedAsset[];
  shouldPersistResultUrls: boolean;
  shouldUnsubscribe: boolean;
  notification?: MediaTaskSaveNotificationPlan;
}

export interface BuildMediaTaskProgressDeliveryPlanInput {
  status: MediaTaskStatus;
  taskType: GeneratedMediaTaskType;
  finalized: FinalizedMediaTaskOutputs;
  workspaceRoot?: string;
  showSaveNotification?: boolean;
}

export function buildMediaTaskProgressDeliveryPlan(
  input: BuildMediaTaskProgressDeliveryPlanInput,
): MediaTaskProgressDeliveryPlan {
  const resultUrls = [...input.finalized.resultUrls];
  const generatedAssets = [...input.finalized.generatedAssets];
  const completed = input.status === 'completed';
  const notification = buildSaveNotificationPlan({
    status: input.status,
    taskType: input.taskType,
    resultUrls,
    hostOutputPaths: input.finalized.hostOutputPaths,
    generatedAssets,
    workspaceRoot: input.workspaceRoot,
    showSaveNotification: input.showSaveNotification,
  });

  return {
    resultUrls,
    thumbnailUrl: input.finalized.thumbnailUrl,
    hostOutputPaths: [...input.finalized.hostOutputPaths],
    generatedAssets,
    shouldPersistResultUrls: completed && hasPersistableResultRef(resultUrls, generatedAssets),
    shouldUnsubscribe: isTerminalMediaTaskStatus(input.status),
    ...(notification ? { notification } : {}),
  };
}

export function isTerminalMediaTaskStatus(status: MediaTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function buildSaveNotificationPlan(input: {
  status: MediaTaskStatus;
  taskType: GeneratedMediaTaskType;
  resultUrls: readonly string[];
  hostOutputPaths: readonly string[];
  generatedAssets: readonly GeneratedAsset[];
  workspaceRoot?: string;
  showSaveNotification?: boolean;
}): MediaTaskSaveNotificationPlan | undefined {
  if (
    input.status !== 'completed' ||
    !input.workspaceRoot ||
    input.generatedAssets.length === 0 ||
    input.showSaveNotification === false
  ) {
    return undefined;
  }

  const filePath = input.hostOutputPaths[0];
  if (!filePath) return undefined;

  const label = toMediaTaskNotificationLabel(input.taskType);
  const displayRef = getGeneratedAssetDisplayRef(input.generatedAssets[0]);
  return {
    label,
    filePath,
    displayRef,
    message: `${label} saved as ${displayRef}`,
    actionLabel: MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
  };
}

function getGeneratedAssetDisplayRef(asset: GeneratedAsset | undefined): string {
  const uri = asset?.assetRef?.uri;
  if (uri && !isManagedCacheReference(uri)) {
    return uri;
  }
  return asset?.id ?? 'generated asset';
}

function isManagedCacheReference(value: string): boolean {
  return value.replace(/\\/g, '/').includes('/.neko/.cache/');
}

function hasPersistableResultRef(
  resultUrls: readonly string[],
  generatedAssets: readonly GeneratedAsset[],
): boolean {
  return (
    generatedAssets.some((asset) => Boolean(asset.assetRef?.uri)) ||
    resultUrls.some((url) => url.startsWith('http://') || url.startsWith('https://'))
  );
}

function toMediaTaskNotificationLabel(taskType: GeneratedMediaTaskType): string {
  switch (taskType) {
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'image':
      return 'Image';
  }
}
