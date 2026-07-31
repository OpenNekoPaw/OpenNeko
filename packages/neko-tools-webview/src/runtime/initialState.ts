import type { ImmutableInitialState, InitialState } from '../components/MediaDiff/types';
import type { IWebviewBridge } from './bridge';

declare global {
  interface Window {
    initialState?: ImmutableInitialState;
  }
}

export function getMediaDiffInitialState(bridge: IWebviewBridge): ImmutableInitialState {
  const persistedState = bridge.getState<Partial<InitialState>>();
  const injectedState = window.initialState;
  if (!injectedState) {
    throw new Error('Media diff initial state was not injected by the Desktop host.');
  }

  const state: InitialState = {
    ...persistedState,
    ...injectedState,
  };
  if (!state.sessionId || !state.fileUri || !state.fileName) {
    throw new Error('Media diff initial state is missing required identity or file fields.');
  }
  if (state.mediaType !== 'image' && state.mediaType !== 'audio' && state.mediaType !== 'video') {
    throw new Error(`Unsupported media diff initial type: ${String(state.mediaType)}`);
  }
  return Object.freeze(state);
}
