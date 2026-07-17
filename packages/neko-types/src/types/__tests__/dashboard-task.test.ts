import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_PROJECT_GLOB_EXTENSION_LIST,
  DASHBOARD_PROJECT_TYPES,
  getDashboardProjectTypeForExtension,
  isDashboardProjectType,
} from '../dashboard-project';
import {
  DASHBOARD_TASK_CONTRACT_VERSION,
  clampDashboardTaskProgress,
  isAbsoluteLocalRef,
  isDashboardDisposableLike,
  isDashboardTask,
  isDashboardTaskOutputRef,
  isDashboardTaskSource,
  normalizeDashboardLocalRef,
  toDashboardTaskId,
  toDashboardTaskRef,
  type DashboardTask,
  type DashboardTaskSource,
} from '../dashboard-task';

const baseTask: DashboardTask = {
  taskId: 'neko-agent:task-1',
  source: 'neko-agent',
  sourceTaskId: 'task-1',
  kind: 'generate-image',
  title: 'Generate shot',
  status: 'running',
  progress: 45,
  actions: ['cancel'],
  startedAt: 1_700_000_000_000,
};

describe('dashboard task contracts', () => {
  it('accepts a valid task DTO', () => {
    expect(
      isDashboardTask({
        ...baseTask,
        outputs: [{ kind: 'file', ref: 'outputs/shot.png', label: 'Shot' }],
        workItemKind: 'media-task',
      }),
    ).toBe(true);
  });

  it('rejects invalid progress values', () => {
    expect(isDashboardTask({ ...baseTask, progress: -1 })).toBe(false);
    expect(isDashboardTask({ ...baseTask, progress: 101 })).toBe(false);
    expect(isDashboardTask({ ...baseTask, progress: Number.NaN })).toBe(false);
  });

  it('allows unknown progress by omitting the field', () => {
    const { progress: _progress, ...taskWithoutProgress } = baseTask;

    expect(isDashboardTask(taskWithoutProgress)).toBe(true);
  });

  it('rejects absolute local output refs', () => {
    expect(isDashboardTaskOutputRef({ kind: 'file', ref: '/tmp/output.png' })).toBe(false);
    expect(isDashboardTaskOutputRef({ kind: 'file', ref: 'C:\\tmp\\output.png' })).toBe(false);
    expect(isDashboardTaskOutputRef({ kind: 'folder', ref: 'file:///tmp/output' })).toBe(false);
  });

  it('accepts workspace-relative and variable output refs', () => {
    expect(isDashboardTaskOutputRef({ kind: 'file', ref: 'renders/output.mp4' })).toBe(true);
    expect(isDashboardTaskOutputRef({ kind: 'folder', ref: '${workspaceFolder}/renders' })).toBe(
      true,
    );
  });

  it('accepts remote URL output refs for url outputs', () => {
    expect(isDashboardTaskOutputRef({ kind: 'url', ref: 'https://example.com/output.png' })).toBe(
      true,
    );
  });

  it('detects absolute local refs', () => {
    expect(isAbsoluteLocalRef('/tmp/file.png')).toBe(true);
    expect(isAbsoluteLocalRef('\\server\\share\\file.png')).toBe(true);
    expect(isAbsoluteLocalRef('D:/tmp/file.png')).toBe(true);
    expect(isAbsoluteLocalRef('file:///tmp/file.png')).toBe(true);
    expect(isAbsoluteLocalRef('renders/file.png')).toBe(false);
  });

  it('normalizes local refs and clamps progress for source adapters', () => {
    expect(normalizeDashboardLocalRef('renders\\file.png')).toBe('renders/file.png');
    expect(normalizeDashboardLocalRef('../file.png')).toBeUndefined();
    expect(normalizeDashboardLocalRef('/tmp/file.png')).toBeUndefined();
    expect(clampDashboardTaskProgress(Number.NaN)).toBe(0);
    expect(clampDashboardTaskProgress(-1)).toBe(0);
    expect(clampDashboardTaskProgress(45)).toBe(45);
    expect(clampDashboardTaskProgress(101)).toBe(100);
  });

  it('accepts a valid task source shape', () => {
    const source: DashboardTaskSource = {
      contractVersion: DASHBOARD_TASK_CONTRACT_VERSION,
      source: 'neko-agent',
      capabilities: { cancel: true, retry: true, revealOutput: true },
      async getSnapshot() {
        return [baseTask];
      },
      onDidChangeTask() {
        return { dispose() {} };
      },
    };

    expect(isDashboardTaskSource(source)).toBe(true);
  });

  it('rejects invalid task source shapes', () => {
    expect(
      isDashboardTaskSource({
        source: 'neko-agent',
        getSnapshot: async () => [],
        onDidChangeTask: () => ({ dispose() {} }),
      }),
    ).toBe(false);

    expect(
      isDashboardTaskSource({
        contractVersion: DASHBOARD_TASK_CONTRACT_VERSION,
        source: '',
        getSnapshot: async () => [],
        onDidChangeTask: () => ({ dispose() {} }),
      }),
    ).toBe(false);

    expect(
      isDashboardTaskSource({
        contractVersion: DASHBOARD_TASK_CONTRACT_VERSION,
        source: 'neko-agent',
        getSnapshot: [],
        onDidChangeTask: () => ({ dispose() {} }),
      }),
    ).toBe(false);
  });

  it('recognizes disposable-like objects without vscode types', () => {
    expect(isDashboardDisposableLike({ dispose() {} })).toBe(true);
    expect(isDashboardDisposableLike({ dispose: true })).toBe(false);
  });

  it('converts between task references and aggregation ids', () => {
    expect(toDashboardTaskId({ source: 'neko-agent', sourceTaskId: 'task-1' })).toBe(
      'neko-agent:task-1',
    );
    expect(toDashboardTaskRef(baseTask)).toEqual({
      source: 'neko-agent',
      sourceTaskId: 'task-1',
    });
  });
});

describe('dashboard project contracts', () => {
  it('maps supported file extensions from the shared project SSOT', () => {
    expect(getDashboardProjectTypeForExtension('.fountain')).toBe('story');
    expect(getDashboardProjectTypeForExtension('.nkv')).toBe('video');
    expect(getDashboardProjectTypeForExtension('.NKC')).toBe('canvas');
    expect(getDashboardProjectTypeForExtension('.txt')).toBeUndefined();
  });

  it('validates project types and exposes the glob extension list', () => {
    expect(DASHBOARD_PROJECT_TYPES).toContain('story');
    expect(DASHBOARD_PROJECT_TYPES).toContain('audio');
    expect(isDashboardProjectType('puppet')).toBe(true);
    expect(isDashboardProjectType('unknown')).toBe(false);
    expect(DASHBOARD_PROJECT_GLOB_EXTENSION_LIST).toBe('fountain,nkc,nkv,nka,nkm,nkp,nks');
  });
});
