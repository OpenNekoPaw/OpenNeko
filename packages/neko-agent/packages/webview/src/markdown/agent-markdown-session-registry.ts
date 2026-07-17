import {
  MarkdownStreamingSession,
  type MarkdownStreamingResult,
  type MarkdownStreamingSnapshot,
} from '@neko/markdown';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko-agent/types';

export interface AgentMarkdownSessionRegistryMetrics {
  readonly activeSessions: number;
  readonly createdSessions: number;
  readonly disposedSessions: number;
  readonly renderRevisions: number;
  readonly notifications: number;
  readonly activeSubscriptions: number;
}

export interface AgentMarkdownSessionPublication {
  /** Notify external-store subscribers after the owning conversation commit is visible. */
  publish(): void;
}

interface TimelineSnapshotInput {
  readonly conversationId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
}

export interface AgentMarkdownSessionRegistry {
  commitProjectionPatch(patch: ConversationProjectionPatch): AgentMarkdownSessionPublication;
  commitProjectionSnapshot(
    snapshot: ConversationProjectionSnapshot,
  ): AgentMarkdownSessionPublication;
  getSnapshot(sessionKey: string): MarkdownStreamingSnapshot | undefined;
  subscribe(sessionKey: string, listener: () => void): () => void;
  disposeConversation(conversationId: string): void;
  /** Release the exiting Webview realm without publishing to subscribers being torn down. */
  disposeAll(): void;
  metrics(): AgentMarkdownSessionRegistryMetrics;
}

interface RegistryEntry {
  readonly conversationId: string;
  readonly messageId: string;
  readonly sourceGeneration: number;
  readonly session: MarkdownStreamingSession;
  itemRevision: number;
  snapshot: MarkdownStreamingSnapshot;
}

type MarkdownTimelineItem = Extract<
  AgentTurnTimelineItem,
  { readonly kind: 'assistant_text' | 'thinking' }
>;

interface PendingSessionMutation {
  readonly sessionKey: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly sourceGeneration: number;
  readonly itemRevision: number;
  readonly mode: 'append' | 'replace' | 'snapshot';
  readonly source: string;
  readonly complete: boolean;
}

let defaultRegistry: AgentMarkdownSessionRegistry | undefined;

export function getAgentMarkdownSessionRegistry(): AgentMarkdownSessionRegistry {
  defaultRegistry ??= createAgentMarkdownSessionRegistry();
  return defaultRegistry;
}

