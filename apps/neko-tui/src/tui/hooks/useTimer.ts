/**
 * useTimer Hook
 *
 * Tracks elapsed time while the agent is running.
 * Updates every second for the status bar display.
 */

import { useState, useEffect, useRef } from 'react';
import { useTuiAgentStore as useAgentStore } from '../runtime/tui-runtime-context';

/**
 * Returns elapsed seconds since agent started running.
 * Returns 0 when agent is idle.
 */
export function useTimer(): number {
  const [elapsed, setElapsed] = useState(0);
  const status = useAgentStore((s) => s.status);
  const startTime = useAgentStore((s) => s.startTime);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'running' && startTime !== null) {
      // Update immediately
      setElapsed(Math.floor((Date.now() - startTime) / 1000));

      // Then every second
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (startTime === null) {
        setElapsed(0);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status, startTime]);

  return elapsed;
}
