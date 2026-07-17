import type { IWebviewBridge } from './bridge';
import type { AssetDiffInitialState } from '../components/AssetDiff/types';

const DEFAULT_INITIAL_STATE: AssetDiffInitialState = {
  entity: {
    id: '',
    name: '',
    category: '',
  },
  variantA: {
    id: '',
    name: '',
    attributes: {},
    fileCount: 0,
    fileName: null,
    filePath: null,
  },
  variantB: {
    id: '',
    name: '',
    attributes: {},
    fileCount: 0,
    fileName: null,
    filePath: null,
  },
  imageUriA: null,
  imageUriB: null,
};

declare global {
  interface Window {
    assetDiffInitialState?: AssetDiffInitialState;
  }
}

export function getAssetDiffInitialState(bridge: IWebviewBridge): AssetDiffInitialState {
  const persistedState = bridge.getState<Partial<AssetDiffInitialState>>();
  const injectedState = window.assetDiffInitialState;

  return {
    ...DEFAULT_INITIAL_STATE,
    ...persistedState,
    ...injectedState,
  };
}
