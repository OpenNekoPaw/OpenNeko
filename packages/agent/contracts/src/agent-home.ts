export interface AgentHomeAttentionProjection {
  readonly needsInput: number;
  readonly needsReview: number;
  readonly running: number;
}

export type AgentHomeAttentionStatus = 'none' | 'needs-input' | 'needs-review' | 'running';

export type AgentHomeActivityKind =
  | 'conversation-updated'
  | 'turn-running'
  | 'turn-completed'
  | 'turn-cancelled'
  | 'turn-failed'
  | 'tool-confirmation-required';

export interface AgentHomeNavigationIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface AgentHomeActivitySummary {
  readonly kind: AgentHomeActivityKind;
  readonly occurredAt: string;
  readonly turnId?: string;
  readonly runId?: string;
  readonly toolCallId?: string;
  readonly generationJob?: {
    readonly jobId: string;
    readonly revision: number;
    readonly phase: string;
  };
}

export interface AgentHomeConversationSummary {
  readonly navigation: AgentHomeNavigationIdentity;
  readonly title: string;
  readonly updatedAt: string;
  readonly attention: AgentHomeAttentionStatus;
  readonly lastActivity: AgentHomeActivitySummary;
}

export interface AgentHomeProjection {
  readonly revision: number;
  readonly conversations: readonly AgentHomeConversationSummary[];
  readonly attention: AgentHomeAttentionProjection;
}
