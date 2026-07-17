import { describe, expect, it, vi } from 'vitest';
import { createAgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-registry';
import { createIdleConversationStreamingSnapshot } from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import {
  bindConversationRenderRuntimeLifecycle,
  createConversationRenderRuntimeLifecycle,
} from './conversation-render-runtime-lifecycle';

describe('conversation render runtime lifecycle', () => {
  it('separates component detach, hide/reveal, and realm teardown without delivery scheduling', () => {
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator, markdown });
    coordinator.ingest(hostSnapshot('conv-a'));

    runtime.attachComponent();
    runtime.setVisibility('hidden');
    runtime.setVisibility('visible');
    expect(runtime.metrics()).toEqual({
      componentAttached: true,
      realmDisposed: false,
      visibility: 'visible',
    });

    runtime.detachComponent();
    expect(runtime.metrics().componentAttached).toBe(false);
    expect(coordinator.read('conv-a')).toBeDefined();
    runtime.attachComponent();

    runtime.disposeRealm();
    expect(runtime.metrics()).toMatchObject({ componentAttached: false, realmDisposed: true });
    expect(() => runtime.attachComponent()).toThrow(/disposed Webview render realm/);
    expect(coordinator.read('conv-a')).toBeDefined();
  });

  it('disposes only one conversation and preserves other Markdown sessions', () => {
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator, markdown });
    coordinator.ingest(hostSnapshot('conv-a'));
    coordinator.ingest(hostSnapshot('conv-b'));
    markdown.commitProjectionSnapshot(projectionSnapshot('conv-a', 'message-a')).publish();
    markdown.commitProjectionSnapshot(projectionSnapshot('conv-b', 'message-b')).publish();

    runtime.disposeConversation('conv-a', 'conversation-delete');
    expect(coordinator.read('conv-a')).toBeUndefined();
    expect(coordinator.isDisposed('conv-a')).toBe(true);
    expect(coordinator.read('conv-b')).toBeDefined();
    expect(markdown.metrics().activeSessions).toBe(1);
  });

  it('stops projecting document visibility after the Webview realm is torn down', () => {
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator, markdown });
    const setVisibility = vi.spyOn(runtime, 'setVisibility');
    const unbind = bindConversationRenderRuntimeLifecycle(runtime);

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(runtime.metrics().realmDisposed).toBe(true);
    expect(setVisibility).not.toHaveBeenCalled();
    unbind();
  });

  it('keeps the realm recoverable when pagehide enters the back-forward cache', () => {
    const markdown = createAgentMarkdownSessionRegistry();
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator, markdown });
    const unbind = bindConversationRenderRuntimeLifecycle(runtime);

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));

    expect(runtime.metrics()).toMatchObject({
      realmDisposed: false,
      visibility: 'hidden',
    });
    unbind();
  });
});

function hostSnapshot(conversationId: string) {
  return {
    kind: 'host-snapshot' as const,
    conversationId,
    baseRevision: 0,
    messages: [],
    streaming: createIdleConversationStreamingSnapshot(),
  };
}

function projectionSnapshot(conversationId: string, messageId: string) {
  return {
    conversationId,
    projectionVersion: 1,
    turns: [
      {
        turnId: `turn-${messageId}`,
        messageId,
        items: [
          {
            conversationId,
            turnId: `turn-${messageId}`,
            messageId,
            itemId: 'text-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'assistant_text' as const,
            status: 'streaming' as const,
            payload: { content: conversationId, format: 'markdown' as const, sourceGeneration: 1 },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    ],
  };
}
