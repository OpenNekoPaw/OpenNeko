import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import type {
  CutCommand,
  CutExportTaskSnapshot,
  CutHtmlVideoDescriptor,
  CutPcmStreamDescriptor,
  TimelineClipView,
  TimelineView,
} from '@neko/cut-domain';
import { isCutUserDiagnostic } from '@neko/cut-domain';
import { usePersistedResize, useResizable } from '@neko/ui/hooks';
import { useFocusedWebviewRoot } from '@neko/ui/keyboard';
import { ResizeHandle } from '@neko/ui/primitives';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { PropertyPanelInline } from './components/PropertyPanel/PropertyPanelInline';
import { PreviewControls } from './components/PreviewControls';
import { PreviewPanel } from './components/PreviewPanel';
import { Timeline } from './components/Timeline';
import { clampTimelineTime, timelineInsertionTime } from './components/Timeline/timelineMath';
import { collectIndependentClipIds } from './components/Timeline/timelineSelection';
import { useToast } from './components/Toast';
import { translateCutDiagnostic } from './i18n/cutDiagnostics';
import { useTranslation } from './i18n/I18nContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  advancePreviewPlayback,
  applyPreviewPlaybackAdvance,
  finishPreviewPlaybackSegment,
  previewPreparationLeadSeconds,
  shouldAcceptPreviewReady,
  type PreviewPlaybackAdvance,
  type PreviewPlaybackSegment,
} from './previewPlayback';
import { PreviewAudioContextOwner, previewAudioStartTime } from './previewAudioContext';
import {
  PreviewFailureGate,
  previewFailureDiagnostic,
  type PreviewFailureStage,
} from './previewFailureGate';
import {
  HtmlVideoClient as CutHtmlVideoClient,
  PcmAudioClient as CutPcmAudioClient,
} from '@neko/media/browser';
import { CutPreviewClock } from './media/CutPreviewClock';
import type { CutPreviewAudioPlayback } from './controllers/CutOtioController';
import { useCutOtioController } from './controllers/CutOtioControllerContext';
import { useCutWebviewHostBridge } from './controllers/CutWebviewHostBridgeContext';
import {
  useCutPresentationStore,
  useCutPresentationStoreApi,
} from './stores/cut-presentation-store';

type PreviewVideoSlot = 0 | 1;

interface PreparedVideoClient {
  readonly client: CutHtmlVideoClient;
  readonly slot: PreviewVideoSlot;
}

interface PendingVideoPromotion {
  readonly previewRequestId: string;
  readonly client?: CutHtmlVideoClient;
  readonly slot?: PreviewVideoSlot;
  readonly previous?: CutHtmlVideoClient;
  readonly videoClipId?: string;
  readonly timelineOriginSeconds?: number;
  readonly playbackRate: number;
  readonly retained: boolean;
}

export interface CutAppProps {
  readonly presentation?: 'editor' | 'timeline-only';
  readonly timelineTarget?: Element;
}

