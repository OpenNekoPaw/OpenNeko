/**
 * useKeyboardShortcuts - 键盘快捷键 Hook
 * P2: 支持常用快捷键操作
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean; // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  enabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Check if the current platform is Mac
 */
function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Check if modifier keys match
 */
function matchesModifiers(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const mac = isMac();

  // On Mac, meta (Cmd) is primary, on others it's Ctrl
  const primaryMod = mac ? event.metaKey : event.ctrlKey;
  const expectedPrimary = shortcut.meta ?? shortcut.ctrl ?? false;

  if (primaryMod !== expectedPrimary) return false;
  if ((shortcut.shift ?? false) !== event.shiftKey) return false;
  if ((shortcut.alt ?? false) !== event.altKey) return false;

  return true;
}

/**
 * Hook for handling keyboard shortcuts
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input/textarea (unless explicitly allowed)
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;

        // Check key match (case insensitive)
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        // Check modifiers
        if (!matchesModifiers(event, shortcut)) continue;

        // For shortcuts without modifiers, skip if in input
        const hasModifier = shortcut.meta || shortcut.ctrl || shortcut.alt;
        if (isInput && !hasModifier) continue;

        // Prevent default and execute action
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
        return;
      }
    },
    [shortcuts, enabled],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Common shortcut presets
 */
export const COMMON_SHORTCUTS = {
  // Focus input: Cmd/Ctrl + /
  focusInput: (action: () => void): KeyboardShortcut => ({
    key: '/',
    meta: true,
    action,
    description: 'Focus input',
  }),

  // Clear conversation: Cmd/Ctrl + K
  clearConversation: (action: () => void): KeyboardShortcut => ({
    key: 'k',
    meta: true,
    action,
    description: 'Clear conversation',
  }),

  // New conversation: Cmd/Ctrl + N
  newConversation: (action: () => void): KeyboardShortcut => ({
    key: 'n',
    meta: true,
    action,
    description: 'New conversation',
  }),

  // Cancel current operation: Escape
  cancel: (action: () => void): KeyboardShortcut => ({
    key: 'Escape',
    action,
    description: 'Cancel',
  }),

  // Send message: Enter (handled separately in textarea)
  send: (action: () => void): KeyboardShortcut => ({
    key: 'Enter',
    action,
    description: 'Send message',
  }),

  // Toggle settings: Cmd/Ctrl + ,
  settings: (action: () => void): KeyboardShortcut => ({
    key: ',',
    meta: true,
    action,
    description: 'Open settings',
  }),

  // Search: Cmd/Ctrl + F
  search: (action: () => void): KeyboardShortcut => ({
    key: 'f',
    meta: true,
    action,
    description: 'Search',
  }),

  // Copy last response: Cmd/Ctrl + Shift + C
  copyLastResponse: (action: () => void): KeyboardShortcut => ({
    key: 'c',
    meta: true,
    shift: true,
    action,
    description: 'Copy last response',
  }),
};
