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
} from '@neko/agent-contracts';

export interface AgentMarkdownSessionRegistryMetrics {
  readonly activeSessions: number;
  readonly createdSessions: number;
  readonly disposedSessions: number;
  readonly renderUpdates: number;
  readonly notifications: number;
  readonly activeSubscriptions: number;
}

export type AgentMarkdownStreamingUpdateScheduler = (
  callback: () => AgentMarkdownSessionPublication | undefined,
) => () => void;

export interface AgentMarkdownSessionRegistryOptions {
  readonly scheduleStreamingUpdate?: AgentMarkdownStreamingUpdateScheduler;
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
  readonly session: MarkdownStreamingSession;
  snapshot: MarkdownStreamingSnapshot;
  targetSource: string;
  cancelScheduledUpdate?: () => void;
}

type MarkdownTimelineItem = Extract<
  AgentTurnTimelineItem,
  { readonly kind: 'assistant_text' | 'thinking' }
>;

interface PendingSessionMutation {
  readonly sessionKey: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly mode: 'append' | 'replace' | 'snapshot';
  readonly source: string;
  readonly complete: boolean;
}

let defaultRegistry: AgentMarkdownSessionRegistry | undefined;

export function getAgentMarkdownSessionRegistry(): AgentMarkdownSessionRegistry {
  defaultRegistry ??= createAgentMarkdownSessionRegistry();
  return defaultRegistry;
}

