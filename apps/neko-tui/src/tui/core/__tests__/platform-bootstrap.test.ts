import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCLITaskManager } from '../platform-bootstrap';

const mocks = vi.hoisted(() => ({
  taskManagerOptions: [] as unknown[],
}));

vi.mock('@neko/agent', () => ({
  TaskManager: class TaskManager {
    constructor(options: unknown) {
      mocks.taskManagerOptions.push(options);
    }
  },
}));

describe('createCLITaskManager', () => {
  beforeEach(() => {
    mocks.taskManagerOptions.length = 0;
  });

  it('uses the shared Host binding for Task and recovery persistence', () => {
    const taskStorage = { kind: 'sqlite-task-storage' };
    const taskRecoveryStorage = { kind: 'sqlite-task-recovery-storage' };

    createCLITaskManager({
      taskStorage: taskStorage as never,
      taskRecoveryStorage: taskRecoveryStorage as never,
    });

    expect(mocks.taskManagerOptions[0]).toEqual({
      storage: taskStorage,
      recoveryStorage: taskRecoveryStorage,
    });
  });
});
