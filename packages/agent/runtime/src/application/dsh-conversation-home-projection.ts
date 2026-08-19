import {
  parseAgentHomeProjection,
  type AgentBoundDomainBinding,
  type AgentHomeConversationSummary,
  type AgentHomeDiagnostic,
  type AgentConversationOwnerRef,
  type AgentHomeProjection,
} from '@neko/agent-contracts';

import type { ConversationDshSessionBindingStore } from './conversation-dsh-session-binding';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';

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
}): DshConversationHomeProjection {
  let projection = EMPTY_HOME;
  const listeners = new Set<() => void>();
  let refreshTail = Promise.resolve();
  const refresh = (): Promise<void> => {
    const operation = refreshTail.then(async () => {
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
        snapshot.records.map(async (record): Promise<ProjectedConversation> => {
          try {
            let unavailable:
              { readonly fieldNames: readonly string[]; readonly message: string } | undefined;
            try {
              const binding = await options.bindings.get(record.conversationId);
              if (binding === undefined) {
                unavailable = {
                  fieldNames: ['dshSessionId'],
                  message: 'Conversation publication has no DSH Session binding.',
                };
              }
            } catch (error) {
              unavailable = {
                fieldNames: ['dshSessionId'],
                message: error instanceof Error ? error.message : String(error),
              };
            }
            const summary: AgentHomeConversationSummary = {
              navigation: {
                conversationId: record.conversationId,
                owner: conversationOwner(record.context),
              },
              title: record.title,
              updatedAt: record.updatedAt,
              attention: 'none',
              lastActivity: {
                kind: 'conversation-updated',
                occurredAt: record.updatedAt,
              },
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
        if ('summary' in result) conversations.push(result.summary);
        else diagnostics.push(result.diagnostic);
      }
      projection = parseAgentHomeProjection({
        conversations,
        attention: { needsInput: 0, needsReview: 0, running: 0 },
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

function conversationOwner(context: AgentBoundDomainBinding): AgentConversationOwnerRef {
  switch (context.kind) {
    case 'assistant':
      return { kind: 'assistant', assistantSpaceId: context.assistantSpaceId };
    case 'workspace':
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
