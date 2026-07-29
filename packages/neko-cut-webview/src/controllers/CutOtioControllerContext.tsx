import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { useCutPresentationStoreApi } from '../stores/cut-presentation-store';
import { postMessage } from '../utils/vscodeApi';
import { CutOtioController } from './CutOtioController';

const CutOtioControllerContext = createContext<CutOtioController | undefined>(undefined);

export function CutOtioControllerProvider({ children }: PropsWithChildren): ReactElement {
  const store = useCutPresentationStoreApi();
  const controller = useMemo(() => new CutOtioController(store, { postMessage }), [store]);
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