function App({ presentation = 'editor', timelineTarget }: CutAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const [activeVideoSlot, setActiveVideoSlot] = useState<PreviewVideoSlot>(0);
  const activeVideoSlotRef = useRef<PreviewVideoSlot>(0);
  const previewVideoClientRef = useRef<CutHtmlVideoClient>();
  const pendingVideoPromotionRef = useRef<PendingVideoPromotion>();
  const preparedVideoRequestIdRef = useRef<{
    readonly previewRequestId: string;
    readonly client: Promise<PreparedVideoClient | undefined>;
  }>();
  const activeVideoClipIdRef = useRef<string>();
  const activeVideoTimelineOriginRef = useRef<number>();
  const activeVideoPlaybackRateRef = useRef(1);
  const previewAudioContextOwnerRef = useRef<PreviewAudioContextOwner>();
  const previewAudioClientsRef = useRef<readonly CutPcmAudioClient[]>([]);
  const retiringAudioClientsRef = useRef<readonly CutPcmAudioClient[]>([]);
  const preparedAudioRequestIdRef = useRef<{
    readonly previewRequestId: string;
    readonly clients: Promise<readonly CutPcmAudioClient[]>;
  }>();
  const previewClockRef = useRef<CutPreviewClock>();
  const audioGainMultipliersRef = useRef<readonly number[]>([]);
  const connectedPreviewRequestIdRef = useRef<string>();
  const requestedPreviewRequestIdRef = useRef<string>();
  const requestedPreviewModeRef = useRef<'playing' | 'paused'>();
  const preparingPreviewRequestIdRef = useRef<string>();
  const preparedPreviewRef = useRef<PreviewStreamMessage>();
  const activatingPreviewRequestIdRef = useRef<string>();
  const activePreviewHostRequestIdRef = useRef<string>();
  const waitingPreviewBoundaryRef = useRef<number>();
  const playbackSegmentRef = useRef<PreviewPlaybackSegment>();
  const mediaPlaybackEndRef = useRef<(previewRequestId: string) => void>();
  const previewAttemptRef = useRef<number>();
  const previewFailureGateRef = useRef<PreviewFailureGate>();
  const volumeRef = useRef(1);
  const { isKeyboardFocused } = useFocusedWebviewRoot(rootRef);
  const { t } = useTranslation();
  const store = useCutPresentationStoreApi();
  const view = useCutPresentationStore((state) => state.view);
  const selection = useCutPresentationStore((state) => state.selection);
  const selectedClips = useCutPresentationStore((state) => state.selectedClips);
  const clipboard = useCutPresentationStore((state) => state.clipboard);
  const playheadSeconds = useCutPresentationStore((state) => state.playheadSeconds);
  const placementMode = useCutPresentationStore((state) => state.placementMode);
  const playing = useCutPresentationStore((state) => state.isPlaying);
  const previewVolume = useCutPresentationStore((state) => state.previewVolume);
  const previewMuted = useCutPresentationStore((state) => state.previewMuted);
  const volume = previewMuted ? 0 : previewVolume;
  const pixelsPerSecond = useCutPresentationStore((state) => state.pixelsPerSecond);
  const snappingEnabled = useCutPresentationStore((state) => state.snappingEnabled);
  const overviewVisible = useCutPresentationStore((state) => state.overviewVisible);
  const diagnostic = useCutPresentationStore((state) => state.diagnostic);
  const presentationActions = useCutPresentationStore((state) => state.actions);
  const selectedClipId = selection?.kind === 'clip' ? selection.clipId : undefined;
  const selectedGap =
    selection?.kind === 'gap'
      ? { trackId: selection.trackId, itemIndex: selection.itemIndex }
      : undefined;
  const { showToast } = useToast();
  const controller = useCutOtioController();
  const hostBridge = useCutWebviewHostBridge();
  previewAudioContextOwnerRef.current ??= new PreviewAudioContextOwner();
  previewFailureGateRef.current ??= new PreviewFailureGate();
  const previewAudioContextOwner = previewAudioContextOwnerRef.current;
  const previewFailureGate = previewFailureGateRef.current;
  const previewSplit = usePersistedResize('cut.previewTimelineSplit', 0.5, {
    minSize: 0.2,
    maxSize: 0.8,
  });
  const inspectorLayout = usePersistedResize('cut.inspector', 280, { minSize: 220, maxSize: 420 });
  const previewResize = useResizable<HTMLDivElement>({
    edge: 'top',
    mode: 'ratio',
    size: previewSplit.size,
    minSize: 0.2,
    maxSize: 0.8,
    onSizeChange: previewSplit.setSize,
  });
  const inspectorResize = useResizable<HTMLElement>({
    edge: 'right',
    mode: 'pixel',
    size: inspectorLayout.size,
    minSize: 220,
    maxSize: 420,
    disabled: inspectorLayout.collapsed,
    onSizeChange: inspectorLayout.setSize,
  });

  useEffect(() => {
    if (!diagnostic) return;
    showToast(translateCutDiagnostic(t, diagnostic), 'error');
    presentationActions.clearDiagnostic();
  }, [diagnostic, presentationActions, showToast, t]);

  useEffect(() => {
    if (!view) return;
    controller.updatePresentation({
      previewVolume,
      previewMuted,
      pixelsPerSecond,
      snappingEnabled,
      overviewVisible,
    });
  }, [
    controller,
    overviewVisible,
    pixelsPerSecond,
    previewMuted,
    previewVolume,
    snappingEnabled,
    view,
  ]);

  const reportPreviewFailure = useCallback(
    (attempt: number, stage: PreviewFailureStage): void => {
      if (!previewFailureGate.accept(attempt)) return;
      presentationActions.setPlaying(false);
      presentationActions.reportDiagnostic(previewFailureDiagnostic(stage));
    },
    [presentationActions, previewFailureGate],
  );

  const preparePreviewVideoClient = useCallback(
    async (
      message: PreviewStreamMessage,
      attempt: number,
    ): Promise<PreparedVideoClient | undefined> => {
      if (!message.video) return undefined;
      const slot: PreviewVideoSlot = previewVideoClientRef.current
        ? activeVideoSlotRef.current === 0
          ? 1
          : 0
        : activeVideoSlotRef.current;
      const videoElement = slot === 0 ? previewVideoRef.current : secondaryPreviewVideoRef.current;
      if (!videoElement) throw new Error('Cut preview video element is unavailable.');
      const client = new CutHtmlVideoClient({
        video: videoElement,
        descriptor: message.video,
        playbackRate: message.videoPlaybackRate ?? 1,
        onEnded: () => mediaPlaybackEndRef.current?.(message.previewRequestId),
        onError: () => reportPreviewFailure(attempt, 'video'),
      });
      try {
        await client.connect();
        await client.primeForSynchronizedStart();
        return { client, slot };
      } catch (error) {
        client.dispose();
        reportPreviewFailure(attempt, 'video');
        throw error;
      }
    },
    [reportPreviewFailure],
  );

  const disposePreparedVideoRequestId = useCallback((): void => {
    const prepared = preparedVideoRequestIdRef.current;
    preparedVideoRequestIdRef.current = undefined;
    if (!prepared) return;
    void prepared.client.then((result) => result?.client.dispose()).catch(() => undefined);
  }, []);

  const discardPendingVideoPromotion = useCallback((): void => {
    const pending = pendingVideoPromotionRef.current;
    pendingVideoPromotionRef.current = undefined;
    if (pending?.client && pending.client !== previewVideoClientRef.current) {
      pending.client.dispose();
    }
  }, []);

  const preparePreviewAudioClients = useCallback(
    async (
      message: PreviewStreamMessage,
      attempt: number,
      previewRequestId: string,
    ): Promise<readonly CutPcmAudioClient[]> => {
      const audioContext =
        message.audioStreams.length > 0
          ? await previewAudioContextOwner.contextForConnection()
          : undefined;
      const audioClients = message.audioStreams.map((descriptor, index) => {
        const playback = message.audioPlayback[index];
        if (!playback) throw new Error(`Cut preview audio playback ${index} is missing.`);
        return new CutPcmAudioClient({
          descriptor,
          playbackRate: playback.playbackRate,
          volume: volumeRef.current * dbToLinearGain(message.audioGainsDb[index] ?? 0),
          gainEnvelope: {
            positionSeconds: playback.positionSeconds,
            clipDurationSeconds: playback.clipDurationSeconds,
            fadeInSeconds: playback.fadeInSeconds,
            fadeOutSeconds: playback.fadeOutSeconds,
          },
          onError: () => {
            if (connectedPreviewRequestIdRef.current === previewRequestId) {
              reportPreviewFailure(attempt, 'audio');
            }
          },
          ...(index === 0
            ? {
                onPlaybackEnd: () => mediaPlaybackEndRef.current?.(message.previewRequestId),
              }
            : {}),
        });
      });
      try {
        await Promise.all(
          audioClients.map((client) =>
            client.prepare(audioContext).catch((error: unknown) => {
              reportPreviewFailure(attempt, 'audio');
              throw error;
            }),
          ),
        );
        return audioClients;
      } catch (error) {
        for (const client of audioClients) client.dispose();
        throw error;
      }
    },
    [previewAudioContextOwner, reportPreviewFailure],
  );

  const disposePreparedAudioRequestId = useCallback((): void => {
    const prepared = preparedAudioRequestIdRef.current;
    preparedAudioRequestIdRef.current = undefined;
    if (!prepared) return;
    void prepared.clients.then(disposeAudioClients).catch(() => undefined);
  }, []);

  const connectPausedPreview = useCallback(
    (message: PreviewStreamMessage): void => {
      const attempt = previewAttemptRef.current;
      if (attempt === undefined) throw new Error('Cut paused preview attempt is unavailable.');
      const previewRequestId = message.previewRequestId;
      void preparePreviewVideoClient(message, attempt)
        .then((preparedVideo) => {
          if (
            requestedPreviewRequestIdRef.current !== previewRequestId ||
            requestedPreviewModeRef.current !== 'paused'
          ) {
            preparedVideo?.client.dispose();
            return;
          }
          const previous = previewVideoClientRef.current;
          if (preparedVideo) {
            preparedVideo.client.pause();
            activeVideoSlotRef.current = preparedVideo.slot;
            setActiveVideoSlot(preparedVideo.slot);
            previewVideoClientRef.current = preparedVideo.client;
            activeVideoClipIdRef.current = message.videoClipId;
            activeVideoTimelineOriginRef.current = message.timelineTimeSeconds;
            activeVideoPlaybackRateRef.current = message.videoPlaybackRate ?? 1;
          } else {
            previewVideoClientRef.current = undefined;
            activeVideoClipIdRef.current = undefined;
            activeVideoTimelineOriginRef.current = undefined;
          }
          if (previous && previous !== preparedVideo?.client) previous.dispose();
          requestedPreviewRequestIdRef.current = undefined;
          requestedPreviewModeRef.current = undefined;
          previewAttemptRef.current = undefined;
          previewFailureGate.invalidate();
          controller.pausePreview(previewRequestId);
        })
        .catch(() => {
          if (requestedPreviewRequestIdRef.current !== previewRequestId) return;
          requestedPreviewRequestIdRef.current = undefined;
          requestedPreviewModeRef.current = undefined;
          reportPreviewFailure(attempt, 'video');
          controller.stopPreview();
        });
    },
    [controller, preparePreviewVideoClient, previewFailureGate, reportPreviewFailure],
  );

  const connectPreviewClients = useCallback(
    async (
      message: PreviewStreamMessage,
      preparedAudioClients?: Promise<readonly CutPcmAudioClient[]>,
      preparedVideoClient?: Promise<PreparedVideoClient | undefined>,
    ): Promise<boolean> => {
      const attempt = previewAttemptRef.current;
      if (attempt === undefined) throw new Error('Cut preview attempt is unavailable.');
      const retainedVideoClient =
        !message.video &&
        message.videoClipId !== undefined &&
        message.videoClipId === activeVideoClipIdRef.current
          ? previewVideoClientRef.current
          : undefined;
      const previewRequestId = message.previewRequestId;
      connectedPreviewRequestIdRef.current = previewRequestId;
      audioGainMultipliersRef.current = message.audioGainsDb.map(dbToLinearGain);
      const [preparedVideo, audioClients] = await Promise.all([
        message.video
          ? (preparedVideoClient ?? preparePreviewVideoClient(message, attempt))
          : Promise.resolve(undefined),
        preparedAudioClients ?? preparePreviewAudioClients(message, attempt, previewRequestId),
      ]);
      const videoClient = preparedVideo?.client ?? retainedVideoClient;
      try {
        if (connectedPreviewRequestIdRef.current !== previewRequestId) {
          preparedVideo?.client.dispose();
          for (const client of audioClients) client.dispose();
          return false;
        }
      } catch (error) {
        preparedVideo?.client.dispose();
        for (const client of audioClients) client.dispose();
        throw error;
      }
      retiringAudioClientsRef.current = previewAudioClientsRef.current;
      pendingVideoPromotionRef.current = {
        previewRequestId: message.previewRequestId,
        ...(videoClient ? { client: videoClient } : {}),
        ...(preparedVideo ? { slot: preparedVideo.slot } : {}),
        ...(!retainedVideoClient && previewVideoClientRef.current
          ? { previous: previewVideoClientRef.current }
          : {}),
        ...(message.videoClipId ? { videoClipId: message.videoClipId } : {}),
        ...(preparedVideo ? { timelineOriginSeconds: message.timelineTimeSeconds } : {}),
        playbackRate: message.videoPlaybackRate ?? activeVideoPlaybackRateRef.current,
        retained: retainedVideoClient !== undefined,
      };
      previewAudioClientsRef.current = audioClients;
      previewClockRef.current = new CutPreviewClock({
        ...(audioClients[0] ? { primaryAudio: audioClients[0] } : {}),
        ...(audioClients.length > 1
          ? {
              secondaryAudio: audioClients.slice(1).map((clock, index) => {
                const playback = message.audioPlayback[index + 1];
                if (!playback) {
                  throw new Error(`Cut preview secondary audio playback ${index + 1} is missing.`);
                }
                return {
                  clock,
                  mediaOriginSeconds: playback.mediaOriginSeconds,
                  playbackRate: playback.playbackRate,
                };
              }),
            }
          : {}),
        ...(videoClient ? { video: videoClient } : {}),
        ...(message.mediaSourceTimeSeconds !== undefined
          ? { primaryMediaOriginSeconds: message.mediaSourceTimeSeconds }
          : {}),
        ...(message.mediaPlaybackRate !== undefined
          ? { primaryPlaybackRate: message.mediaPlaybackRate }
          : {}),
        ...(message.videoPlaybackRate !== undefined
          ? { videoPlaybackRate: message.videoPlaybackRate }
          : {}),
        ...(retainedVideoClient
          ? { videoClockOriginSeconds: retainedVideoClient.currentTimeSeconds }
          : {}),
      });
      return true;
    },
    [preparePreviewAudioClients, preparePreviewVideoClient],
  );

  const activatePreparedPreview = useCallback(
    (boundarySeconds: number) => {
      playbackSegmentRef.current = undefined;
      const prepared = preparedPreviewRef.current;
      if (!prepared) {
        waitingPreviewBoundaryRef.current = boundarySeconds;
        presentationActions.seek(boundarySeconds);
        return;
      }
      if (activatingPreviewRequestIdRef.current !== undefined) return;
      const previewRequestId = prepared.previewRequestId;
      const attempt = previewAttemptRef.current;
      if (attempt === undefined) throw new Error('Cut preview attempt is unavailable.');
      activatingPreviewRequestIdRef.current = previewRequestId;
      waitingPreviewBoundaryRef.current = boundarySeconds;
      presentationActions.seek(boundarySeconds);
      const preparedAudio =
        preparedAudioRequestIdRef.current?.previewRequestId === previewRequestId
          ? preparedAudioRequestIdRef.current.clients
          : undefined;
      if (preparedAudio) preparedAudioRequestIdRef.current = undefined;
      const preparedVideo =
        preparedVideoRequestIdRef.current?.previewRequestId === previewRequestId
          ? preparedVideoRequestIdRef.current.client
          : undefined;
      if (preparedVideo) preparedVideoRequestIdRef.current = undefined;
      void connectPreviewClients(prepared, preparedAudio, preparedVideo)
        .then((connected) => {
          if (
            !connected ||
            !store.getState().isPlaying ||
            preparedPreviewRef.current?.previewRequestId !== previewRequestId
          ) {
            return;
          }
          controller.activatePreview(previewRequestId);
        })
        .catch(() => {
          if (activatingPreviewRequestIdRef.current !== previewRequestId) return;
          reportPreviewFailure(attempt, 'startup');
          controller.stopPreview();
        });
    },
    [connectPreviewClients, controller, presentationActions, reportPreviewFailure, store],
  );

  const finishOrContinuePreview = useCallback(
    (
      advance: Exclude<PreviewPlaybackAdvance, { kind: 'continue' }>,
      segment: PreviewPlaybackSegment,
    ) => {
      if (playbackSegmentRef.current !== segment) return;
      applyPreviewPlaybackAdvance(advance, {
        seek: presentationActions.seek,
        prepareNextSegment: (playheadSeconds) => {
          if (
            preparingPreviewRequestIdRef.current !== undefined ||
            preparedPreviewRef.current !== undefined
          ) {
            return;
          }
          preparingPreviewRequestIdRef.current = controller.preparePreview(playheadSeconds);
        },
        activateNextSegment: (playheadSeconds) => {
          activatePreparedPreview(playheadSeconds);
        },
        stopAtTimelineEnd: () => {
          playbackSegmentRef.current = undefined;
          stopPlaybackClients(
            previewVideoClientRef,
            previewAudioClientsRef,
            previewClockRef,
            connectedPreviewRequestIdRef,
          );
          requestedPreviewRequestIdRef.current = undefined;
          preparingPreviewRequestIdRef.current = undefined;
          preparedPreviewRef.current = undefined;
          activatingPreviewRequestIdRef.current = undefined;
          activePreviewHostRequestIdRef.current = undefined;
          waitingPreviewBoundaryRef.current = undefined;
          previewAttemptRef.current = undefined;
          previewFailureGate.invalidate();
          presentationActions.setPlaying(false);
          controller.stopPreview();
        },
      });
    },
    [activatePreparedPreview, controller, presentationActions, previewFailureGate],
  );

  mediaPlaybackEndRef.current = (previewRequestId) => {
    if (!store.getState().isPlaying || activePreviewHostRequestIdRef.current !== previewRequestId) {
      return;
    }
    const segment = playbackSegmentRef.current;
    if (!segment) return;
    finishOrContinuePreview(finishPreviewPlaybackSegment(segment), segment);
  };

  useEffect(() => {
    return () => {
      previewAttemptRef.current = undefined;
      requestedPreviewModeRef.current = undefined;
      previewFailureGate.invalidate();
      connectedPreviewRequestIdRef.current = undefined;
      disposePreviewClients(previewVideoClientRef, previewAudioClientsRef, previewClockRef);
      disposeAudioClients(retiringAudioClientsRef.current);
      retiringAudioClientsRef.current = [];
      disposePreparedAudioRequestId();
      disposePreparedVideoRequestId();
      discardPendingVideoPromotion();
      activePreviewHostRequestIdRef.current = undefined;
      activeVideoClipIdRef.current = undefined;
      activeVideoTimelineOriginRef.current = undefined;
      void previewAudioContextOwner.dispose().catch((error: unknown) => {
        globalThis.reportError(error);
      });
    };
  }, [
    disposePreparedAudioRequestId,
    disposePreparedVideoRequestId,
    discardPendingVideoPromotion,
    previewAudioContextOwner,
    previewFailureGate,
  ]);

  useEffect(() => {
    const receive = (value: unknown) => {
      if (!isRecord(value)) return;
      const message = value;
      if (message['type'] === 'cut:preview-ready' && isPreviewStreamMessage(message)) {
        const requestMode = requestedPreviewModeRef.current;
        if (
          !shouldAcceptPreviewReady(
            message.previewRequestId,
            requestedPreviewRequestIdRef.current,
            store.getState().isPlaying || requestMode === 'paused',
          )
        ) {
          return;
        }
        disposePreparedAudioRequestId();
        disposePreparedVideoRequestId();
        discardPendingVideoPromotion();
        if (requestMode === 'paused') {
          connectPausedPreview(message);
          return;
        }
        requestedPreviewRequestIdRef.current = undefined;
        requestedPreviewModeRef.current = undefined;
        preparingPreviewRequestIdRef.current = undefined;
        preparedPreviewRef.current = message;
        activatingPreviewRequestIdRef.current = undefined;
        waitingPreviewBoundaryRef.current = undefined;
        activatePreparedPreview(message.timelineTimeSeconds);
        return;
      }
      if (message['type'] === 'cut:preview-prepared' && isPreviewStreamMessage(message)) {
        if (
          !shouldAcceptPreviewReady(
            message.previewRequestId,
            preparingPreviewRequestIdRef.current,
            store.getState().isPlaying,
          )
        ) {
          return;
        }
        const attempt = previewAttemptRef.current;
        if (attempt === undefined) throw new Error('Cut preview attempt is unavailable.');
        disposePreparedAudioRequestId();
        disposePreparedVideoRequestId();
        const clients = preparePreviewAudioClients(message, attempt, message.previewRequestId);
        void clients.catch(() => undefined);
        preparedAudioRequestIdRef.current = { previewRequestId: message.previewRequestId, clients };
        const videoClient = preparePreviewVideoClient(message, attempt);
        void videoClient.catch(() => undefined);
        preparedVideoRequestIdRef.current = {
          previewRequestId: message.previewRequestId,
          client: videoClient,
        };
        preparedPreviewRef.current = message;
        const waitingBoundary = waitingPreviewBoundaryRef.current;
        if (waitingBoundary !== undefined) {
          activatePreparedPreview(waitingBoundary);
        }
        return;
      }
      if (
        message['type'] === 'cut:preview-activated' &&
        typeof message['previewRequestId'] === 'string'
      ) {
        const previewRequestId = message['previewRequestId'];
        const prepared = preparedPreviewRef.current;
        if (
          !store.getState().isPlaying ||
          activatingPreviewRequestIdRef.current !== previewRequestId ||
          prepared?.previewRequestId !== previewRequestId
        ) {
          return;
        }
        const attempt = previewAttemptRef.current;
        if (attempt === undefined) throw new Error('Cut preview attempt is unavailable.');
        const videoPromotion = pendingVideoPromotionRef.current;
        const videoClient =
          videoPromotion?.previewRequestId === previewRequestId ? videoPromotion.client : undefined;
        const audioClients = previewAudioClientsRef.current;
        const audioContext = audioClients[0]?.getAudioContext();
        const retiringAudioClients = retiringAudioClientsRef.current;
        const startContext = audioContext ?? retiringAudioClients[0]?.getAudioContext();
        void (async () => {
          try {
            if (
              !store.getState().isPlaying ||
              activatingPreviewRequestIdRef.current !== previewRequestId ||
              preparedPreviewRef.current?.previewRequestId !== previewRequestId
            ) {
              return;
            }
            const sharedStartTime = startContext ? previewAudioStartTime(startContext) : undefined;
            if (audioContext && sharedStartTime !== undefined) {
              await Promise.all(
                audioClients.map((client) =>
                  client.startAt(sharedStartTime).catch((error: unknown) => {
                    reportPreviewFailure(attempt, 'audio');
                    throw error;
                  }),
                ),
              );
            }
            if (sharedStartTime !== undefined) {
              for (const client of retiringAudioClients) client.retireAt(sharedStartTime, 0.01);
              retiringAudioClientsRef.current = [];
              if (startContext) await waitForAudioContextTime(startContext, sharedStartTime);
            } else {
              disposeAudioClients(retiringAudioClients);
              retiringAudioClientsRef.current = [];
            }
            if (
              !store.getState().isPlaying ||
              activatingPreviewRequestIdRef.current !== previewRequestId ||
              preparedPreviewRef.current?.previewRequestId !== previewRequestId
            ) {
              return;
            }
            await videoClient?.play().catch((error: unknown) => {
              reportPreviewFailure(attempt, 'video');
              throw error;
            });
            if (
              !store.getState().isPlaying ||
              activatingPreviewRequestIdRef.current !== previewRequestId ||
              preparedPreviewRef.current?.previewRequestId !== previewRequestId
            ) {
              return;
            }
            if (videoPromotion?.previewRequestId === previewRequestId) {
              if (videoPromotion.slot !== undefined) {
                activeVideoSlotRef.current = videoPromotion.slot;
                setActiveVideoSlot(videoPromotion.slot);
              }
              previewVideoClientRef.current = videoClient;
              activeVideoClipIdRef.current = videoPromotion.videoClipId;
              if (videoPromotion.timelineOriginSeconds !== undefined) {
                activeVideoTimelineOriginRef.current = videoPromotion.timelineOriginSeconds;
              } else if (!videoPromotion.retained) {
                activeVideoTimelineOriginRef.current = undefined;
              }
              activeVideoPlaybackRateRef.current = videoPromotion.playbackRate;
              if (videoPromotion.previous && videoPromotion.previous !== videoClient) {
                videoPromotion.previous.dispose();
              }
              if (!videoClient) {
                const context = previewCanvasRef.current?.getContext('2d');
                if (context && previewCanvasRef.current) {
                  context.fillStyle = '#000000';
                  context.fillRect(
                    0,
                    0,
                    previewCanvasRef.current.width,
                    previewCanvasRef.current.height,
                  );
                }
              }
              pendingVideoPromotionRef.current = undefined;
            }
            playbackSegmentRef.current = {
              timelineStartSeconds: prepared.timelineTimeSeconds,
              wallStartMilliseconds: performance.now(),
              segmentEndSeconds: prepared.segmentEndSeconds,
              timelineEndSeconds: prepared.playbackEndSeconds,
              preparationLeadSeconds: previewPreparationLeadSeconds(
                prepared.video?.preparationProfile,
              ),
              ...(prepared.mediaSourceTimeSeconds !== undefined &&
              prepared.mediaPlaybackRate !== undefined
                ? {
                    mediaClock: {
                      sourceStartSeconds: prepared.mediaSourceTimeSeconds,
                      playbackRate: prepared.mediaPlaybackRate,
                    },
                  }
                : {}),
            };
            activePreviewHostRequestIdRef.current = previewRequestId;
            preparingPreviewRequestIdRef.current = undefined;
            preparedPreviewRef.current = undefined;
            activatingPreviewRequestIdRef.current = undefined;
            waitingPreviewBoundaryRef.current = undefined;
          } catch {
            reportPreviewFailure(attempt, 'startup');
            controller.stopPreview();
          }
        })();
        return;
      }
      const accepted = controller.acceptHostMessage(message);
      if (!accepted) return;
      if (
        message['type'] === 'cut:view' ||
        message['type'] === 'cut:runtime-snapshot' ||
        message['type'] === 'cut:error'
      ) {
        previewAttemptRef.current = undefined;
        requestedPreviewModeRef.current = undefined;
        previewFailureGate.invalidate();
        playbackSegmentRef.current = undefined;
        requestedPreviewRequestIdRef.current = undefined;
        preparingPreviewRequestIdRef.current = undefined;
        preparedPreviewRef.current = undefined;
        disposePreparedAudioRequestId();
        disposePreparedVideoRequestId();
        discardPendingVideoPromotion();
        activatingPreviewRequestIdRef.current = undefined;
        activePreviewHostRequestIdRef.current = undefined;
        waitingPreviewBoundaryRef.current = undefined;
        stopPlaybackClients(
          previewVideoClientRef,
          previewAudioClientsRef,
          previewClockRef,
          connectedPreviewRequestIdRef,
        );
        disposeAudioClients(retiringAudioClientsRef.current);
        retiringAudioClientsRef.current = [];
        activeVideoClipIdRef.current = undefined;
        activeVideoTimelineOriginRef.current = undefined;
      }
      if (message['type'] === 'cut:export-task' && isExportTaskSnapshot(message['task'])) {
        const task = message['task'];
        if (task.status === 'completed') {
          showToast(
            t('notification.export-completed', { path: task.outputWorkspaceRelativePath }),
            'success',
          );
        }
        if (task.status === 'failed') {
          if (!task.diagnostic) {
            throw new Error('Failed Cut export task is missing its diagnostic.');
          }
          presentationActions.reportDiagnostic(task.diagnostic);
        }
      }
    };
    const unsubscribe = hostBridge.subscribe(receive);
    controller.ready();
    return unsubscribe;
  }, [
    activatePreparedPreview,
    connectPreviewClients,
    connectPausedPreview,
    controller,
    disposePreparedAudioRequestId,
    disposePreparedVideoRequestId,
    discardPendingVideoPromotion,
    preparePreviewAudioClients,
    preparePreviewVideoClient,
    presentationActions,
    previewFailureGate,
    reportPreviewFailure,
    showToast,
    store,
    t,
    hostBridge,
  ]);

  useEffect(() => {
    volumeRef.current = volume;
    previewAudioClientsRef.current.forEach((client, index) =>
      client.setVolume(volume * (audioGainMultipliersRef.current[index] ?? 1)),
    );
  }, [volume]);

  useEffect(() => {
    if (!playing || !view) return;
    const timer = window.setInterval(() => {
      const segment = playbackSegmentRef.current;
      if (!segment) return;
      const clock = previewClockRef.current?.read();
      if (clock?.discontinuity) {
        const attempt = previewAttemptRef.current;
        if (attempt === undefined) throw new Error('Cut preview attempt is unavailable.');
        reportPreviewFailure(attempt, 'synchronization');
        stopPlaybackClients(
          previewVideoClientRef,
          previewAudioClientsRef,
          previewClockRef,
          connectedPreviewRequestIdRef,
        );
        controller.stopPreview();
        return;
      }
      const advance = advancePreviewPlayback(
        segment,
        performance.now(),
        clock?.mediaTimeSeconds,
        store.getState().playheadSeconds,
      );
      if (advance.kind === 'continue') {
        presentationActions.seek(advance.playheadSeconds);
        return;
      }
      finishOrContinuePreview(advance, segment);
    }, 50);
    return () => window.clearInterval(timer);
  }, [controller, finishOrContinuePreview, playing, reportPreviewFailure, store, view]);

  const selected = useMemo(() => findClip(view, selectedClipId), [selectedClipId, view]);
  const selectedTrack = useMemo(() => {
    if (selection?.kind === 'track') {
      return view?.tracks.find((track) => track.trackId === selection.trackId);
    }
    if (selectedGap) return view?.tracks.find((track) => track.trackId === selectedGap.trackId);
    return view?.tracks.find((track) =>
      track.items.some((item) => item.kind === 'clip' && item.clipId === selectedClipId),
    );
  }, [selectedClipId, selectedGap, selection, view]);
  const frameSeconds = view?.profile
    ? view.profile.editRateDenominator / view.profile.editRateNumerator
    : 1 / 30;
  const videoTrackId = view?.tracks.find((track) => track.kind === 'Video')?.trackId;
  const canSplit = Boolean(
    selected &&
    playheadSeconds > selected.startSeconds &&
    playheadSeconds < selected.startSeconds + selected.durationSeconds,
  );

  const postCommand = (command: CutCommand) => controller.command(command);

  const linkMediaToSelectedTrack = () => {
    const targetTrack =
      selectedTrack ?? view?.tracks.find((track) => track.trackId === videoTrackId);
    if (!targetTrack) throw new Error('Cut timeline does not contain a target Track.');
    const targetSeconds =
      placementMode === 'sequence'
        ? timelineInsertionTime(targetTrack.items, playheadSeconds)
        : playheadSeconds;
    controller.selectLinkMedia(
      targetTrack.trackId,
      Math.max(0, Math.round(targetSeconds / frameSeconds)),
      placementMode === 'sequence' ? 'insert' : 'reject',
    );
  };

  const pausePreview = () => {
    previewAttemptRef.current = undefined;
    previewFailureGate.invalidate();
    playbackSegmentRef.current = undefined;
    requestedPreviewRequestIdRef.current = undefined;
    requestedPreviewModeRef.current = undefined;
    preparingPreviewRequestIdRef.current = undefined;
    preparedPreviewRef.current = undefined;
    disposePreparedAudioRequestId();
    disposePreparedVideoRequestId();
    discardPendingVideoPromotion();
    activatingPreviewRequestIdRef.current = undefined;
    activePreviewHostRequestIdRef.current = undefined;
    waitingPreviewBoundaryRef.current = undefined;
    connectedPreviewRequestIdRef.current = undefined;
    previewVideoClientRef.current?.pause();
    const audioClients = previewAudioClientsRef.current;
    previewAudioClientsRef.current = [];
    const audioContext = audioClients[0]?.getAudioContext();
    if (audioContext) {
      const retirementTime = audioContext.currentTime + 0.005;
      for (const client of audioClients) client.retireAt(retirementTime, 0.01);
    } else {
      disposeAudioClients(audioClients);
    }
    disposeAudioClients(retiringAudioClientsRef.current);
    retiringAudioClientsRef.current = [];
    previewClockRef.current = undefined;
    presentationActions.setPlaying(false);
    if (view) controller.pausePreview();
  };

  const togglePlayback = () => {
    if (playing) {
      pausePreview();
      return;
    }
    if (!view) {
      presentationActions.reportDiagnostic({ code: 'project-not-open' });
      return;
    }
    const attempt = previewFailureGate.begin();
    previewAttemptRef.current = attempt;
    try {
      previewAudioContextOwner.activateFromUserGesture();
    } catch {
      reportPreviewFailure(attempt, 'audio');
      return;
    }
    presentationActions.setPlaying(true);
    playbackSegmentRef.current = undefined;
    preparingPreviewRequestIdRef.current = undefined;
    preparedPreviewRef.current = undefined;
    disposePreparedAudioRequestId();
    disposePreparedVideoRequestId();
    discardPendingVideoPromotion();
    activatingPreviewRequestIdRef.current = undefined;
    activePreviewHostRequestIdRef.current = undefined;
    waitingPreviewBoundaryRef.current = undefined;
    const playheadVideoClip = findVideoClipAtTime(view, playheadSeconds);
    requestedPreviewModeRef.current = 'playing';
    requestedPreviewRequestIdRef.current = controller.startPreview(
      playheadSeconds,
      playheadVideoClip?.clipId === activeVideoClipIdRef.current
        ? activeVideoClipIdRef.current
        : undefined,
      'playing',
    );
  };

  const seek = (seconds: number) => {
    if (playing) pausePreview();
    const targetSeconds = clampTimelineTime(seconds, view?.durationSeconds ?? 0);
    presentationActions.seek(targetSeconds);
    const activeVideoClient = previewVideoClientRef.current;
    const activeTimelineOrigin = activeVideoTimelineOriginRef.current;
    const targetVideoClip = findVideoClipAtTime(view, targetSeconds);
    if (
      activeVideoClient &&
      activeTimelineOrigin !== undefined &&
      targetVideoClip?.clipId === activeVideoClipIdRef.current
    ) {
      const mediaOffsetSeconds =
        (targetSeconds - activeTimelineOrigin) * activeVideoPlaybackRateRef.current;
      if (activeVideoClient.canSeek(mediaOffsetSeconds)) {
        activeVideoClient.seek(mediaOffsetSeconds);
        return;
      }
    }
    if (!view || targetSeconds >= view.durationSeconds) return;
    const attempt = previewFailureGate.begin();
    previewAttemptRef.current = attempt;
    requestedPreviewModeRef.current = 'paused';
    requestedPreviewRequestIdRef.current = controller.startPreview(
      targetSeconds,
      undefined,
      'paused',
    );
  };

  const splitClip = (clip: TimelineClipView) => {
    const splitAllowed =
      playheadSeconds > clip.startSeconds &&
      playheadSeconds < clip.startSeconds + clip.durationSeconds;
    if (!splitAllowed || !view) return;
    const rate = view.profile
      ? view.profile.editRateNumerator / view.profile.editRateDenominator
      : 30;
    controller.split(clip.clipId, Math.round((playheadSeconds - clip.startSeconds) * rate));
  };
  const splitSelected = () => selected && splitClip(selected);
  const deleteSelected = () => {
    const clipIds = collectIndependentClipIds(
      view,
      selectedClips.map(({ clipId }) => clipId),
    );
    if (clipIds.length === 1) {
      postCommand({ type: 'ripple-delete', clipId: clipIds[0]! });
    } else if (clipIds.length > 1) {
      controller.batch(clipIds.map((clipId) => ({ type: 'ripple-delete', clipId })));
    }
  };
  const undo = () => view && controller.undo();
  const redo = () => view && controller.redo();

  const shortcutActions = useMemo(
    () => ({
      togglePlayback,
      seekByFrames: (frames: number) => seek(playheadSeconds + frames * frameSeconds),
      seekStart: () => seek(0),
      seekEnd: () => seek(view?.durationSeconds ?? 0),
      undo,
      redo,
      split: splitSelected,
      duplicateSelection: () => {
        if (selectedClips.length > 0) {
          controller.duplicate(selectedClips.map(({ clipId }) => clipId));
        }
      },
      cutSelection: () => {
        presentationActions.copySelection();
        deleteSelected();
      },
      copySelection: presentationActions.copySelection,
      paste: () => clipboard && controller.paste(clipboard, playheadSeconds),
      selectAll: presentationActions.selectAllClips,
      deleteSelection: deleteSelected,
      clearSelection: () => presentationActions.select(undefined),
    }),
    [
      canSplit,
      clipboard,
      controller,
      frameSeconds,
      playheadSeconds,
      playing,
      presentationActions,
      selected?.clipId,
      selectedClips,
      selection,
      view,
    ],
  );
  useKeyboardShortcuts({
    enabled: isKeyboardFocused,
    state: {
      hasView: Boolean(view),
      hasSelection: Boolean(selection),
      hasClipboard: Boolean(clipboard),
      canSplit,
    },
    actions: shortcutActions,
  });

  const previewTitle = selected?.name ?? view?.name;
  const previewSource = selected?.targetUrl;
  if (presentation === 'timeline-only') {
    return (
      <div
        ref={rootRef}
        className="relative h-full bg-neko-bg"
        data-cut-presentation="timeline-only"
        data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
      >
        <section className="cut-basic-timeline-region cut-basic-timeline-region--host">
          <Timeline onOpenPackage={linkMediaToSelectedTrack} onSeek={seek} />
        </section>
      </div>
    );
  }
  return (
    <div
      ref={rootRef}
      className="relative h-full bg-neko-bg"
      data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
    >
      <CreativeWorkbenchShell
        className="cut-workbench-shell"
        bodyClassName="cut-workbench-body"
        mainClassName="cut-main-panel"
        mainKind="preview-timeline"
        main={
          <div
            ref={previewResize.containerRef}
            className="cut-basic-editor"
            data-resizing={previewResize.isResizing ? 'true' : 'false'}
          >
            <section
              className="cut-basic-upper-workspace"
              style={{ flex: timelineTarget ? 1 : previewSplit.size }}
            >
              <div className="cut-basic-preview-region">
                <PreviewPanel
                  ref={previewCanvasRef}
                  videoRef={previewVideoRef}
                  secondaryVideoRef={secondaryPreviewVideoRef}
                  activeVideoSlot={activeVideoSlot}
                  title={previewTitle}
                  source={previewSource}
                  projectWidth={view?.profile?.width ?? 1920}
                  projectHeight={view?.profile?.height ?? 1080}
                />
                <PreviewControls
                  currentTime={playheadSeconds}
                  duration={view?.durationSeconds ?? 0}
                  playing={playing}
                  propertyPanelVisible={!inspectorLayout.collapsed}
                  volume={volume}
                  onStart={() => seek(0)}
                  onPrevious={() => seek(playheadSeconds - frameSeconds)}
                  onToggle={togglePlayback}
                  onNext={() => seek(playheadSeconds + frameSeconds)}
                  onEnd={() => seek(view?.durationSeconds ?? 0)}
                  onVolume={(nextVolume) => {
                    presentationActions.setPreviewVolume(nextVolume);
                    if (previewMuted && nextVolume > 0) presentationActions.togglePreviewMute();
                  }}
                  onToggleMute={presentationActions.togglePreviewMute}
                  onTogglePropertyPanel={() =>
                    inspectorLayout.setCollapsed(!inspectorLayout.collapsed)
                  }
                  onFullscreen={() =>
                    requestFullscreen(() =>
                      presentationActions.reportDiagnostic({ code: 'fullscreen-failed' }),
                    )
                  }
                />
              </div>
              {!inspectorLayout.collapsed ? (
                <aside
                  ref={inspectorResize.containerRef}
                  className="cut-basic-inspector-shell"
                  data-resizing={inspectorResize.isResizing ? 'true' : 'false'}
                  style={{ width: inspectorLayout.size }}
                >
                  <ResizeHandle
                    handleProps={inspectorResize.handleProps}
                    className="cut-basic-inspector-resize-handle"
                  />
                  <PropertyPanelInline mode="basic" />
                </aside>
              ) : null}
            </section>
            {timelineTarget ? (
              createPortal(
                <div className="cut-webview-root cut-timeline-portal-root">
                  <section className="cut-basic-timeline-region cut-basic-timeline-region--host">
                    <Timeline onOpenPackage={linkMediaToSelectedTrack} onSeek={seek} />
                  </section>
                </div>,
                timelineTarget,
              )
            ) : (
              <>
                <ResizeHandle
                  handleProps={previewResize.handleProps}
                  className="cut-basic-preview-resize-handle"
                />
                <section
                  className="cut-basic-timeline-region"
                  style={{ flex: 1 - previewSplit.size }}
                >
                  <Timeline onOpenPackage={linkMediaToSelectedTrack} onSeek={seek} />
                </section>
              </>
            )}
          </div>
        }
      />
    </div>
  );
}

