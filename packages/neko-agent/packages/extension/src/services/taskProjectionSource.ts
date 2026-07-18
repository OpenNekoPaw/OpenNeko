import {
  clampTaskProjectionProgress,
  toTaskProjectionId,
  type TaskProjection,
  type TaskProjectionAction,
  type TaskProjectionOutputRef,
} from '@neko/shared/types/task-projection';
import {
  getAgentWorkItemRuntimeKey,
  isTaskWorkItem,
  type AgentWorkItem,
  type AgentWorkItemTaskStatus,
} from '@neko-agent/types';

const SOURCE_ID = 'neko-agent';
const SOURCE_NAME = 'Neko Agent';

export class AgentTaskProjectionSource {
  toTaskProjection(item: AgentWorkItem): TaskProjection {
    const sourceTaskId = getAgentWorkItemRuntimeKey(item);
    const status = toTaskProjectionStatus(item.status);
    const outputs = this.toOutputRefs(item);

    return {
      taskId: toTaskProjectionId({ source: SOURCE_ID, sourceTaskId }),
      source: SOURCE_ID,
      sourceDisplayName: SOURCE_NAME,
      sourceTaskId,
      kind: item.kind,
      title: item.title,
      status,
      progress: clampTaskProjectionProgress(item.progress),
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

  getSnapshot(items: Iterable<AgentWorkItem>): TaskProjection[] {
    return Array.from(items, (item) => this.toTaskProjection(item)).sort(
      (a, b) => b.startedAt - a.startedAt,
    );
  }

  private toOutputRefs(item: AgentWorkItem): TaskProjectionOutputRef[] {
    if (!isTaskWorkItem(item)) {
      return [];
    }

    const outputs: TaskProjectionOutputRef[] = [];
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

export function toTaskProjectionStatus(status: AgentWorkItemTaskStatus): TaskProjection['status'] {
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
  status: TaskProjection['status'],
  outputs: readonly TaskProjectionOutputRef[],
): TaskProjectionAction[] {
  const actions: TaskProjectionAction[] = [];
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

function isTerminalStatus(status: TaskProjection['status']): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

function dedupeOutputs(outputs: TaskProjectionOutputRef[]): TaskProjectionOutputRef[] {
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
