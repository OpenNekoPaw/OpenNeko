import { isCanonicalConversationId } from '../session/conversation-id';

export interface ConversationDshSessionBindingRecord {
  readonly conversationId: string;
  readonly dshSessionId: string;
}

export type ConversationDshSessionStoreBindResult =
  | {
      readonly ok: true;
      readonly binding: ConversationDshSessionBindingRecord;
      readonly created: boolean;
    }
  | {
      readonly ok: false;
      readonly code: 'CONVERSATION_ALREADY_BOUND' | 'DSH_SESSION_ALREADY_BOUND';
      readonly message: string;
    };

export type ConversationDshSessionStoreUnbindResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'CONVERSATION_BINDING_MISSING'
        | 'CONVERSATION_BINDING_MISMATCH'
        | 'CONVERSATION_BINDING_CROSS_CONVERSATION';
      readonly message: string;
    };

export interface ConversationDshSessionBindingStore {
  get(conversationId: string): Promise<ConversationDshSessionBindingRecord | undefined>;
  getByDshSessionId(dshSessionId: string): Promise<ConversationDshSessionBindingRecord | undefined>;
  bind(record: ConversationDshSessionBindingRecord): Promise<ConversationDshSessionStoreBindResult>;
  unbind(
    expected: ConversationDshSessionBindingRecord,
  ): Promise<ConversationDshSessionStoreUnbindResult>;
}

export interface DshSessionResolvabilityPort {
  isResolvable(dshSessionId: string): Promise<boolean>;
}

export type ConversationDshSessionBindingResolution =
  | {
      readonly ok: true;
      readonly binding: ConversationDshSessionBindingRecord;
    }
  | {
      readonly ok: false;
      readonly code: 'DSH_SESSION_STALE';
      readonly conversationId: string;
      readonly binding: ConversationDshSessionBindingRecord;
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'CONVERSATION_BINDING_INVALID'
        | 'CONVERSATION_BINDING_MISSING'
        | 'CONVERSATION_BINDING_CROSS_CONVERSATION';
      readonly conversationId: string;
      readonly message: string;
    };

export type ConversationDshSessionBindResult =
  | {
      readonly ok: true;
      readonly binding: ConversationDshSessionBindingRecord;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'CONVERSATION_BINDING_INVALID'
        | 'CONVERSATION_BINDING_ALREADY_BOUND'
        | 'DSH_SESSION_ALREADY_BOUND'
        | 'DSH_SESSION_STALE'
        | 'STORE_BINDING_MISMATCH';
      readonly message: string;
    };

export type ConversationDshSessionUnbindResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'CONVERSATION_BINDING_INVALID'
        | 'CONVERSATION_BINDING_MISSING'
        | 'CONVERSATION_BINDING_MISMATCH';
      readonly conversationId: string;
      readonly message: string;
    };

export interface ConversationDshSessionBindingService {
  bind(input: {
    readonly conversationId: string;
    readonly dshSessionId: string;
  }): Promise<ConversationDshSessionBindResult>;
  resolve(conversationId: string): Promise<ConversationDshSessionBindingResolution>;
  unbind(conversationId: string): Promise<ConversationDshSessionUnbindResult>;
}

export interface ConversationDshSessionBindingServiceOptions {
  readonly store: ConversationDshSessionBindingStore;
  readonly sessions: DshSessionResolvabilityPort;
}

export function createConversationDshSessionBindingService(
  options: ConversationDshSessionBindingServiceOptions,
): ConversationDshSessionBindingService {
  return {
    async bind({ conversationId, dshSessionId }) {
      if (!isCanonicalConversationId(conversationId)) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_INVALID',
          message: `Conversation id is not canonical: ${conversationId}`,
        };
      }
      if (!isNonEmptyString(dshSessionId)) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_INVALID',
          message: 'DSH Session id must be a non-empty string.',
        };
      }
      if (!(await options.sessions.isResolvable(dshSessionId))) {
        return {
          ok: false,
          code: 'DSH_SESSION_STALE',
          message: `DSH Session is not resolvable: ${dshSessionId}`,
        };
      }
      const result = await options.store.bind({ conversationId, dshSessionId });
      if (!result.ok) {
        return {
          ok: false,
          code:
            result.code === 'CONVERSATION_ALREADY_BOUND'
              ? 'CONVERSATION_BINDING_ALREADY_BOUND'
              : 'DSH_SESSION_ALREADY_BOUND',
          message: result.message,
        };
      }
      if (
        result.binding.conversationId !== conversationId ||
        result.binding.dshSessionId !== dshSessionId
      ) {
        return {
          ok: false,
          code: 'STORE_BINDING_MISMATCH',
          message: `Binding store returned a mismatched binding for ${conversationId}.`,
        };
      }
      return { ok: true, binding: result.binding };
    },

    async resolve(conversationId) {
      if (!isCanonicalConversationId(conversationId)) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_INVALID',
          conversationId,
          message: `Conversation id is not canonical: ${conversationId}`,
        };
      }
      const binding = await options.store.get(conversationId);
      if (binding === undefined) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_MISSING',
          conversationId,
          message: `Conversation has no DSH Session binding: ${conversationId}`,
        };
      }
      if (binding.conversationId !== conversationId) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_CROSS_CONVERSATION',
          conversationId,
          message: `Binding store returned a cross-Conversation record for ${conversationId}.`,
        };
      }
      if (!(await options.sessions.isResolvable(binding.dshSessionId))) {
        return {
          ok: false,
          code: 'DSH_SESSION_STALE',
          conversationId,
          binding,
          message: `DSH Session is not resolvable for ${conversationId}: ${binding.dshSessionId}`,
        };
      }
      return { ok: true, binding };
    },

    async unbind(conversationId) {
      if (!isCanonicalConversationId(conversationId)) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_INVALID',
          conversationId,
          message: `Conversation id is not canonical: ${conversationId}`,
        };
      }
      const binding = await options.store.get(conversationId);
      if (binding === undefined) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_MISSING',
          conversationId,
          message: `Conversation has no DSH Session binding: ${conversationId}`,
        };
      }
      if (binding.conversationId !== conversationId) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_MISMATCH',
          conversationId,
          message: `Binding store returned a cross-Conversation record for ${conversationId}.`,
        };
      }
      const result = await options.store.unbind(binding);
      if (!result.ok) {
        return {
          ok: false,
          code:
            result.code === 'CONVERSATION_BINDING_MISSING'
              ? 'CONVERSATION_BINDING_MISSING'
              : 'CONVERSATION_BINDING_MISMATCH',
          conversationId,
          message: result.message,
        };
      }
      return { ok: true };
    },
  };
}

function isNonEmptyString(value: string): boolean {
  return value.length > 0;
}
