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
  LocalMetadataStore,
} from '@neko/shared';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createSafeCanvasWorkspaceProjectionDiagnostic,
  createGeneratedAssetsWorkspaceDeliveryRequest,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
} from '@neko/shared';
import {
  buildMediaGenerationDeliverySettingsPlan,
  finalizeMediaGenerationOutputs,
  GeneratedAssetIndex,
} from '@neko/platform';
import type { MediaGenerationResult } from '@neko/generation';
import type { GeneratedMediaKind } from '@neko/platform/media/media-generated-asset';
import { NodeWorkspaceBoardMutationPort } from './node-workspace-board-mutation-port';

export interface NodeMediaGenerationDeliveryHostDeps {
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly assetIndex: GeneratedAssetIndex;
  readonly onWorkspaceBoardProjection?: (
    results: readonly CanvasWorkspaceProjectionResult[],
  ) => void;
  readonly onGeneratedOutputDelivery?: (lifecycles: readonly GeneratedAssetRevisionRef[]) => void;
}

export interface WorkspaceBoardDeliveryObservability {
  readonly canonicalSubmissionCount: number;
  readonly resumeScanCount: number;
  readonly legacyFallbackCounts: {
    readonly activeCanvas: number;
    readonly recentCanvas: number;
    readonly directWriter: number;
    readonly genericSendToCanvas: number;
  };
}

export class NodeMediaGenerationDeliveryHost {
  private readonly assetIndex: GeneratedAssetIndex;
  private readonly workspaceBoardMutation: NodeWorkspaceBoardMutationPort;
  private readonly workspaceBoardDelivery: WorkspaceBoardDeliveryCoordinator;
  private canonicalSubmissionCount = 0;
  private resumeScanCount = 0;

  constructor(private readonly deps: NodeMediaGenerationDeliveryHostDeps) {
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

  async resumePendingWorkspaceBoardDeliveries(): Promise<
    readonly CanvasWorkspaceProjectionResult[]
  > {
    this.resumeScanCount += 1;
    const results = await this.workspaceBoardDelivery.flush();
    this.deps.onWorkspaceBoardProjection?.(results);
    return results;
  }

  getWorkspaceBoardDeliveryObservability(): WorkspaceBoardDeliveryObservability {
    return {
      canonicalSubmissionCount: this.canonicalSubmissionCount,
      resumeScanCount: this.resumeScanCount,
      legacyFallbackCounts: {
        activeCanvas: 0,
        recentCanvas: 0,
        directWriter: 0,
        genericSendToCanvas: 0,
      },
    };
  }

  async deliverMediaGeneration(input: {
    readonly operationId: string;
    readonly result: MediaGenerationResult;
  }): Promise<{
    readonly resultUrls: readonly string[];
    readonly resultLocators: readonly import('@neko/shared').GeneratedOutputContentLocator[];
  }> {
    const mediaKind = toGeneratedMediaKind(input.result.type);
    const settingsPlan = buildMediaGenerationDeliverySettingsPlan({
      workspaceRoot: this.deps.workspaceRoot,
      defaultOutputDir: resolveGeneratedOutputDir(this.deps.workspaceRoot, mediaKind),
      configuredOutputDir: '',
      configuredShowSaveNotification: false,
    });
    if (!settingsPlan.outputDir) {
      throw new Error('TUI media generation delivery requires a workspace output directory.');
    }
    const finalized = await finalizeMediaGenerationOutputs({
      workspaceRoot: this.deps.workspaceRoot,
      operationId: input.operationId,
      generationType: input.result.type,
      mediaKind,
      outputs: input.result.outputs,
      providerId: input.result.providerId,
      modelId: input.result.modelId,
      request: input.result.request,
      outputDir: settingsPlan.outputDir,
      assetIndex: this.assetIndex,
    });
    await this.deliverGeneratedOutputBatch(finalized.generatedAssets);
    return {
      resultUrls: finalized.resultUrls,
      resultLocators: finalized.generatedAssets.map((asset) => {
        if (!asset.lifecycle) {
          throw new Error(`Generated asset ${asset.id} is missing its durable lifecycle.`);
        }
        return asset.lifecycle.contentLocator;
      }),
    };
  }

  private async deliverGeneratedOutputBatch(assets: readonly GeneratedAsset[]): Promise<void> {
    if (assets.length === 0) return;
    this.deps.onGeneratedOutputDelivery?.(
      assets.flatMap((asset) => (asset.lifecycle ? [asset.lifecycle] : [])),
    );
    await this.deliverWorkspaceBoardRequest(
      createGeneratedAssetsWorkspaceDeliveryRequest(assets, {
        workspaceId: this.deps.workspaceId,
        workspaceUri: this.workspaceBoardMutation.workspaceUri(),
        sourceHost: 'tui',
      }),
    );
  }

  async deliverCreatorVisibleArtifacts(input: {
    readonly deliveryId: string;
    readonly createdAt: string;
    readonly artifacts: readonly CreatorVisibleArtifactCandidate[];
    readonly runId?: string;
  }): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    if (input.artifacts.length === 0) return [];
    const request = {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      target: {
        workspaceId: this.deps.workspaceId,
        workspaceUri: this.workspaceBoardMutation.workspaceUri(),
      },
      process: {
        deliveryId: input.deliveryId,
        sourceHost: 'tui' as const,
        createdAt: input.createdAt,
        ...(input.runId ? { runId: input.runId } : {}),
      },
      artifacts: input.artifacts.map((artifact) => toProjectionArtifact(artifact, input)),
    } satisfies CanvasWorkspaceProjectionRequest;
    return this.deliverWorkspaceBoardRequest(request);
  }

  private async deliverWorkspaceBoardRequest(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    this.canonicalSubmissionCount += 1;
    let results: readonly CanvasWorkspaceProjectionResult[];
    try {
      results = await this.workspaceBoardDelivery.enqueue(request);
    } catch (error) {
      results = [blockedProjection(error)];
    }
    this.deps.onWorkspaceBoardProjection?.(results);
    return results;
  }
}

function toProjectionArtifact(
  artifact: CreatorVisibleArtifactCandidate,
  input: {
    readonly deliveryId: string;
    readonly createdAt: string;
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
  if (!artifact.contentLocator) {
    throw new Error(
      `creator-visible-artifact-migration-required: Artifact ${artifact.artifactId} requires contentLocator.`,
    );
  }
  return {
    kind: artifact.kind,
    title: artifact.title,
    contentLocator: artifact.contentLocator,
    ...(artifact.intrinsicDimensions ? { intrinsicDimensions: artifact.intrinsicDimensions } : {}),
    provenance,
  };
}

function blockedProjection(error: unknown): CanvasWorkspaceProjectionResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = /metadata|sqlite|ledger/iu.test(message)
    ? 'delivery-ledger-unavailable'
    : 'projection-write-failed';
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics: [createSafeCanvasWorkspaceProjectionDiagnostic(code)],
  };
}

function resolveGeneratedOutputDir(
  workspaceRoot: string,
  mediaKind: GeneratedMediaKind | 'file',
): string {
  return path.join(workspaceRoot, resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }));
}

function toGeneratedMediaKind(type: MediaGenerationResult['type']): GeneratedMediaKind {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}
