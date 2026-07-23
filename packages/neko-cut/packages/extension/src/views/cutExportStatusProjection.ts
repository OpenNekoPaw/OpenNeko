import type { CutExportTaskSnapshot } from '@neko-cut/domain';

export type CutExportStatusTone = 'neutral' | 'warning' | 'error';

export interface CutExportStatusProjection {
  readonly visible: boolean;
  readonly text: string;
  readonly tooltip: string;
  readonly tone: CutExportStatusTone;
  readonly documentUri?: string;
}

const EMPTY_PROJECTION: CutExportStatusProjection = {
  visible: false,
  text: '',
  tooltip: '',
  tone: 'neutral',
};

export function projectCutExportStatus(
  tasks: readonly CutExportTaskSnapshot[],
): CutExportStatusProjection {
  if (tasks.length === 0) return EMPTY_PROJECTION;

  const running = tasks.filter((task) => task.status === 'running');
  if (running.length > 0) {
    const selected = latestTask(running);
    const label = running.length === 1 ? outputName(selected) : `${running.length} exports`;
    return {
      visible: true,
      text: `$(sync~spin) Cut: ${label}`,
      tooltip: running
        .sort(compareNewestFirst)
        .map((task) => `Exporting ${task.outputWorkspaceRelativePath}`)
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
        text: `$(check) Cut: ${outputName(selected)}`,
        tooltip: `Export completed: ${selected.outputWorkspaceRelativePath}`,
        tone: 'neutral',
        documentUri: selected.documentUri,
      };
    case 'failed':
      return {
        visible: true,
        text: '$(error) Cut export failed',
        tooltip: `Export failed: ${selected.outputWorkspaceRelativePath}\n${selected.error ?? 'Unknown error'}`,
        tone: 'error',
        documentUri: selected.documentUri,
      };
    case 'cancelled':
      return {
        visible: true,
        text: '$(circle-slash) Cut export cancelled',
        tooltip: `Export cancelled: ${selected.outputWorkspaceRelativePath}`,
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
