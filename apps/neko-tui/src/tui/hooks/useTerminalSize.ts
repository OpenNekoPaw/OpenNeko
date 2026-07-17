/**
 * useTerminalSize Hook
 *
 * Tracks terminal dimensions and updates the UI store
 * when the terminal is resized.
 */

import { useEffect } from 'react';
import { useTuiConversationStores } from '../runtime/tui-runtime-context';

/**
 * Listen for terminal resize events and keep UI store in sync.
 */
export function useTerminalSize(): void {
  const stores = useTuiConversationStores();
  useEffect(() => {
    function handleResize() {
      stores.ui.getState().setTerminalSize({
        rows: process.stdout.rows ?? 24,
        columns: process.stdout.columns ?? 80,
      });
    }

    process.stdout.on('resize', handleResize);
    // Set initial size
    handleResize();

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, [stores]);
}
