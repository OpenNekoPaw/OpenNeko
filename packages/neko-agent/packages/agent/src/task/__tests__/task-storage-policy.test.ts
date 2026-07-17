import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  buildAgentTaskHostPrivateLeaseDiagnostic,
  buildTaskStorageCleanupPlan,
  createAgentTaskHostPrivateLease,
  filterRecoverableTasks,
  isRecoverableTaskStatus,
  isTaskCleanupCandidate,
  isTaskCleanupStatus,
} from '../task-storage-policy';
import type { SerializableTask, TaskStatus } from '@neko/shared';

function makeTask(id: string, status: TaskStatus, updatedAt: number): SerializableTask {
  return {
    id,
    type: 'custom',
    status,
    input: { type: 'custom', payload: {} },
    progress: 0,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('task storage policy', () => {
  it('exposes default task persistence policy for host adapters', () => {
    expect(DEFAULT_TASK_CLEANUP_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(DEFAULT_TASK_RETENTION_PERIOD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('classifies recoverable and cleanup task statuses', () => {
    expect(isRecoverableTaskStatus('pending')).toBe(true);
    expect(isRecoverableTaskStatus('running')).toBe(true);
    expect(isRecoverableTaskStatus('completed')).toBe(false);

    expect(isTaskCleanupStatus('completed')).toBe(true);
    expect(isTaskCleanupStatus('failed')).toBe(true);
    expect(isTaskCleanupStatus('cancelled')).toBe(true);
    expect(isTaskCleanupStatus('running')).toBe(false);
  });

  it('filters recoverable tasks defensively', () => {
    const pending = makeTask('pending', 'pending', 100);
    const running = makeTask('running', 'running', 100);
    const completed = makeTask('completed', 'completed', 100);

    const result = filterRecoverableTasks([pending, running, completed]);
    expect(result.map((task) => task.id)).toEqual(['pending', 'running']);
    expect(result[0]).not.toBe(pending);
  });

  it('builds cleanup plans for old terminal tasks only', () => {
    const tasks = [
      makeTask('old-completed', 'completed', 100),
      makeTask('old-failed', 'failed', 100),
      makeTask('old-cancelled', 'cancelled', 100),
      makeTask('old-running', 'running', 100),
      makeTask('fresh-completed', 'completed', 950),
    ];

    expect(isTaskCleanupCandidate(tasks[0]!, 500)).toBe(true);
    expect(isTaskCleanupCandidate(tasks[3]!, 500)).toBe(false);

    const plan = buildTaskStorageCleanupPlan({
      tasks,
      olderThanMs: 500,
      now: () => 1000,
    });

    expect(plan.removed.map((task) => task.id)).toEqual([
      'old-completed',
      'old-failed',
      'old-cancelled',
    ]);
    expect(plan.retained.map((task) => task.id)).toEqual(['old-running', 'fresh-completed']);
  });

  it('returns a host-private lease diagnostic when another surface asks for live controls', () => {
    const lease = createAgentTaskHostPrivateLease({
      taskId: 'task-1',
      ownerSurface: 'extension',
      leaseId: 'lease-1',
      recoveryHandle: 'vscode-state-key',
      controls: ['cancel', 'recover'],
    });

    expect(lease).toEqual({
      scope: 'host-private',
      taskId: 'task-1',
      ownerSurface: 'extension',
      leaseId: 'lease-1',
      recoveryHandle: 'vscode-state-key',
      controls: ['cancel', 'recover'],
    });
    expect(
      buildAgentTaskHostPrivateLeaseDiagnostic({
        lease,
        requestingSurface: 'extension',
        control: 'cancel',
      }),
    ).toBeUndefined();
    expect(
      buildAgentTaskHostPrivateLeaseDiagnostic({
        lease,
        requestingSurface: 'tui',
        control: 'cancel',
      }),
    ).toEqual(
      expect.objectContaining({
        code: 'hostPrivateLease',
        taskId: 'task-1',
        ownerSurface: 'extension',
        requestingSurface: 'tui',
        control: 'cancel',
      }),
    );
  });
});