function findClip(
  view: TimelineView | undefined,
  clipId: string | undefined,
): TimelineClipView | undefined {
  if (!view || !clipId) return undefined;
  const item = view.tracks
    .flatMap((track) => track.items)
    .find((candidate) => candidate.kind === 'clip' && candidate.clipId === clipId);
  return item?.kind === 'clip' ? item : undefined;
}

function findVideoClipAtTime(
  view: TimelineView | undefined,
  timelineTimeSeconds: number,
): TimelineClipView | undefined {
  return view?.tracks
    .find((track) => track.enabled && track.kind === 'Video')
    ?.items.find(
      (item): item is TimelineClipView =>
        item.kind === 'clip' &&
        item.enabled &&
        item.startSeconds <= timelineTimeSeconds &&
        timelineTimeSeconds < item.startSeconds + item.durationSeconds,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface PreviewStreamMessage extends Record<string, unknown> {
  readonly type: 'cut:preview-ready' | 'cut:preview-prepared';
  readonly previewRequestId: string;
  readonly videoClipId?: string;
  readonly timelineTimeSeconds: number;
  readonly segmentEndSeconds: number;
  readonly playbackEndSeconds: number;
  readonly mediaSourceTimeSeconds?: number;
  readonly mediaPlaybackRate?: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly video?: CutHtmlVideoDescriptor;
  readonly videoPlaybackRate?: number;
  readonly audioStreams: readonly CutPcmStreamDescriptor[];
  readonly audioGainsDb: readonly number[];
  readonly audioPlayback: readonly CutPreviewAudioPlayback[];
}

function isPreviewStreamMessage(value: Record<string, unknown>): value is PreviewStreamMessage {
  return (
    (value['type'] === 'cut:preview-ready' || value['type'] === 'cut:preview-prepared') &&
    typeof value['previewRequestId'] === 'string' &&
    (value['videoClipId'] === undefined || typeof value['videoClipId'] === 'string') &&
    typeof value['timelineTimeSeconds'] === 'number' &&
    typeof value['segmentEndSeconds'] === 'number' &&
    typeof value['playbackEndSeconds'] === 'number' &&
    Number.isFinite(value['playbackEndSeconds']) &&
    value['playbackEndSeconds'] > 0 &&
    (value['mediaSourceTimeSeconds'] === undefined ||
      (typeof value['mediaSourceTimeSeconds'] === 'number' &&
        Number.isFinite(value['mediaSourceTimeSeconds']))) &&
    (value['mediaPlaybackRate'] === undefined ||
      (typeof value['mediaPlaybackRate'] === 'number' &&
        Number.isFinite(value['mediaPlaybackRate']) &&
        value['mediaPlaybackRate'] > 0)) &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['framesPerSecond'] === 'number' &&
    (value['video'] === undefined || isHtmlVideoDescriptor(value['video'])) &&
    (value['videoPlaybackRate'] === undefined ||
      (typeof value['videoPlaybackRate'] === 'number' &&
        Number.isFinite(value['videoPlaybackRate']) &&
        value['videoPlaybackRate'] > 0)) &&
    Array.isArray(value['audioStreams']) &&
    value['audioStreams'].every(isPcmStreamDescriptor) &&
    Array.isArray(value['audioGainsDb']) &&
    value['audioGainsDb'].length === value['audioStreams'].length &&
    value['audioGainsDb'].every((gain) => typeof gain === 'number' && Number.isFinite(gain)) &&
    Array.isArray(value['audioPlayback']) &&
    value['audioPlayback'].length === value['audioStreams'].length &&
    value['audioPlayback'].every(isPreviewAudioPlayback)
  );
}

function isPreviewAudioPlayback(value: unknown): value is CutPreviewAudioPlayback {
  return (
    isRecord(value) &&
    isNonNegativeFinite(value['mediaOriginSeconds']) &&
    isPositiveFinite(value['playbackRate']) &&
    isNonNegativeFinite(value['positionSeconds']) &&
    isPositiveFinite(value['clipDurationSeconds']) &&
    value['positionSeconds'] < value['clipDurationSeconds'] &&
    isNonNegativeFinite(value['fadeInSeconds']) &&
    value['fadeInSeconds'] <= value['clipDurationSeconds'] &&
    isNonNegativeFinite(value['fadeOutSeconds']) &&
    value['fadeOutSeconds'] <= value['clipDurationSeconds']
  );
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isHtmlVideoDescriptor(value: unknown): value is CutHtmlVideoDescriptor {
  return (
    isRecord(value) &&
    isCutMediaUrl(value['url']) &&
    typeof value['mimeType'] === 'string' &&
    typeof value['preparationProfile'] === 'string' &&
    isNonNegativeFinite(value['mediaTimeOriginSeconds']) &&
    isPositiveFinite(value['durationSeconds'])
  );
}

function isPcmStreamDescriptor(value: unknown): value is CutPcmStreamDescriptor {
  return (
    isRecord(value) &&
    isCutMediaUrl(value['streamUrl']) &&
    typeof value['sampleRate'] === 'number' &&
    typeof value['channels'] === 'number'
  );
}

function isCutMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'openneko:' &&
      url.hostname === 'resource' &&
      /^\/[A-Za-z0-9_-]{32}$/u.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function dbToLinearGain(gainDb: number): number {
  return 10 ** (gainDb / 20);
}

function waitForAudioContextTime(context: AudioContext, contextTime: number): Promise<void> {
  const delayMilliseconds = Math.max(0, (contextTime - context.currentTime) * 1_000);
  return new Promise((resolve) => window.setTimeout(resolve, delayMilliseconds));
}

function isExportTaskSnapshot(value: unknown): value is CutExportTaskSnapshot {
  const valid =
    isRecord(value) &&
    typeof value['jobId'] === 'string' &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['sourceSnapshotId'] === 'string' &&
    isExportSettings(value['settings']) &&
    typeof value['outputWorkspaceRelativePath'] === 'string' &&
    (value['status'] === 'running' ||
      value['status'] === 'completed' ||
      value['status'] === 'failed' ||
      value['status'] === 'cancelled') &&
    typeof value['startedAt'] === 'number';
  return valid && (value['status'] !== 'failed' || isCutUserDiagnostic(value['diagnostic']));
}

function isExportSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['framesPerSecond'] === 'number'
  );
}

function stopPlaybackClients(
  videoClientRef: MutableRefObject<CutHtmlVideoClient | undefined>,
  audioClientsRef: MutableRefObject<readonly CutPcmAudioClient[]>,
  clockRef: MutableRefObject<CutPreviewClock | undefined>,
  connectedPreviewRequestIdRef: MutableRefObject<string | undefined>,
): void {
  connectedPreviewRequestIdRef.current = undefined;
  disposePreviewClients(videoClientRef, audioClientsRef, clockRef);
}

function disposePreviewClients(
  videoClientRef: MutableRefObject<CutHtmlVideoClient | undefined>,
  audioClientsRef: MutableRefObject<readonly CutPcmAudioClient[]>,
  clockRef: MutableRefObject<CutPreviewClock | undefined>,
): void {
  videoClientRef.current?.dispose();
  videoClientRef.current = undefined;
  disposePreviewAudioClients(audioClientsRef, clockRef);
}

function disposePreviewAudioClients(
  audioClientsRef: MutableRefObject<readonly CutPcmAudioClient[]>,
  clockRef: MutableRefObject<CutPreviewClock | undefined>,
): void {
  const clients = audioClientsRef.current;
  audioClientsRef.current = [];
  disposeAudioClients(clients);
  clockRef.current = undefined;
}

function disposeAudioClients(clients: readonly CutPcmAudioClient[]): void {
  for (const client of clients) client.dispose();
}

function requestFullscreen(onError: () => void): void {
  const operation = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  operation.catch(onError);
}

export default App;
