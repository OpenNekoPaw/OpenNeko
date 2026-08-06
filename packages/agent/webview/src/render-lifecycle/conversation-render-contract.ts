import type { AgentQueuedMessageItem, Message } from '@neko/agent-contracts';

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
  readonly messageQueueSequence?: number;
}

export interface ConversationRenderSnapshot {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationStreamingSnapshot;
  readonly retention: ConversationRetention;
}

interface ConversationOwnedMutation {
  readonly conversationId: string;
}

export type ConversationRenderMutation =
  | (ConversationOwnedMutation & {
      readonly kind: 'host-snapshot';
      readonly messages: readonly Message[];
      readonly streaming: ConversationStreamingSnapshot;
    })
  | (ConversationOwnedMutation & {
      readonly kind: 'queue-status';
      readonly queuedMessageCount: number;
      readonly queuedMessages: readonly AgentQueuedMessageItem[];
      readonly messageQueueSequence?: number;
      readonly isThinking?: boolean;
    })
  | (ConversationOwnedMutation & {
      readonly kind: 'completion';
      readonly messages: readonly Message[];
    })
  | {
      readonly kind: 'disposal';
      readonly conversationId: string;
      readonly reason: 'conversation-delete' | 'confirmed-empty-conversation';
    };

export type ConversationRenderDiagnosticCode =
  'conversation-snapshot-unavailable' | 'conversation-disposed';

export interface ConversationRenderDiagnostic {
  readonly code: ConversationRenderDiagnosticCode;
  readonly message: string;
  readonly conversationId: string;
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
