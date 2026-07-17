/**
 * UI Store
 *
 * Manages TUI-specific UI state: tool approval panel,
 * selection menus, scroll position, focus, terminal dimensions.
 */

import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';
import type { TerminalSize } from '../types/state';

/**
 * Pending tool approval request (simplified from ToolConfirmationRequest)
 */
export interface PendingApproval {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

/**
 * Selection menu item
 */
export interface SelectionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Whether this item is currently active/selected */
  readonly active?: boolean;
}

/**
 * Pending selection menu request
 */
export interface PendingSelection {
  readonly title: string;
  readonly items: SelectionMenuItem[];
  resolve: (selectedId: string | null) => void;
}

export interface UISlice {
  // State
  readonly pendingApproval: PendingApproval | null;
  readonly pendingSelection: PendingSelection | null;
  /** Rows above the live bottom; zero means follow new output. */
  readonly scrollOffset: number;
  readonly scrollLimit: number;
  readonly inputFocused: boolean;
  readonly slashMenuOpen: boolean;
  readonly terminalSize: TerminalSize;

  // Actions
  showToolApproval: (approval: PendingApproval) => void;
  dismissToolApproval: () => void;
  showSelection: (selection: PendingSelection) => void;
  dismissSelection: () => void;
  setScrollOffset: (offset: number) => void;
  setScrollLimit: (limit: number) => void;
  scrollUp: (lines?: number) => void;
  scrollDown: (lines?: number) => void;
  scrollToBottom: () => void;
  setInputFocused: (focused: boolean) => void;
  setSlashMenuOpen: (open: boolean) => void;
  setTerminalSize: (size: TerminalSize) => void;
}

export type UIStore = StoreApi<UISlice>;

export function createUIStore(
  initialTerminalSize: TerminalSize = readProcessTerminalSize(),
  assertMutable: () => void = () => undefined,
): UIStore {
  return createStore<UISlice>(createUIState(initialTerminalSize, assertMutable));
}

function createUIState(
  initialTerminalSize: TerminalSize,
  assertMutable: () => void,
): StateCreator<UISlice> {
  return (set) => {
    const update = (
      next: UISlice | Partial<UISlice> | ((state: UISlice) => UISlice | Partial<UISlice>),
    ): void => {
      assertMutable();
      set(next);
    };

    return {
      pendingApproval: null,
      pendingSelection: null,
      scrollOffset: 0,
      scrollLimit: 0,
      inputFocused: true,
      slashMenuOpen: false,
      terminalSize: { ...initialTerminalSize },

      showToolApproval: (approval) => {
        update({ pendingApproval: approval, inputFocused: false });
      },

      dismissToolApproval: () => {
        update({ pendingApproval: null, inputFocused: true });
      },

      showSelection: (selection) => {
        update({ pendingSelection: selection, inputFocused: false });
      },

      dismissSelection: () => {
        update({ pendingSelection: null, inputFocused: true });
      },

      setScrollOffset: (offset) => {
        update((state) => ({
          scrollOffset: Math.min(state.scrollLimit, normalizeScrollRows(offset)),
        }));
      },

      setScrollLimit: (limit) => {
        update((state) => {
          const scrollLimit = normalizeScrollRows(limit);
          if (scrollLimit === state.scrollLimit) return state;
          const growth = Math.max(0, scrollLimit - state.scrollLimit);
          return {
            scrollLimit,
            scrollOffset:
              state.scrollOffset === 0 ? 0 : Math.min(scrollLimit, state.scrollOffset + growth),
          };
        });
      },

      scrollUp: (lines = 3) => {
        update((state) => ({
          scrollOffset: Math.min(
            state.scrollLimit,
            state.scrollOffset + normalizeScrollRows(lines),
          ),
        }));
      },

      scrollDown: (lines = 3) => {
        update((state) => ({
          scrollOffset: Math.max(0, state.scrollOffset - normalizeScrollRows(lines)),
        }));
      },

      scrollToBottom: () => {
        update({ scrollOffset: 0 });
      },

      setInputFocused: (focused) => {
        update({ inputFocused: focused });
      },

      setSlashMenuOpen: (open) => {
        update({ slashMenuOpen: open });
      },

      setTerminalSize: (size) => {
        update({ terminalSize: { ...size } });
      },
    };
  };
}

function readProcessTerminalSize(): TerminalSize {
  return {
    rows: process.stdout.rows ?? 24,
    columns: process.stdout.columns ?? 80,
  };
}

function normalizeScrollRows(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('TUI scroll rows must be finite.');
  }
  return Math.max(0, Math.floor(value));
}
