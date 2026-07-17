import type { OpenTab } from '@neko-agent/types';
import type { MessageHandlerContext } from './types';

export function openConversationTabBinding(context: MessageHandlerContext, tab: OpenTab): void {
  const openTabs = [...context.openTabs.filter((candidate) => candidate.id !== tab.id), tab];
  const reconcileTabRenderRuntimes = context.reconcileTabRenderRuntimes;
  if (!reconcileTabRenderRuntimes) {
    throw new Error('Opening a conversation Tab requires a Tab render runtime reconciler.');
  }
  reconcileTabRenderRuntimes(
    openTabs.map((candidate) => ({
      tabId: candidate.id,
      conversationId: candidate.conversationId,
    })),
    tab.id,
  );
  context.isTablessConversationViewRef.current = false;
  context.setOpenTabs(openTabs);
  context.setActiveTabId(tab.id);
  context.setActiveTab('chat');
}
