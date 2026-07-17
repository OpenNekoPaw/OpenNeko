/**
 * Tab State Handlers
 *
 * Handles tab state restoration from extension host.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { TabStateMessage } from './messages';
import { AgentHostMessages } from '../messages';

/**
 * Handle 'tabState' message - Restore tab state from extension
 */
const handleTabState: MessageHandler<'tabState'> = (message: TabStateMessage, context) => {
  const revisionRef = context.tabStateRevisionRef;
  if (!revisionRef) {
    throw new Error('Tab state handling requires a Webview-owned revision ref.');
  }
  if (message.revision < revisionRef.current) {
    return;
  }
  revisionRef.current = message.revision;

  if (message.tabState) {
    const openTabs = message.tabState.openTabs ?? [];
    const { activeTabId } = message.tabState;
    const isEmptyTabState =
      Array.isArray(message.tabState.openTabs) &&
      openTabs.length === 0 &&
      (activeTabId ?? null) === null;

    if (!context.reconcileTabRenderRuntimes) {
      throw new Error('Tab state handling requires a Tab render runtime reconciler.');
    }
    context.reconcileTabRenderRuntimes(
      openTabs.map((tab) => ({ tabId: tab.id, conversationId: tab.conversationId })),
      activeTabId ?? null,
    );

    if (Array.isArray(openTabs)) {
      context.setOpenTabs(openTabs);
    }

    if (activeTabId !== undefined) {
      context.setActiveTabId(activeTabId);
    }

    const restoredConversationIds = context.restoredConversationIdsRef;
    if (!restoredConversationIds) {
      throw new Error('Tab state handling requires a Webview-owned restore request registry.');
    }
    for (const conversationId of new Set(openTabs.map((tab) => tab.conversationId))) {
      if (restoredConversationIds.current.has(conversationId)) continue;
      restoredConversationIds.current.add(conversationId);
      AgentHostMessages.getConversationSnapshot(conversationId);
      AgentHostMessages.getSettings(conversationId);
    }

    if (isEmptyTabState) {
      context.isTablessConversationViewRef.current = true;
      context.setActiveConversationId(null);
      context.activeConversationIdRef.current = null;
      context.setActiveTab('chat');
      return;
    }

    const activeTab = activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
    if (activeTab) {
      context.isTablessConversationViewRef.current = false;
      context.setActiveTab('chat');
    }
  }
};

/**
 * All tab handler registrations
 */
export const tabHandlers: HandlerRegistration[] = [defineHandler('tabState', handleTabState)];
