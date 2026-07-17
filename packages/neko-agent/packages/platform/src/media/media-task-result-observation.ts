import type {
  AgentTaskResultDeliveryPolicy,
  GeneratedAsset,
  PerceptualAssetRef,
  ResourceRef,
  Task,
  TaskLifecycleMetadata,
  TaskResultDeliveryGroupMetadata,
  TaskStatus,
  TaskType,
} from '@neko/shared';
import { isResourceRef } from '@neko/shared';
import type { MediaTaskProgressDeliveryPlan } from './media-task-progress-plan';
import type { MediaTask } from './types';

export type MediaTaskResultObservationAssetInput = Pick<
  GeneratedAsset,
  'id' | 'mimeType' | 'assetRef' | 'lifecycle'
> &
  Partial<Pick<GeneratedAsset, 'path'>> & {
    readonly label?: string;
    readonly resourceRef?: ResourceRef;
  };

export interface MediaTaskResultObservationAssetData {
  readonly id: string;
  readonly mimeType?: string;
  readonly label?: string;
  readonly assetRef?: PerceptualAssetRef;
  readonly resourceRef: ResourceRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly generationLineage: NonNullable<GeneratedAsset['lifecycle']>['generation'];
  readonly localPath?: string;
}

export interface MediaTaskResultObservationProjectionInput {
  readonly conversationId: string;
  readonly taskId: string;
  readonly progress: number;
  readonly mediaTask: MediaTask;
  readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
  readonly assets?: readonly MediaTaskResultObservationAssetInput[];
  readonly resultUrls?: readonly string[];
  readonly error?: string;
}

export function toMediaTaskResultObservationTask(
  input: MediaTaskResultObservationProjectionInput,
): Task {
  const task = input.mediaTask;
  const deliveryPolicy = readMediaTaskResultDeliveryPolicy(task.request.metadata);
  const resultDeliveryGroup = readMediaTaskResultDeliveryGroup(task.request.metadata);
  const ownerRunId = readMediaTaskRunId(task.request.metadata);
  const ownerRunStartedAt = readMediaTaskRunStartedAt(task.request.metadata);
  const lifecycle: TaskLifecycleMetadata = {
    ownerConversationId: input.conversationId,
    ...(ownerRunId ? { ownerRunId } : {}),
    ...(ownerRunStartedAt !== undefined ? { ownerRunStartedAt } : {}),
    runMode: 'background',
    costPhase: 'idle',
    interruptPolicy: 'detach-and-continue',
    recoverPolicy: 'snapshot-only',
    ...(deliveryPolicy ? { resultDeliveryPolicy: deliveryPolicy } : {}),
    ...(resultDeliveryGroup ? { resultDeliveryGroup } : {}),
  };
  const outputData = buildMediaTaskResultObservationData(input);
  const error = input.error ?? formatMediaTaskError(task);

  if (input.taskId !== task.scope.childRunId) {
    throw new Error(
      `Media task observation id ${input.taskId} does not match scope ${task.scope.childRunId}`,
    );
  }

  return {
    scope: task.scope,
    id: input.taskId,
    type: toAgentTaskType(task.type),
    status: toAgentTaskStatus(task.status),
    input: {
      type: toAgentTaskType(task.type),
      payload: {
        prompt: task.request.prompt,
        providerId: task.providerId,
        modelId: task.modelId,
        mediaTaskType: task.type,
      },
      lifecycle,
    },
    output: {
      data: outputData,
      ...(error ? { error } : {}),
    },
    progress: input.progress,
    createdAt: task.createdAt.getTime(),
    updatedAt: (task.completedAt ?? task.updatedAt).getTime(),
    ...(error ? { error } : {}),
    lifecycle,
  };
}

export function readMediaTaskResultDeliveryPolicy(
  metadata: Record<string, unknown> | undefined,
): AgentTaskResultDeliveryPolicy | undefined {
  const value = metadata?.['resultDeliveryPolicy'] ?? metadata?.['agentTaskResultDeliveryPolicy'];
  if (!isRecord(value)) return undefined;
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
      return undefined;
  }
}

