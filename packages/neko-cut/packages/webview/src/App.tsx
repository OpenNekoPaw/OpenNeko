import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type {
  CutCommand,
  CutExportTaskSnapshot,
  TimelineClipView,
  TimelineView,
} from '@neko-cut/domain';
import { isCutUserDiagnostic } from '@neko-cut/domain';
import { AudioStreamClient, EngineAvStreamLifecycle } from '@neko/neko-client';
import { usePersistedResize, useResizable } from '@neko/ui/hooks';
import { useFocusedWebviewRoot } from '@neko/ui/keyboard';
import { ResizeHandle } from '@neko/ui/primitives';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { PropertyPanelInline } from './components/PropertyPanel/PropertyPanelInline';
import { PreviewControls } from './components/PreviewControls';
import { PreviewPanel } from './components/PreviewPanel';
import { drawContainedVideoFrame } from './components/PreviewPanel/previewCanvas';
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
  shouldAcceptPreviewReady,
  type PreviewPlaybackAdvance,
  type PreviewPlaybackSegment,
} from './previewPlayback';
import { PreviewAudioContextOwner } from './previewAudioContext';
import { useCutOtioController } from './controllers/CutOtioControllerContext';
import {
  useCutPresentationStore,
  useCutPresentationStoreApi,
} from './stores/cut-presentation-store';

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewLifecycleRef = useRef<EngineAvStreamLifecycle>();
  const previewAudioContextOwnerRef = useRef<PreviewAudioContextOwner>();
  const additionalAudioClientsRef = useRef<readonly AudioStreamClient[]>([]);
  const audioGainMultipliersRef = useRef<readonly number[]>([]);
  const previewGenerationRef = useRef(0);
  const requestedPreviewGenerationRef = useRef<number>();
  const preparingPreviewGenerationRef = useRef<number>();
  const preparedPreviewRef = useRef<PreviewStreamMessage>();
  const activatingPreviewGenerationRef = useRef<number>();
  const waitingPreviewBoundaryRef = useRef<number>();
  const playbackSegmentRef = useRef<PreviewPlaybackSegment>();
  const mediaClockTimeSecondsRef = useRef<number>();
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
  const volume = useCutPresentationStore((state) => (state.previewMuted ? 0 : state.previewVolume));
  const previewMuted = useCutPresentationStore((state) => state.previewMuted);
  const diagnostic = useCutPresentationStore((state) => state.diagnostic);
  const presentationActions = useCutPresentationStore((state) => state.actions);
  const selectedClipId = selection?.kind === 'clip' ? selection.clipId : undefined;
  const selectedGap =
    selection?.kind === 'gap'
      ? { trackId: selection.trackId, itemIndex: selection.itemIndex }
      : undefined;
  const { showToast } = useToast();
  const controller = useCutOtioController();
  previewAudioContextOwnerRef.current ??= new PreviewAudioContextOwner();
  const previewAudioContextOwner = previewAudioContextOwnerRef.current;
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

  const drawPreviewFrame = useCallback((frame: VideoFrame) => {
    mediaClockTimeSecondsRef.current = frame.timestamp / 1_000_000;
    const canvas = previewCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      frame.close();
      return;
    }
    try {
      drawContainedVideoFrame(context, frame);
    } finally {
      frame.close();
    }
  }, []);

  const connectPreviewClients = useCallback(
    async (message: PreviewStreamMessage): Promise<boolean> => {
      const canvas = previewCanvasRef.current;
      if (canvas && !message.videoStreamUrl) {
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#000000';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      const lifecycle = previewLifecycleRef.current;
      if (!lifecycle) throw new Error('Cut preview lifecycle is unavailable.');
      const audioContext = await previewAudioContextOwner.contextForConnection();
      disposeAudioClients(additionalAudioClientsRef);
      mediaClockTimeSecondsRef.current = undefined;
      const generation = previewGenerationRef.current + 1;
      previewGenerationRef.current = generation;
      const [primaryAudioStreamUrl, ...additionalAudioStreamUrls] = message.audioStreamUrls;
      audioGainMultipliersRef.current = message.audioGainsDb.map(dbToLinearGain);
      const [primaryGain = 1, ...additionalGains] = audioGainMultipliersRef.current;
      const snapshot = await lifecycle.start(
        {
          ...(message.videoStreamUrl
            ? {
                video: {
                  websocketUrl: message.videoStreamUrl,
                  width: message.width,
                  height: message.height,
                  onFrame: drawPreviewFrame,
                },
              }
            : {}),
          ...(primaryAudioStreamUrl
            ? {
                audio: {
                  websocketUrl: primaryAudioStreamUrl,
                  volume: volumeRef.current * primaryGain,
                },
              }
            : {}),
          fps: message.framesPerSecond,
          schedulerMode: 'none',
          videoFrameRoute: 'callback',
        },
        { audioContext },
      );
      snapshot.audioClient?.setClockPlaybackRate(message.mediaPlaybackRate ?? 1);
      if (previewGenerationRef.current !== generation) return false;
      const additionalClients = additionalAudioStreamUrls.map(
        (websocketUrl, index) =>
          new AudioStreamClient({
            websocketUrl,
            volume: volumeRef.current * (additionalGains[index] ?? 1),
            onError: () => {
              if (previewGenerationRef.current === generation) {
                presentationActions.setPlaying(false);
                presentationActions.reportDiagnostic({ code: 'preview-failed' });
              }
            },
          }),
      );
      additionalAudioClientsRef.current = additionalClients;
      try {
        await Promise.all(additionalClients.map((client) => client.connect(audioContext)));
      } catch (error) {
        if (previewGenerationRef.current === generation) {
          disposeAudioClients(additionalAudioClientsRef);
          lifecycle.stop();
        }
        throw error;
      }
      return previewGenerationRef.current === generation;
    },
    [drawPreviewFrame, presentationActions, previewAudioContextOwner],
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
      if (activatingPreviewGenerationRef.current !== undefined) return;
      const generation = prepared.generation;
      activatingPreviewGenerationRef.current = generation;
      waitingPreviewBoundaryRef.current = boundarySeconds;
      presentationActions.seek(boundarySeconds);
      void connectPreviewClients(prepared)
        .then((connected) => {
          if (
            !connected ||
            !store.getState().isPlaying ||
            preparedPreviewRef.current?.generation !== generation
          ) {
            return;
          }
          controller.activatePreview(generation);
        })
        .catch(() => {
          if (activatingPreviewGenerationRef.current !== generation) return;
          presentationActions.setPlaying(false);
          presentationActions.reportDiagnostic({ code: 'preview-failed' });
          controller.stopPreview();
        });
    },
    [connectPreviewClients, controller, presentationActions, store],
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
            preparingPreviewGenerationRef.current !== undefined ||
            preparedPreviewRef.current !== undefined
          ) {
            return;
          }
          preparingPreviewGenerationRef.current = controller.preparePreview(playheadSeconds);
        },
        activateNextSegment: (playheadSeconds) => {
          activatePreparedPreview(playheadSeconds);
        },
        stopAtTimelineEnd: () => {
          playbackSegmentRef.current = undefined;
          stopPlaybackClients(previewLifecycleRef, additionalAudioClientsRef, previewGenerationRef);
          requestedPreviewGenerationRef.current = undefined;
          preparingPreviewGenerationRef.current = undefined;
          preparedPreviewRef.current = undefined;
          activatingPreviewGenerationRef.current = undefined;
          waitingPreviewBoundaryRef.current = undefined;
          presentationActions.setPlaying(false);
          controller.stopPreview();
        },
      });
    },
    [activatePreparedPreview, controller, presentationActions],
  );

  useEffect(() => {
    const lifecycle = new EngineAvStreamLifecycle({
      callbacks: {
        onError: () => {
          presentationActions.setPlaying(false);
          presentationActions.reportDiagnostic({ code: 'preview-failed' });
        },
        onStreamEnd: (kind) => {
          if (kind === 'audio' && lifecycle.getSnapshot().videoClient) return;
          const segment = playbackSegmentRef.current;
          if (!segment) return;
          const advance = finishPreviewPlaybackSegment(segment);
          window.queueMicrotask(() => finishOrContinuePreview(advance, segment));
        },
      },
    });
    previewLifecycleRef.current = lifecycle;
    return () => {
      previewGenerationRef.current += 1;
      disposeAudioClients(additionalAudioClientsRef);
      lifecycle.dispose();
      void previewAudioContextOwner.dispose().catch(() => {
        presentationActions.reportDiagnostic({ code: 'preview-failed' });
      });
      previewLifecycleRef.current = undefined;
    };
  }, [finishOrContinuePreview, presentationActions, previewAudioContextOwner]);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!isRecord(event.data)) return;
      const message = event.data;
      if (message['type'] === 'cut:preview-ready' && isPreviewStreamMessage(message)) {
        if (
          !shouldAcceptPreviewReady(
            message.generation,
            requestedPreviewGenerationRef.current,
            store.getState().isPlaying,
          )
        ) {
          return;
        }
        requestedPreviewGenerationRef.current = undefined;
        preparingPreviewGenerationRef.current = undefined;
        preparedPreviewRef.current = message;
        activatingPreviewGenerationRef.current = undefined;
        waitingPreviewBoundaryRef.current = undefined;
        activatePreparedPreview(message.timelineTimeSeconds);
        return;
      }
      if (message['type'] === 'cut:preview-prepared' && isPreviewStreamMessage(message)) {
        if (
          !shouldAcceptPreviewReady(
            message.generation,
            preparingPreviewGenerationRef.current,
            store.getState().isPlaying,
          )
        ) {
          return;
        }
        preparedPreviewRef.current = message;
        const waitingBoundary = waitingPreviewBoundaryRef.current;
        if (waitingBoundary !== undefined) {
          activatePreparedPreview(waitingBoundary);
        }
        return;
      }
      if (
        message['type'] === 'cut:preview-activated' &&
        typeof message['generation'] === 'number'
      ) {
        const generation = message['generation'];
        const prepared = preparedPreviewRef.current;
        if (
          !store.getState().isPlaying ||
          activatingPreviewGenerationRef.current !== generation ||
          prepared?.generation !== generation
        ) {
          return;
        }
        playbackSegmentRef.current = {
          timelineStartSeconds: prepared.timelineTimeSeconds,
          wallStartMilliseconds: performance.now(),
          segmentEndSeconds: prepared.segmentEndSeconds,
          timelineEndSeconds: prepared.playbackEndSeconds,
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
        preparingPreviewGenerationRef.current = undefined;
        preparedPreviewRef.current = undefined;
        activatingPreviewGenerationRef.current = undefined;
        waitingPreviewBoundaryRef.current = undefined;
        return;
      }
      const accepted = controller.acceptHostMessage(message);
      if (!accepted) return;
      if (message['type'] === 'cut:view' || message['type'] === 'cut:error') {
        playbackSegmentRef.current = undefined;
        requestedPreviewGenerationRef.current = undefined;
        preparingPreviewGenerationRef.current = undefined;
        preparedPreviewRef.current = undefined;
        activatingPreviewGenerationRef.current = undefined;
        waitingPreviewBoundaryRef.current = undefined;
        stopPlaybackClients(previewLifecycleRef, additionalAudioClientsRef, previewGenerationRef);
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
    window.addEventListener('message', receive);
    controller.ready();
    return () => window.removeEventListener('message', receive);
  }, [
    activatePreparedPreview,
    connectPreviewClients,
    controller,
    presentationActions,
    showToast,
    store,
    t,
  ]);

  useEffect(() => {
    volumeRef.current = volume;
    const [primaryGain = 1, ...additionalGains] = audioGainMultipliersRef.current;
    previewLifecycleRef.current?.getSnapshot().audioClient?.setVolume(volume * primaryGain);
    additionalAudioClientsRef.current.forEach((client, index) =>
      client.setVolume(volume * (additionalGains[index] ?? 1)),
    );
  }, [volume]);

  useEffect(() => {
    if (!playing || !view) return;
    const timer = window.setInterval(() => {
      const segment = playbackSegmentRef.current;
      if (!segment) return;
      const primaryAudio = previewLifecycleRef.current?.getSnapshot().audioClient;
      const mediaTimeSeconds =
        primaryAudio?.isClockReady === true
          ? primaryAudio.getCurrentTime()
          : mediaClockTimeSecondsRef.current;
      const advance = advancePreviewPlayback(
        segment,
        performance.now(),
        mediaTimeSeconds,
        store.getState().playheadSeconds,
      );
      if (advance.kind === 'continue') {
        presentationActions.seek(advance.playheadSeconds);
        return;
      }
      finishOrContinuePreview(advance, segment);
    }, 50);
    return () => window.clearInterval(timer);
  }, [finishOrContinuePreview, playing, presentationActions, store, view]);

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

  const stopPreview = () => {
    playbackSegmentRef.current = undefined;
    requestedPreviewGenerationRef.current = undefined;
    preparingPreviewGenerationRef.current = undefined;
    preparedPreviewRef.current = undefined;
    activatingPreviewGenerationRef.current = undefined;
    waitingPreviewBoundaryRef.current = undefined;
    stopPlaybackClients(previewLifecycleRef, additionalAudioClientsRef, previewGenerationRef);
    presentationActions.setPlaying(false);
    if (view) controller.stopPreview();
  };

  const togglePlayback = () => {
    if (playing) {
      stopPreview();
      return;
    }
    if (!view) {
      presentationActions.reportDiagnostic({ code: 'project-not-open' });
      return;
    }
    try {
      previewAudioContextOwner.activateFromUserGesture();
    } catch {
      presentationActions.reportDiagnostic({ code: 'preview-failed' });
      return;
    }
    presentationActions.setPlaying(true);
    playbackSegmentRef.current = undefined;
    preparingPreviewGenerationRef.current = undefined;
    preparedPreviewRef.current = undefined;
    activatingPreviewGenerationRef.current = undefined;
    waitingPreviewBoundaryRef.current = undefined;
    requestedPreviewGenerationRef.current = controller.startPreview(playheadSeconds);
  };

  const seek = (seconds: number) => {
    if (playing) stopPreview();
    presentationActions.seek(clampTimelineTime(seconds, view?.durationSeconds ?? 0));
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
  return (
    <div
      ref={rootRef}
      className="relative h-full bg-vscode-bg"
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
            <section className="cut-basic-upper-workspace" style={{ flex: previewSplit.size }}>
              <div className="cut-basic-preview-region">
                <PreviewPanel
                  ref={previewCanvasRef}
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
            <ResizeHandle
              handleProps={previewResize.handleProps}
              className="cut-basic-preview-resize-handle"
            />
            <section className="cut-basic-timeline-region" style={{ flex: 1 - previewSplit.size }}>
              <Timeline onOpenPackage={linkMediaToSelectedTrack} />
            </section>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface PreviewStreamMessage extends Record<string, unknown> {
  readonly type: 'cut:preview-ready' | 'cut:preview-prepared';
  readonly generation: number;
  readonly videoClipId?: string;
  readonly timelineTimeSeconds: number;
  readonly segmentEndSeconds: number;
  readonly playbackEndSeconds: number;
  readonly mediaSourceTimeSeconds?: number;
  readonly mediaPlaybackRate?: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly videoStreamUrl?: string;
  readonly audioStreamUrls: readonly string[];
  readonly audioGainsDb: readonly number[];
}

function isPreviewStreamMessage(value: Record<string, unknown>): value is PreviewStreamMessage {
  return (
    (value['type'] === 'cut:preview-ready' || value['type'] === 'cut:preview-prepared') &&
    typeof value['generation'] === 'number' &&
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
    (value['videoStreamUrl'] === undefined || typeof value['videoStreamUrl'] === 'string') &&
    Array.isArray(value['audioStreamUrls']) &&
    value['audioStreamUrls'].every((streamUrl) => typeof streamUrl === 'string') &&
    Array.isArray(value['audioGainsDb']) &&
    value['audioGainsDb'].length === value['audioStreamUrls'].length &&
    value['audioGainsDb'].every((gain) => typeof gain === 'number' && Number.isFinite(gain))
  );
}

function dbToLinearGain(gainDb: number): number {
  return 10 ** (gainDb / 20);
}

function isExportTaskSnapshot(value: unknown): value is CutExportTaskSnapshot {
  const valid =
    isRecord(value) &&
    typeof value['jobId'] === 'string' &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['sourceRevision'] === 'number' &&
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
  lifecycleRef: MutableRefObject<EngineAvStreamLifecycle | undefined>,
  audioClientsRef: MutableRefObject<readonly AudioStreamClient[]>,
  generationRef: MutableRefObject<number>,
): void {
  generationRef.current += 1;
  disposeAudioClients(audioClientsRef);
  lifecycleRef.current?.stop();
}

function disposeAudioClients(
  audioClientsRef: MutableRefObject<readonly AudioStreamClient[]>,
): void {
  const clients = audioClientsRef.current;
  audioClientsRef.current = [];
  for (const client of clients) client.dispose();
}

function requestFullscreen(onError: () => void): void {
  const operation = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  operation.catch(onError);
}

export default App;
