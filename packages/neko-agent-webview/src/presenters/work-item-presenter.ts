import type {
  AgentWorkItem,
  AgentWorkItemStatus,
  AgentWorkItemStep,
  AgentWorkItemStepStatus,
  Message,
  SubAgentWorkItem,
} from '@neko-agent/contracts';

export type AgentWorkItemStatusTone = 'neutral' | 'info' | 'success' | 'danger';

export interface AgentWorkItemStatusProjection {
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  tone: AgentWorkItemStatusTone;
}

export interface AgentWorkItemStepsProjection {
  currentStepIndex: number;
  completedSteps: number;
  currentStepName: string | null;
  rows: AgentWorkItemStepRowProjection[];
}

export interface AgentWorkItemStepRowProjection {
  step: AgentWorkItemStep;
  index: number;
  isCurrent: boolean;
  iconKind: 'completed' | 'running' | 'failed' | 'pending';
  tone: AgentWorkItemStatusTone;
  animate: boolean;
  durationSeconds: number | null;
  showDuration: boolean;
  showMessage: boolean;
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
  metaBadges: Array<{ label: string; value: string }>;
  childIds: string[];
  parentAgentId: string;
}

const ATTENTION_WORK_ITEM_STATUSES = new Set<AgentWorkItemStatus>([
  'queued',
  'processing',
  'failed',
]);

export function selectConversationAttentionWorkItems(
  messages: readonly Message[],
  workItems: readonly AgentWorkItem[],
): AgentWorkItem[] {
  if (workItems.length === 0) return [];
  const linkedIds = new Set(messages.flatMap((message) => message.workItemIds ?? []));
  return workItems.filter(
    (item) => !linkedIds.has(item.id) && ATTENTION_WORK_ITEM_STATUSES.has(item.status),
  );
}

function projectAgentWorkItemStatus(status: AgentWorkItemStatus): AgentWorkItemStatusProjection {
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

export function projectAgentWorkItemSteps(
  steps: readonly AgentWorkItemStep[],
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
    rows: steps.map((step, index) => ({
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
    })),
  };
}

export function projectSubAgentCard(item: SubAgentWorkItem): SubAgentCardProjection {
  const status = projectAgentWorkItemStatus(item.status);
  const childIds = item.children ?? [];
  const metaBadges: Array<{ label: string; value: string }> = [
    { label: 'status', value: item.status },
  ];
  if (item.subAgent.runMode) metaBadges.push({ label: 'mode', value: item.subAgent.runMode });
  if (item.subAgent.modelTier) metaBadges.push({ label: 'model', value: item.subAgent.modelTier });

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

function toStepIconKind(
  status: AgentWorkItemStepStatus,
): AgentWorkItemStepRowProjection['iconKind'] {
  return status;
}

function toStepTone(status: AgentWorkItemStepStatus): AgentWorkItemStatusTone {
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