export function readMediaTaskResultDeliveryGroup(
  metadata: Record<string, unknown> | undefined,
): TaskResultDeliveryGroupMetadata | undefined {
  const value = metadata?.['resultDeliveryGroup'] ?? metadata?.['agentTaskResultDeliveryGroup'];
  if (!isRecord(value)) return undefined;
  const taskGroupId = value['taskGroupId'];
  const resultDeliveryPolicy = value['resultDeliveryPolicy'];
  if (typeof taskGroupId !== 'string' || !taskGroupId.trim()) return undefined;
  if (
    resultDeliveryPolicy !== 'wait-all' &&
    resultDeliveryPolicy !== 'continue-on-each' &&
    resultDeliveryPolicy !== 'continue-on-threshold'
  ) {
    return undefined;
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

function readMediaTaskRunId(metadata: Record<string, unknown> | undefined): string | undefined {
  const value = metadata?.['runId'];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readMediaTaskRunStartedAt(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  const value = metadata?.['runStartedAt'];
  return typeof value === 'number' ? value : undefined;
}

function buildMediaTaskResultObservationData(
  input: MediaTaskResultObservationProjectionInput,
): Record<string, unknown> {
  const resultUrls = [
    ...(input.deliveryPlan?.resultUrls ?? []),
    ...(input.resultUrls ?? []),
  ].filter(isHttpUrl);
  const assets = projectMediaTaskResultObservationAssets([
    ...(input.deliveryPlan?.generatedAssets ?? []),
    ...(input.assets ?? []),
  ]);
  const hostOutputPaths = uniqueStrings([
    ...(input.deliveryPlan?.hostOutputPaths ?? []),
    ...assets.flatMap((asset) => (asset.localPath ? [asset.localPath] : [])),
  ]);

  return {
    mediaTaskId: input.taskId,
    mediaTaskType: input.mediaTask.type,
    providerId: input.mediaTask.providerId,
    modelId: input.mediaTask.modelId,
    ...(resultUrls.length > 0 ? { resultUrls } : {}),
    ...(hostOutputPaths.length > 0 ? { hostOutputPaths } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}

function projectMediaTaskResultObservationAssets(
  assets: readonly MediaTaskResultObservationAssetInput[],
): MediaTaskResultObservationAssetData[] {
  const projected: MediaTaskResultObservationAssetData[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    const localPath = readAssetLocalPath(asset);
    const assetRef = asset.assetRef;
    const key = assetRef?.assetId ?? asset.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const lifecycle = asset.lifecycle;
    const resourceRef = readAssetResourceRef(asset) ?? lifecycle?.resourceRef;
    if (!lifecycle || !resourceRef) {
      throw new Error(
        `Generated asset ${asset.id} is missing revision-bound lifecycle identity for task backfill.`,
      );
    }
    if (lifecycle.assetId !== (assetRef?.assetId ?? asset.id)) {
      throw new Error(
        `Generated asset ${asset.id} lifecycle identity does not match its asset ref.`,
      );
    }
    projected.push({
      id: asset.id,
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      label: asset.label ?? assetRef?.uri ?? asset.id,
      ...(assetRef ? { assetRef } : {}),
      resourceRef,
      revision: lifecycle.revision,
      contentDigest: lifecycle.contentDigest,
      generationLineage: lifecycle.generation,
      ...(localPath ? { localPath } : {}),
    });
  }

  return projected;
}

function readAssetLocalPath(asset: MediaTaskResultObservationAssetInput): string | undefined {
  if (!('path' in asset)) {
    return undefined;
  }
  return typeof asset.path === 'string' && asset.path.length > 0 ? asset.path : undefined;
}

function readAssetResourceRef(
  asset: MediaTaskResultObservationAssetInput,
): ResourceRef | undefined {
  return isResourceRef(asset.resourceRef) ? asset.resourceRef : undefined;
}

function toAgentTaskStatus(status: MediaTask['status']): TaskStatus {
  if (status === 'processing') return 'running';
  return status;
}

function toAgentTaskType(type: MediaTask['type']): TaskType {
  if (type.includes('image')) return 'image_generation';
  if (type.includes('video')) return 'video_generation';
  if (type.includes('audio') || type.includes('music')) return 'audio_generation';
  if (type === 'workflow') return 'workflow';
  return 'custom';
}

function formatMediaTaskError(task: MediaTask): string | undefined {
  if (!task.error) return undefined;
  return task.error.message || task.error.code;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
