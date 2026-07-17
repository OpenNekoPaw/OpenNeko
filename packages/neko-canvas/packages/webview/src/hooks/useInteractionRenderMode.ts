import { useEffect, useState } from 'react';

export type NodeInteractionRenderMode = 'full' | 'shell';

export interface UseInteractionRenderModeOptions {
  readonly requestedMode?: NodeInteractionRenderMode;
  readonly maxShellDurationMs?: number;
}

export function useInteractionRenderMode({
  requestedMode = 'full',
  maxShellDurationMs = 2000,
}: UseInteractionRenderModeOptions): NodeInteractionRenderMode {
  const [mode, setMode] = useState<NodeInteractionRenderMode>(requestedMode);

  useEffect(() => {
    setMode(requestedMode);
    if (requestedMode !== 'shell') return;

    const timeout = window.setTimeout(() => setMode('full'), maxShellDurationMs);
    return () => window.clearTimeout(timeout);
  }, [maxShellDurationMs, requestedMode]);

  return mode;
}
