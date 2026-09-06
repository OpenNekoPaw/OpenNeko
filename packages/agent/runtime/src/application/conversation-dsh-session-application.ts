import type { ListSessionsRequest, ListSessionsResponse } from '@agentclientprotocol/sdk';
import { createCanvasWorkspaceTarget } from '@neko/canvas-domain';

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
  type DshSessionLookupCwdPort,
} from './conversation-dsh-session-publication';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import type { DshStaleConversationCleanup } from './dsh-stale-conversation-cleanup';
import {
  createDshConversationHomeProjection,
  type DshConversationHomeProjection,
} from './dsh-conversation-home-projection';
import type { DshAcpProjection } from '../acp/dsh-acp-projection';

const MAX_SESSION_LIST_PAGES = 100;

export interface DshSessionCatalogAcpClient {
  listSessions(input?: Omit<ListSessionsRequest, 'cwd'>): Promise<ListSessionsResponse>;
}

export interface DshSessionArchiveAcpClient {
  archiveSession(sessionId: string): Promise<{ readonly sessionIds: readonly string[] }>;
  readArchivedSessions(): Promise<{ readonly sessionIds: readonly string[] }>;
}

export interface ConversationDshSessionArchive {
  archiveConversation(conversationId: string): Promise<void>;
  deleteUnavailableConversation(conversationId: string): Promise<void>;
}

export interface ConversationDshSessionApplication {
  readonly binding: ConversationDshSessionBindingService;
  readonly activation: ConversationDshSessionActivation;
  readonly conversations: ConversationDshSessionBoundClient;
  readonly home: DshConversationHomeProjection;
  readonly archive: ConversationDshSessionArchive;
  readonly publication: ConversationDshSessionPublication;
  readonly catalog: Pick<
    DshConversationCatalogStore,
    'get' | 'readCanvasSelection' | 'selectCanvas'
  >;
  branchConversation(input: {
    readonly sourceConversationId: string;
    readonly messageId: string;
  }): Promise<{ readonly conversationId: string; readonly dshSessionId: string }>;
}

export interface ConversationDshSessionApplicationOptions {
  readonly client: ConversationDshSessionAcpClient &
    DshSessionCatalogAcpClient &
    DshSessionArchiveAcpClient &
    DshSessionCreationClient;
  readonly store: ConversationDshSessionBindingStore;
  readonly catalog: DshConversationCatalogStore;
  readonly staleConversations: DshStaleConversationCleanup;
  readonly conversationIdentitySeed: string;
  readonly activity: Pick<DshAcpProjection, 'snapshot'>;
  readonly lookupCwd: DshSessionLookupCwdPort;
}

export function createConversationDshSessionApplication(
  options: ConversationDshSessionApplicationOptions,
): ConversationDshSessionApplication {
  const resolveCwd = async (conversationId: string): Promise<string> => {
    const record = await options.catalog.get(conversationId);
    if (record === undefined) {
      throw new Error(`DSH Conversation lookup cwd is unavailable: ${conversationId}`);
    }
    return options.lookupCwd.resolve(record.context);
  };
  const binding = createConversationDshSessionBindingService({
    store: options.store,
    sessions: createDshSessionResolvabilityPort(options.client),
  });
  const activation = createConversationDshSessionActivation({
    binding,
    client: options.client,
    resolveCwd,
  });
  const home = createDshConversationHomeProjection({
    catalog: options.catalog,
    bindings: options.store,
    archivedSessions: options.client,
    activity: options.activity,
  });
  const publication = createConversationDshSessionPublication({
    client: options.client,
    binding,
    activation,
    catalog: options.catalog,
    home,
    conversationIdentitySeed: options.conversationIdentitySeed,
    lookupCwd: options.lookupCwd,
  });
  return {
    binding,
    activation,
    conversations: createConversationDshSessionBoundClient({
      client: options.client,
      binding,
      activation,
      resolveCwd,
    }),
    home,
    archive: Object.freeze({
      async archiveConversation(conversationId: string) {
        const resolution = await binding.resolve(conversationId);
        if (!resolution.ok) {
          if (resolution.code === 'DSH_SESSION_STALE') {
            await options.staleConversations.discard(resolution.binding);
            await home.refresh();
            return;
          }
          if (resolution.code === 'CONVERSATION_BINDING_MISSING') {
            await options.staleConversations.discardMissingBinding(conversationId);
            await home.refresh();
            return;
          }
          throw new Error(
            `DSH Conversation archive failed: ${resolution.code}: ${resolution.message}`,
          );
        }
        await options.client.archiveSession(resolution.binding.dshSessionId);
        await home.refresh();
      },
      async deleteUnavailableConversation(conversationId: string) {
        const resolution = await binding.resolve(conversationId);
        if (resolution.ok) {
          throw new Error(
            `DSH Conversation delete rejected: Conversation is still resolvable: ${conversationId}`,
          );
        }
        if (resolution.code === 'DSH_SESSION_STALE') {
          await options.staleConversations.discard(resolution.binding);
          await home.refresh();
          return;
        }
        if (resolution.code === 'CONVERSATION_BINDING_MISSING') {
          await options.staleConversations.discardMissingBinding(conversationId);
          await home.refresh();
          return;
        }
        throw new Error(
          `DSH Conversation delete failed: ${resolution.code}: ${resolution.message}`,
        );
      },
    }),
    publication,
    catalog: options.catalog,
    async branchConversation(input) {
      const source = await options.catalog.get(input.sourceConversationId);
      if (source === undefined) {
        throw new Error(`DSH Conversation branch source is missing: ${input.sourceConversationId}`);
      }
      const sourceDshSessionId = await activation.ensureLoaded(input.sourceConversationId);
      const canvasId = await options.catalog.readCanvasSelection(input.sourceConversationId);
      if (
        canvasId !== undefined &&
        source.context.kind !== 'workspace' &&
        source.context.kind !== 'authoring'
      ) {
        throw new Error('A Conversation Canvas selection requires a Workspace context.');
      }
      return publication.branch({
        sourceConversationId: input.sourceConversationId,
        sourceDshSessionId,
        messageId: input.messageId,
        context: source.context,
        title: source.title,
        ...(canvasId === undefined ||
        (source.context.kind !== 'workspace' && source.context.kind !== 'authoring')
          ? {}
          : {
              canvasSelection: createCanvasWorkspaceTarget(source.context.workspaceId, canvasId),
            }),
      });
    },
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
