import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type {
  CutCommand,
  CutExportTaskSnapshot,
  TimelineClipView,
  TimelineView,
} from '@neko-cut/domain';
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
import { clampTimelineTime } from './components/Timeline/timelineMath';
import { collectIndependentClipIds } from './components/Timeline/timelineSelection';
import { useTranslation } from './i18n/I18nContext';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  advancePreviewPlayback,
  finishPreviewPlaybackSegment,
  type PreviewPlaybackAdvance,
  type PreviewPlaybackSegment,
} from './previewPlayback';
import { useCutOtioController } from './controllers/CutOtioControllerContext';
import {
  useCutPresentationStore,
  useCutPresentationStoreApi,
} from './stores/cut-presentation-store';

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewLifecycleRef = useRef<EngineAvStreamLifecycle>();
  const additionalAudioClientsRef = useRef<readonly AudioStreamClient[]>([]);
  const audioGainMultipliersRef = useRef<readonly number[]>([]);
  const previewGenerationRef = useRef(0);
  const playbackSegmentRef = useRef<PreviewPlaybackSegment>();
  const volumeRef = useRef(1);
  const { isKeyboardFocused } = useFocusedWebviewRoot(rootRef);
  const { t } = useTranslation();
  const store = useCutPresentationStoreApi();
  const view = useCutPresentationStore((state) => state.view);
  const selection = useCutPresentationStore((state) => state.selection);
  const selectedClips = useCutPresentationStore((state) => state.selectedClips);
  const clipboard = useCutPresentationStore((state) => state.clipboard);
  const playheadSeconds = useCutPresentationStore((state) => state.playheadSeconds);
  const playing = useCutPresentationStore((state) => state.isPlaying);
  const volume = useCutPresentationStore((state) => (state.previewMuted ? 0 : state.previewVolume));
  const previewMuted = useCutPresentationStore((state) => state.previewMuted);
  const error = useCutPresentationStore((state) => state.diagnostic);
  const presentationActions = useCutPresentationStore((state) => state.actions);
  const selectedClipId = selection?.kind === 'clip' ? selection.clipId : undefined;
  const selectedGap =
    selection?.kind === 'gap'
      ? { trackId: selection.trackId, itemIndex: selection.itemIndex }
      : undefined;
  const [notice, setNotice] = useState<string>();
  const controller = useCutOtioController();
  const previewSplit = usePersistedResize('cut.previewTimelineSplit', 0.5, {
    minSize: 0.2,
    maxSize: 0.8,
  });
  const inspectorLayout = usePersistedResize('cut.inspector', 280, { minSize: 200, maxSize: 400 });
  const previewResize = useResizable<HTMLDivElement>({
    edge: 'top',
    mode: 'ratio',
    size: previewSplit.size,
    minSize: 0.2,
    maxSize: 0.8,
    onSizeChange: previewSplit.setSize,
  });
  const inspectorResize = useResizable<HTMLElement>({
    edge: 'left',
    mode: 'pixel',
    size: inspectorLayout.size,
    minSize: 200,
    maxSize: 400,
    disabled: inspectorLayout.collapsed,
    onSizeChange: inspectorLayout.setSize,
  });

  const drawPreviewFrame = useCallback((frame: VideoFrame) => {
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

  const finishOrContinuePreview = useCallback(
    (
      advance: Exclude<PreviewPlaybackAdvance, { kind: 'continue' }>,
      segment: PreviewPlaybackSegment,
    ) => {
      if (playbackSegmentRef.current !== segment) return;
      playbackSegmentRef.current = undefined;
      stopPlaybackClients(previewLifecycleRef, additionalAudioClientsRef, previewGenerationRef);
      presentationActions.seek(advance.playheadSeconds);
      if (advance.kind === 'segment-boundary') {
        controller.startPreview(advance.playheadSeconds);
        return;
      }
      presentationActions.setPlaying(false);
    },
    [controller, presentationActions],
  );

  useEffect(() => {
    const lifecycle = new EngineAvStreamLifecycle({
      callbacks: {
        onError: (streamError) => {
          presentationActions.setPlaying(false);
          presentationActions.reportDiagnostic(streamError.message);
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
      previewLifecycleRef.current = undefined;
    };
  }, [finishOrContinuePreview, presentationActions]);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!isRecord(event.data)) return;
      const message = event.data;
      if (message['type'] === 'cut:preview-ready' && isPreviewReadyMessage(message)) {
        const canvas = previewCanvasRef.current;
        if (canvas) {
          if (!message.videoStreamUrl) {
            const context = canvas.getContext('2d');
            if (context) {
              context.fillStyle = '#000000';
              context.fillRect(0, 0, canvas.width, canvas.height);
            }
          }
        }
        const lifecycle = previewLifecycleRef.current;
        if (!lifecycle) throw new Error('Cut preview lifecycle is unavailable.');
        disposeAudioClients(additionalAudioClientsRef);
        const generation = previewGenerationRef.current + 1;
        previewGenerationRef.current = generation;
        playbackSegmentRef.current = {
          timelineStartSeconds: message.timelineTimeSeconds,
          wallStartMilliseconds: performance.now(),
          segmentEndSeconds: message.segmentEndSeconds,
          timelineEndSeconds: store.getState().view?.durationSeconds ?? message.segmentEndSeconds,
        };
        const [primaryAudioStreamUrl, ...additionalAudioStreamUrls] = message.audioStreamUrls;
        audioGainMultipliersRef.current = message.audioGainsDb.map(dbToLinearGain);
        const [primaryGain = 1, ...additionalGains] = audioGainMultipliersRef.current;
        void (async () => {
          const snapshot = await lifecycle.start({
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
          });
          if (previewGenerationRef.current !== generation) return;
          const audioContext = snapshot.audioClient?.getAudioContext() ?? undefined;
          const additionalClients = additionalAudioStreamUrls.map(
            (websocketUrl, index) =>
              new AudioStreamClient({
                websocketUrl,
                volume: volumeRef.current * (additionalGains[index] ?? 1),
                onError: (streamError) => {
                  if (previewGenerationRef.current === generation) {
                    presentationActions.setPlaying(false);
                    presentationActions.reportDiagnostic(streamError.message);
                  }
                },
              }),
          );
          additionalAudioClientsRef.current = additionalClients;
          try {
            await Promise.all(additionalClients.map((client) => client.connect(audioContext)));
          } catch (streamError) {
            if (previewGenerationRef.current === generation) {
              disposeAudioClients(additionalAudioClientsRef);
              lifecycle.stop();
            }
            throw streamError;
          }
        })().catch((streamError: unknown) => {
          if (previewGenerationRef.current === generation) {
            presentationActions.setPlaying(false);
            presentationActions.reportDiagnostic(
              streamError instanceof Error ? streamError.message : String(streamError),
            );
          }
        });
        return;
      }
      const accepted = controller.acceptHostMessage(message);
      if (!accepted) return;
      if (message['type'] === 'cut:view' || message['type'] === 'cut:error') {
        stopPlaybackClients(previewLifecycleRef, additionalAudioClientsRef, previewGenerationRef);
      }
      if (message['type'] === 'cut:export-task' && isExportTaskSnapshot(message['task'])) {
        const task = message['task'];
        if (task.status === 'completed') setNotice(task.outputWorkspaceRelativePath);
        if (task.status === 'failed') {
          presentationActions.reportDiagnostic(task.error ?? 'Cut export failed.');
        }
      }
    };
    window.addEventListener('message', receive);
    controller.ready();
    return () => window.removeEventListener('message', receive);
  }, [controller, drawPreviewFrame, presentationActions, store]);

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
      const advance = advancePreviewPlayback(segment, performance.now());
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
    if (selectedGap) return view?.tracks.find((track) => track.trackId === selectedGap.trackId);
    return view?.tracks.find((track) =>
      track.items.some((item) => item.kind === 'clip' && item.clipId === selectedClipId),
    );
  }, [selectedClipId, selectedGap, view]);
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
    const targetTrackId = selectedTrack?.trackId ?? videoTrackId;
    if (!targetTrackId) throw new Error('Cut timeline does not contain a target Track.');
    controller.selectLinkMedia(targetTrackId);
  };

  const stopPreview = () => {
    playbackSegmentRef.current = undefined;
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
      presentationActions.reportDiagnostic(t('timeline.basic.selectClip'));
      return;
    }
    presentationActions.setPlaying(true);
    playbackSegmentRef.current = undefined;
    controller.startPreview(playheadSeconds);
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
                {error ? (
                  <div className="cut-basic-error" role="alert">
                    {error}
                  </div>
                ) : null}
                {notice ? (
                  <div className="cut-basic-notice">
                    {t('timeline.basic.exportComplete')} {notice}
                  </div>
                ) : null}
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
                  onFullscreen={() => requestFullscreen(t('timeline.basic.fullscreenError'))}
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

