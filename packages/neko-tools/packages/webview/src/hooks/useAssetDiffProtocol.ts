import { useCallback, useEffect, useState } from 'react';
import { useAssetDiffRuntime } from '../runtime/AssetDiffRuntimeContext';
import type {
  AssetDiffAttributeDiff,
  AssetDiffInitialState,
  AssetDiffResultPayload,
} from '../components/AssetDiff/types';

interface AssetDiffIncomingMessageMap {
  'assetDiff:result': AssetDiffResultPayload;
  'assetDiff:attributeDiffs': AssetDiffAttributeDiff[];
  'assetDiff:aiSummary': string;
  'assetDiff:aiLoading': boolean;
  'assetDiff:error': { error?: string };
}

type AssetDiffIncomingMessage = {
  [K in keyof AssetDiffIncomingMessageMap]: {
    type: K;
    payload?: AssetDiffIncomingMessageMap[K];
    error?: string;
  };
}[keyof AssetDiffIncomingMessageMap];

export interface AssetDiffProtocolState {
  initialState: AssetDiffInitialState;
  similarity: number | null;
  attributeDiffs: AssetDiffAttributeDiff[];
  aiSummary: string | null;
  aiLoading: boolean;
  isLoading: boolean;
  error: string | null;
}

let requestCounter = 0;
function nextRequestId(): string {
  return `asset-diff-${Date.now()}-${++requestCounter}`;
}

function isAssetDiffIncomingMessage(message: unknown): message is AssetDiffIncomingMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type?: unknown }).type === 'string'
  );
}

export function useAssetDiffProtocol(): AssetDiffProtocolState & {
  sendInit: () => void;
  sendRequestAi: () => void;
} {
  const { bridge, initialState } = useAssetDiffRuntime();
  const [state, setState] = useState<AssetDiffProtocolState>({
    initialState,
    similarity: null,
    attributeDiffs: [],
    aiSummary: null,
    aiLoading: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = bridge.subscribe((message) => {
      if (!isAssetDiffIncomingMessage(message)) {
        return;
      }

      switch (message.type) {
        case 'assetDiff:result':
          setState((prev) => ({
            ...prev,
            similarity: message.payload?.similarity ?? prev.similarity,
            attributeDiffs: message.payload?.attributeDiffs ?? prev.attributeDiffs,
            isLoading: false,
            error: null,
          }));
          break;
        case 'assetDiff:attributeDiffs':
          setState((prev) => ({
            ...prev,
            attributeDiffs: message.payload ?? [],
          }));
          break;
        case 'assetDiff:aiSummary':
          setState((prev) => ({
            ...prev,
            aiSummary: message.payload ?? null,
            aiLoading: false,
          }));
          break;
        case 'assetDiff:aiLoading':
          setState((prev) => ({
            ...prev,
            aiLoading: message.payload ?? false,
          }));
          break;
        case 'assetDiff:error':
          setState((prev) => ({
            ...prev,
            isLoading: false,
            aiLoading: false,
            error: message.error ?? 'Unknown error',
          }));
          break;
      }
    });

    return unsubscribe;
  }, [bridge]);

  const sendInit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));
    bridge.postMessage({
      type: 'assetDiff:init',
      requestId: nextRequestId(),
      timestamp: Date.now(),
    });
  }, [bridge]);

  const sendRequestAi = useCallback(() => {
    setState((prev) => ({
      ...prev,
      aiLoading: true,
      error: null,
    }));
    bridge.postMessage({
      type: 'assetDiff:requestAI',
      requestId: nextRequestId(),
      timestamp: Date.now(),
    });
  }, [bridge]);

  return {
    ...state,
    sendInit,
    sendRequestAi,
  };
}
