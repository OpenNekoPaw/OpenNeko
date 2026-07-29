import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { CutWebviewIntent } from './CutOtioController';

export interface CutWebviewHostBridge {
  postIntent(intent: CutWebviewIntent): void;
  subscribe(listener: (message: unknown) => void): () => void;
}

const CutWebviewHostBridgeContext = createContext<CutWebviewHostBridge | undefined>(undefined);

export function CutWebviewHostBridgeProvider({
  children,
  bridge,
}: PropsWithChildren<{ readonly bridge: CutWebviewHostBridge }>): ReactElement {
  return (
    <CutWebviewHostBridgeContext.Provider value={bridge}>
      {children}
    </CutWebviewHostBridgeContext.Provider>
  );
}

export function useCutWebviewHostBridge(): CutWebviewHostBridge {
  const bridge = useContext(CutWebviewHostBridgeContext);
  if (!bridge) throw new Error('CutWebviewHostBridgeProvider is missing.');
  return bridge;
}
