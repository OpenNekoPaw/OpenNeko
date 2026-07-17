import type {
  AgentBackgroundTask,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskStepStatus,
  AgentWorkItemTaskType,
  SubAgentWorkItem,
} from '@neko-agent/types';
import { getPanoramicPreviewRoute } from '@neko/shared';

export type AgentWorkItemStatusTone = 'info' | 'success' | 'danger' | 'neutral';

export type AgentTaskRichContentKind =
  'image' | 'image-grid' | 'video' | 'audio' | 'panoramic-image' | 'panoramic-video';

export interface AgentTaskResultContentProjection {
  contentKind: AgentTaskRichContentKind | null;
  contentData: Record<string, unknown> | null;
  displayWidth?: number;
  displayHeight?: number;
  displayDuration?: number;
  mediaType: AgentWorkItemTaskType;
}

export interface AgentWorkItemStatusProjection {
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  tone: AgentWorkItemStatusTone;
}

export interface BackgroundTaskBatchProjection {
  stats: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  totalProgress: number;
  allCompleted: boolean;
  allFailed: boolean;
  hasActive: boolean;
  taskType: AgentWorkItemTaskType;
  tone: AgentWorkItemStatusTone;
  titleKey:
    'tasks.batchVideoGeneration' | 'tasks.batchAudioGeneration' | 'tasks.batchImageGeneration';
  badges: BackgroundTaskBatchBadgeProjection[];
  rows: BackgroundTaskBatchRowProjection[];
  showProgress: boolean;
  showCancelAll: boolean;
}

export type BackgroundTaskBatchBadgeTone = 'success' | 'info' | 'warning' | 'danger';

export interface BackgroundTaskBatchBadgeProjection {
  status: 'completed' | 'processing' | 'queued' | 'failed';
  count: number;
  tone: BackgroundTaskBatchBadgeTone;
  iconKind: 'completed' | 'processing' | 'queued' | 'failed';
  labelKey:
    | 'tasks.status.completed'
    | 'tasks.status.processing'
    | 'tasks.status.queued'
    | 'tasks.status.failed';
  animate: boolean;
}

export interface BackgroundTaskBatchRowProjection {
  task: AgentBackgroundTask;
  index: number;
  promptPreview: string;
  statusDisplay: string;
  statusTone: AgentWorkItemStatusTone;
  showViewResult: boolean;
}

export interface BackgroundTaskCardProjection {
  status: AgentWorkItemStatusProjection;
  tone: AgentWorkItemStatusTone;
  taskType: AgentWorkItemTaskType;
  titleKey: 'tasks.videoGeneration' | 'tasks.audioGeneration' | 'tasks.imageGeneration';
  progressLabel: string | null;
  progressBarPercent: number;
  showProgressLabel: boolean;
  showProgressBar: boolean;
  useIndeterminateProgress: boolean;
  showCancel: boolean;
  showRetry: boolean;
  showViewResult: boolean;
  showCollapsedError: boolean;
  showExpandedError: boolean;
  showSteps: boolean;
  showResultPreview: boolean;
  showEta: boolean;
  etaSeconds: number | null;
  providerName: string;
}

export interface AgentWorkItemStepsProjection {
  currentStepIndex: number;
  completedSteps: number;
  currentStepName: string | null;
  rows: AgentWorkItemStepRowProjection[];
}

export interface AgentWorkItemStepRowProjection {
  step: AgentWorkItemTaskStep;
  index: number;
  isCurrent: boolean;
  iconKind: 'completed' | 'running' | 'failed' | 'pending';
  tone: AgentWorkItemStatusTone;
  animate: boolean;
  durationSeconds: number | null;
  showDuration: boolean;
  showMessage: boolean;
}

export interface SubAgentCardMetaBadgeProjection {
  label: string;
  value: string;
}

export interface SubAgentCardProjection {
  status: AgentWorkItemStatusProjection;
  tone: AgentWorkItemStatusTone;
  typeLabel: string;
  progressLabel: string | null;
  progressBarPercent: number;
  showProgressLabel: boolean;
  showProgressBar: boolean;
  showSummary: boolean;
  showSteps: boolean;
  showChildren: boolean;
  showError: boolean;
  showResponse: boolean;
  metaBadges: SubAgentCardMetaBadgeProjection[];
  childIds: string[];
  parentAgentId: string;
}

