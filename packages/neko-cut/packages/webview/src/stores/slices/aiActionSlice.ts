/**
 * AI Action Slice
 * Manages AI-related operations state and actions
 * Centralizes AI action dispatching to replace scattered event/postMessage calls
 */

import { StateCreator } from 'zustand';
import { sendAIAction, isVSCodeContext } from '../../utils/vscodeApi';
import { getLogger } from '../../utils/logger';

const logger = getLogger('AIAction');

// AI Action types matching shared/src/types/ai-actions.ts
export type AIActionId =
  | 'ai-background-remove'
  | 'ai-style-transfer'
  | 'ai-auto-edit'
  | 'ai-match-music'
  | 'ai-remove-silence'
  | 'ai-color-grade'
  | 'ai-smart-crop';

export interface AIActionRequest {
  actionId: AIActionId;
  elementIds: string[];
  trackIds?: string[];
  params?: Record<string, unknown>;
}

export interface AIActionStatus {
  actionId: AIActionId;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  error?: string;
}

export interface AIActionSlice {
  // State
  pendingAIActions: AIActionRequest[];
  activeAIAction: AIActionStatus | null;
  aiActionHistory: AIActionStatus[];

  // Actions
  executeAIAction: (actionId: AIActionId, elementIds: string[], trackIds?: string[]) => void;
  setAIActionStatus: (status: AIActionStatus) => void;
  clearAIActionStatus: () => void;

  // Timeline context menu AI operations
  aiAutoEdit: () => void;
  aiMatchMusic: () => void;
  aiRemoveSilence: () => void;
}

export const createAIActionSlice: StateCreator<AIActionSlice, [], [], AIActionSlice> = (
  set,
  get,
) => ({
  // Initial state
  pendingAIActions: [],
  activeAIAction: null,
  aiActionHistory: [],

  // Execute AI action - sends to Extension Host via postMessage
  executeAIAction: (actionId, elementIds, trackIds) => {
    const request: AIActionRequest = { actionId, elementIds, trackIds };

    // Add to pending queue
    set((state) => ({
      pendingAIActions: [...state.pendingAIActions, request],
      activeAIAction: {
        actionId,
        status: 'pending',
        message: `Preparing ${actionId}...`,
      },
    }));

    // Send to Extension Host
    if (isVSCodeContext()) {
      sendAIAction(actionId, elementIds, trackIds);
      logger.info('Sent to Extension:', { actionId, elementIds });
    } else {
      // Development mode - simulate action
      logger.info('Dev mode - would execute:', { actionId, elementIds });

      // Simulate processing for dev mode
      setTimeout(() => {
        set((state) => ({
          activeAIAction: {
            actionId,
            status: 'completed',
            message: `${actionId} completed (dev mode)`,
          },
          pendingAIActions: state.pendingAIActions.filter(
            (a) => a.actionId !== actionId || a.elementIds !== elementIds,
          ),
          aiActionHistory: [
            ...state.aiActionHistory,
            { actionId, status: 'completed', message: 'Dev mode simulation' },
          ],
        }));
      }, 1000);
    }
  },

  // Set AI action status (called when Extension sends status updates)
  setAIActionStatus: (status) => {
    set((state) => {
      const newState: Partial<AIActionSlice> = { activeAIAction: status };

      // If completed or failed, move to history and remove from pending
      if (status.status === 'completed' || status.status === 'failed') {
        newState.pendingAIActions = state.pendingAIActions.filter(
          (a) => a.actionId !== status.actionId,
        );
        newState.aiActionHistory = [...state.aiActionHistory, status];
      }

      return newState;
    });
  },

  clearAIActionStatus: () => {
    set({ activeAIAction: null });
  },

  // Timeline context menu AI operations
  aiAutoEdit: () => {
    const { executeAIAction } = get();
    executeAIAction('ai-auto-edit', []);
  },

  aiMatchMusic: () => {
    const { executeAIAction } = get();
    executeAIAction('ai-match-music', []);
  },

  aiRemoveSilence: () => {
    const { executeAIAction } = get();
    executeAIAction('ai-remove-silence', []);
  },
});
