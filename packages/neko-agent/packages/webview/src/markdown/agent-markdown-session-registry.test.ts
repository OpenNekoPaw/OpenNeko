import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko-agent/types';
import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
} from './agent-markdown-session-registry';

describe('agent markdown session registry', () => {
  it('coalesces one projection patch into one Markdown revision and publication', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    const listener = vi.fn();
    registry.subscribe(key, listener);

    const publication = registry.commitProjectionPatch({
      ...projectionPatch('', 1, 1),
      operations: [
        appendOperation('| A', 1),
        appendOperation(' | B |\n', 2),
        appendOperation('| - | - |\n', 3),
      ],
    });

    expect(registry.getSnapshot(key)).toMatchObject({
      source: '| A | B |\n| - | - |\n',
      isFinal: false,
    });
    expect(registry.metrics()).toMatchObject({ renderRevisions: 1, activeSessions: 1 });
    expect(listener).not.toHaveBeenCalled();
    publication.publish();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => publication.publish()).toThrow(
      'Markdown Timeline commit publication may only be published once',
    );
  });

  it('keeps one parser session across authoritative append patches', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();

    registry.commitProjectionPatch(projectionPatch('| Shot | Prompt |\n', 1, 1)).publish();
    const first = registry.getSnapshot(key);
    registry.commitProjectionPatch(projectionPatch('| --- | --- |\n', 2, 2)).publish();
    registry.commitProjectionPatch(projectionPatch('| 1 | Pan right |', 3, 3)).publish();
    const final = registry.getSnapshot(key);

    expect(final).toMatchObject({
      sessionId: first?.sessionId,
      revision: 3,
      source: '| Shot | Prompt |\n| --- | --- |\n| 1 | Pan right |',
      isFinal: false,
    });
    expect(final?.document.root.children.some((node) => node.type === 'table')).toBe(true);
  });

  it('reconciles a missing parser session from the authoritative projection snapshot', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    const listener = vi.fn();
    registry.subscribe(key, listener);

    const publication = registry.commitProjectionSnapshot(
      projectionSnapshot('partial **markdown**', 4),
    );

    expect(registry.getSnapshot(key)).toMatchObject({
      source: 'partial **markdown**',
      isFinal: false,
    });
    expect(listener).not.toHaveBeenCalled();
    publication.publish();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild a parser session when an authoritative snapshot is unchanged', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const snapshot = projectionSnapshot('stable', 2);

    registry.commitProjectionSnapshot(snapshot).publish();
    const first = registry.getSnapshot(sessionKey());
    const metricsBefore = registry.metrics();
    registry.commitProjectionSnapshot(snapshot).publish();

    expect(registry.getSnapshot(sessionKey())).toBe(first);
    expect(registry.metrics()).toMatchObject({
      createdSessions: metricsBefore.createdSessions,
      disposedSessions: metricsBefore.disposedSessions,
      renderRevisions: metricsBefore.renderRevisions,
      notifications: metricsBefore.notifications,
    });
  });

  it('finalizes Markdown and removes omitted turns from an authoritative snapshot', () => {
    const registry = createAgentMarkdownSessionRegistry();
    const key = sessionKey();
    registry.commitProjectionSnapshot(projectionSnapshot('final', 1)).publish();

    registry
      .commitProjectionPatch({
        ...projectionPatch('', 2, 2),
        operations: [
          {
            operation: 'complete',
            itemId: 'text-1',
            itemRevision: 2,
            kind: 'assistant_text',
            sourceGeneration: 1,
            status: 'complete',
            updatedAt: 2,
          },
        ],
        completion: { status: 'completed', completedAt: 2 },
      })
      .publish();

    expect(registry.getSnapshot(key)).toMatchObject({ source: 'final', isFinal: true });
    registry
      .commitProjectionSnapshot({ conversationId: 'conv-1', projectionVersion: 3, turns: [] })
      .publish();
    expect(registry.getSnapshot(key)).toBeUndefined();
  });

  it('keeps Markdown registries isolated for two Tab projection replicas', () => {
    const registryA = createAgentMarkdownSessionRegistry();
    const registryB = createAgentMarkdownSessionRegistry();
    const key = sessionKey();

    registryA.commitProjectionSnapshot(projectionSnapshot('tab A', 1)).publish();
    registryB.commitProjectionSnapshot(projectionSnapshot('tab B', 1)).publish();

    expect(registryA.getSnapshot(key)?.source).toBe('tab A');
    expect(registryB.getSnapshot(key)?.source).toBe('tab B');
    registryA.disposeAll();
    expect(registryA.getSnapshot(key)).toBeUndefined();
    expect(registryB.getSnapshot(key)?.source).toBe('tab B');
  });

  it('disposes a conversation without affecting another conversation', () => {
    const registry = createAgentMarkdownSessionRegistry();
    registry.commitProjectionSnapshot(projectionSnapshot('A', 1, 'conv-a')).publish();
    registry.commitProjectionSnapshot(projectionSnapshot('B', 1, 'conv-b')).publish();

    registry.disposeConversation('conv-a');

    expect(registry.getSnapshot(sessionKey('conv-a'))).toBeUndefined();
    expect(registry.getSnapshot(sessionKey('conv-b'))?.source).toBe('B');
  });
});

function sessionKey(conversationId = 'conv-1'): string {
  return createAgentMarkdownSessionKey({
    conversationId,
    messageId: 'message-1',
    itemId: 'text-1',
  });
}

function projectionPatch(
  content: string,
  projectionVersion: number,
  itemRevision: number,
  conversationId = 'conv-1',
): ConversationProjectionPatch {
  return {
    type: 'conversationProjectionPatch',
    conversationId,
    projectionVersion,
    baseProjectionVersion: projectionVersion - 1,
    turnId: 'turn-1',
    messageId: 'message-1',
    operations: [appendOperation(content, itemRevision, conversationId)],
  };
}

function appendOperation(content: string, itemRevision: number, conversationId = 'conv-1') {
  return {
    operation: 'append' as const,
    item: textItem(content, itemRevision, conversationId),
  };
}

function projectionSnapshot(
  content: string,
  itemRevision: number,
  conversationId = 'conv-1',
): ConversationProjectionSnapshot {
  return {
    conversationId,
    projectionVersion: itemRevision,
    turns: [
      {
        turnId: 'turn-1',
        messageId: 'message-1',
        items: [textItem(content, itemRevision, conversationId)],
      },
    ],
  };
}

function textItem(
  content: string,
  itemRevision: number,
  conversationId: string,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId,
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId: 'text-1',
    sequence: 1,
    itemRevision,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: itemRevision,
  };
}