export function projectAgentWorkItemStatus(
  status: AgentWorkItemTaskStatus,
): AgentWorkItemStatusProjection {
  const isActive = status === 'queued' || status === 'processing';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'cancelled';

  return {
    isActive,
    isCompleted,
    isFailed,
    tone: isCompleted ? 'success' : isFailed ? 'danger' : isActive ? 'info' : 'neutral',
  };
}

export function projectBackgroundTaskBatch(
  tasks: readonly AgentBackgroundTask[],
): BackgroundTaskBatchProjection {
  const stats = {
    queued: tasks.filter((task) => task.status === 'queued').length,
    processing: tasks.filter((task) => task.status === 'processing').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').length,
  };

  return {
    stats,
    totalProgress:
      tasks.length > 0
        ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
        : 0,
    allCompleted: tasks.length > 0 && stats.completed === tasks.length,
    allFailed: tasks.length > 0 && stats.failed === tasks.length,
    hasActive: stats.queued > 0 || stats.processing > 0,
    taskType: tasks[0]?.type ?? 'video',
    tone:
      tasks.length > 0 && stats.completed === tasks.length
        ? 'success'
        : tasks.length > 0 && stats.failed === tasks.length
          ? 'danger'
          : 'info',
    titleKey: toBatchTaskTitleKey(tasks[0]?.type ?? 'video'),
    badges: projectBackgroundTaskBatchBadges(stats),
    rows: tasks.map((task, index) => projectBackgroundTaskBatchRow(task, index)),
    showProgress: stats.queued > 0 || stats.processing > 0,
    showCancelAll: stats.queued > 0 || stats.processing > 0,
  };
}

export function projectBackgroundTaskCard(task: AgentBackgroundTask): BackgroundTaskCardProjection {
  const status = projectAgentWorkItemStatus(task.status);
  const hasProgress = task.progress > 0;
  const showError = status.isFailed && Boolean(task.error);

  return {
    status,
    tone: status.tone,
    taskType: task.type,
    titleKey: toTaskCardTitleKey(task.type),
    progressLabel: status.isActive && hasProgress ? `${task.progress}%` : null,
    progressBarPercent: task.progress,
    showProgressLabel: status.isActive && hasProgress,
    showProgressBar: status.isActive,
    useIndeterminateProgress: status.isActive && !hasProgress,
    showCancel: status.isActive,
    showRetry: status.isFailed,
    showViewResult: status.isCompleted,
    showCollapsedError: showError,
    showExpandedError: showError,
    showSteps: Boolean(task.steps && task.steps.length > 0),
    showResultPreview: status.isCompleted && Boolean(task.result),
    showEta: status.isActive && hasProgress && task.eta !== undefined && task.eta > 0,
    etaSeconds: task.eta !== undefined && task.eta > 0 ? task.eta : null,
    providerName: task.providerName,
  };
}

export function projectBackgroundTaskResultContent(
  task: AgentBackgroundTask,
): AgentTaskResultContentProjection {
  const result = task.result;
  const assets = result?.assets;
  const displayUrls =
    assets && assets.length > 0 ? assets.map((asset) => asset.renderUri) : result?.urls;
  const firstAsset = assets?.[0];
  const displayWidth = readNumberField(firstAsset, 'width') ?? result?.width;
  const displayHeight = readNumberField(firstAsset, 'height') ?? result?.height;
  const displayDuration = readNumberField(firstAsset, 'duration') ?? result?.duration;
  const richContent = projectTaskRichContent(task, displayUrls, result?.thumbnailUrl);

  return {
    ...richContent,
    ...(displayWidth !== undefined ? { displayWidth } : {}),
    ...(displayHeight !== undefined ? { displayHeight } : {}),
    ...(displayDuration !== undefined ? { displayDuration } : {}),
    mediaType: task.type,
  };
}

