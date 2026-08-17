import type { ConversationRenderCoordinator } from './conversation-render-coordinator';

export type WebviewRenderVisibility = 'hidden' | 'visible';

export interface ConversationRenderRuntimeMetrics {
  readonly componentAttached: boolean;
  readonly realmDisposed: boolean;
  readonly visibility: WebviewRenderVisibility;
}

export interface ConversationRenderRuntimeLifecycle {
  attachComponent(): void;
  detachComponent(): void;
  setVisibility(visibility: WebviewRenderVisibility): void;
  disposeConversation(
    conversationId: string,
    reason: 'conversation-delete' | 'confirmed-empty-conversation',
  ): void;
  disposeRealm(): void;
  metrics(): ConversationRenderRuntimeMetrics;
}

export function bindConversationRenderRuntimeLifecycle(
  runtime: ConversationRenderRuntimeLifecycle,
): () => void {
  runtime.attachComponent();
  const handleVisibilityChange = (): void => {
    runtime.setVisibility(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
  };
  const unbindNativeListeners = (): void => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
  };
  const handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      runtime.setVisibility('hidden');
      return;
    }
    unbindNativeListeners();
    runtime.disposeRealm();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  return () => {
    unbindNativeListeners();
    runtime.detachComponent();
  };
}

export function createConversationRenderRuntimeLifecycle(input: {
  readonly coordinator: ConversationRenderCoordinator;
}): ConversationRenderRuntimeLifecycle {
  let componentAttached = false;
  let realmDisposed = false;
  let visibility: WebviewRenderVisibility =
    typeof document === 'undefined' || document.visibilityState === 'visible'
      ? 'visible'
      : 'hidden';

  return {
    attachComponent(): void {
      if (realmDisposed) {
        throw new Error('Cannot attach a component to a disposed Webview render realm.');
      }
      componentAttached = true;
    },
    detachComponent(): void {
      if (realmDisposed || !componentAttached) return;
      componentAttached = false;
    },
    setVisibility(nextVisibility): void {
      if (realmDisposed) {
        throw new Error('Cannot change visibility for a disposed Webview render realm.');
      }
      visibility = nextVisibility;
    },
    disposeConversation(conversationId, reason): void {
      if (input.coordinator.isDisposed(conversationId)) return;
      if (input.coordinator.read(conversationId)) {
        input.coordinator.dispose({ kind: 'disposal', conversationId, reason });
      }
    },
    disposeRealm(): void {
      if (realmDisposed) return;
      componentAttached = false;
      realmDisposed = true;
    },
    metrics(): ConversationRenderRuntimeMetrics {
      return { componentAttached, realmDisposed, visibility };
    },
  };
}
