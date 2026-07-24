import type { CutExportTaskSnapshot } from '@neko-cut/domain';

export type CutExportStatusTone = 'neutral' | 'warning' | 'error';

export interface CutExportStatusProjection {
  readonly visible: boolean;
  readonly text: string;
  readonly tooltip: string;
  readonly tone: CutExportStatusTone;
  readonly documentUri?: string;
}

export interface CutExportStatusMessages {
  readonly runningText: (label: string) => string;
  readonly runningCount: (count: number) => string;
  readonly exporting: (path: string) => string;
  readonly completedText: (name: string) => string;
  readonly completed: (path: string) => string;
  readonly failedText: string;
  readonly failed: (path: string) => string;
  readonly cancelledText: string;
  readonly cancelled: (path: string) => string;
}

const EMPTY_PROJECTION: CutExportStatusProjection = {
  visible: false,
  text: '',
  tooltip: '',
  tone: 'neutral',
};

export function projectCutExportStatus(
  tasks: readonly CutExportTaskSnapshot[],
  messages: CutExportStatusMessages,
): CutExportStatusProjection {
  if (tasks.length === 0) return EMPTY_PROJECTION;

  const running = tasks.filter((task) => task.status === 'running');
  if (running.length > 0) {
    const selected = latestTask(running);
    const label =
      running.length === 1 ? outputName(selected) : messages.runningCount(running.length);
    return {
      visible: true,
      text: `$(sync~spin) ${messages.runningText(label)}`,
      tooltip: running
        .sort(compareNewestFirst)
        .map((task) => messages.exporting(task.outputWorkspaceRelativePath))
        .join('\n'),
      tone: 'warning',
      documentUri: selected.documentUri,
    };
  }

  const selected = latestTask(tasks);
  switch (selected.status) {
    case 'completed':
      return {
        visible: true,
        text: `$(check) ${messages.completedText(outputName(selected))}`,
        tooltip: messages.completed(selected.outputWorkspaceRelativePath),
        tone: 'neutral',
        documentUri: selected.documentUri,
      };
    case 'failed':
      return {
        visible: true,
        text: `$(error) ${messages.failedText}`,
        tooltip: messages.failed(selected.outputWorkspaceRelativePath),
        tone: 'error',
        documentUri: selected.documentUri,
      };
    case 'cancelled':
      return {
        visible: true,
        text: `$(circle-slash) ${messages.cancelledText}`,
        tooltip: messages.cancelled(selected.outputWorkspaceRelativePath),
        tone: 'neutral',
        documentUri: selected.documentUri,
      };
    case 'running':
      throw new Error('Running Cut export task must be projected by the running-task branch.');
  }
}

function latestTask(tasks: readonly CutExportTaskSnapshot[]): CutExportTaskSnapshot {
  const selected = [...tasks].sort(compareNewestFirst)[0];
  if (!selected) throw new Error('Cut export status projection requires at least one task.');
  return selected;
}

function compareNewestFirst(left: CutExportTaskSnapshot, right: CutExportTaskSnapshot): number {
  return (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
}

function outputName(task: CutExportTaskSnapshot): string {
  const segments = task.outputWorkspaceRelativePath.split('/');
  return segments[segments.length - 1] || task.outputWorkspaceRelativePath;
}
