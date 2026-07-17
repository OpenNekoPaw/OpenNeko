import * as path from 'node:path';
import type {
  CanvasWorkspaceProjectionResult,
  GeneratedAsset,
  GeneratedAssetRevisionRef,
  RenderableGeneratedAsset,
  TaskRunScope,
} from '@neko/shared';
import {
  createGeneratedAssetWorkspaceProjectionRequest,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
} from '@neko/shared';
import {
  buildMediaTaskDeliverySettingsPlan,
  buildMediaTaskProgressViewDelivery,
  buildMediaTaskViewDelivery,
  GeneratedAssetIndex,
  type DownloadMediaOptions,
  type MediaTask,
  type MediaTaskProgressViewDelivery,
  type MediaTaskViewDelivery,
  type Platform,
} from '@neko/platform';
import type { GeneratedMediaTaskType } from '@neko/platform/media/media-generated-asset';
import { NodeWorkspaceBoardProjector } from './node-workspace-board-projector';

export interface NodeMediaTaskDeliveryHostDeps {
  readonly platform?: Platform;
  readonly workspaceRoot: string;
  readonly assetIndex: GeneratedAssetIndex;
  readonly onWorkspaceBoardProjection?: (
    results: readonly CanvasWorkspaceProjectionResult[],
  ) => void;
  readonly onGeneratedOutputDelivery?: (
    lifecycles: readonly GeneratedAssetRevisionRef[],
  ) => void;
}

export class NodeMediaTaskDeliveryHost {
  private readonly assetIndex: GeneratedAssetIndex;
  private readonly workspaceBoardProjector: NodeWorkspaceBoardProjector;

  constructor(private readonly deps: NodeMediaTaskDeliveryHostDeps) {
    this.assetIndex = deps.assetIndex;
    this.workspaceBoardProjector = new NodeWorkspaceBoardProjector(deps.workspaceRoot);
  }

  dispose(): void {}

  async createTaskViewDelivery(task: MediaTask): Promise<MediaTaskViewDelivery> {
    const delivery = await buildMediaTaskViewDelivery({
      ...this.createDeliveryInput(task, toGeneratedMediaTaskType(task.type)),
      task,
    });
    await this.projectGeneratedAssets(delivery.deliveryPlan.generatedAssets);
    return delivery;
  }

  async createProgressViewDelivery(
    task: MediaTask,
    taskType: GeneratedMediaTaskType,
  ): Promise<MediaTaskProgressViewDelivery> {
    const delivery = await buildMediaTaskProgressViewDelivery({
      ...this.createDeliveryInput(task, taskType),
      task,
    });
    await this.projectGeneratedAssets(delivery.deliveryPlan.generatedAssets);
    return delivery;
  }

  private createDeliveryInput(task: MediaTask, taskType: GeneratedMediaTaskType) {
    const settingsPlan = buildMediaTaskDeliverySettingsPlan({
      workspaceRoot: this.deps.workspaceRoot,
      defaultOutputDir: resolveGeneratedOutputDir(this.deps.workspaceRoot, taskType),
      configuredOutputDir: '',
      configuredShowSaveNotification: false,
    });

    return {
      task,
      taskType,
      outputDir: settingsPlan.outputDir,
      saveOutputs: (scope: TaskRunScope, dir: string, options?: DownloadMediaOptions) =>
        this.deps.platform?.media?.saveOutputs(scope, dir, options) ?? Promise.resolve([]),
      assetIndex: this.assetIndex,
      workspaceRoot: settingsPlan.workspaceRoot,
      showSaveNotification: settingsPlan.showSaveNotification,
      resolveResultUrl: (url: string) => url,
      toViewAsset,
    };
  }

  private async projectGeneratedAssets(assets: readonly GeneratedAsset[]): Promise<void> {
    if (assets.length === 0) return;
    this.deps.onGeneratedOutputDelivery?.(
      assets.flatMap((asset) => (asset.lifecycle ? [asset.lifecycle] : [])),
    );
    const workspaceUri = this.workspaceBoardProjector.workspaceUri();
    const results = await Promise.all(
      assets.map((asset) =>
        asset.lifecycle
          ? this.workspaceBoardProjector.project(
              createGeneratedAssetWorkspaceProjectionRequest(asset, workspaceUri),
            )
          : Promise.resolve({
              version: 1 as const,
              status: 'blocked' as const,
              diagnostics: [
                {
                  code: 'invalid-resource-ref' as const,
                  severity: 'error' as const,
                  message: `Generated output ${asset.id} has no durable lifecycle reference.`,
                },
              ],
            }),
      ),
    );
    this.deps.onWorkspaceBoardProjection?.(results);
  }
}

function resolveGeneratedOutputDir(
  workspaceRoot: string,
  mediaKind: GeneratedMediaTaskType | 'file',
): string {
  return path.join(workspaceRoot, resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }));
}

function toGeneratedMediaTaskType(type: MediaTask['type']): GeneratedMediaTaskType {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}

function toViewAsset(asset: GeneratedAsset): RenderableGeneratedAsset | undefined {
  const renderUri = asset.assetRef?.uri;
  if (!renderUri) {
    return undefined;
  }
  const { path: _path, ...assetWithoutPath } = asset;
  return {
    ...assetWithoutPath,
    renderUri,
  } as RenderableGeneratedAsset;
}
