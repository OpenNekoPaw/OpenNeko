import { createContext, useContext, type ReactNode } from 'react';
import type { CanvasWebviewHostPort } from './canvas-webview-host';

const CanvasHostContext = createContext<CanvasWebviewHostPort | undefined>(undefined);

export function CanvasHostProvider({
  children,
  host,
}: {
  readonly children: ReactNode;
  readonly host: CanvasWebviewHostPort;
}) {
  return <CanvasHostContext.Provider value={host}>{children}</CanvasHostContext.Provider>;
}

export function useCanvasHost(): CanvasWebviewHostPort {
  const host = useContext(CanvasHostContext);
  if (!host) throw new Error('Canvas Host provider is missing.');
  return host;
}

export function useOptionalCanvasHost(): CanvasWebviewHostPort | undefined {
  return useContext(CanvasHostContext);
}