export function createAgentMarkdownSessionRegistry(): AgentMarkdownSessionRegistry {
  const entries = new Map<string, RegistryEntry>();
  const listeners = new Map<string, Set<() => void>>();
  let createdSessions = 0;
  let disposedSessions = 0;
  let renderRevisions = 0;
  let notifications = 0;

  const notify = (sessionKey: string): void => {
    const subscribers = listeners.get(sessionKey);
    if (!subscribers) return;
    notifications += 1;
    for (const listener of subscribers) listener();
  };

  const replaceEntry = (mutation: PendingSessionMutation): void => {
    if (entries.delete(mutation.sessionKey)) disposedSessions += 1;
    const session = new MarkdownStreamingSession();
    const result = mutation.complete
      ? session.finalize(mutation.source)
      : session.append(mutation.source);
    const snapshot = requireReadySnapshot(result, mutation.sessionKey);
    entries.set(mutation.sessionKey, {
      conversationId: mutation.conversationId,
      messageId: mutation.messageId,
      sourceGeneration: mutation.sourceGeneration,
      session,
      itemRevision: mutation.itemRevision,
      snapshot,
    });
    createdSessions += 1;
    renderRevisions += 1;
  };

  const appendEntry = (mutation: PendingSessionMutation): void => {
    const entry = entries.get(mutation.sessionKey);
    if (!entry) {
      replaceEntry(mutation);
      return;
    }
    if (entry.sourceGeneration !== mutation.sourceGeneration) {
      throw new Error(
        `Markdown append generation mismatch for ${mutation.sessionKey}: expected ${entry.sourceGeneration}, received ${mutation.sourceGeneration}.`,
      );
    }
    if (mutation.itemRevision <= entry.itemRevision) {
      throw new Error(
        `Markdown item revision must increase for ${mutation.sessionKey}: current ${entry.itemRevision}, received ${mutation.itemRevision}.`,
      );
    }
    const result = mutation.complete
      ? entry.session.finalize(`${entry.session.source}${mutation.source}`)
      : entry.session.append(mutation.source);
    entry.snapshot = requireReadySnapshot(result, mutation.sessionKey);
    entry.itemRevision = mutation.itemRevision;
    renderRevisions += 1;
  };

  const createPublication = (
    affectedSessionKeys: ReadonlySet<string>,
  ): AgentMarkdownSessionPublication => {
    let published = false;
    return {
      publish(): void {
        if (published) {
          throw new Error('Markdown Timeline commit publication may only be published once.');
        }
        published = true;
        for (const sessionKey of affectedSessionKeys) notify(sessionKey);
      },
    };
  };

  const disposeMatching = (predicate: (sessionKey: string) => boolean): void => {
    const affectedKeys = new Set<string>();
    for (const sessionKey of entries.keys()) {
      if (predicate(sessionKey)) affectedKeys.add(sessionKey);
    }
    for (const sessionKey of listeners.keys()) {
      if (predicate(sessionKey)) affectedKeys.add(sessionKey);
    }
    for (const sessionKey of affectedKeys) {
      if (entries.delete(sessionKey)) disposedSessions += 1;
      notify(sessionKey);
      listeners.delete(sessionKey);
    }
  };

  const reconcileSnapshotMutations = (
    owner: {
      readonly conversationId: string;
      readonly messageId?: string;
      readonly messageIds?: ReadonlySet<string>;
    },
    mutations: ReadonlyMap<string, PendingSessionMutation>,
  ): AgentMarkdownSessionPublication => {
    const expectedSessionKeys = new Set(mutations.keys());
    const affectedSessionKeys = new Set<string>();

    for (const [sessionKey, entry] of entries) {
      if (entry.conversationId !== owner.conversationId) continue;
      if (owner.messageIds && !owner.messageIds.has(entry.messageId)) {
        entries.delete(sessionKey);
        disposedSessions += 1;
        affectedSessionKeys.add(sessionKey);
        continue;
      }
      if (owner.messageId && entry.messageId !== owner.messageId) continue;
      if (expectedSessionKeys.has(sessionKey)) continue;
      entries.delete(sessionKey);
      disposedSessions += 1;
      affectedSessionKeys.add(sessionKey);
    }

    for (const mutation of mutations.values()) {
      const entry = entries.get(mutation.sessionKey);
      const isMatching =
        entry?.sourceGeneration === mutation.sourceGeneration &&
        entry.itemRevision === mutation.itemRevision &&
        entry.snapshot.source === mutation.source &&
        entry.snapshot.isFinal === mutation.complete;
      if (isMatching) continue;
      replaceEntry(mutation);
      affectedSessionKeys.add(mutation.sessionKey);
    }

    return createPublication(affectedSessionKeys);
  };

  const commitProjectionSnapshot = (
    snapshot: ConversationProjectionSnapshot,
  ): AgentMarkdownSessionPublication => {
    const mutations = new Map<string, PendingSessionMutation>();
    const messageIds = new Set<string>();
    for (const turn of snapshot.turns) {
      messageIds.add(turn.messageId);
      for (const [sessionKey, mutation] of collectSnapshotMutations({
        conversationId: snapshot.conversationId,
        messageId: turn.messageId,
        items: turn.items,
      })) {
        mutations.set(sessionKey, mutation);
      }
    }
    return reconcileSnapshotMutations(
      { conversationId: snapshot.conversationId, messageIds },
      mutations,
    );
  };

  return {
    commitProjectionPatch(patch): AgentMarkdownSessionPublication {
      const mutations = collectOperationMutations({
        conversationId: patch.conversationId,
        messageId: patch.messageId,
        operations: patch.operations,
      });
      const affectedSessionKeys = new Set<string>();
      for (const mutation of mutations.values()) {
        if (mutation.mode === 'append') appendEntry(mutation);
        else replaceEntry(mutation);
        affectedSessionKeys.add(mutation.sessionKey);
      }
      return createPublication(affectedSessionKeys);
    },
    commitProjectionSnapshot,
    getSnapshot(sessionKey): MarkdownStreamingSnapshot | undefined {
      return entries.get(sessionKey)?.snapshot;
    },
    subscribe(sessionKey, listener): () => void {
      const subscribers = listeners.get(sessionKey) ?? new Set<() => void>();
      subscribers.add(listener);
      listeners.set(sessionKey, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(sessionKey);
      };
    },
    disposeConversation(conversationId): void {
      disposeMatching((sessionKey) => belongsToConversation(sessionKey, conversationId));
    },
    disposeAll(): void {
      disposedSessions += entries.size;
      entries.clear();
      listeners.clear();
    },
    metrics(): AgentMarkdownSessionRegistryMetrics {
      return {
        activeSessions: entries.size,
        createdSessions,
        disposedSessions,
        renderRevisions,
        notifications,
        activeSubscriptions: Array.from(listeners.values()).reduce(
          (count, subscribers) => count + subscribers.size,
          0,
        ),
      };
    },
  };
}

