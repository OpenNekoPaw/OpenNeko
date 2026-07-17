/**
 * useResourceState Hook
 *
 * Manages resource-related state (tasks) for the AIAssistant component.
 */

import { useState } from 'react';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

/**
 * Resource state shape
 */
export interface ResourceState {
  workItemsByConversation: AgentWorkItemStore;
  pluginsAvailable: PluginsAvailable;
}

/**
 * Resource state actions
 */
export interface ResourceStateActions {
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;
}

/**
 * useResourceState return type
 */
export interface UseResourceStateReturn extends ResourceState, ResourceStateActions {}

/**
 * Hook for managing resource state
 */
export function useResourceState(): UseResourceStateReturn {
  const [workItemsByConversation, setWorkItemsByConversation] = useState<AgentWorkItemStore>(
    () => new Map(),
  );
  const [pluginsAvailable, setPluginsAvailable] = useState<PluginsAvailable>({});

  return {
    workItemsByConversation,
    setWorkItemsByConversation,
    pluginsAvailable,
    setPluginsAvailable,
  };
}
