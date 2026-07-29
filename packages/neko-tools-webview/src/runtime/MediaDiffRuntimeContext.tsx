import { createContext, useContext, type ReactNode } from 'react';
import type { ImmutableInitialState } from '../components/MediaDiff/types';
import type { IWebviewBridge } from './bridge';
import type { IAudioContextFactory } from './audioContextFactory';
import type { IBlobUrlRegistry } from './blobUrlRegistry';
import type { IRafScheduler } from './rafScheduler';
import type { IMediaDiffStreamClientFactory } from './streamClientFactory';

export interface IMediaDiffRuntime {
  bridge: IWebviewBridge;
  initialState: ImmutableInitialState;
  audioContextFactory: IAudioContextFactory;
  blobUrlRegistry: IBlobUrlRegistry;
  rafScheduler: IRafScheduler;
  streamClientFactory: IMediaDiffStreamClientFactory;
}

const MediaDiffRuntimeContext = createContext<IMediaDiffRuntime | null>(null);

interface MediaDiffRuntimeProviderProps {
  runtime: IMediaDiffRuntime;
  children: ReactNode;
}

export function MediaDiffRuntimeProvider({
  runtime,
  children,
}: MediaDiffRuntimeProviderProps): JSX.Element {
  return (
    <MediaDiffRuntimeContext.Provider value={runtime}>{children}</MediaDiffRuntimeContext.Provider>
  );
}

export function useMediaDiffRuntime(): IMediaDiffRuntime {
  const runtime = useContext(MediaDiffRuntimeContext);
  if (!runtime) {
    throw new Error('useMediaDiffRuntime must be used within a MediaDiffRuntimeProvider');
  }
  return runtime;
}
