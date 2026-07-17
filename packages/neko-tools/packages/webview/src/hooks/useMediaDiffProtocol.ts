/**
 * useMediaDiffProtocol — Core hook for Extension ↔ Webview IPC
 *
 * Responsibilities:
 * - Listen to Extension → Webview messages
 * - Convert ArrayBuffer → Blob URL for binary data
 * - Expose typed send* methods for Webview → Extension requests
 * - Clean up Blob URLs on unmount
 */

import { useState, useEffect, useCallback } from 'react';
import type { DiffResult, GitCommitInfo, StreamConfig, AudioStreamConfig } from '@neko/shared';
import { useMediaDiffRuntime } from '../runtime/MediaDiffRuntimeContext';
import type { ImmutableInitialState } from '../components/MediaDiff/types';

// =============================================================================
// State Interface
// =============================================================================

export interface MediaDiffProtocolState {
  diffResult: DiffResult | null;
  isLoading: boolean;
  progress: { progress: number; stage: string } | null;
  error: string | null;
  currentImageSrc: string | null;
  previousImageSrc: string | null;
  heatmapSrc: string | null;
  currentWaveform: number[];
  previousWaveform: number[];
  currentFrameSrc: string | null;
  previousFrameSrc: string | null;
  commits: GitCommitInfo[];
  elementThumbnails: Map<string, string>;
  initialState: ImmutableInitialState;
  /** Stream config from extension (set when streaming is active) */
  streamConfig: StreamConfig | null;
  /** Stream error message */
  streamError: string | null;
  /** Audio-only stream config from extension (set when audio streaming is active) */
  audioStreamConfig: AudioStreamConfig | null;
  /**
   * True while the extension is running `git show` to extract the previous
   * version to a temp file. Play button should be disabled during this time
   * to prevent a race condition where streaming starts before the file exists.
   */
  isFetchingPrevious: boolean;
}

type MediaDiffIncomingMessage =
  | {
      type: 'mediaDiff:progress';
      payload: { progress: number; stage: string };
    }
  | {
      type: 'mediaDiff:result';
      payload: DiffResult;
    }
  | {
      type: 'mediaDiff:error';
      error?: string;
    }
  | {
      type: 'mediaDiff:imageData';
      payload: {
        currentImage?: ArrayBuffer;
        previousImage?: ArrayBuffer;
        heatmap?: ArrayBuffer;
        mimeType?: string;
      };
    }
  | {
      type: 'mediaDiff:waveformData';
      payload: {
        currentWaveform?: number[];
        previousWaveform?: number[];
      };
    }
  | {
      type: 'mediaDiff:frameData';
      payload: {
        version: 'current' | 'previous';
        imageBuffer: ArrayBuffer;
      };
    }
  | {
      type: 'mediaDiff:fileHistory';
      payload: { commits?: GitCommitInfo[] };
    }
  | {
      type: 'mediaDiff:elementThumbnail';
      payload: {
        src: string;
        imageBuffer: ArrayBuffer;
      };
    }
  | {
      type: 'mediaDiff:fetchState';
      state?: 'fetching' | 'idle';
    }
  | {
      type: 'mediaDiff:streamConfig';
      payload: StreamConfig | null;
    }
  | {
      type: 'mediaDiff:audioStreamConfig';
      payload: AudioStreamConfig | null;
    }
  | {
      type: 'mediaDiff:streamError';
      error?: string;
    };

// =============================================================================
// Helpers
// =============================================================================

let requestCounter = 0;
function nextRequestId(): string {
  return `req-${Date.now()}-${++requestCounter}`;
}

