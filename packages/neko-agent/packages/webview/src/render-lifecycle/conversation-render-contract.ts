import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';

export type ConversationRetention = 'retained' | 'disposed';

export type ForegroundConversationAvailability =
  | { readonly kind: 'ready' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly diagnostic: string };

export interface ConversationStreamingSnapshot {
  readonly streamingMessageId: string | null;
  readonly isThinking: boolean;
  readonly queuedMessageCount: number;
  readonly queuedMessages: readonly AgentQueuedMessageItem[];
  readonly messageQueueVersion?: number;
}

export interface ConversationRenderSnapshot {
  readonly conversationId: string;
  readonly revision: number;
  readonly messages: readonly Message[];
  readonly streaming: ConversationStreamingSnapshot;
  readonly retention: ConversationRetention;
}

interface RevisionedConversationMutation {
  readonly conversationId: string;
  readonly baseRevision: number;
}

export type ConversationRenderMutation =
  | (RevisionedConversationMutation & {
      readonly kind: 'host-snapshot';
      readonly messages: readonly Message[];
      readonly streaming: ConversationStreamingSnapshot;
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'queue-status';
      readonly queuedMessageCount: number;
      readonly queuedMessages: readonly AgentQueuedMessageItem[];
      readonly messageQueueVersion?: number;
      readonly isThinking?: boolean;
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'completion';
      readonly messages: readonly Message[];
    })
  | {
      readonly kind: 'disposal';
      readonly conversationId: string;
      readonly reason: 'conversation-delete' | 'confirmed-empty-conversation';
    };

export type ConversationRenderDiagnosticCode =
  'stale-revision' | 'conversation-snapshot-unavailable' | 'conversation-disposed';

export interface ConversationRenderDiagnostic {
  readonly code: ConversationRenderDiagnosticCode;
  readonly message: string;
  readonly conversationId: string;
  readonly currentRevision?: number;
  readonly targetRevision?: number;
  readonly messageId?: string;
  readonly turnId?: string;
}

export class ConversationRenderLifecycleError extends Error {
  constructor(readonly diagnostic: ConversationRenderDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = 'ConversationRenderLifecycleError';
  }
}

export function createIdleConversationStreamingSnapshot(): ConversationStreamingSnapshot {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}