function belongsToConversation(sessionKey: string, conversationId: string): boolean {
  return sessionKey.startsWith(`${conversationId}\u0000`);
}

export function createAgentMarkdownSessionKey(input: {
  readonly conversationId: string | null;
  readonly messageId: string;
  readonly itemId: string;
}): string {
  return [input.conversationId ?? '@detached', input.messageId, input.itemId].join('\u0000');
}

function collectOperationMutations(input: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly operations: readonly AgentTurnTimelineOperation[];
}): Map<string, PendingSessionMutation> {
  const pending = new Map<string, PendingSessionMutation>();
  for (const operation of input.operations) {
    collectOperationMutation(input, operation, pending);
  }
  return pending;
}

function collectOperationMutation(
  delivery: { readonly conversationId: string; readonly messageId: string },
  operation: AgentTurnTimelineOperation,
  pending: Map<string, PendingSessionMutation>,
): void {
  if (operation.operation === 'complete') {
    if (operation.kind !== 'assistant_text' && operation.kind !== 'thinking') return;
    const sessionKey = createAgentMarkdownSessionKey({
      conversationId: delivery.conversationId,
      messageId: delivery.messageId,
      itemId: operation.itemId,
    });
    const current = pending.get(sessionKey);
    if (current) {
      pending.set(sessionKey, {
        ...current,
        itemRevision: operation.itemRevision,
        complete: true,
      });
      return;
    }
    pending.set(sessionKey, {
      sessionKey,
      conversationId: delivery.conversationId,
      messageId: delivery.messageId,
      sourceGeneration: operation.sourceGeneration,
      itemRevision: operation.itemRevision,
      mode: 'append',
      source: '',
      complete: true,
    });
    return;
  }

  if (!isMarkdownTimelineItem(operation.item)) return;
  const item = operation.item;
  const sessionKey = createAgentMarkdownSessionKey({
    conversationId: delivery.conversationId,
    messageId: delivery.messageId,
    itemId: item.itemId,
  });
  const complete = item.status !== 'streaming';
  if (operation.operation === 'append') {
    const current = pending.get(sessionKey);
    if (current?.mode === 'append' && current.sourceGeneration === item.payload.sourceGeneration) {
      pending.set(sessionKey, {
        ...current,
        itemRevision: item.itemRevision,
        source: `${current.source}${item.payload.content}`,
        complete: current.complete || complete,
      });
      return;
    }
    pending.set(sessionKey, {
      sessionKey,
      conversationId: delivery.conversationId,
      messageId: delivery.messageId,
      sourceGeneration: item.payload.sourceGeneration,
      itemRevision: item.itemRevision,
      mode: 'append',
      source: item.payload.content,
      complete,
    });
    return;
  }

  pending.set(sessionKey, {
    sessionKey,
    conversationId: delivery.conversationId,
    messageId: delivery.messageId,
    sourceGeneration: item.payload.sourceGeneration,
    itemRevision: item.itemRevision,
    mode: operation.operation === 'snapshot' ? 'snapshot' : 'replace',
    source: item.payload.content,
    complete,
  });
}

function collectSnapshotMutations(
  snapshot: TimelineSnapshotInput,
): Map<string, PendingSessionMutation> {
  const mutations = new Map<string, PendingSessionMutation>();
  for (const item of snapshot.items) {
    if (!isMarkdownTimelineItem(item)) continue;
    if (item.conversationId !== snapshot.conversationId || item.messageId !== snapshot.messageId) {
      throw new Error(
        `Markdown Timeline snapshot identity mismatch for ${item.itemId}: expected ${snapshot.conversationId}/${snapshot.messageId}, received ${item.conversationId}/${item.messageId}.`,
      );
    }
    const sessionKey = createAgentMarkdownSessionKey({
      conversationId: snapshot.conversationId,
      messageId: snapshot.messageId,
      itemId: item.itemId,
    });
    mutations.set(sessionKey, {
      sessionKey,
      conversationId: snapshot.conversationId,
      messageId: snapshot.messageId,
      sourceGeneration: item.payload.sourceGeneration,
      itemRevision: item.itemRevision,
      mode: 'snapshot',
      source: item.payload.content,
      complete: item.status !== 'streaming',
    });
  }
  return mutations;
}

function isMarkdownTimelineItem(item: AgentTurnTimelineItem): item is MarkdownTimelineItem {
  return item.kind === 'assistant_text' || item.kind === 'thinking';
}

function requireReadySnapshot(
  result: MarkdownStreamingResult,
  sessionKey: string,
): MarkdownStreamingSnapshot {
  if (result.status === 'ready') return result.snapshot;
  const details = result.diagnostics.map((diagnostic) => diagnostic.code).join('; ');
  throw new Error(`Normalized Markdown session failed for ${sessionKey}: ${details}`);
}
