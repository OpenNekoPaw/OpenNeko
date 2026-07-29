/**
 * History Store - Undo/Redo system using snapshot-based approach
 *
 * Records canvas data snapshots for undo/redo operations.
 * Only records meaningful changes (node/connection mutations),
 * not viewport or selection changes.
 */

import { create } from 'zustand';
import type { CanvasData } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface HistoryStore {
  /** Undo stack (most recent at end) */
  undoStack: string[];
  /** Redo stack (most recent at end) */
  redoStack: string[];
  /** Maximum number of history entries */
  maxHistory: number;

  /** Whether undo is available */
  canUndo: () => boolean;
  /** Whether redo is available */
  canRedo: () => boolean;

  /** Push a new state snapshot (clears redo stack) */
  pushState: (state: CanvasData) => void;
  /** Undo: pop from undo stack, push current to redo stack */
  undo: (currentState: CanvasData) => CanvasData | null;
  /** Redo: pop from redo stack, push current to undo stack */
  redo: (currentState: CanvasData) => CanvasData | null;
  /** Clear all history */
  clear: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Serialize canvas data for comparison and storage.
 * Strips viewport and selection info since those are not undoable.
 */
function serializeForHistory(data: CanvasData): string {
  const { viewport: _viewport, ...rest } = data;
  return JSON.stringify(rest);
}

/**
 * Deserialize a history snapshot back to CanvasData,
 * preserving the current viewport.
 */
function deserializeWithViewport(
  snapshot: string,
  currentViewport: CanvasData['viewport'],
): CanvasData {
  const data = JSON.parse(snapshot) as Omit<CanvasData, 'viewport'>;
  return { ...data, viewport: currentViewport } as CanvasData;
}

// =============================================================================
// Store
// =============================================================================

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistory: 50,

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  pushState: (state) => {
    const { undoStack, maxHistory } = get();
    const serialized = serializeForHistory(state);

    // Skip if identical to the last recorded state
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === serialized) {
      return;
    }

    const newStack = [...undoStack, serialized];
    // Trim to max history size
    if (newStack.length > maxHistory) {
      newStack.splice(0, newStack.length - maxHistory);
    }

    set({
      undoStack: newStack,
      redoStack: [], // Clear redo stack on new action
    });
  },

  undo: (currentState) => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const previousSnapshot = undoStack[undoStack.length - 1]!;
    const currentSnapshot = serializeForHistory(currentState);

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
    });

    return deserializeWithViewport(previousSnapshot, currentState.viewport);
  },

  redo: (currentState) => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const nextSnapshot = redoStack[redoStack.length - 1]!;
    const currentSnapshot = serializeForHistory(currentState);

    set({
      undoStack: [...undoStack, currentSnapshot],
      redoStack: redoStack.slice(0, -1),
    });

    return deserializeWithViewport(nextSnapshot, currentState.viewport);
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] });
  },
}));
