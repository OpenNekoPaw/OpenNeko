import type {
  NewSessionRequest,
  NewSessionResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
} from '@agentclientprotocol/sdk';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { DshComposerSubmitInput } from '@neko/agent-contracts/dsh-session-host';

import { createConversationId } from '../session/conversation-id';
import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import type { ConversationDshSessionActivation } from './conversation-dsh-session-activation';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import type { DshConversationHomeProjection } from './dsh-conversation-home-projection';

export interface ConversationDshSessionPublication {
  publish(input: {
    readonly conversationId?: string;
    readonly context: AgentConversationContext;
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
    async publish(input: {
      readonly conversationId?: string;
      readonly context: AgentConversationContext;
      readonly title: string;
    }) {
      const conversationId =
        input.conversationId === undefined
          ? createIdentity(options.conversationIdentitySeed)
          : requireConversationId(input.conversationId);
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

function requireConversationId(value: string): string {
  if (value.trim().length === 0) throw new Error('Conversation identity is required.');
  return value;
}

const DSH_CONVERSATION_TITLE_MAX_SOURCE_LENGTH = 50;

export function projectDshConversationTitle(input: DshComposerSubmitInput): string {
  const normalized = projectTitleSource(input).trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0) {
    throw new Error('DSH Conversation title source must not be empty.');
  }
  const characters = Array.from(normalized);
  if (characters.length <= DSH_CONVERSATION_TITLE_MAX_SOURCE_LENGTH) return normalized;

  let title = characters.slice(0, DSH_CONVERSATION_TITLE_MAX_SOURCE_LENGTH).join('').trim();
  const lastSpace = title.lastIndexOf(' ');
  if (lastSpace > 20) title = title.slice(0, lastSpace);
  return `${title}...`;
}

function projectTitleSource(input: DshComposerSubmitInput): string {
  switch (input.kind) {
    case 'message': {
      const text = input.text.trim();
      if (text.length > 0) return text;
      return [
        ...input.references.map((reference) => reference.label),
        ...input.contextPayloads.map((context) => context.label),
      ].join(' ');
    }
    case 'command':
      return input.line;
    case 'skill':
      return input.displayText;
  }
}
