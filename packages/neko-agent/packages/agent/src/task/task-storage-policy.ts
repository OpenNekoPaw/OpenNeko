import type { SerializableTask, TaskStatus } from '@neko/shared';

export const DEFAULT_TASK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_TASK_RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const RECOVERABLE_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'running'];
export const CLEANUP_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export type AgentTaskHostSurface = 'extension' | 'tui' | 'headless';
export type AgentTaskLeaseControl = 'resume' | 'cancel' | 'attach' | 'recover';

export interface TaskStorageCleanupPlan {
  readonly retained: SerializableTask[];
  readonly removed: SerializableTask[];
}

export interface AgentTaskHostPrivateLease {
  readonly scope: 'host-private';
  readonly taskId: string;
  readonly ownerSurface: AgentTaskHostSurface;
  readonly leaseId: string;
  readonly recoveryHandle?: string;
  readonly controls: readonly AgentTaskLeaseControl[];
}

export interface AgentTaskLeaseDiagnostic {
  readonly code: 'hostPrivateLease';
  readonly taskId: string;
  readonly ownerSurface: AgentTaskHostSurface;
  readonly requestingSurface: AgentTaskHostSurface;
  readonly control: AgentTaskLeaseControl;
  readonly message: string;
}

export function isRecoverableTaskStatus(status: TaskStatus): boolean {
  return RECOVERABLE_TASK_STATUSES.includes(status);
}

export function isTaskCleanupStatus(status: TaskStatus): boolean {
  return CLEANUP_TASK_STATUSES.includes(status);
}

export function isRecoverableTask(task: Pick<SerializableTask, 'status'>): boolean {
  return isRecoverableTaskStatus(task.status);
}

export function isTaskCleanupCandidate(
  task: Pick<SerializableTask, 'status' | 'updatedAt'>,
  cutoffTimestamp: number,
): boolean {
  return isTaskCleanupStatus(task.status) && task.updatedAt < cutoffTimestamp;
}

export function filterRecoverableTasks(tasks: readonly SerializableTask[]): SerializableTask[] {
  return tasks.filter(isRecoverableTask).map((task) => ({ ...task }));
}

export function createAgentTaskHostPrivateLease(input: {
  readonly taskId: string;
  readonly ownerSurface: AgentTaskHostSurface;
  readonly leaseId: string;
  readonly recoveryHandle?: string;
  readonly controls: readonly AgentTaskLeaseControl[];
}): AgentTaskHostPrivateLease {
  const taskId = input.taskId.trim();
  const leaseId = input.leaseId.trim();
  if (!taskId || !leaseId) {
    throw new Error('Host-private Agent task leases require taskId and leaseId');
  }
  return {
    scope: 'host-private',
    taskId,
    ownerSurface: input.ownerSurface,
    leaseId,
    ...(input.recoveryHandle ? { recoveryHandle: input.recoveryHandle } : {}),
    controls: [...input.controls],
  };
}

export function buildAgentTaskHostPrivateLeaseDiagnostic(input: {
  readonly lease: AgentTaskHostPrivateLease;
  readonly requestingSurface: AgentTaskHostSurface;
  readonly control: AgentTaskLeaseControl;
}): AgentTaskLeaseDiagnostic | undefined {
  if (input.lease.ownerSurface === input.requestingSurface) {
    return undefined;
  }
  return {
    code: 'hostPrivateLease',
    taskId: input.lease.taskId,
    ownerSurface: input.lease.ownerSurface,
    requestingSurface: input.requestingSurface,
    control: input.control,
    message: `Agent task ${input.lease.taskId} has a host-private ${input.lease.ownerSurface} lease and cannot ${input.control} from ${input.requestingSurface}.`,
  };
}

export function buildTaskStorageCleanupPlan(input: {
  readonly tasks: readonly SerializableTask[];
  readonly olderThanMs: number;
  readonly now?: () => number;
}): TaskStorageCleanupPlan {
  const cutoff = (input.now?.() ?? Date.now()) - input.olderThanMs;
  const retained: SerializableTask[] = [];
  const removed: SerializableTask[] = [];

  for (const task of input.tasks) {
    if (isTaskCleanupCandidate(task, cutoff)) {
      removed.push(task);
    } else {
      retained.push(task);
    }
  }

  return { retained, removed };
}
