import {
  clampDashboardTaskProgress,
  toDashboardTaskId,
  type DashboardTask,
  type DashboardTaskAction,
  type DashboardTaskOutputRef,
} from '@neko/shared/types/dashboard-task';
import {
  getAgentWorkItemRuntimeKey,
  isTaskWorkItem,
  type AgentWorkItem,
  type AgentWorkItemTaskStatus,
} from '@neko-agent/types';

const SOURCE_ID = 'neko-agent';
const SOURCE_NAME = 'Neko Agent';

export interface AgentTaskProjectionHost {
  readonly workspaceFolders?: readonly { readonly uri: { readonly fsPath: string } }[];
}

export interface AgentTaskProjectionSourceOptions {
  readonly host: AgentTaskProjectionHost;
}

export class AgentTaskProjectionSource {
  constructor(private readonly options: AgentTaskProjectionSourceOptions) {}

  toDashboardTask(item: AgentWorkItem): DashboardTask {
    const sourceTaskId = getAgentWorkItemRuntimeKey(item);
    const status = toDashboardStatus(item.status);
    const outputs = this.toOutputRefs(item);

    return {
      taskId: toDashboardTaskId({ source: SOURCE_ID, sourceTaskId }),
      source: SOURCE_ID,
      sourceDisplayName: SOURCE_NAME,
      sourceTaskId,
      kind: item.kind,
      title: item.title,
      status,
      progress: clampDashboardTaskProgress(item.progress),
      actions: toActions(item, status, outputs),
      startedAt: Date.parse(item.createdAt) || 0,
      ...(isTerminalStatus(status)
        ? { completedAt: Date.parse(item.updatedAt) || Date.now() }
        : {}),
      ...(outputs.length > 0 ? { outputs } : {}),
      ...(item.currentStepId ? { currentStep: item.currentStepId } : {}),
      ...(item.error ? { error: item.error } : {}),
      conversationId: item.conversationId,
      workItemKind: item.kind,
    };
  }

  getSnapshot(items: Iterable<AgentWorkItem>): DashboardTask[] {
    return Array.from(items, (item) => this.toDashboardTask(item)).sort(
      (a, b) => b.startedAt - a.startedAt,
    );
  }

  private toOutputRefs(item: AgentWorkItem): DashboardTaskOutputRef[] {
    if (!isTaskWorkItem(item)) {
      return [];
    }

    const outputs: DashboardTaskOutputRef[] = [];
    for (const url of item.task.result?.urls ?? []) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        outputs.push({ kind: 'url', ref: url, label: 'Generated output' });
      }
    }

    for (const asset of item.task.result?.assets ?? []) {
      outputs.push({ kind: 'asset', ref: asset.id, label: asset.id });
    }

    return dedupeOutputs(outputs);
  }
}

export function toDashboardStatus(status: AgentWorkItemTaskStatus): DashboardTask['status'] {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'processing':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
  }
}

function toActions(
  item: AgentWorkItem,
  status: DashboardTask['status'],
  outputs: readonly DashboardTaskOutputRef[],
): DashboardTaskAction[] {
  const actions: DashboardTaskAction[] = [];
  if ((status === 'queued' || status === 'running') && item.kind !== 'subagent') {
    actions.push('cancel');
  }
  if (status === 'error' && item.kind === 'tool-background-task') {
    actions.push('retry');
  }
  if (outputs.some((output) => output.kind === 'file' || output.kind === 'folder')) {
    actions.push('reveal-output');
  }
  return actions;
}

function isTerminalStatus(status: DashboardTask['status']): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

function dedupeOutputs(outputs: DashboardTaskOutputRef[]): DashboardTaskOutputRef[] {
  const seen = new Set<string>();
  return outputs.filter((output) => {
    const key = `${output.kind}:${output.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
