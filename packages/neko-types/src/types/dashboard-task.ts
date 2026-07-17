export const DASHBOARD_TASK_CONTRACT_VERSION = 1;

export type DashboardTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type DashboardTaskAction = 'cancel' | 'retry' | 'reveal-output';

export type DashboardTaskOutputKind = 'file' | 'folder' | 'url' | 'asset';

export interface DashboardTaskRef {
  readonly source: string;
  readonly sourceTaskId: string;
}

export interface DashboardTaskOutputRef {
  readonly kind: DashboardTaskOutputKind;
  readonly ref: string;
  readonly label?: string;
}

export interface DashboardTask {
  readonly taskId: string;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly sourceTaskId: string;
  readonly kind: string;
  readonly title: string;
  readonly status: DashboardTaskStatus;
  readonly progress?: number;
  readonly actions: readonly DashboardTaskAction[];
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly outputs?: readonly DashboardTaskOutputRef[];
  readonly currentStep?: string;
  readonly error?: string;
  readonly conversationId?: string;
  readonly workItemKind?: 'media-task' | 'tool-background-task' | 'subagent';
}

export interface DashboardTaskEvent {
  readonly task: DashboardTask;
  readonly type: 'added' | 'updated' | 'removed';
}

export interface DashboardTaskSourceCapabilities {
  readonly cancel?: boolean;
  readonly retry?: boolean;
  readonly revealOutput?: boolean;
}

export interface DashboardDisposableLike {
  dispose(): void;
}

export interface DashboardTaskSource {
  readonly contractVersion: typeof DASHBOARD_TASK_CONTRACT_VERSION;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly capabilities?: DashboardTaskSourceCapabilities;
  getSnapshot(): Promise<DashboardTask[]>;
  onDidChangeTask(listener: (event: DashboardTaskEvent) => void): DashboardDisposableLike;
  cancel?(task: DashboardTaskRef): Promise<void>;
  retry?(task: DashboardTaskRef): Promise<void>;
}

export const DASHBOARD_TASK_STATUSES: readonly DashboardTaskStatus[] = [
  'queued',
  'running',
  'done',
  'error',
  'cancelled',
] as const;

export const DASHBOARD_TASK_ACTIONS: readonly DashboardTaskAction[] = [
  'cancel',
  'retry',
  'reveal-output',
] as const;

export const DASHBOARD_TASK_OUTPUT_KINDS: readonly DashboardTaskOutputKind[] = [
  'file',
  'folder',
  'url',
  'asset',
] as const;

export function isDashboardTaskStatus(value: unknown): value is DashboardTaskStatus {
  return DASHBOARD_TASK_STATUSES.includes(value as DashboardTaskStatus);
}

export function isDashboardTaskAction(value: unknown): value is DashboardTaskAction {
  return DASHBOARD_TASK_ACTIONS.includes(value as DashboardTaskAction);
}

export function isDashboardTaskOutputKind(value: unknown): value is DashboardTaskOutputKind {
  return DASHBOARD_TASK_OUTPUT_KINDS.includes(value as DashboardTaskOutputKind);
}

export function isDashboardDisposableLike(value: unknown): value is DashboardDisposableLike {
  return isRecord(value) && typeof value.dispose === 'function';
}

export function isDashboardTaskOutputRef(value: unknown): value is DashboardTaskOutputRef {
  if (!isRecord(value)) return false;
  if (!isDashboardTaskOutputKind(value.kind)) return false;
  if (!isNonEmptyString(value.ref)) return false;
  if (value.label !== undefined && typeof value.label !== 'string') return false;

  if ((value.kind === 'file' || value.kind === 'folder') && isAbsoluteLocalRef(value.ref)) {
    return false;
  }

  return true;
}

export function isDashboardTask(value: unknown): value is DashboardTask {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.taskId)) return false;
  if (!isNonEmptyString(value.source)) return false;
  if (value.sourceDisplayName !== undefined && typeof value.sourceDisplayName !== 'string') {
    return false;
  }
  if (!isNonEmptyString(value.sourceTaskId)) return false;
  if (!isNonEmptyString(value.kind)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (!isDashboardTaskStatus(value.status)) return false;
  if (value.progress !== undefined && !isValidProgress(value.progress)) return false;
  if (!Array.isArray(value.actions) || !value.actions.every(isDashboardTaskAction)) return false;
  if (!isValidTimestamp(value.startedAt)) return false;
  if (value.completedAt !== undefined && !isValidTimestamp(value.completedAt)) return false;
  if (value.outputs !== undefined) {
    if (!Array.isArray(value.outputs) || !value.outputs.every(isDashboardTaskOutputRef)) {
      return false;
    }
  }
  if (value.currentStep !== undefined && typeof value.currentStep !== 'string') return false;
  if (value.error !== undefined && typeof value.error !== 'string') return false;
  if (value.conversationId !== undefined && typeof value.conversationId !== 'string') return false;
  if (value.workItemKind !== undefined && !isAgentWorkItemKind(value.workItemKind)) return false;

  return true;
}

export function isDashboardTaskEvent(value: unknown): value is DashboardTaskEvent {
  if (!isRecord(value)) return false;
  if (value.type !== 'added' && value.type !== 'updated' && value.type !== 'removed') {
    return false;
  }
  return isDashboardTask(value.task);
}

export function isDashboardTaskSourceCapabilities(
  value: unknown,
): value is DashboardTaskSourceCapabilities {
  if (!isRecord(value)) return false;
  return (
    isOptionalBoolean(value.cancel) &&
    isOptionalBoolean(value.retry) &&
    isOptionalBoolean(value.revealOutput)
  );
}

export function isDashboardTaskSource(value: unknown): value is DashboardTaskSource {
  if (!isRecord(value)) return false;
  if (value.contractVersion !== DASHBOARD_TASK_CONTRACT_VERSION) return false;
  if (!isNonEmptyString(value.source)) return false;
  if (value.sourceDisplayName !== undefined && typeof value.sourceDisplayName !== 'string') {
    return false;
  }
  if (value.capabilities !== undefined && !isDashboardTaskSourceCapabilities(value.capabilities)) {
    return false;
  }
  if (typeof value.getSnapshot !== 'function') return false;
  if (typeof value.onDidChangeTask !== 'function') return false;
  if (value.cancel !== undefined && typeof value.cancel !== 'function') return false;
  if (value.retry !== undefined && typeof value.retry !== 'function') return false;

  return true;
}

export function toDashboardTaskId(ref: DashboardTaskRef): string {
  return `${ref.source}:${ref.sourceTaskId}`;
}

export function toDashboardTaskRef(task: DashboardTask): DashboardTaskRef {
  return {
    source: task.source,
    sourceTaskId: task.sourceTaskId,
  };
}

export function isAbsoluteLocalRef(ref: string): boolean {
  return (
    ref.startsWith('/') ||
    ref.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(ref) ||
    /^file:/i.test(ref)
  );
}

export function normalizeDashboardLocalRef(ref: string): string | undefined {
  const normalized = ref.replace(/\\/g, '/');
  if (!normalized || isAbsoluteLocalRef(normalized)) {
    return undefined;
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return undefined;
  }
  return normalized;
}

export function clampDashboardTaskProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function isAgentWorkItemKind(value: unknown): value is DashboardTask['workItemKind'] {
  return value === 'media-task' || value === 'tool-background-task' || value === 'subagent';
}

function isValidProgress(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
