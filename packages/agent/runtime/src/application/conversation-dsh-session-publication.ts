import type {
  NewSessionRequest,
  NewSessionResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
} from '@agentclientprotocol/sdk';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';

import { createConversationId } from '../session/conversation-id';
import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import type { ConversationDshSessionActivation } from './conversation-dsh-session-activation';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import type { DshConversationHomeProjection } from './dsh-conversation-home-projection';

export interface ConversationDshSessionPublication {
  publish(input: {
    readonly context: AgentBoundDomainBinding;
    readonly title: string;
  }): Promise<{ readonly conversationId: string; readonly dshSessionId: string }>;
}

export interface DshSessionCreationClient {
  createSession(input: Omit<NewSessionRequest, 'cwd'>): Promise<NewSessionResponse>;
  closeSession(sessionId: string): Promise<void>;
  resumeSession(input: Omit<ResumeSessionRequest, 'cwd'>): Promise<ResumeSessionResponse>;
}

export function createConversationDshSessionPublication(options: {
  readonly client: DshSessionCreationClient;
  readonly binding: Pick<ConversationDshSessionBindingService, 'bind'>;
  readonly activation: Pick<ConversationDshSessionActivation, 'markLoaded' | 'markClosed'>;
  readonly catalog: DshConversationCatalogStore;
  readonly home: Pick<DshConversationHomeProjection, 'refresh'>;
  readonly conversationIdentitySeed: string;
  readonly now?: () => Date;
  readonly createConversationIdentity?: (seed: string) => string;
}): ConversationDshSessionPublication {
  const now = options.now ?? (() => new Date());
  const createIdentity = options.createConversationIdentity ?? createConversationId;
  return Object.freeze({
    async publish(input: { readonly context: AgentBoundDomainBinding; readonly title: string }) {
      const conversationId = createIdentity(options.conversationIdentitySeed);
      const timestamp = now().toISOString();
      await options.catalog.reserve({
        conversationId,
        title: requireTitle(input.title),
        createdAt: timestamp,
        updatedAt: timestamp,
        context: input.context,
      });
      await options.home.refresh();

      const created = await options.client.createSession({ mcpServers: [] });
      const dshSessionId = requireSessionId(created.sessionId);
      await options.client.closeSession(dshSessionId);
      options.activation.markClosed(dshSessionId);
      await options.client.resumeSession({ sessionId: dshSessionId, mcpServers: [] });
      options.activation.markLoaded(dshSessionId);
      const result = await options.binding.bind({ conversationId, dshSessionId });
      if (!result.ok) {
        await options.home.refresh();
        throw new Error(`DSH Conversation publication failed: ${result.code}: ${result.message}`);
      }
      await options.home.refresh();
      return Object.freeze({ conversationId, dshSessionId });
    },
  });
}

function requireTitle(value: string): string {
  const title = value.trim();
  if (title.length === 0) throw new Error('DSH Conversation title is required.');
  return title;
}

function requireSessionId(value: string): string {
  if (value.trim().length === 0) throw new Error('DSH session/new returned an empty Session id.');
  return value;
}
