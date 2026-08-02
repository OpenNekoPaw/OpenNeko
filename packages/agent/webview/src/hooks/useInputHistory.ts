/**
 * Input History Hook
 *
 * Manages input history for the chat input area.
 * Supports navigating through previous inputs with arrow keys.
 */

import { useState, useCallback, useRef } from 'react';

interface UseInputHistoryOptions {
  /** Maximum number of history entries to keep */
  maxHistory?: number;
}

interface UseInputHistoryReturn {
  /** Add a new entry to history (called on send) */
  addToHistory: (input: string) => void;
  /** Navigate to previous (older) history entry */
  navigateUp: (currentInput: string) => string | null;
  /** Navigate to next (newer) history entry */
  navigateDown: () => string | null;
  /** Reset history navigation (called when user types) */
  resetNavigation: () => void;
  /** Current history index (-1 means not navigating) */
  historyIndex: number;
  /** Whether currently navigating history */
  isNavigating: boolean;
}

/**
 * Hook for managing input history with arrow key navigation
 *
 * Usage:
 * ```tsx
 * const { addToHistory, navigateUp, navigateDown, resetNavigation } = useInputHistory();
 *
 * // On send
 * addToHistory(inputValue);
 *
 * // On ArrowUp (when cursor at first line)
 * const prevInput = navigateUp(inputValue);
 * if (prevInput !== null) setInputValue(prevInput);
 *
 * // On ArrowDown
 * const nextInput = navigateDown();
 * if (nextInput !== null) setInputValue(nextInput);
 *
 * // On user typing
 * resetNavigation();
 * ```
 */
export function useInputHistory(options: UseInputHistoryOptions = {}): UseInputHistoryReturn {
  const { maxHistory = 50 } = options;

  // History entries (newest first)
  const [history, setHistory] = useState<string[]>([]);

  // Current navigation index (-1 = not navigating, 0 = most recent, etc.)
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Temporary storage for current input when starting navigation
  const tempInputRef = useRef<string>('');

  /**
   * Add a new entry to history
   * Called when user sends a message
   */
  const addToHistory = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      setHistory((prev) => {
        // Remove duplicate if exists
        const filtered = prev.filter((h) => h !== trimmed);
        // Add to front, limit size
        return [trimmed, ...filtered].slice(0, maxHistory);
      });

      // Reset navigation state
      setHistoryIndex(-1);
      tempInputRef.current = '';
    },
    [maxHistory],
  );

  /**
   * Navigate to previous (older) history entry
   * Returns the history entry or null if at end
   */
  const navigateUp = useCallback(
    (currentInput: string): string | null => {
      if (history.length === 0) return null;

      // If starting navigation, save current input
      if (historyIndex === -1) {
        tempInputRef.current = currentInput;
      }

      const newIndex = Math.min(historyIndex + 1, history.length - 1);

      // Already at oldest entry
      if (newIndex === historyIndex) return null;

      setHistoryIndex(newIndex);
      return history[newIndex] ?? null;
    },
    [history, historyIndex],
  );

  /**
   * Navigate to next (newer) history entry
   * Returns the history entry, temp input, or null if not navigating
   */
  const navigateDown = useCallback((): string | null => {
    // Not navigating
    if (historyIndex === -1) return null;

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);

    // Return to current input
    if (newIndex < 0) {
      return tempInputRef.current;
    }

    return history[newIndex] ?? null;
  }, [history, historyIndex]);

  /**
   * Reset navigation state
   * Called when user types (modifies input)
   */
  const resetNavigation = useCallback(() => {
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      tempInputRef.current = '';
    }
  }, [historyIndex]);

  return {
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    historyIndex,
    isNavigating: historyIndex !== -1,
  };
}
