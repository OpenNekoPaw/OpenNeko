import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MEDIA_DIFF_SCHEMA_VERSION,
  parseMediaDiffResponse,
  type AudioStreamConfig,
  type DiffResult,
  type GitCommitInfo,
  type MediaDiffRequest,
  type StreamConfig,
} from '@neko-tools/contracts';
import { useMediaDiffRuntime } from '../runtime/MediaDiffRuntimeContext';
import type { ImmutableInitialState } from '../components/MediaDiff/types';

export interface MediaDiffProtocolState {
  diffResult: DiffResult | null;
  isLoading: boolean;
  progress: { progress: number; stage: string } | null;
  error: string | null;
  currentImageSrc: string | null;
  previousImageSrc: string | null;
  currentWaveform: readonly number[];
  previousWaveform: readonly number[];
  currentFrameSrc: string | null;
  previousFrameSrc: string | null;
  commits: readonly GitCommitInfo[];
  initialState: ImmutableInitialState;
  streamConfig: StreamConfig | null;
  streamError: string | null;
  audioStreamConfig: AudioStreamConfig | null;
  isFetchingPrevious: boolean;
}

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `request-${Date.now()}-${requestCounter}`;
}

export function useMediaDiffProtocol(): MediaDiffProtocolState & {
  sendInit: (ref?: string) => void;
  sendInitLocal: (currentUri: string, previousUri: string) => void;
  sendSeek: (time: number) => void;
  sendGetFrame: (time: number, version: 'current' | 'previous') => void;
  sendChangeRef: (ref: string) => void;
  sendCancel: () => void;
  sendGetFileHistory: (maxCount?: number) => void;
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
  const requestLanes = useRef(new Map<string, string>());
  const latestRequestByLane = useRef(new Map<string, string>());
  const [state, setState] = useState<MediaDiffProtocolState>(() => ({
    diffResult: null,
    isLoading: false,
    progress: null,
    error: null,
    currentImageSrc: null,
    previousImageSrc: null,
    currentWaveform: [],
    previousWaveform: [],
    currentFrameSrc: null,
    previousFrameSrc: null,
    commits: [],
    initialState,
    streamConfig: null,
    streamError: null,
    audioStreamConfig: null,
    isFetchingPrevious: false,
  }));

  const revokeBlobUrl = useCallback(
    (url: string | null) => blobUrlRegistry.revokeObjectUrl(url),
    [blobUrlRegistry],
  );
  const createBlobUrl = useCallback(
    (buffer: ArrayBuffer, mimeType: string) => blobUrlRegistry.createObjectUrl(buffer, mimeType),
    [blobUrlRegistry],
  );

  const postRequest = useCallback(
    (request: MediaDiffRequest) => {
      const lane = getRequestLane(request);
      const supersededRequestId = latestRequestByLane.current.get(lane);
      if (supersededRequestId) requestLanes.current.delete(supersededRequestId);
      requestLanes.current.set(request.requestId, lane);
      latestRequestByLane.current.set(lane, request.requestId);
      bridge.postMessage(request);
    },
    [bridge],
  );

  useEffect(() => {
    return bridge.subscribe((message) => {
      try {
        const response = parseMediaDiffResponse(message, initialState.sessionId);
        const lane = requestLanes.current.get(response.requestId);
        if (!lane || latestRequestByLane.current.get(lane) !== response.requestId) {
          throw new Error(`Stale media diff response: ${response.requestId}`);
        }

        switch (response.type) {
          case 'mediaDiff:progress':
            setState((previous) => ({
              ...previous,
              isLoading: true,
              progress: response.payload,
              error: null,
            }));
            break;
          case 'mediaDiff:result':
            setState((previous) => ({
              ...previous,
              diffResult: response.payload,
              isLoading: false,
              progress: null,
            }));
            break;
          case 'mediaDiff:error':
            setState((previous) => ({
              ...previous,
              isLoading: false,
              progress: null,
              error: response.error,
            }));
            break;
          case 'mediaDiff:cancelled':
            setState((previous) => ({
              ...previous,
              isLoading: false,
              progress: null,
            }));
            break;
          case 'mediaDiff:imageData':
            setState((previous) => {
              revokeBlobUrl(previous.currentImageSrc);
              revokeBlobUrl(previous.previousImageSrc);
              return {
                ...previous,
                currentImageSrc: createBlobUrl(
                  response.payload.currentImage,
                  response.payload.mimeType,
                ),
                previousImageSrc: response.payload.previousImage
                  ? createBlobUrl(response.payload.previousImage, response.payload.mimeType)
                  : null,
              };
            });
            break;
          case 'mediaDiff:waveformData':
            setState((previous) => ({
              ...previous,
              currentWaveform: response.payload.currentWaveform,
              previousWaveform: response.payload.previousWaveform,
            }));
            break;
          case 'mediaDiff:frameData':
            setState((previous) => {
              const key =
                response.payload.version === 'current' ? 'currentFrameSrc' : 'previousFrameSrc';
              revokeBlobUrl(previous[key]);
              return {
                ...previous,
                [key]: createBlobUrl(response.payload.imageBuffer, 'image/jpeg'),
              };
            });
            break;
          case 'mediaDiff:fileHistory':
            setState((previous) => ({ ...previous, commits: response.payload.commits }));
            break;
          case 'mediaDiff:fetchState':
            setState((previous) => ({
              ...previous,
              isFetchingPrevious: response.state === 'fetching',
            }));
            break;
          case 'mediaDiff:streamConfig':
            setState((previous) => ({
              ...previous,
              streamConfig: response.payload,
              streamError: null,
            }));
            break;
          case 'mediaDiff:audioStreamConfig':
            setState((previous) => ({
              ...previous,
              audioStreamConfig: response.payload,
              streamError: null,
            }));
            break;
          case 'mediaDiff:streamError':
            setState((previous) => ({ ...previous, streamError: response.error }));
            break;
        }
      } catch (error) {
        setState((previous) => ({
          ...previous,
          isLoading: false,
          progress: null,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  }, [bridge, createBlobUrl, initialState.sessionId, revokeBlobUrl]);

  useEffect(() => () => blobUrlRegistry.revokeAll(), [blobUrlRegistry]);

  const createRequestIdentity = useCallback(
    () => ({
      schemaVersion: MEDIA_DIFF_SCHEMA_VERSION,
      sessionId: initialState.sessionId,
      requestId: nextRequestId(),
      timestamp: Date.now(),
    }),
    [initialState.sessionId],
  );

  const sendInit = useCallback(
    (ref?: string) => {
      setState((previous) => ({ ...previous, isLoading: true, error: null }));
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:init',
        payload: { ref },
      });
    },
    [createRequestIdentity, postRequest],
  );

  const sendInitLocal = useCallback(
    (_currentUri: string, _previousUri: string) => {
      setState((previous) => ({ ...previous, isLoading: true, error: null }));
      postRequest({ ...createRequestIdentity(), type: 'mediaDiff:initLocal', payload: {} });
    },
    [createRequestIdentity, postRequest],
  );

  const sendSeek = useCallback(
    (time: number) =>
      postRequest({ ...createRequestIdentity(), type: 'mediaDiff:seek', payload: { time } }),
    [createRequestIdentity, postRequest],
  );
  const sendGetFrame = useCallback(
    (time: number, version: 'current' | 'previous') =>
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:getFrame',
        payload: { time, version },
      }),
    [createRequestIdentity, postRequest],
  );
  const sendChangeRef = useCallback(
    (ref: string) => {
      setState((previous) => ({ ...previous, isLoading: true, error: null }));
      postRequest({ ...createRequestIdentity(), type: 'mediaDiff:changeRef', payload: { ref } });
    },
    [createRequestIdentity, postRequest],
  );
  const sendCancel = useCallback(() => {
    postRequest({ ...createRequestIdentity(), type: 'mediaDiff:cancel' });
  }, [createRequestIdentity, postRequest]);
  const sendGetFileHistory = useCallback(
    (maxCount?: number) =>
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:getFileHistory',
        payload: { maxCount },
      }),
    [createRequestIdentity, postRequest],
  );
  const sendStartStreaming = useCallback(
    () =>
      postRequest({ ...createRequestIdentity(), type: 'mediaDiff:startStreaming', payload: {} }),
    [createRequestIdentity, postRequest],
  );
  const sendStopStreaming = useCallback(() => {
    setState((previous) => ({ ...previous, streamConfig: null, streamError: null }));
    postRequest({ ...createRequestIdentity(), type: 'mediaDiff:stopStreaming', payload: {} });
  }, [createRequestIdentity, postRequest]);
  const sendStreamControl = useCallback(
    (
      action: 'play' | 'pause' | 'seek',
      payload?: { readonly time?: number; readonly speed?: number },
    ) =>
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:streamControl',
        payload: { action, ...payload },
      }),
    [createRequestIdentity, postRequest],
  );
  const sendStartAudioStreaming = useCallback(
    () =>
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:startAudioStreaming',
        payload: {},
      }),
    [createRequestIdentity, postRequest],
  );
  const sendStopAudioStreaming = useCallback(() => {
    setState((previous) => ({ ...previous, audioStreamConfig: null, streamError: null }));
    postRequest({
      ...createRequestIdentity(),
      type: 'mediaDiff:stopAudioStreaming',
      payload: {},
    });
  }, [createRequestIdentity, postRequest]);
  const sendAudioStreamControl = useCallback(
    (action: 'play' | 'pause' | 'seek', payload?: { readonly time?: number }) =>
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:audioStreamControl',
        payload: { action, ...payload },
      }),
    [createRequestIdentity, postRequest],
  );
  const sendSetTimeRange = useCallback(
    (startTime?: number, endTime?: number) => {
      setState((previous) => ({ ...previous, isLoading: true, error: null }));
      postRequest({
        ...createRequestIdentity(),
        type: 'mediaDiff:setTimeRange',
        payload: { startTime, endTime },
      });
    },
    [createRequestIdentity, postRequest],
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
    sendStartStreaming,
    sendStopStreaming,
    sendStreamControl,
    sendStartAudioStreaming,
    sendStopAudioStreaming,
    sendAudioStreamControl,
    sendSetTimeRange,
  };
}

function getRequestLane(request: MediaDiffRequest): string {
  switch (request.type) {
    case 'mediaDiff:init':
    case 'mediaDiff:initLocal':
    case 'mediaDiff:changeRef':
    case 'mediaDiff:setTimeRange':
      return 'analysis';
    case 'mediaDiff:seek':
      return 'seek';
    case 'mediaDiff:getFrame':
      return `frame:${request.payload.version}`;
    case 'mediaDiff:startStreaming':
    case 'mediaDiff:stopStreaming':
    case 'mediaDiff:streamControl':
      return 'video-stream';
    case 'mediaDiff:startAudioStreaming':
    case 'mediaDiff:stopAudioStreaming':
    case 'mediaDiff:audioStreamControl':
      return 'audio-stream';
    case 'mediaDiff:getFileHistory':
      return 'history';
    case 'mediaDiff:cancel':
      return 'cancel';
  }
}
