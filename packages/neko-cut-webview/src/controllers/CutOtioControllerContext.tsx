import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { useCutPresentationStoreApi } from '../stores/cut-presentation-store';
import { CutOtioController } from './CutOtioController';
import { useCutWebviewHostBridge } from './CutWebviewHostBridgeContext';

const CutOtioControllerContext = createContext<CutOtioController | undefined>(undefined);

export function CutOtioControllerProvider({ children }: PropsWithChildren): ReactElement {
  const store = useCutPresentationStoreApi();
  const hostBridge = useCutWebviewHostBridge();
  const controller = useMemo(
    () => new CutOtioController(store, { postMessage: hostBridge.postIntent }),
    [hostBridge, store],
  );
  return (
    <CutOtioControllerContext.Provider value={controller}>
      {children}
    </CutOtioControllerContext.Provider>
  );
}

export function useCutOtioController(): CutOtioController {
  const controller = useContext(CutOtioControllerContext);
  if (!controller) throw new Error('CutOtioControllerProvider is missing.');
  return controller;
}
