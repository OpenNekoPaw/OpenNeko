import { describe, expect, it } from 'vitest';
import {
  TASK_PROJECTION_CONTRACT_VERSION,
  clampTaskProjectionProgress,
  isTaskProjection,
  isTaskProjectionDisposableLike,
  isTaskProjectionOutputRef,
  isTaskProjectionSource,
  toTaskProjectionId,
  toTaskProjectionRef,
  type TaskProjection,
  type TaskProjectionSource,
} from '../task-projection';

const baseTask: TaskProjection = {
  taskId: 'neko-agent:task-1',
  source: 'neko-agent',
  sourceTaskId: 'task-1',
  kind: 'generation',
  title: 'Generate image',
  status: 'running',
  progress: 25,
  actions: ['cancel'],
  startedAt: 1,
};

describe('task projection contracts', () => {
  it('validates task projections and progress bounds', () => {
    expect(isTaskProjection(baseTask)).toBe(true);
    expect(isTaskProjection({ ...baseTask, progress: -1 })).toBe(false);
    expect(isTaskProjection({ ...baseTask, progress: 101 })).toBe(false);
    expect(isTaskProjection({ ...baseTask, progress: Number.NaN })).toBe(false);
    const { progress: _progress, ...taskWithoutProgress } = baseTask;
    expect(isTaskProjection(taskWithoutProgress)).toBe(true);
  });

  it('rejects absolute local output refs and accepts portable refs', () => {
    expect(isTaskProjectionOutputRef({ kind: 'file', ref: '/tmp/output.png' })).toBe(false);
    expect(isTaskProjectionOutputRef({ kind: 'file', ref: 'C:\\tmp\\output.png' })).toBe(false);
    expect(isTaskProjectionOutputRef({ kind: 'folder', ref: 'file:///tmp/output' })).toBe(false);
    expect(isTaskProjectionOutputRef({ kind: 'file', ref: 'renders/output.mp4' })).toBe(true);
    expect(isTaskProjectionOutputRef({ kind: 'folder', ref: '${workspaceFolder}/renders' })).toBe(
      true,
    );
    expect(isTaskProjectionOutputRef({ kind: 'url', ref: 'https://example.com/output.png' })).toBe(
      true,
    );
  });

  it('clamps projected progress deterministically', () => {
    expect(clampTaskProjectionProgress(Number.NaN)).toBe(0);
    expect(clampTaskProjectionProgress(-1)).toBe(0);
    expect(clampTaskProjectionProgress(45)).toBe(45);
    expect(clampTaskProjectionProgress(101)).toBe(100);
  });

  it('validates source capabilities and disposable shape', () => {
    const source: TaskProjectionSource = {
      contractVersion: TASK_PROJECTION_CONTRACT_VERSION,
      source: 'neko-agent',
      capabilities: { cancel: true, retry: true, revealOutput: true },
      getSnapshot: async () => [baseTask],
      onDidChangeTask: () => ({ dispose() {} }),
      cancel: async () => undefined,
      retry: async () => undefined,
    };
    expect(isTaskProjectionSource(source)).toBe(true);
    expect(isTaskProjectionDisposableLike({ dispose() {} })).toBe(true);
    expect(isTaskProjectionSource({ ...source, contractVersion: 2 })).toBe(false);
  });

  it('builds stable projection identities', () => {
    expect(toTaskProjectionId({ source: 'neko-agent', sourceTaskId: 'task-1' })).toBe(
      'neko-agent:task-1',
    );
    expect(toTaskProjectionRef(baseTask)).toEqual({
      source: 'neko-agent',
      sourceTaskId: 'task-1',
    });
  });
});
