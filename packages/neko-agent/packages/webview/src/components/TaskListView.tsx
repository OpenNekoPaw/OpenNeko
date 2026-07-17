/**
 * Task type definitions for background media generation tasks.
 *
 * Originally this file also contained TaskListView/TaskItem/useBackgroundTasks
 * components, but those were replaced by inline TaskCard rendering within messages.
 * Only the type definitions are still used (by TaskCard, handlers, hooks).
 */

import type {
  AgentBackgroundTask,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskStepStatus,
  AgentWorkItemTaskType,
} from '@neko-agent/types';

export type TaskStatus = AgentWorkItemTaskStatus;
export type TaskType = AgentWorkItemTaskType;

/** Task step status for detailed progress tracking */
export type TaskStepStatus = AgentWorkItemTaskStepStatus;

/** Individual step in a task workflow */
export type TaskStep = AgentWorkItemTaskStep;

export type BackgroundTask = AgentBackgroundTask;
