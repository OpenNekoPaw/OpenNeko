import {
  parseAgentHomeProjection,
  type AgentConversationContext,
  type AgentHomeConversationSummary,
  type AgentHomeDiagnostic,
  type AgentConversationOwnerRef,
  type AgentHomeProjection,
} from '@neko/agent-contracts';

import type { ConversationDshSessionBindingStore } from './conversation-dsh-session-binding';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import type { DshAcpProjectionSnapshot } from '../acp/dsh-acp-projection';

export interface DshConversationHomeProjection {
  readHomeProjection(): AgentHomeProjection;
  subscribeHomeProjection(listener: () => void): () => void;
  refresh(): Promise<void>;
}

type ProjectedConversation =
  { readonly summary: AgentHomeConversationSummary } | { readonly diagnostic: AgentHomeDiagnostic };

const EMPTY_HOME = parseAgentHomeProjection({
  conversations: [],
  attention: { needsInput: 0, needsReview: 0, running: 0 },
});

export function createDshConversationHomeProjection(options: {
  readonly catalog: DshConversationCatalogStore;
  readonly bindings: Pick<ConversationDshSessionBindingStore, 'get'>;
  readonly archivedSessions: {
    readArchivedSessions(): Promise<{ readonly sessionIds: readonly string[] }>;
  };
  readonly activity: { snapshot(dshSessionId: string): DshAcpProjectionSnapshot };
}): DshConversationHomeProjection {
  let projection = EMPTY_HOME;
  const listeners = new Set<() => void>();
  let refreshTail = Promise.resolve();
  const refresh = (): Promise<void> => {
    const operation = refreshTail.then(async () => {
      const archived = new Set((await options.archivedSessions.readArchivedSessions()).sessionIds);
      const snapshot = await options.catalog.read();
      const conversations: AgentHomeConversationSummary[] = [];
      const diagnostics: AgentHomeDiagnostic[] = snapshot.diagnostics.map((diagnostic) => ({
        code: 'invalid-conversation-record',
        ...(diagnostic.conversationId === undefined
          ? {}
          : { conversationId: diagnostic.conversationId }),
        message: diagnostic.message,
      }));
      const projected = await Promise.all(
        snapshot.records.map(async (record): Promise<ProjectedConversation | undefined> => {
          try {
            let unavailable:
              { readonly fieldNames: readonly string[]; readonly message: string } | undefined;
            let dshSessionId: string | undefined;
            try {
              const binding = await options.bindings.get(record.conversationId);
              if (binding === undefined) {
                unavailable = {
                  fieldNames: ['dshSessionId'],
                  message: 'Conversation publication has no DSH Session binding.',
                };
              } else {
                dshSessionId = binding.dshSessionId;
              }
            } catch (error) {
              unavailable = {
                fieldNames: ['dshSessionId'],
                message: error instanceof Error ? error.message : String(error),
              };
            }
            if (dshSessionId !== undefined && archived.has(dshSessionId)) {
              return undefined;
            }
            const activity =
              dshSessionId === undefined
                ? {
                    attention: 'none' as const,
                    updatedAt: record.updatedAt,
                    lastActivity: {
                      kind: 'conversation-updated' as const,
                      occurredAt: record.updatedAt,
                    },
                  }
                : projectDshActivity(options.activity.snapshot(dshSessionId), record.updatedAt);
            const summary: AgentHomeConversationSummary = {
              navigation: {
                conversationId: record.conversationId,
                owner: conversationOwner(record.context),
              },
              title: record.title,
              updatedAt: activity.updatedAt,
              attention: activity.attention,
              lastActivity: activity.lastActivity,
              ...(unavailable === undefined ? {} : { unavailable }),
            };
            return {
              summary,
            };
          } catch (error) {
            return {
              diagnostic: {
                code: 'invalid-conversation-record',
                conversationId: record.conversationId,
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        }),
      );
      for (const result of projected) {
        if (result === undefined) continue;
        if ('summary' in result) conversations.push(result.summary);
        else diagnostics.push(result.diagnostic);
      }
      projection = parseAgentHomeProjection({
        conversations,
        attention: {
          needsInput: conversations.filter((item) => item.attention === 'needs-input').length,
          needsReview: conversations.filter((item) => item.attention === 'needs-review').length,
          running: conversations.filter((item) => item.attention === 'running').length,
        },
        ...(diagnostics.length === 0 ? {} : { diagnostics }),
      });
      for (const listener of listeners) listener();
    });
    refreshTail = operation.catch(() => undefined);
    return operation;
  };
  return Object.freeze({
    readHomeProjection: () => projection,
    subscribeHomeProjection(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
  });
}

function projectDshActivity(
  snapshot: DshAcpProjectionSnapshot,
  fallbackUpdatedAt: string,
): Pick<AgentHomeConversationSummary, 'attention' | 'updatedAt' | 'lastActivity'> {
  if (snapshot.currentTurn !== undefined) {
    const start = [...snapshot.events]
      .reverse()
      .find(
        (event) =>
          event.kind === 'turn' && event.phase === 'start' && event.turn === snapshot.currentTurn,
      );
    const occurredAt =
      start?.kind === 'turn' && start.phase === 'start'
        ? new Date(start.startedAt).toISOString()
        : fallbackUpdatedAt;
    return {
      attention: 'running',
      updatedAt: occurredAt,
      lastActivity: {
        kind: 'turn-running',
        occurredAt,
        dshSessionId: snapshot.sessionId,
        turn: snapshot.currentTurn,
      },
    };
  }
  const end = [...snapshot.events]
    .reverse()
    .find((event) => event.kind === 'turn' && event.phase === 'end');
  if (end?.kind !== 'turn' || end.phase !== 'end') {
    return {
      attention: 'none',
      updatedAt: fallbackUpdatedAt,
      lastActivity: { kind: 'conversation-updated', occurredAt: fallbackUpdatedAt },
    };
  }
  const occurredAt = new Date(end.completedAt).toISOString();
  const kind =
    end.reason === 'aborted' || end.reason === 'cancelled'
      ? 'turn-cancelled'
      : end.reason === 'completed' || end.reason === 'success' || end.reason === 'max-tokens'
        ? 'turn-completed'
        : 'turn-failed';
  return {
    attention: 'none',
    updatedAt: occurredAt,
    lastActivity: {
      kind,
      occurredAt,
      dshSessionId: snapshot.sessionId,
      turn: end.turn,
    },
  };
}

function conversationOwner(context: AgentConversationContext): AgentConversationOwnerRef {
  switch (context.kind) {
    case 'assistant':
      return { kind: 'assistant', assistantSpaceId: context.assistantSpaceId };
    case 'workspace':
      return { kind: 'workspace', workspaceId: context.workspaceId };
    case 'authoring':
      return { kind: 'workspace', workspaceId: context.workspaceId };
    case 'room':
      return { kind: 'room', roomId: context.roomId, roomRunId: context.roomRunId };
    case 'character':
      if (!context.characterRunId || !context.dialogueRunId) {
        throw new Error('Character Conversation catalog requires exact Run and Dialogue identity.');
      }
      return {
        kind: 'character',
        characterId: context.characterId,
        characterRunId: context.characterRunId,
        dialogueRunId: context.dialogueRunId,
      };
    case 'world':
      throw new Error('World context cannot own an executable DSH Conversation.');
  }
}
