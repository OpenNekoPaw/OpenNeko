import {
  evaluateAgentTaskResultDelivery,
  getAgentTaskResultDeliveryPolicy,
  normalizeAgentTaskResultObservation,
  type TaskTerminalEvent,
} from '@neko/agent';
import type { AgentContinuationMetadata } from '@neko-agent/types';
import { toMediaTaskResultObservationTask, type Platform } from '@neko/platform';
import type { NodeMediaTaskDeliveryHost } from '../host/node-media-task-delivery-host';

export interface TuiTaskResultContinuation {
  readonly prompt: string;
  readonly source: 'task-result-continuation';
  readonly displayKind: 'task-continuation';
  readonly metadata: AgentContinuationMetadata;
}

export function projectTuiTaskResultContinuation(input: {
  readonly event: TaskTerminalEvent;
  readonly conversationId: string;
}): TuiTaskResultContinuation | undefined {
  if (input.event.scope.conversationId !== input.conversationId) return undefined;

  const observation = normalizeAgentTaskResultObservation({
    task: input.event.task,
    scope: input.event.scope,
    source: 'task-manager',
  });
  const decision = evaluateAgentTaskResultDelivery({
    observation,
    policy: getAgentTaskResultDeliveryPolicy(input.event.task),
  });
  if (decision.kind !== 'auto-resume-agent') return undefined;

  return Object.freeze({
    prompt: decision.followUpRequest.prompt,
    source: 'task-result-continuation' as const,
    displayKind: 'task-continuation' as const,
    metadata: Object.freeze({
      observationId: observation.id,
      taskId: observation.taskId,
      runId: observation.runId,
      status: 'queued' as const,
      policy: decision.kind,
    }),
  });
}

export async function materializeTuiMediaTaskResult(input: {
  readonly event: TaskTerminalEvent;
  readonly platform: Platform;
  readonly deliveryHost: NodeMediaTaskDeliveryHost;
}): Promise<TaskTerminalEvent> {
  if (!isMediaGenerationTask(input.event.task.type)) return input.event;
  const media = input.platform.media;
  if (!media)
    throw new Error(`TUI media result delivery is unavailable for ${input.event.task.id}.`);

  const mediaTask = await media.waitForTask(input.event.scope);
  const delivery = await input.deliveryHost.createTaskViewDelivery(mediaTask);
  const task = toMediaTaskResultObservationTask({
    conversationId: input.event.scope.conversationId,
    taskId: input.event.task.id,
    progress: input.event.task.progress,
    mediaTask,
    deliveryPlan: delivery.deliveryPlan,
    ...(input.event.task.error ? { error: input.event.task.error } : {}),
  });
  return Object.freeze({ task, scope: input.event.scope });
}

function isMediaGenerationTask(type: string): boolean {
  return type === 'image_generation' || type === 'video_generation' || type === 'audio_generation';
}
