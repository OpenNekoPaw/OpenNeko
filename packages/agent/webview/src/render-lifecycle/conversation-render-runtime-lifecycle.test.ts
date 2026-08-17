import { describe, expect, it, vi } from 'vitest';
import { createIdleConversationStreamingSnapshot } from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import {
  bindConversationRenderRuntimeLifecycle,
  createConversationRenderRuntimeLifecycle,
} from './conversation-render-runtime-lifecycle';

describe('conversation render runtime lifecycle', () => {
  it('separates component detach, hide/reveal, and realm teardown without delivery scheduling', () => {
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator });
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

  it('disposes only one conversation and preserves the other coordinator snapshot', () => {
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator });
    coordinator.ingest(hostSnapshot('conv-a'));
    coordinator.ingest(hostSnapshot('conv-b'));

    runtime.disposeConversation('conv-a', 'conversation-delete');
    expect(coordinator.read('conv-a')).toBeUndefined();
    expect(coordinator.isDisposed('conv-a')).toBe(true);
    expect(coordinator.read('conv-b')).toBeDefined();
  });

  it('stops projecting document visibility after the Webview realm is torn down', () => {
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator });
    const setVisibility = vi.spyOn(runtime, 'setVisibility');
    const unbind = bindConversationRenderRuntimeLifecycle(runtime);

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(runtime.metrics().realmDisposed).toBe(true);
    expect(setVisibility).not.toHaveBeenCalled();
    unbind();
  });

  it('keeps the realm recoverable when pagehide enters the back-forward cache', () => {
    const coordinator = new ConversationRenderCoordinator();
    const runtime = createConversationRenderRuntimeLifecycle({ coordinator });
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
    messages: [],
    streaming: createIdleConversationStreamingSnapshot(),
  };
}
