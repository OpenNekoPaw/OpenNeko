import { createContext, useContext, type ReactNode } from 'react';
import type { IWebviewBridge } from './bridge';
import type { AssetDiffInitialState } from '../components/AssetDiff/types';

export interface IAssetDiffRuntime {
  bridge: IWebviewBridge;
  initialState: AssetDiffInitialState;
}

const AssetDiffRuntimeContext = createContext<IAssetDiffRuntime | null>(null);

interface AssetDiffRuntimeProviderProps {
  runtime: IAssetDiffRuntime;
  children: ReactNode;
}

export function AssetDiffRuntimeProvider({
  runtime,
  children,
}: AssetDiffRuntimeProviderProps): JSX.Element {
  return (
    <AssetDiffRuntimeContext.Provider value={runtime}>{children}</AssetDiffRuntimeContext.Provider>
  );
}

export function useAssetDiffRuntime(): IAssetDiffRuntime {
  const runtime = useContext(AssetDiffRuntimeContext);
  if (!runtime) {
    throw new Error('useAssetDiffRuntime must be used within an AssetDiffRuntimeProvider');
  }
  return runtime;
}
