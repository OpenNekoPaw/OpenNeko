/**
 * useKeyboard Hook
 *
 * Global keyboard shortcut handling for the TUI.
 * Uses Ink's useInput hook internally.
 */

import { useInput } from 'ink';
import {
  useTuiAgentStore as useAgentStore,
  useTuiConversationStores,
  useTuiUIStore as useUIStore,
} from '../runtime/tui-runtime-context';
import type { ExecutionMode } from '../types/state';

const MODE_CYCLE: ExecutionMode[] = ['auto', 'plan', 'ask'];

export interface KeyboardActions {
  onCancel: () => void;
  onClear: () => void;
  onQuit: () => void;
  onModeChange?: (mode: ExecutionMode) => void;
}

/**
 * Register global keyboard shortcuts.
 *
 * - Escape: Cancel running agent
 * - Ctrl+L: Clear conversation
 * - Shift+Tab: Cycle execution mode (auto → plan → ask → auto)
 * - Ctrl+C: Quit (handled by Ink)
 */
export function useKeyboard(actions: KeyboardActions): void {
  const stores = useTuiConversationStores();
  const status = useAgentStore((s) => s.status);
  const pendingApproval = useUIStore((s) => s.pendingApproval);
  const pendingSelection = useUIStore((s) => s.pendingSelection);
  const terminalRows = useUIStore((s) => s.terminalSize.rows);
  const keyboardBlocked = Boolean(pendingApproval || pendingSelection);

  useInput((_input, key) => {
    // Modal surfaces own their keyboard input while active.
    if (keyboardBlocked) return;

    const pageRows = Math.max(3, terminalRows - 6);
    if (key.pageUp) {
      stores.ui.getState().scrollUp(pageRows);
      return;
    }
    if (key.pageDown) {
      stores.ui.getState().scrollDown(pageRows);
      return;
    }

    // Escape → cancel running agent
    if (key.escape && status === 'running') {
      actions.onCancel();
      return;
    }

    // Ctrl+L → clear conversation
    if (_input === 'l' && key.ctrl) {
      actions.onClear();
      return;
    }

    // Shift+Tab → cycle execution mode
    if (key.shift && key.tab) {
      const current = stores.agent.getState().executionMode;
      const idx = MODE_CYCLE.indexOf(current);
      const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!;
      stores.agent.getState().setExecutionMode(next);
      actions.onModeChange?.(next);
      return;
    }
  });
}
