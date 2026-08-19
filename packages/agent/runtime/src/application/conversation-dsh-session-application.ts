import type { ListSessionsRequest, ListSessionsResponse } from '@agentclientprotocol/sdk';

import {
  createConversationDshSessionBindingService,
  type ConversationDshSessionBindingService,
  type ConversationDshSessionBindingStore,
  type DshSessionResolvabilityPort,
} from './conversation-dsh-session-binding';
import {
  createConversationDshSessionActivation,
  type ConversationDshSessionActivation,
} from './conversation-dsh-session-activation';
import {
  createConversationDshSessionBoundClient,
  type ConversationDshSessionAcpClient,
  type ConversationDshSessionBoundClient,
} from './conversation-dsh-session-client';
import {
  createConversationDshSessionPublication,
  type ConversationDshSessionPublication,
  type DshSessionCreationClient,
} from './conversation-dsh-session-publication';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import {
  createDshConversationHomeProjection,
  type DshConversationHomeProjection,
} from './dsh-conversation-home-projection';

const MAX_SESSION_LIST_PAGES = 100;

export interface DshSessionCatalogAcpClient {
  listSessions(input?: Omit<ListSessionsRequest, 'cwd'>): Promise<ListSessionsResponse>;
}

export interface ConversationDshSessionApplication {
  readonly binding: ConversationDshSessionBindingService;
  readonly activation: ConversationDshSessionActivation;
  readonly conversations: ConversationDshSessionBoundClient;
  readonly home: DshConversationHomeProjection;
  readonly publication: ConversationDshSessionPublication;
}

export interface ConversationDshSessionApplicationOptions {
  readonly client: ConversationDshSessionAcpClient &
    DshSessionCatalogAcpClient &
    DshSessionCreationClient;
  readonly store: ConversationDshSessionBindingStore;
  readonly catalog: DshConversationCatalogStore;
  readonly conversationIdentitySeed: string;
}

export function createConversationDshSessionApplication(
  options: ConversationDshSessionApplicationOptions,
): ConversationDshSessionApplication {
  const binding = createConversationDshSessionBindingService({
    store: options.store,
    sessions: createDshSessionResolvabilityPort(options.client),
  });
  const activation = createConversationDshSessionActivation({ binding, client: options.client });
  const home = createDshConversationHomeProjection({
    catalog: options.catalog,
    bindings: options.store,
  });
  return {
    binding,
    activation,
    conversations: createConversationDshSessionBoundClient({
      client: options.client,
      binding,
      activation,
    }),
    home,
    publication: createConversationDshSessionPublication({
      client: options.client,
      binding,
      activation,
      catalog: options.catalog,
      home,
      conversationIdentitySeed: options.conversationIdentitySeed,
    }),
  };
}

export function createDshSessionResolvabilityPort(
  client: DshSessionCatalogAcpClient,
): DshSessionResolvabilityPort {
  return {
    async isResolvable(dshSessionId) {
      if (dshSessionId.length === 0) throw new Error('DSH Session id must be non-empty.');

      const seenSessionIds = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      let targetFound = false;

      for (let page = 0; page < MAX_SESSION_LIST_PAGES; page += 1) {
        const response = await client.listSessions(cursor === undefined ? {} : { cursor });
        for (const session of response.sessions) {
          if (seenSessionIds.has(session.sessionId)) {
            throw new Error(
              `DSH ACP session/list returned duplicate Session ${session.sessionId}.`,
            );
          }
          seenSessionIds.add(session.sessionId);
          if (session.sessionId === dshSessionId) targetFound = true;
        }

        const nextCursor = response.nextCursor ?? undefined;
        if (nextCursor === undefined) return targetFound;
        if (nextCursor.length === 0) {
          throw new Error('DSH ACP session/list returned an empty continuation cursor.');
        }
        if (seenCursors.has(nextCursor)) {
          throw new Error(`DSH ACP session/list repeated continuation cursor ${nextCursor}.`);
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }

      throw new Error(
        `DSH ACP session/list exceeded the ${MAX_SESSION_LIST_PAGES}-page safety bound.`,
      );
    },
  };
}