export function projectAgentWorkItemSteps(
  steps: readonly AgentWorkItemTaskStep[],
  currentStepId?: string,
): AgentWorkItemStepsProjection {
  const currentStepIndex = currentStepId
    ? steps.findIndex((step) => step.id === currentStepId)
    : -1;
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : undefined;

  return {
    currentStepIndex,
    completedSteps: steps.filter((step) => step.status === 'completed').length,
    currentStepName: currentStep?.name ?? null,
    rows: steps.map((step, index) => projectAgentWorkItemStepRow(step, index, currentStepId)),
  };
}

export function projectSubAgentCard(item: SubAgentWorkItem): SubAgentCardProjection {
  const status = projectAgentWorkItemStatus(item.status);
  const childIds = item.children ?? [];
  const metaBadges: SubAgentCardMetaBadgeProjection[] = [{ label: 'status', value: item.status }];

  if (item.subAgent.runMode) {
    metaBadges.push({ label: 'mode', value: item.subAgent.runMode });
  }
  if (item.subAgent.modelTier) {
    metaBadges.push({ label: 'model', value: item.subAgent.modelTier });
  }

  return {
    status,
    tone: status.tone,
    typeLabel: item.subAgent.type ?? 'subagent',
    progressLabel: status.isActive && item.progress > 0 ? `${item.progress}%` : null,
    progressBarPercent: Math.max(item.progress, 8),
    showProgressLabel: status.isActive && item.progress > 0,
    showProgressBar: status.isActive,
    showSummary: Boolean(item.summary),
    showSteps: Boolean(item.steps && item.steps.length > 0),
    showChildren: childIds.length > 0,
    showError: Boolean(item.error),
    showResponse: Boolean(item.subAgent.response),
    metaBadges,
    childIds,
    parentAgentId: item.subAgent.parentAgentId,
  };
}

function projectTaskRichContent(
  task: AgentBackgroundTask,
  displayUrls: readonly string[] | undefined,
  thumbnailUrl: string | undefined,
): Pick<AgentTaskResultContentProjection, 'contentKind' | 'contentData'> {
  const firstUrl = displayUrls?.[0];
  const openTargets = task.result?.assets?.map((asset) => asset.assetRef?.uri ?? asset.renderUri);
  const firstOpenTarget = openTargets?.[0];

  switch (task.type) {
    case 'video':
      if (!firstUrl) return EMPTY_TASK_RESULT_CONTENT;
      if (isPanoramicRenderUri(firstUrl, 'video')) {
        return {
          contentKind: 'panoramic-video',
          contentData: {
            src: thumbnailUrl ?? firstUrl,
            poster: thumbnailUrl,
            name: task.name,
            localPath: firstOpenTarget,
            kind: 'video',
          },
        };
      }
      return {
        contentKind: 'video',
        contentData: {
          src: firstUrl,
          poster: thumbnailUrl,
          title: task.name,
          localPath: firstOpenTarget,
        },
      };
    case 'audio':
      if (!firstUrl) return EMPTY_TASK_RESULT_CONTENT;
      return {
        contentKind: 'audio',
        contentData: { src: firstUrl, title: task.name, localPath: firstOpenTarget },
      };
    case 'image': {
      if (displayUrls && displayUrls.length > 1) {
        return {
          contentKind: 'image-grid',
          contentData: {
            urls: [...displayUrls],
            ...(openTargets ? { localPaths: [...openTargets] } : {}),
            name: task.name,
          },
        };
      }
      const imgSrc = thumbnailUrl || firstUrl;
      if (!imgSrc) return EMPTY_TASK_RESULT_CONTENT;
      if (firstUrl && isPanoramicRenderUri(firstUrl, 'image')) {
        return {
          contentKind: 'panoramic-image',
          contentData: { src: imgSrc, name: task.name, localPath: firstOpenTarget, kind: 'image' },
        };
      }
      return {
        contentKind: 'image',
        contentData: { src: imgSrc, name: task.name, localPath: firstOpenTarget },
      };
    }
  }
}

const EMPTY_TASK_RESULT_CONTENT = {
  contentKind: null,
  contentData: null,
} satisfies Pick<AgentTaskResultContentProjection, 'contentKind' | 'contentData'>;

