import type { GeneratedAsset, RenderableGeneratedAsset } from '@neko/shared';
import {
  finalizeCompletedMediaTaskOutputs,
  type FinalizeCompletedMediaTaskOutputsInput,
} from './media-task-result';
import {
  buildMediaTaskProgressDeliveryPlan,
  type MediaTaskProgressDeliveryPlan,
} from './media-task-progress-plan';
import {
  createMediaTaskView,
  createMediaTaskProgressView,
  type MediaTaskView,
  type MediaTaskProgressView,
} from './media-task-view';
import type { GeneratedMediaTaskType } from './media-generated-asset';
import type { MediaTask } from './types';

export interface BuildMediaTaskProgressViewDeliveryInput extends Omit<
  FinalizeCompletedMediaTaskOutputsInput,
  'taskType'
> {
  readonly task: MediaTask;
  readonly taskType: GeneratedMediaTaskType;
  readonly workspaceRoot?: string;
  readonly showSaveNotification?: boolean;
  readonly resolveResultUrl?: (url: string) => string | undefined;
  readonly toViewAsset?: (asset: GeneratedAsset) => RenderableGeneratedAsset | undefined;
  readonly now?: () => Date;
}

export interface MediaTaskProgressViewDelivery {
  readonly view: MediaTaskProgressView;
  readonly deliveryPlan: MediaTaskProgressDeliveryPlan;
}

export interface MediaTaskViewDelivery {
  readonly view: MediaTaskView;
  readonly deliveryPlan: MediaTaskProgressDeliveryPlan;
}

export async function buildMediaTaskViewDelivery(
  input: BuildMediaTaskProgressViewDeliveryInput,
): Promise<MediaTaskViewDelivery> {
  const deliveryPlan = await buildMediaTaskDeliveryPlan(input);
  const { urls, thumbnailUrl, assets } = projectDeliveryPresentation(input, deliveryPlan);

  return {
    view: createMediaTaskView(input.task, {
      urls,
      thumbnailUrl,
      assets,
    }),
    deliveryPlan,
  };
}

export async function buildMediaTaskProgressViewDelivery(
  input: BuildMediaTaskProgressViewDeliveryInput,
): Promise<MediaTaskProgressViewDelivery> {
  const deliveryPlan = await buildMediaTaskDeliveryPlan(input);
  const { urls, thumbnailUrl, assets } = projectDeliveryPresentation(input, deliveryPlan);

  return {
    view: createMediaTaskProgressView({
      task: input.task,
      urls,
      thumbnailUrl,
      assets,
      now: input.now,
    }),
    deliveryPlan,
  };
}

async function buildMediaTaskDeliveryPlan(
  input: BuildMediaTaskProgressViewDeliveryInput,
): Promise<MediaTaskProgressDeliveryPlan> {
  const finalized = await finalizeCompletedMediaTaskOutputs({
    task: input.task,
    taskType: input.taskType,
    outputDir: input.outputDir,
    saveOutputs: input.saveOutputs,
    transcodeFile: input.transcodeFile,
    assetIndex: input.assetIndex,
    computeContentDigest: input.computeContentDigest,
    logger: input.logger,
  });

  const deliveryPlan = buildMediaTaskProgressDeliveryPlan({
    status: input.task.status,
    taskType: input.taskType,
    finalized,
    workspaceRoot: input.workspaceRoot,
    showSaveNotification: input.showSaveNotification,
  });

  return deliveryPlan;
}

function projectDeliveryPresentation(
  input: BuildMediaTaskProgressViewDeliveryInput,
  deliveryPlan: MediaTaskProgressDeliveryPlan,
): {
  readonly urls: string[];
  readonly thumbnailUrl?: string;
  readonly assets: RenderableGeneratedAsset[];
} {
  const urls = deliveryPlan.resultUrls
    .map((url) => (input.resolveResultUrl ? input.resolveResultUrl(url) : url))
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
  const thumbnailUrl = deliveryPlan.thumbnailUrl
    ? input.resolveResultUrl
      ? input.resolveResultUrl(deliveryPlan.thumbnailUrl)
      : deliveryPlan.thumbnailUrl
    : undefined;
  const assets = input.toViewAsset
    ? deliveryPlan.generatedAssets
        .map((asset) => input.toViewAsset!(asset))
        .filter((asset): asset is RenderableGeneratedAsset => asset !== undefined)
    : [];

  return {
    urls,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    assets,
  };
}
