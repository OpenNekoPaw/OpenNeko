import type { MediaType } from '@neko/shared';
import type { ImmutableInitialState, InitialState } from '../components/MediaDiff/types';
import type { IWebviewBridge } from './bridge';

const DEFAULT_INITIAL_STATE: ImmutableInitialState = Object.freeze({
  mediaType: 'image' as MediaType,
  fileName: '',
  isLocalComparison: false,
  fileUri: '',
});

declare global {
  interface Window {
    initialState?: ImmutableInitialState;
  }
}

export function getMediaDiffInitialState(bridge: IWebviewBridge): ImmutableInitialState {
  const persistedState = bridge.getState<Partial<InitialState>>();
  const injectedState = window.initialState;

  return Object.freeze({
    ...DEFAULT_INITIAL_STATE,
    ...persistedState,
    ...injectedState,
  });
}