function isPanoramicRenderUri(uri: string, kind: 'image' | 'video'): boolean {
  return getPanoramicPreviewRoute({ filePath: uri })?.kind === kind;
}

function readNumberField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'number' ? field : undefined;
}

function projectBackgroundTaskBatchBadges(
  stats: BackgroundTaskBatchProjection['stats'],
): BackgroundTaskBatchBadgeProjection[] {
  return [
    projectBackgroundTaskBatchBadge('completed', stats.completed, 'success', 'completed', false),
    projectBackgroundTaskBatchBadge('processing', stats.processing, 'info', 'processing', true),
    projectBackgroundTaskBatchBadge('queued', stats.queued, 'warning', 'queued', false),
    projectBackgroundTaskBatchBadge('failed', stats.failed, 'danger', 'failed', false),
  ].filter((badge) => badge.count > 0);
}

function projectBackgroundTaskBatchBadge(
  status: BackgroundTaskBatchBadgeProjection['status'],
  count: number,
  tone: BackgroundTaskBatchBadgeTone,
  iconKind: BackgroundTaskBatchBadgeProjection['iconKind'],
  animate: boolean,
): BackgroundTaskBatchBadgeProjection {
  return {
    status,
    count,
    tone,
    iconKind,
    labelKey: toBatchTaskStatusLabelKey(status),
    animate,
  };
}

function projectBackgroundTaskBatchRow(
  task: AgentBackgroundTask,
  index: number,
): BackgroundTaskBatchRowProjection {
  const statusProjection = projectAgentWorkItemStatus(task.status);
  return {
    task,
    index,
    promptPreview: task.prompt.length > 40 ? `${task.prompt.slice(0, 40)}...` : task.prompt,
    statusDisplay:
      task.status === 'completed'
        ? 'completed'
        : task.status === 'failed' || task.status === 'cancelled'
          ? 'failed'
          : `${task.progress}%`,
    statusTone: statusProjection.tone,
    showViewResult: statusProjection.isCompleted,
  };
}

function projectAgentWorkItemStepRow(
  step: AgentWorkItemTaskStep,
  index: number,
  currentStepId?: string,
): AgentWorkItemStepRowProjection {
  return {
    step,
    index,
    isCurrent: step.id === currentStepId,
    iconKind: toStepIconKind(step.status),
    tone: toStepTone(step.status),
    animate: step.status === 'running',
    durationSeconds:
      step.startTime !== undefined && step.endTime !== undefined
        ? Math.round((step.endTime - step.startTime) / 1000)
        : null,
    showDuration: step.startTime !== undefined && step.endTime !== undefined,
    showMessage: Boolean(step.message),
  };
}

function toStepIconKind(
  status: AgentWorkItemTaskStepStatus,
): AgentWorkItemStepRowProjection['iconKind'] {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'running':
      return 'running';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'pending';
  }
}

function toStepTone(status: AgentWorkItemTaskStepStatus): AgentWorkItemStatusTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'failed':
      return 'danger';
    case 'pending':
      return 'neutral';
  }
}

function toBatchTaskTitleKey(
  type: AgentWorkItemTaskType,
): BackgroundTaskBatchProjection['titleKey'] {
  if (type === 'video') return 'tasks.batchVideoGeneration';
  if (type === 'audio') return 'tasks.batchAudioGeneration';
  return 'tasks.batchImageGeneration';
}

function toTaskCardTitleKey(type: AgentWorkItemTaskType): BackgroundTaskCardProjection['titleKey'] {
  if (type === 'video') return 'tasks.videoGeneration';
  if (type === 'audio') return 'tasks.audioGeneration';
  return 'tasks.imageGeneration';
}

function toBatchTaskStatusLabelKey(
  status: BackgroundTaskBatchBadgeProjection['status'],
): BackgroundTaskBatchBadgeProjection['labelKey'] {
  switch (status) {
    case 'completed':
      return 'tasks.status.completed';
    case 'processing':
      return 'tasks.status.processing';
    case 'queued':
      return 'tasks.status.queued';
    case 'failed':
      return 'tasks.status.failed';
  }
}
