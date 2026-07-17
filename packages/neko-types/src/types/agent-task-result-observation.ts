import type { ResourceRef } from './resource-cache';

/**
 * Agent task-result observation contracts.
 *
 * These DTOs are host-neutral and serializable. They describe how an
 * Agent-owned async task terminal state becomes an Agent observation and, when
 * explicitly allowed, a follow-up scheduling request.
 */

export type AgentTaskResultSource =
  'task-manager' | 'media-task' | 'subagent' | 'tool-background-task';

export type AgentTaskResultTerminalStatus = 'completed' | 'failed' | 'cancelled';

export type AgentTaskResultRefKind = 'resource' | 'artifact' | 'asset' | 'url';

export interface AgentTaskResultRef {
  readonly kind: AgentTaskResultRefKind;
  readonly id: string;
  readonly mimeType?: string;
  readonly label?: string;
  readonly resourceRef?: ResourceRef;
}

export interface AgentTaskResultObservation {
  readonly id: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly runStartedAt?: number;
  readonly taskId: string;
  readonly source: AgentTaskResultSource;
  readonly taskType: string;
  readonly status: AgentTaskResultTerminalStatus;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly summary: string;
  readonly resultRefs?: readonly AgentTaskResultRef[];
  readonly error?: string;
  readonly createdAt: number;
  readonly completedAt: number;
}

export type AgentTaskResultDeliveryPolicy =
  | {
      readonly kind: 'notify-only';
    }
  | {
      readonly kind: 'append-observation';
    }
  | {
      readonly kind: 'ask-user-to-continue';
      readonly prompt?: string;
    }
  | {
      readonly kind: 'auto-resume-agent';
      readonly prompt?: string;
    };

export interface AgentTaskResultFollowUpRequest {
  readonly id: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly observationId: string;
  readonly taskId: string;
  readonly policy: Extract<
    AgentTaskResultDeliveryPolicy,
    { readonly kind: 'ask-user-to-continue' | 'auto-resume-agent' }
  >;
  readonly prompt: string;
  readonly createdAt: number;
}
