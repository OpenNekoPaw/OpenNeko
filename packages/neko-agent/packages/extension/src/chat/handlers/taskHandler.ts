/**
 * Task Handler - Handles task-related webview messages
 *
 * Responsible for:
 * - Bridging task runtime messages to the webview
 * - Injecting task manager and media service adapters
 * - Executing VSCode-only open-file/open-external effects
 * - Re-generating webview URIs from local paths for session reload
 */

import * as vscode from 'vscode';
import {
  runCancelTaskRuntime,
  runRetryTaskRuntime,
  runSendTasksRuntime,
  runViewTaskResultRuntime,
  type AgentTaskLeaseDiagnostic,
  type TaskActionRejectPlan,
  type TaskResultOpenPlan,
  type TaskRuntimeDeps,
  type TaskRuntimeEffects,
  type TaskRuntimeMessage,
} from '@neko/agent';
import type { ITaskManager as TaskManager, TaskRunScope } from '@neko/shared';
import { getLogger } from '../../base';
import type { AgentWorkItemProjectionSource } from '../../services/workItemProjectionSource';
import type { AgentLocalResourceAccess } from '../../services/localResourceAccess';
import {
  resolveGeneratedAssetOpenPath,
  type GeneratedAssetLookup,
} from '../../services/generatedAssetOpenResolver';

const logger = getLogger('TaskHandler');

/**
 * Dependencies for TaskHandler
 */
export interface TaskHandlerDeps {
  taskManager?: TaskManager;
  workItemProjections?: AgentWorkItemProjectionSource;
  localResourceAccess?: AgentLocalResourceAccess;
  generatedAssetLookup?: GeneratedAssetLookup;
  hostPrivateTaskLeaseGuard?: TaskRuntimeDeps['hostPrivateLeaseGuard'];
}

/**
 * Handler for task-related webview messages
 */
export class TaskHandler {
  constructor(private deps: TaskHandlerDeps) {}

  updateDeps(partial: Partial<TaskHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Send all tasks to webview
   */
  async sendTasks(webview: vscode.Webview, conversationId: string): Promise<void> {
    await this._runTaskRuntime(() =>
      runSendTasksRuntime(
        { conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle task cancellation
   */
  async handleCancelTask(webview: vscode.Webview, scope: TaskRunScope): Promise<void> {
    await this._runTaskRuntime(() =>
      runCancelTaskRuntime(
        { scope, taskId: scope.childRunId, conversationId: scope.conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle task retry — re-submit the failed task with the same payload
   */
  async handleRetryTask(webview: vscode.Webview, scope: TaskRunScope): Promise<void> {
    await this._runTaskRuntime(() =>
      runRetryTaskRuntime(
        { scope, taskId: scope.childRunId, conversationId: scope.conversationId },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(webview),
      ),
    );
  }

  /**
   * Handle viewing task result
   */
  async handleViewTaskResult(scope: TaskRunScope, resultRef?: string): Promise<void> {
    await this._runTaskRuntime(() =>
      runViewTaskResultRuntime(
        {
          scope,
          taskId: scope.childRunId,
          conversationId: scope.conversationId,
          ...(resultRef ? { resultRef } : {}),
        },
        this._createTaskRuntimeDeps(),
        this._createTaskRuntimeEffects(),
      ),
    );
  }

  /**
   * Bridge runtime dependencies to extension-owned services.
   */
  private _createTaskRuntimeDeps(): TaskRuntimeDeps {
    return {
      ...(this.deps.taskManager ? { taskManager: this.deps.taskManager } : {}),
      ...(this.deps.hostPrivateTaskLeaseGuard
        ? { hostPrivateLeaseGuard: this.deps.hostPrivateTaskLeaseGuard }
        : {}),
    };
  }

  private _createTaskRuntimeEffects(webview?: vscode.Webview): TaskRuntimeEffects {
    return {
      postMessage: async (message: TaskRuntimeMessage): Promise<void> => {
        this.deps.workItemProjections?.acceptWebviewMessage(message);
        await webview?.postMessage(message);
      },
      openTaskResult: (plan: TaskResultOpenPlan) => this.executeOpenPlan(plan),
      onRejectedAction: ({ action, plan }) => this.logRejectedTaskAction(action, plan),
      onTaskRetried: ({ taskId, newTaskId }) => {
        logger.debug('Task retried', { originalTaskId: taskId, newTaskId });
      },
      onRetryFailed: ({ taskId, error }) => {
        logger.error('Failed to retry task', { taskId, error });
      },
      onMediaDeleteFailed: ({ taskId, error }) => {
        logger.debug('Ignoring media task delete failure during task cleanup', { taskId, error });
      },
      onHostPrivateLeaseDiagnostic: (diagnostic) => this.logHostPrivateLeaseDiagnostic(diagnostic),
    };
  }

  private async _runTaskRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Task runtime bridge failed', error);
    }
  }

  private toWebviewUri(webview: vscode.Webview, path: string): string | undefined {
    if (this.deps.localResourceAccess) {
      return this.deps.localResourceAccess.toWebviewUri(webview, path, 'neko-agent.task');
    }
    logger.warn('Local resource access service unavailable for task media projection', { path });
    return undefined;
  }

  private logRejectedTaskAction(action: string, plan: TaskActionRejectPlan): void {
    logger.warn(`Cannot ${action} task`, {
      taskId: plan.taskId,
      conversationId: plan.conversationId,
      taskConversationId: plan.taskConversationId,
      reason: plan.reason,
    });
  }

  private logHostPrivateLeaseDiagnostic(diagnostic: AgentTaskLeaseDiagnostic): void {
    logger.warn(diagnostic.message, {
      taskId: diagnostic.taskId,
      ownerSurface: diagnostic.ownerSurface,
      requestingSurface: diagnostic.requestingSurface,
      control: diagnostic.control,
    });
  }

  private async executeOpenPlan(plan: TaskResultOpenPlan): Promise<void> {
    if (plan.kind === 'open-file') {
      await this.openInVSCode(plan.filePath);
      return;
    }

    const generatedAssetPath = resolveGeneratedAssetOpenPath(
      plan.url,
      this.deps.generatedAssetLookup,
    );
    if (generatedAssetPath) {
      await this.openInVSCode(generatedAssetPath);
      return;
    }

    if (plan.url.startsWith('generated-assets/')) {
      throw new Error(`Generated asset is not available for opening: ${plan.url}`);
    }

    if (isWorkspaceRelativeFilePath(plan.url)) {
      await this.openInVSCode(plan.url);
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(plan.url));
  }

  private async openInVSCode(filePath: string): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', this.toVSCodeOpenUri(filePath));
  }

  private toVSCodeOpenUri(filePath: string): vscode.Uri {
    if (isAbsoluteFilePath(filePath)) {
      return vscode.Uri.file(filePath);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    }

    return vscode.Uri.file(filePath);
  }
}

function isWorkspaceRelativeFilePath(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && value.length > 0;
}

function isAbsoluteFilePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}
