export const TASK_PROJECTION_CONTRACT_VERSION = 1;

export type TaskProjectionStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type TaskProjectionAction = 'cancel' | 'retry' | 'reveal-output';

export type TaskProjectionOutputKind = 'file' | 'folder' | 'url' | 'asset';

export interface TaskProjectionRef {
  readonly source: string;
  readonly sourceTaskId: string;
}

export interface TaskProjectionOutputRef {
  readonly kind: TaskProjectionOutputKind;
  readonly ref: string;
  readonly label?: string;
}

export interface TaskProjection {
  readonly taskId: string;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly sourceTaskId: string;
  readonly kind: string;
  readonly title: string;
  readonly status: TaskProjectionStatus;
  readonly progress?: number;
  readonly actions: readonly TaskProjectionAction[];
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly outputs?: readonly TaskProjectionOutputRef[];
  readonly currentStep?: string;
  readonly error?: string;
  readonly conversationId?: string;
  readonly workItemKind?: 'media-task' | 'tool-background-task' | 'subagent';
}

export interface TaskProjectionEvent {
  readonly task: TaskProjection;
  readonly type: 'added' | 'updated' | 'removed';
}

export interface TaskProjectionSourceCapabilities {
  readonly cancel?: boolean;
  readonly retry?: boolean;
  readonly revealOutput?: boolean;
}

export interface TaskProjectionDisposableLike {
  dispose(): void;
}

export interface TaskProjectionSource {
  readonly contractVersion: typeof TASK_PROJECTION_CONTRACT_VERSION;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly capabilities?: TaskProjectionSourceCapabilities;
  getSnapshot(): Promise<TaskProjection[]>;
  onDidChangeTask(listener: (event: TaskProjectionEvent) => void): TaskProjectionDisposableLike;
  cancel?(task: TaskProjectionRef): Promise<void>;
  retry?(task: TaskProjectionRef): Promise<void>;
}

export const TASK_PROJECTION_STATUSES: readonly TaskProjectionStatus[] = [
  'queued',
  'running',
  'done',
  'error',
  'cancelled',
] as const;

export const TASK_PROJECTION_ACTIONS: readonly TaskProjectionAction[] = [
  'cancel',
  'retry',
  'reveal-output',
] as const;

export const TASK_PROJECTION_OUTPUT_KINDS: readonly TaskProjectionOutputKind[] = [
  'file',
  'folder',
  'url',
  'asset',
] as const;

export function isTaskProjectionStatus(value: unknown): value is TaskProjectionStatus {
  return TASK_PROJECTION_STATUSES.includes(value as TaskProjectionStatus);
}

export function isTaskProjectionAction(value: unknown): value is TaskProjectionAction {
  return TASK_PROJECTION_ACTIONS.includes(value as TaskProjectionAction);
}

export function isTaskProjectionOutputKind(value: unknown): value is TaskProjectionOutputKind {
  return TASK_PROJECTION_OUTPUT_KINDS.includes(value as TaskProjectionOutputKind);
}

export function isTaskProjectionDisposableLike(
  value: unknown,
): value is TaskProjectionDisposableLike {
  return isRecord(value) && typeof value.dispose === 'function';
}

export function isTaskProjectionOutputRef(value: unknown): value is TaskProjectionOutputRef {
  if (!isRecord(value)) return false;
  if (!isTaskProjectionOutputKind(value.kind)) return false;
  if (!isNonEmptyString(value.ref)) return false;
  if (value.label !== undefined && typeof value.label !== 'string') return false;

  if ((value.kind === 'file' || value.kind === 'folder') && isAbsoluteLocalRef(value.ref)) {
    return false;
  }

  return true;
}

export function isTaskProjection(value: unknown): value is TaskProjection {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.taskId)) return false;
  if (!isNonEmptyString(value.source)) return false;
  if (value.sourceDisplayName !== undefined && typeof value.sourceDisplayName !== 'string') {
    return false;
  }
  if (!isNonEmptyString(value.sourceTaskId)) return false;
  if (!isNonEmptyString(value.kind)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (!isTaskProjectionStatus(value.status)) return false;
  if (value.progress !== undefined && !isValidProgress(value.progress)) return false;
  if (!Array.isArray(value.actions) || !value.actions.every(isTaskProjectionAction)) return false;
  if (!isValidTimestamp(value.startedAt)) return false;
  if (value.completedAt !== undefined && !isValidTimestamp(value.completedAt)) return false;
  if (value.outputs !== undefined) {
    if (!Array.isArray(value.outputs) || !value.outputs.every(isTaskProjectionOutputRef)) {
      return false;
    }
  }
  if (value.currentStep !== undefined && typeof value.currentStep !== 'string') return false;
  if (value.error !== undefined && typeof value.error !== 'string') return false;
  if (value.conversationId !== undefined && typeof value.conversationId !== 'string') return false;
  if (value.workItemKind !== undefined && !isAgentWorkItemKind(value.workItemKind)) return false;

  return true;
}

export function isTaskProjectionEvent(value: unknown): value is TaskProjectionEvent {
  if (!isRecord(value)) return false;
  if (value.type !== 'added' && value.type !== 'updated' && value.type !== 'removed') {
    return false;
  }
  return isTaskProjection(value.task);
}

export function isTaskProjectionSourceCapabilities(
  value: unknown,
): value is TaskProjectionSourceCapabilities {
  if (!isRecord(value)) return false;
  return (
    isOptionalBoolean(value.cancel) &&
    isOptionalBoolean(value.retry) &&
    isOptionalBoolean(value.revealOutput)
  );
}

export function isTaskProjectionSource(value: unknown): value is TaskProjectionSource {
  if (!isRecord(value)) return false;
  if (value.contractVersion !== TASK_PROJECTION_CONTRACT_VERSION) return false;
  if (!isNonEmptyString(value.source)) return false;
  if (value.sourceDisplayName !== undefined && typeof value.sourceDisplayName !== 'string') {
    return false;
  }
  if (value.capabilities !== undefined && !isTaskProjectionSourceCapabilities(value.capabilities)) {
    return false;
  }
  if (typeof value.getSnapshot !== 'function') return false;
  if (typeof value.onDidChangeTask !== 'function') return false;
  if (value.cancel !== undefined && typeof value.cancel !== 'function') return false;
  if (value.retry !== undefined && typeof value.retry !== 'function') return false;

  return true;
}

export function toTaskProjectionId(ref: TaskProjectionRef): string {
  return `${ref.source}:${ref.sourceTaskId}`;
}

export function toTaskProjectionRef(task: TaskProjection): TaskProjectionRef {
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

export function normalizeTaskProjectionLocalRef(ref: string): string | undefined {
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

export function clampTaskProjectionProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function isAgentWorkItemKind(value: unknown): value is TaskProjection['workItemKind'] {
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
