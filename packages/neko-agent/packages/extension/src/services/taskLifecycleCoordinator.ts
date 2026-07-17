import * as vscode from 'vscode';
import type { Task, TaskRunScope } from '@neko/shared';
import type {
  AgentConversationInterruptedEvent,
  AgentConversationInterruptionReason,
} from '../ai/agentManager';

export interface TaskLifecycleInterruptionEvent {
  readonly conversationId: string;
  readonly reason: AgentConversationInterruptionReason;
}

export interface TaskLifecycleInterruptionSource {
  readonly onDidConversationInterrupted: vscode.Event<TaskLifecycleInterruptionEvent>;
}

export interface TaskLifecycleQueryPort {
  list(): Promise<readonly Task[]>;
}

export interface TaskLifecycleCancelPort {
  cancel(scope: TaskRunScope): Promise<unknown>;
}

export interface TaskLifecycleCoordinatorOptions {
  readonly interruptions: TaskLifecycleInterruptionSource;
  readonly tasks: TaskLifecycleQueryPort;
  readonly taskCancellation: TaskLifecycleCancelPort;
}

/**
 * Compose-only bridge for Agent session interruption and task cancellation.
 *
 * Policy values come from task lifecycle metadata. This service only wires
 * events to narrow query/cancel ports.
 */
export class TaskLifecycleCoordinator implements vscode.Disposable {
  private readonly disposable: vscode.Disposable;

  constructor(private readonly options: TaskLifecycleCoordinatorOptions) {
    this.disposable = options.interruptions.onDidConversationInterrupted((event) => {
      void this.handleInterruption(event);
    });
  }

  dispose(): void {
    this.disposable.dispose();
  }

  private async handleInterruption(event: AgentConversationInterruptedEvent): Promise<void> {
    const tasks = await this.options.tasks.list();
    const cancelTargets = tasks.filter((task) => shouldCancelForInterruption(task, event));

    await Promise.allSettled(
      cancelTargets.map((task) => this.options.taskCancellation.cancel(task.scope)),
    );
  }
}

export function shouldCancelForInterruption(
  task: Task,
  event: TaskLifecycleInterruptionEvent,
): boolean {
  const lifecycle = task.lifecycle;
  if (!lifecycle || task.scope.conversationId !== event.conversationId) {
    return false;
  }
  if (task.status !== 'pending' && task.status !== 'running') {
    return false;
  }
  return (
    lifecycle.interruptPolicy === 'cancel-with-agent' && lifecycle.costPhase === 'token-active'
  );
}
