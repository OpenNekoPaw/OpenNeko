import { useLayoutEffect, useReducer, useRef } from 'react';
import type { OpenTab } from '@neko-agent/types';
import type {
  ConversationSessionState,
  ConversationSessionStateMap,
} from '@/presenters/conversation-session-state-presenter';
import {
  createTabComponentRetentionPolicy,
  type TabComponentRetentionPolicy,
} from './tab-component-retention';
import type { TabRenderRuntimeRegistry } from './tab-render-runtime';

export interface UseRetainedTabComponentsInput {
  readonly openTabs: readonly OpenTab[];
  readonly activeTabId: string | null;
  readonly runtimeRegistry: TabRenderRuntimeRegistry;
  readonly sessionStateByConversation: ConversationSessionStateMap;
}

export function useRetainedTabComponents({
  openTabs,
  activeTabId,
  runtimeRegistry,
  sessionStateByConversation,
}: UseRetainedTabComponentsInput): ReadonlySet<string> {
  const policyRef = useRef<TabComponentRetentionPolicy>();
  const [, publishRetentionChange] = useReducer((revision: number) => revision + 1, 0);
  policyRef.current ??= createTabComponentRetentionPolicy();

  useLayoutEffect(() => {
    const subscriptions = openTabs.flatMap((tab) => {
      const runtime = runtimeRegistry.get(tab.id);
      if (!runtime) return [];
      return [runtime.subscribeRetention(publishRetentionChange)];
    });
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [openTabs, runtimeRegistry]);

  return policyRef.current.reconcile(
    openTabs.map((tab) => {
      const runtime = runtimeRegistry.get(tab.id);
      const retention = runtime?.getRetentionSnapshot();
      const session = sessionStateByConversation.get(tab.conversationId);
      return {
        tabId: tab.id,
        active: tab.id === activeTabId,
        mustRetain:
          retention?.lifecycle === 'attaching' ||
          retention?.isComposing === true ||
          retention?.hasDirtyInput === true ||
          isConversationRunning(session),
      };
    }),
  );
}

function isConversationRunning(session: ConversationSessionState | undefined): boolean {
  if (!session) return false;
  return Boolean(
    session.streaming.isThinking ||
    session.streaming.streamingMessageId ||
    (session.streaming.queuedMessageCount ?? 0) > 0 ||
    (session.agentState && session.agentState.phase !== 'idle') ||
    session.workItems.some((item) => item.status === 'queued' || item.status === 'processing'),
  );
}
