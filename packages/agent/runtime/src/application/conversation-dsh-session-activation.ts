import type { LoadSessionResponse } from '@agentclientprotocol/sdk';

import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import type { ConversationDshSessionAcpClient } from './conversation-dsh-session-client';

export interface ConversationDshSessionActivation {
  ensureLoaded(conversationId: string): Promise<string>;
  markLoaded(dshSessionId: string): void;
  markClosed(dshSessionId: string): void;
  reset(): void;
}

interface ActivationState {
  readonly loaded: Set<string>;
  readonly pending: Map<string, Promise<LoadSessionResponse>>;
}

export function createConversationDshSessionActivation(options: {
  readonly binding: ConversationDshSessionBindingService;
  readonly client: Pick<ConversationDshSessionAcpClient, 'loadSession'>;
}): ConversationDshSessionActivation {
  let state = createState();
  return Object.freeze({
    async ensureLoaded(conversationId: string) {
      const resolved = await options.binding.resolve(conversationId);
      if (!resolved.ok) {
        throw new Error(
          `Conversation DSH Session activation failed: ${resolved.code}: ${resolved.message}`,
        );
      }
      const dshSessionId = resolved.binding.dshSessionId;
      const current = state;
      if (current.loaded.has(dshSessionId)) return dshSessionId;
      let pending = current.pending.get(dshSessionId);
      if (pending === undefined) {
        pending = options.client.loadSession({ sessionId: dshSessionId, mcpServers: [] });
        current.pending.set(dshSessionId, pending);
      }
      try {
        await pending;
        current.loaded.add(dshSessionId);
        return dshSessionId;
      } finally {
        current.pending.delete(dshSessionId);
      }
    },
    markLoaded(dshSessionId: string) {
      requireSessionId(dshSessionId);
      state.loaded.add(dshSessionId);
    },
    markClosed(dshSessionId: string) {
      requireSessionId(dshSessionId);
      state.loaded.delete(dshSessionId);
    },
    reset() {
      state = createState();
    },
  });
}

function createState(): ActivationState {
  return { loaded: new Set(), pending: new Map() };
}

function requireSessionId(value: string): void {
  if (value.trim().length === 0) throw new Error('DSH Session identity is required.');
}
