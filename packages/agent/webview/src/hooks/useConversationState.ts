/**
 * useConversationState Hook
 *
 * Manages conversation-related state for the AIAssistant component.
 */

import { useState, useRef, useCallback, type MutableRefObject } from 'react';
import type {
  AgentQueuedMessageItem,
  Message,
  ConversationSummary,
  OpenTab,
} from '@neko/agent-contracts';
import { ConversationRenderCoordinator } from '../render-lifecycle/conversation-render-coordinator';
import {
  ingestConversationRenderSnapshot,
  type ConversationRenderStateUpdater as CanonicalConversationRenderStateUpdater,
  type ConversationRenderStreamingState,
} from '../render-lifecycle/conversation-render-state-adapter';

/**
 * Streaming state for a conversation
 */
export type StreamingState = ConversationRenderStreamingState;

/**
 * Conversation state shape
 */
export interface ConversationState {
  // Current conversation messages
  messages: Message[];
  // Streaming state
  isThinking: boolean;
  streamingMessageId: string | null;
  queuedMessageCount: number;
  queuedMessages: readonly AgentQueuedMessageItem[];
  // Conversation management
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  // Tab state
  openTabs: OpenTab[];
  activeTabId: string | null;
}

/**
 * Conversation state refs
 */
export interface ConversationStateRefs {
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationRenderCoordinator: ConversationRenderCoordinator;
}

/**
 * Conversation state actions
 */
export type ConversationRenderStateUpdater =
  CanonicalConversationRenderStateUpdater<StreamingState>;

export interface ConversationStateActions {
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  clearVisibleState: () => void;
  updateConversationRenderState: (
    conversationId: string,
    updater: ConversationRenderStateUpdater,
  ) => void;
}

/**
 * useConversationState return type
 */
export interface UseConversationStateReturn
  extends ConversationState, ConversationStateRefs, ConversationStateActions {}

/**
 * Hook for managing conversation state
 */
export function useConversationState(): UseConversationStateReturn {
  const conversationRenderCoordinatorRef = useRef<ConversationRenderCoordinator | null>(null);
  conversationRenderCoordinatorRef.current ??= new ConversationRenderCoordinator();
  const conversationRenderCoordinator = conversationRenderCoordinatorRef.current;

  // Current conversation's visible projection state. Conversation-owned maps and the
  // render coordinator remain authoritative; these values only project the active conversation.
  const [messages, setVisibleMessages] = useState<Message[]>([]);
  const [isThinking, setVisibleIsThinking] = useState(false);
  const [streamingMessageId, setVisibleStreamingMessageId] = useState<string | null>(null);
  const [queuedMessageCount, setVisibleQueuedMessageCount] = useState(0);
  const [queuedMessages, setVisibleQueuedMessages] = useState<readonly AgentQueuedMessageItem[]>(
    [],
  );
  const streamingMessageIdRef = useRef<string | null>(null);

  // Conversation management
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setVisibleActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const updateConversationRenderState = useCallback(
    (conversationId: string, updater: ConversationRenderStateUpdater): void => {
      const current = conversationRenderCoordinator.read(conversationId);
      const currentMessages = current?.messages ?? [];
      const currentStreaming = current?.streaming ?? {
        streamingMessageId: null,
        isThinking: false,
        queuedMessageCount: 0,
        queuedMessages: [],
      };
      const updated = updater([...currentMessages], currentStreaming);
      const snapshot = ingestConversationRenderSnapshot({
        coordinator: conversationRenderCoordinator,
        conversationId,
        messages: updated.messages,
        source: 'local',
        streaming: updated.streaming,
      });
      if (conversationId !== activeConversationIdRef.current) return;

      const projectedStreaming = snapshot.streaming;
      setVisibleMessages([...snapshot.messages]);
      setVisibleIsThinking(projectedStreaming.isThinking);
      setVisibleStreamingMessageId(projectedStreaming.streamingMessageId);
      setVisibleQueuedMessageCount(projectedStreaming.queuedMessageCount ?? 0);
      setVisibleQueuedMessages(projectedStreaming.queuedMessages ?? []);
      streamingMessageIdRef.current = projectedStreaming.streamingMessageId;
    },
    [conversationRenderCoordinator],
  );

  const setActiveConversationId = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (value) => {
      const nextValue =
        typeof value === 'function' ? value(activeConversationIdRef.current) : value;
      activeConversationIdRef.current = nextValue;
      setVisibleActiveConversationId(nextValue);
    },
    [],
  );

  const clearVisibleState = useCallback(() => {
    if (activeConversationIdRef.current) {
      throw new Error('Visible state can only be cleared after detaching the active conversation.');
    }
    setVisibleMessages([]);
    setVisibleStreamingMessageId(null);
    streamingMessageIdRef.current = null;
    setVisibleIsThinking(false);
    setVisibleQueuedMessageCount(0);
    setVisibleQueuedMessages([]);
  }, []);

  return {
    // State
    messages,
    isThinking,
    streamingMessageId,
    queuedMessageCount,
    queuedMessages,
    conversations,
    activeConversationId,
    openTabs,
    activeTabId,
    // Refs
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationRenderCoordinator,
    // Actions
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    clearVisibleState,
    updateConversationRenderState,
  };
}