function isMediaDiffIncomingMessage(message: unknown): message is MediaDiffIncomingMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type?: unknown }).type === 'string'
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useMediaDiffProtocol(): MediaDiffProtocolState & {
  sendInit: (ref?: string) => void;
  sendInitLocal: (currentUri: string, previousUri: string) => void;
  sendSeek: (time: number) => void;
  sendGetFrame: (time: number, version: 'current' | 'previous') => void;
  sendChangeRef: (ref: string) => void;
  sendCancel: () => void;
  sendGetFileHistory: (maxCount?: number) => void;
  sendInspectElement: (src: string) => void;
  sendStartStreaming: () => void;
  sendStopStreaming: () => void;
  sendStreamControl: (
    action: 'play' | 'pause' | 'seek',
    payload?: { time?: number; speed?: number },
  ) => void;
  sendStartAudioStreaming: () => void;
  sendStopAudioStreaming: () => void;
  sendAudioStreamControl: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
  sendSetTimeRange: (startTime?: number, endTime?: number) => void;
} {
  const { bridge, initialState, blobUrlRegistry } = useMediaDiffRuntime();
  const [state, setState] = useState<MediaDiffProtocolState>(() => ({
    diffResult: null,
    isLoading: false,
    progress: null,
    error: null,
    currentImageSrc: null,
    previousImageSrc: null,
    heatmapSrc: null,
    currentWaveform: [],
    previousWaveform: [],
    currentFrameSrc: null,
    previousFrameSrc: null,
    commits: [],
    elementThumbnails: new Map(),
    initialState,
    streamConfig: null,
    streamError: null,
    audioStreamConfig: null,
    isFetchingPrevious: false,
  }));

  const revokeBlobUrl = useCallback(
    (url: string | null) => {
      blobUrlRegistry.revokeObjectUrl(url);
    },
    [blobUrlRegistry],
  );

  const createBlobUrl = useCallback(
    (buffer: ArrayBuffer, mimeType: string) => blobUrlRegistry.createObjectUrl(buffer, mimeType),
    [blobUrlRegistry],
  );

  // =========================================================================
  // Message listener
  // =========================================================================

  useEffect(() => {
    const unsubscribe = bridge.subscribe((message) => {
      if (!isMediaDiffIncomingMessage(message)) {
        return;
      }

      const msg = message;

      switch (msg.type) {
        case 'mediaDiff:progress':
          setState((prev) => ({
            ...prev,
            // When a preliminary diffResult already exists (video/audio fast path),
            // keep current isLoading to avoid re-blocking the interactive UI.
            isLoading: prev.diffResult != null ? prev.isLoading : true,
            progress: msg.payload,
            error: null,
          }));
          break;

        case 'mediaDiff:result':
          setState((prev) => ({
            ...prev,
            diffResult: msg.payload,
            isLoading: false,
            progress: null,
          }));
          break;

        case 'mediaDiff:error':
          setState((prev) => ({
            ...prev,
            isLoading: false,
            progress: null,
            error: msg.error ?? 'Unknown error',
          }));
          break;

        case 'mediaDiff:imageData': {
          const { currentImage, previousImage, heatmap, mimeType } = msg.payload;
          setState((prev) => {
            // Revoke old URLs
            revokeBlobUrl(prev.currentImageSrc);
            revokeBlobUrl(prev.previousImageSrc);
            revokeBlobUrl(prev.heatmapSrc);

            const mime = mimeType ?? 'image/png';
            return {
              ...prev,
              currentImageSrc: currentImage ? createBlobUrl(currentImage, mime) : null,
              previousImageSrc: previousImage ? createBlobUrl(previousImage, mime) : null,
              heatmapSrc: heatmap ? createBlobUrl(heatmap, 'image/png') : null,
            };
          });
          break;
        }

        case 'mediaDiff:waveformData':
          setState((prev) => ({
            ...prev,
            currentWaveform: msg.payload.currentWaveform ?? [],
            previousWaveform: msg.payload.previousWaveform ?? [],
          }));
          break;

        case 'mediaDiff:frameData': {
          const { version, imageBuffer } = msg.payload;
          setState((prev) => {
            const key = version === 'current' ? 'currentFrameSrc' : 'previousFrameSrc';
            revokeBlobUrl(prev[key]);
            return {
              ...prev,
              [key]: createBlobUrl(imageBuffer, 'image/jpeg'),
            };
          });
          break;
        }

        case 'mediaDiff:fileHistory':
          setState((prev) => ({
            ...prev,
            commits: msg.payload.commits ?? [],
          }));
          break;

        case 'mediaDiff:elementThumbnail': {
          const { src, imageBuffer } = msg.payload;
          setState((prev) => {
            const next = new Map(prev.elementThumbnails);
            const oldUrl = next.get(src);
            if (oldUrl) revokeBlobUrl(oldUrl);
            next.set(src, createBlobUrl(imageBuffer, 'image/jpeg'));
            return { ...prev, elementThumbnails: next };
          });
          break;
        }

        // ── Fetch state (git show progress) ─────────────────────────
        case 'mediaDiff:fetchState':
          setState((prev) => ({
            ...prev,
            isFetchingPrevious: msg.state === 'fetching',
          }));
          break;

        // ── Streaming responses ──────────────────────────────────────
        case 'mediaDiff:streamConfig':
          setState((prev) => ({
            ...prev,
            streamConfig: msg.payload,
            streamError: null,
          }));
          break;

        case 'mediaDiff:audioStreamConfig':
          setState((prev) => ({
            ...prev,
            audioStreamConfig: msg.payload,
            streamError: null,
          }));
          break;

        case 'mediaDiff:streamError':
          setState((prev) => ({
            ...prev,
            streamError: msg.error ?? 'Stream error',
          }));
          break;
      }
    });

    return unsubscribe;
  }, [bridge, createBlobUrl, revokeBlobUrl]);

  // Cleanup all Blob URLs on unmount
  useEffect(() => {
    return () => blobUrlRegistry.revokeAll();
  }, [blobUrlRegistry]);

  // =========================================================================
  // Send methods (Webview → Extension)
  // =========================================================================

  const sendInit = useCallback(
    (ref?: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      bridge.postMessage({
        type: 'mediaDiff:init',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { fileUri: initialState.fileUri, ref },
      });
    },
    [bridge, initialState.fileUri],
  );

  const sendInitLocal = useCallback(
    (currentUri: string, previousUri: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      bridge.postMessage({
        type: 'mediaDiff:initLocal',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { currentUri, previousUri },
      });
    },
    [bridge],
  );

  const sendSeek = useCallback(
    (time: number) => {
      bridge.postMessage({
        type: 'mediaDiff:seek',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { time },
      });
    },
    [bridge],
  );

  const sendGetFrame = useCallback(
    (time: number, version: 'current' | 'previous') => {
      bridge.postMessage({
        type: 'mediaDiff:getFrame',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { time, version },
      });
    },
    [bridge],
  );

  const sendChangeRef = useCallback(
    (ref: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      bridge.postMessage({
        type: 'mediaDiff:changeRef',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { ref },
      });
    },
    [bridge],
  );

  const sendCancel = useCallback(() => {
    bridge.postMessage({
      type: 'mediaDiff:cancel',
      requestId: nextRequestId(),
      timestamp: Date.now(),
    });
    setState((prev) => ({ ...prev, isLoading: false, progress: null }));
  }, [bridge]);

  const sendGetFileHistory = useCallback(
    (maxCount?: number) => {
      bridge.postMessage({
        type: 'mediaDiff:getFileHistory',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { maxCount },
      });
    },
    [bridge],
  );

  const sendInspectElement = useCallback(
    (src: string) => {
      bridge.postMessage({
        type: 'mediaDiff:inspectElement',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { src },
      });
    },
    [bridge],
  );

  const sendStartStreaming = useCallback(() => {
    bridge.postMessage({
      type: 'mediaDiff:startStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, [bridge]);

  const sendStopStreaming = useCallback(() => {
    setState((prev) => ({ ...prev, streamConfig: null, streamError: null }));
    bridge.postMessage({
      type: 'mediaDiff:stopStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, [bridge]);

  const sendStreamControl = useCallback(
    (action: 'play' | 'pause' | 'seek', payload?: { time?: number; speed?: number }) => {
      bridge.postMessage({
        type: 'mediaDiff:streamControl',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { action, ...payload },
      });
    },
    [bridge],
  );

  const sendStartAudioStreaming = useCallback(() => {
    bridge.postMessage({
      type: 'mediaDiff:startAudioStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, [bridge]);

  const sendStopAudioStreaming = useCallback(() => {
    setState((prev) => ({ ...prev, audioStreamConfig: null, streamError: null }));
    bridge.postMessage({
      type: 'mediaDiff:stopAudioStreaming',
      requestId: nextRequestId(),
      timestamp: Date.now(),
      payload: {},
    });
  }, [bridge]);

  const sendAudioStreamControl = useCallback(
    (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => {
      bridge.postMessage({
        type: 'mediaDiff:audioStreamControl',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { action, ...payload },
      });
    },
    [bridge],
  );

  const sendSetTimeRange = useCallback(
    (startTime?: number, endTime?: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      bridge.postMessage({
        type: 'mediaDiff:setTimeRange',
        requestId: nextRequestId(),
        timestamp: Date.now(),
        payload: { startTime, endTime },
      });
    },
    [bridge],
  );

  return {
    ...state,
    sendInit,
    sendInitLocal,
    sendSeek,
    sendGetFrame,
    sendChangeRef,
    sendCancel,
    sendGetFileHistory,
    sendInspectElement,
    sendStartStreaming,
    sendStopStreaming,
    sendStreamControl,
    sendStartAudioStreaming,
    sendStopAudioStreaming,
    sendAudioStreamControl,
    sendSetTimeRange,
  };
}
