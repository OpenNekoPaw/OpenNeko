/**
 * useTabManager - Tab lifecycle management
 *
 * Handles opening, closing, and switching tabs,
 * plus persistence of tab state to extension host.
 */

import { useRef, useCallback } from 'react';
import type {
  ActivateConversationWebviewMessage,
  OpenTab,
  ConversationSummary,
  TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import { isCharacterRoleTab } from '@/presenters/character-role-session-presenter';

export interface UseTabManagerProps {
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  activeTabId: string | null;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  onBeforeTabOpen?: () => void;
  conversations: ConversationSummary[];
  setActiveTab: (tab: TabType) => void;
  onAllTabsClosed?: () => void;
  onBeforeConversationActivation?: (
    request: Omit<ActivateConversationWebviewMessage, 'type' | 'tabState'>,
  ) => void;
  onConversationActivated?: (conversationId: string) => void;
  onActivateCharacterRoleTab?: (tab: OpenTab) => void;
  hasLocalConversationActivity?: (conversationId: string) => boolean;
  onConfigSnapshotRequested?: () => void;
  tabStateRevision: number;
  onTabStateRevisionAllocated: (revision: number) => void;
}

export interface UseTabManagerReturn {
  handleOpenTab: (conversationId: string, title: string) => void;
  handleCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  handleSwitchTab: (tabId: string) => void;
}

export function useTabManager({
  openTabs,
  setOpenTabs,
  activeTabId,
  setActiveTabId,
  onBeforeTabOpen,
  conversations,
  setActiveTab,
  onAllTabsClosed,
  onBeforeConversationActivation,
  onConversationActivated,
  onActivateCharacterRoleTab,
  hasLocalConversationActivity,
  onConfigSnapshotRequested,
  tabStateRevision,
  onTabStateRevisionAllocated,
}: UseTabManagerProps): UseTabManagerReturn {
  const optimisticTabStateRevisionRef = useRef(tabStateRevision);
  const activationIdRef = useRef(0);
  optimisticTabStateRevisionRef.current = Math.max(
    optimisticTabStateRevisionRef.current,
    tabStateRevision,
  );

  const beginTabStateMutation = useCallback((): number => {
    const expectedRevision = optimisticTabStateRevisionRef.current;
    const nextRevision = expectedRevision + 1;
    optimisticTabStateRevisionRef.current = nextRevision;
    onTabStateRevisionAllocated(nextRevision);
    return expectedRevision;
  }, [onTabStateRevisionAllocated]);

  const persistTabState = useCallback(
    (nextOpenTabs: OpenTab[], nextActiveTabId: string | null): void => {
      AgentHostMessages.updateTabState(nextOpenTabs, nextActiveTabId, beginTabStateMutation());
    },
    [beginTabStateMutation],
  );

  const activateOrdinaryConversation = useCallback(
    (nextOpenTabs: OpenTab[], tab: OpenTab): void => {
      activationIdRef.current += 1;
      const request = {
        activationId: activationIdRef.current,
        conversationId: tab.conversationId,
        tabId: tab.id,
        expectedTabStateRevision: beginTabStateMutation(),
      };
      onBeforeConversationActivation?.(request);
      AgentHostMessages.activateConversation({
        ...request,
        tabState: { openTabs: nextOpenTabs, activeTabId: tab.id },
      });
      onConversationActivated?.(tab.conversationId);
    },
    [beginTabStateMutation, onBeforeConversationActivation, onConversationActivated],
  );

  const handleOpenTab = useCallback(
    (conversationId: string, title: string) => {
      const existingTab = openTabs.find((t) => t.conversationId === conversationId);
      onBeforeTabOpen?.();
      if (existingTab) {
        setActiveTabId(existingTab.id);
        if (isCharacterRoleTab(existingTab)) {
          persistTabState(openTabs, existingTab.id);
          onActivateCharacterRoleTab?.(existingTab);
        } else {
          activateOrdinaryConversation(openTabs, existingTab);
        }
      } else {
        const newTab: OpenTab = {
          id: `tab-${Date.now()}`,
          title: title || 'New Chat',
          conversationId,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        onConfigSnapshotRequested?.();
        activateOrdinaryConversation([...openTabs, newTab], newTab);
      }
      setActiveTab('chat');
    },
    [
      openTabs,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      onBeforeTabOpen,
      activateOrdinaryConversation,
      onActivateCharacterRoleTab,
      onConfigSnapshotRequested,
      persistTabState,
    ],
  );

  const handleCloseTab = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      const tab = openTabs.find((t) => t.id === tabId);
      if (!tab) return;

      const isClosingActiveTab = activeTabId === tabId;

      const conversation = conversations.find((c) => c.id === tab.conversationId);
      const hasPersistedMessages = (conversation?.messageCount ?? 0) > 0;
      const hasLocalActivity = hasLocalConversationActivity?.(tab.conversationId) ?? false;
      const shouldDeleteEmptyConversation = Boolean(
        conversation && !hasPersistedMessages && !hasLocalActivity,
      );

      const tabIndex = openTabs.findIndex((t) => t.id === tabId);
      const newTabs = openTabs.filter((t) => t.id !== tabId);
      if (tab.kind === 'character-dialogue') {
        AgentHostMessages.exitCharacterDialogueSession(tab.conversationId);
      } else if (tab.kind === 'embody-character') {
        AgentHostMessages.exitEmbodyCharacterSession(tab.conversationId);
      } else if (shouldDeleteEmptyConversation) {
        AgentHostMessages.deleteConversation(tab.conversationId, {
          activateNext: false,
        });
      }

      setOpenTabs(newTabs);

      if (isClosingActiveTab && newTabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTabId(newActiveTab.id);
        if (isCharacterRoleTab(newActiveTab)) {
          persistTabState(newTabs, newActiveTab.id);
          onActivateCharacterRoleTab?.(newActiveTab);
        } else {
          activateOrdinaryConversation(newTabs, newActiveTab);
        }
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        persistTabState([], null);
        onAllTabsClosed?.();
      } else {
        persistTabState(newTabs, activeTabId);
      }
    },
    [
      openTabs,
      activeTabId,
      conversations,
      setOpenTabs,
      setActiveTabId,
      onAllTabsClosed,
      activateOrdinaryConversation,
      onActivateCharacterRoleTab,
      hasLocalConversationActivity,
      persistTabState,
    ],
  );

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      const tab = openTabs.find((t) => t.id === tabId);
      if (tab) {
        onBeforeTabOpen?.();
        setActiveTabId(tabId);
        if (isCharacterRoleTab(tab)) {
          persistTabState(openTabs, tab.id);
          onActivateCharacterRoleTab?.(tab);
        } else {
          activateOrdinaryConversation(openTabs, tab);
        }
        setActiveTab('chat');
      }
    },
    [
      openTabs,
      setActiveTabId,
      setActiveTab,
      onBeforeTabOpen,
      activateOrdinaryConversation,
      onActivateCharacterRoleTab,
      persistTabState,
    ],
  );

  return {
    handleOpenTab,
    handleCloseTab,
    handleSwitchTab,
  };
}