interface PreviewReadyMessage extends Record<string, unknown> {
  readonly type: 'cut:preview-ready';
  readonly videoClipId?: string;
  readonly timelineTimeSeconds: number;
  readonly segmentEndSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly videoStreamUrl?: string;
  readonly audioStreamUrls: readonly string[];
  readonly audioGainsDb: readonly number[];
}

function isPreviewReadyMessage(value: Record<string, unknown>): value is PreviewReadyMessage {
  return (
    value['type'] === 'cut:preview-ready' &&
    (value['videoClipId'] === undefined || typeof value['videoClipId'] === 'string') &&
    typeof value['timelineTimeSeconds'] === 'number' &&
    typeof value['segmentEndSeconds'] === 'number' &&
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
  return (
    isRecord(value) &&
    typeof value['jobId'] === 'string' &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['sourceRevision'] === 'number' &&
    typeof value['outputWorkspaceRelativePath'] === 'string' &&
    (value['status'] === 'running' ||
      value['status'] === 'completed' ||
      value['status'] === 'failed' ||
      value['status'] === 'cancelled') &&
    typeof value['startedAt'] === 'number'
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

function requestFullscreen(errorFallback: string): void {
  const operation = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  operation.catch((error: unknown) => {
    window.alert(error instanceof Error ? error.message : errorFallback);
  });
}

export default App;
