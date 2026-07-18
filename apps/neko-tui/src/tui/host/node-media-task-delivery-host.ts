import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  WorkspaceBoardDeliveryCoordinator,
  WorkspaceBoardDeliveryLedger,
} from '@neko-canvas/domain';
import type { CreatorVisibleArtifactCandidate } from '@neko/agent/runtime';
import type {
  CanvasWorkspaceProjectionResult,
  CanvasWorkspaceProjectionArtifact,
  CanvasWorkspaceProjectionRequest,
  GeneratedAsset,
  GeneratedAssetRevisionRef,
  RenderableGeneratedAsset,
  TaskRunScope,
  LocalMetadataStore,
} from '@neko/shared';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createGeneratedAssetsWorkspaceDeliveryRequest,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  stripRenderableGeneratedAssetPath,
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
import { NodeWorkspaceBoardMutationPort } from './node-workspace-board-mutation-port';

export interface NodeMediaTaskDeliveryHostDeps {
  readonly platform?: Platform;
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly metadataStore: LocalMetadataStore;
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
  private readonly workspaceBoardMutation: NodeWorkspaceBoardMutationPort;
  private readonly workspaceBoardDelivery: WorkspaceBoardDeliveryCoordinator;

  constructor(private readonly deps: NodeMediaTaskDeliveryHostDeps) {
    this.assetIndex = deps.assetIndex;
    this.workspaceBoardMutation = new NodeWorkspaceBoardMutationPort(deps.workspaceRoot);
    this.workspaceBoardDelivery = new WorkspaceBoardDeliveryCoordinator({
      ledger: new WorkspaceBoardDeliveryLedger({
        metadataStore: deps.metadataStore,
        workspaceId: deps.workspaceId,
      }),
      mutation: this.workspaceBoardMutation,
      holderId: `tui:${process.pid}:${randomUUID()}`,
    });
  }

  dispose(): void {}

  async resumePendingWorkspaceBoardDeliveries(): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    const results = await this.workspaceBoardDelivery.flush();
    this.deps.onWorkspaceBoardProjection?.(results);
    return results;
  }

  async createTaskViewDelivery(task: MediaTask): Promise<MediaTaskViewDelivery> {
    const delivery = await buildMediaTaskViewDelivery({
      ...this.createDeliveryInput(task, toGeneratedMediaTaskType(task.type)),
      task,
    });
    await this.deliverGeneratedAssets(delivery.deliveryPlan.generatedAssets);
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
    await this.deliverGeneratedAssets(delivery.deliveryPlan.generatedAssets);
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

  private async deliverGeneratedAssets(assets: readonly GeneratedAsset[]): Promise<void> {
    if (assets.length === 0) return;
    this.deps.onGeneratedOutputDelivery?.(
      assets.flatMap((asset) => (asset.lifecycle ? [asset.lifecycle] : [])),
    );
    let results: readonly CanvasWorkspaceProjectionResult[];
    try {
      const request = createGeneratedAssetsWorkspaceDeliveryRequest(assets, {
        workspaceId: this.deps.workspaceId,
        workspaceUri: this.workspaceBoardMutation.workspaceUri(),
        sourceHost: 'tui',
      });
      results = await this.workspaceBoardDelivery.enqueue(request);
    } catch (error) {
      results = [blockedProjection(error)];
    }
    this.deps.onWorkspaceBoardProjection?.(results);
  }

  async deliverCreatorVisibleArtifacts(input: {
    readonly deliveryId: string;
    readonly createdAt: string;
    readonly artifacts: readonly CreatorVisibleArtifactCandidate[];
    readonly taskId?: string;
    readonly runId?: string;
    readonly documentUri?: string;
  }): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    if (input.artifacts.length === 0) return [];
    const request = {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      target: {
        workspaceId: this.deps.workspaceId,
        workspaceUri: this.workspaceBoardMutation.workspaceUri(),
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      },
      process: {
        deliveryId: input.deliveryId,
        sourceHost: 'tui' as const,
        createdAt: input.createdAt,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      artifacts: input.artifacts.map((artifact) =>
        toProjectionArtifact(artifact, input),
      ),
    } satisfies CanvasWorkspaceProjectionRequest;
    try {
      const results = await this.workspaceBoardDelivery.enqueue(request);
      this.deps.onWorkspaceBoardProjection?.(results);
      return results;
    } catch (error) {
      const results = [blockedProjection(error)];
      this.deps.onWorkspaceBoardProjection?.(results);
      return results;
    }
  }
}

function toProjectionArtifact(
  artifact: CreatorVisibleArtifactCandidate,
  input: {
    readonly deliveryId: string;
    readonly createdAt: string;
    readonly taskId?: string;
    readonly runId?: string;
  },
): CanvasWorkspaceProjectionArtifact {
  const provenance = {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: input.deliveryId,
    artifactId: artifact.artifactId,
    revision: artifact.revision,
    kind: artifact.kind,
    role: artifact.role,
    sourceId: artifact.sourceId,
    ...(artifact.sourceArtifactIds ? { sourceArtifactIds: artifact.sourceArtifactIds } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    createdAt: input.createdAt,
  };
  if (artifact.kind === 'markdown') {
    if (!artifact.markdown) {
      throw new Error(`Markdown artifact ${artifact.artifactId} has no durable body.`);
    }
    return {
      kind: 'markdown',
      title: artifact.title,
      markdown: artifact.markdown,
      provenance,
    };
  }
  return {
    kind: artifact.kind,
    title: artifact.title,
    ...(artifact.resourceRef ? { resourceRef: artifact.resourceRef } : {}),
    ...(artifact.documentResourceRef
      ? { documentResourceRef: artifact.documentResourceRef }
      : {}),
    provenance,
  };
}

function blockedProjection(error: unknown): CanvasWorkspaceProjectionResult {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics: [
      {
        code: 'projection-write-failed',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    ],
  };
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
  return stripRenderableGeneratedAssetPath({ ...asset, renderUri });
}