export function createAgentMarkdownSessionRegistry(
  options: AgentMarkdownSessionRegistryOptions = {},
): AgentMarkdownSessionRegistry {
  const entries = new Map<string, RegistryEntry>();
  const listeners = new Map<string, Set<() => void>>();
  let createdSessions = 0;
  let disposedSessions = 0;
  let renderUpdates = 0;
  let notifications = 0;

  const notify = (sessionKey: string): void => {
    const subscribers = listeners.get(sessionKey);
    if (!subscribers) return;
    notifications += 1;
    for (const listener of subscribers) listener();
  };

  const cancelScheduledUpdate = (entry: RegistryEntry): void => {
    entry.cancelScheduledUpdate?.();
    entry.cancelScheduledUpdate = undefined;
  };

  const commitTargetSource = (sessionKey: string, entry: RegistryEntry): boolean => {
    if (entries.get(sessionKey) !== entry) return false;
    const result = entry.session.updateSource(entry.targetSource);
    entry.snapshot = requireReadySnapshot(result, sessionKey);
    renderUpdates += 1;
    return true;
  };

  const flushScheduledUpdate = (
    sessionKey: string,
    entry: RegistryEntry,
  ): AgentMarkdownSessionPublication | undefined => {
    if (!entry.cancelScheduledUpdate) return undefined;
    entry.cancelScheduledUpdate = undefined;
    return commitTargetSource(sessionKey, entry)
      ? createPublication(new Set([sessionKey]))
      : undefined;
  };

  const replaceEntry = (mutation: PendingSessionMutation): void => {
    const previous = entries.get(mutation.sessionKey);
    if (previous) {
      cancelScheduledUpdate(previous);
      entries.delete(mutation.sessionKey);
      disposedSessions += 1;
    }
    const session = new MarkdownStreamingSession();
    const result = mutation.complete
      ? session.finalize(mutation.source)
      : session.append(mutation.source);
    const snapshot = requireReadySnapshot(result, mutation.sessionKey);
    entries.set(mutation.sessionKey, {
      conversationId: mutation.conversationId,
      messageId: mutation.messageId,
      session,
      snapshot,
      targetSource: mutation.source,
    });
    createdSessions += 1;
    renderUpdates += 1;
  };

  const appendEntry = (mutation: PendingSessionMutation, allowScheduling: boolean): boolean => {
    const entry = entries.get(mutation.sessionKey);
    if (!entry) {
      replaceEntry(mutation);
      return true;
    }
    entry.targetSource = `${entry.targetSource}${mutation.source}`;
    if (allowScheduling && !mutation.complete && options.scheduleStreamingUpdate) {
      entry.cancelScheduledUpdate ??= options.scheduleStreamingUpdate(() =>
        flushScheduledUpdate(mutation.sessionKey, entry),
      );
      return false;
    }
    cancelScheduledUpdate(entry);
    const result = mutation.complete
      ? entry.session.finalize(entry.targetSource)
      : entry.session.updateSource(entry.targetSource);
    entry.snapshot = requireReadySnapshot(result, mutation.sessionKey);
    renderUpdates += 1;
    return true;
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

  const flushPendingConversationUpdates = (
    conversationId: string,
    excludedSessionKeys: ReadonlySet<string>,
    affectedSessionKeys: Set<string>,
  ): void => {
    for (const [sessionKey, entry] of entries) {
      if (
        entry.conversationId !== conversationId ||
        excludedSessionKeys.has(sessionKey) ||
        !entry.cancelScheduledUpdate
      ) {
        continue;
      }
      cancelScheduledUpdate(entry);
      if (commitTargetSource(sessionKey, entry)) affectedSessionKeys.add(sessionKey);
    }
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
      const entry = entries.get(sessionKey);
      if (entry) {
        cancelScheduledUpdate(entry);
        entries.delete(sessionKey);
        disposedSessions += 1;
      }
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
        cancelScheduledUpdate(entry);
        entries.delete(sessionKey);
        disposedSessions += 1;
        affectedSessionKeys.add(sessionKey);
        continue;
      }
      if (owner.messageId && entry.messageId !== owner.messageId) continue;
      if (expectedSessionKeys.has(sessionKey)) continue;
      cancelScheduledUpdate(entry);
      entries.delete(sessionKey);
      disposedSessions += 1;
      affectedSessionKeys.add(sessionKey);
    }

    for (const mutation of mutations.values()) {
      const entry = entries.get(mutation.sessionKey);
      const isMatching =
        entry?.targetSource === mutation.source &&
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
      const coalesce = shouldCoalescePatch(patch);
      if (!coalesce) {
        flushPendingConversationUpdates(
          patch.conversationId,
          new Set(mutations.keys()),
          affectedSessionKeys,
        );
      }
      for (const mutation of mutations.values()) {
        let updatedImmediately: boolean;
        if (mutation.mode === 'append') {
          updatedImmediately = appendEntry(mutation, coalesce);
        } else {
          replaceEntry(mutation);
          updatedImmediately = true;
        }
        if (updatedImmediately) affectedSessionKeys.add(mutation.sessionKey);
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
      for (const entry of entries.values()) cancelScheduledUpdate(entry);
      disposedSessions += entries.size;
      entries.clear();
      listeners.clear();
    },
    metrics(): AgentMarkdownSessionRegistryMetrics {
      return {
        activeSessions: entries.size,
        createdSessions,
        disposedSessions,
        renderUpdates,
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
        complete: true,
      });
      return;
    }
    pending.set(sessionKey, {
      sessionKey,
      conversationId: delivery.conversationId,
      messageId: delivery.messageId,
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
    if (current?.mode === 'append') {
      pending.set(sessionKey, {
        ...current,
        source: `${current.source}${item.payload.content}`,
        complete: current.complete || complete,
      });
      return;
    }
    pending.set(sessionKey, {
      sessionKey,
      conversationId: delivery.conversationId,
      messageId: delivery.messageId,
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

function shouldCoalescePatch(patch: ConversationProjectionPatch): boolean {
  if (patch.completion !== undefined) return false;
  return (
    patch.operations.length > 0 &&
    patch.operations.every((operation) => operation.operation === 'append')
  );
}

function requireReadySnapshot(
  result: MarkdownStreamingResult,
  sessionKey: string,
): MarkdownStreamingSnapshot {
  if (result.status === 'ready') return result.snapshot;
  const details = result.diagnostics.map((diagnostic) => diagnostic.code).join('; ');
  throw new Error(`Normalized Markdown session failed for ${sessionKey}: ${details}`);
}
