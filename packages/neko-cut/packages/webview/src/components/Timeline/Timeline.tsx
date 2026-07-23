import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CutCommand, TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
import { SendIcon } from '@neko/ui/icons';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { useToast } from '../Toast';
import { useCutOtioController } from '../../controllers/CutOtioControllerContext';
import { useClipRepresentations } from '../../hooks/useClipRepresentations';
import { useTimelineContextMenu } from '../../hooks/useTimelineContextMenu';
import { useTrackNameEditing } from '../../hooks/useTrackNameEditing';
import { useTrackReordering } from '../../hooks/useTrackReordering';
import { useTranslation } from '../../i18n/I18nContext';
import {
  useCutPresentationStore,
  type CutPresentationSelection,
} from '../../stores/cut-presentation-store';
import { readDroppedMediaUris } from './droppedMedia';
import { ExportPanel } from './export';
import { TimelineControls } from './TimelineControls';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelineRuler } from './TimelineRuler';
import {
  TimelineTrack,
  type TimelineClipLayoutDraft,
  type TimelineClipPointerMode,
} from './TimelineTrack';
import { createTimelineClipMenuItems } from './timelineContextMenu';
import {
  buildTimelinePointerDragPreview,
  readTimelineEdgeScrollDelta,
  type TimelinePointerDragPreview,
} from './pointerDrag';
import {
  quantizeTimelineDelta,
  readClipTrimCapacity,
  retainTimelineCanvasDuration,
  TRACK_HEADER_WIDTH,
} from './timelineMath';
import { nextPlayheadFollowScrollLeft } from './playheadFollow';
import {
  collectClipSelectionsInBox,
  collectIndependentClipIds,
  collectLinkedClipIds,
  collectSelectedClipLayouts,
  orderClipLayoutsForMove,
} from './timelineSelection';

export interface TimelineProps {
  readonly onOpenPackage: () => void;
}

interface DragUi {
  readonly layout: TimelineClipLayoutDraft;
  readonly targetTrackId?: string;
  readonly targetSeconds?: number;
  readonly placement?: TimelinePointerDragPreview;
  readonly trimStartDeltaSeconds?: number;
  readonly trimEndDeltaSeconds?: number;
}

interface SelectionBoxUi {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function Timeline(props: TimelineProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const controller = useCutOtioController();
  const view = useCutPresentationStore((state) => state.view);
  const selection = useCutPresentationStore((state) => state.selection);
  const selectedClips = useCutPresentationStore((state) => state.selectedClips);
  const clipboard = useCutPresentationStore((state) => state.clipboard);
  const playheadSeconds = useCutPresentationStore((state) => state.playheadSeconds);
  const pixelsPerSecond = useCutPresentationStore((state) => state.pixelsPerSecond);
  const snappingEnabled = useCutPresentationStore((state) => state.snappingEnabled);
  const overviewVisible = useCutPresentationStore((state) => state.overviewVisible);
  const actions = useCutPresentationStore((state) => state.actions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasDurationRef = useRef<{ readonly sessionKey: string; readonly duration: number }>();
  const suppressTimelineClickRef = useRef(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [dragUi, setDragUi] = useState<DragUi>();
  const [selectionBoxUi, setSelectionBoxUi] = useState<SelectionBoxUi>();
  const representations = useClipRepresentations({ view, pixelsPerSecond, timelineRef: scrollRef });
  const sessionKey = view ? `${view.documentUri}\0${view.sessionId}` : '';
  const previousCanvasDuration =
    canvasDurationRef.current?.sessionKey === sessionKey
      ? canvasDurationRef.current.duration
      : undefined;
  const duration = retainTimelineCanvasDuration(previousCanvasDuration, view?.durationSeconds ?? 0);
  canvasDurationRef.current = { sessionKey, duration };
  const timelineWidth = Math.max(duration * pixelsPerSecond, 800);
  const rate = view?.profile
    ? view.profile.editRateNumerator / view.profile.editRateDenominator
    : 30;
  const frameSeconds = 1 / rate;
  const selectedClip = findSelectedClip(view?.tracks, selection);
  const selectedClipIds = useMemo(
    () => new Set(selectedClips.map(({ clipId }) => clipId)),
    [selectedClips],
  );
  const canSplit = Boolean(
    selectedClip &&
    playheadSeconds > selectedClip.startSeconds &&
    playheadSeconds < selectedClip.startSeconds + selectedClip.durationSeconds,
  );
  const audioTrackCount = view?.tracks.filter((track) => track.kind === 'Audio').length ?? 0;
  const subtitleTrackCount = view?.tracks.filter((track) => track.kind === 'Subtitle').length ?? 0;
  const trackNameEditing = useTrackNameEditing({
    onRename: (trackId, name) => controller.command({ type: 'rename-track', trackId, name }),
  });
  const trackReordering = useTrackReordering({
    onReorder: (trackId, toIndex) => controller.command({ type: 'move-track', trackId, toIndex }),
  });

  const splitClip = useCallback(
    (clip: TimelineClipView) => {
      const offsetFrames = Math.round((playheadSeconds - clip.startSeconds) * rate);
      if (offsetFrames > 0 && offsetFrames < Math.round(clip.durationSeconds * rate)) {
        controller.split(clip.clipId, offsetFrames);
      }
    },
    [controller, playheadSeconds, rate],
  );
  const removeClip = useCallback(
    (clip: TimelineClipView) => controller.command({ type: 'ripple-delete', clipId: clip.clipId }),
    [controller],
  );
  const setMuted = useCallback(
    (clip: TimelineClipView, muted: boolean) =>
      controller.command({
        type: 'set-audio',
        clipId: clip.clipId,
        settings: { ...clip.audio, muted },
      }),
    [controller],
  );
  const selectedIndependentClipIds = useMemo(
    () =>
      collectIndependentClipIds(
        view,
        selectedClips.map(({ clipId }) => clipId),
      ),
    [selectedClips, view],
  );
  const selectedMovableClipIds = useMemo(
    () =>
      collectLinkedClipIds(
        view,
        selectedClips.map(({ clipId }) => clipId),
      ),
    [selectedClips, view],
  );
  const removeSelectedClips = useCallback(() => {
    if (selectedIndependentClipIds.length === 0) return;
    controller.batch(
      selectedIndependentClipIds.map((clipId) => ({ type: 'ripple-delete', clipId })),
    );
  }, [controller, selectedIndependentClipIds]);

  const createClipItems = useCallback(
    (track: TimelineTrackView, clip: TimelineClipView) =>
      createTimelineClipMenuItems({
        track,
        clip,
        playheadSeconds,
        labels: {
          split: t('timeline.controls.split'),
          copy: t('timeline.contextMenu.copy'),
          duplicate: t('timeline.contextMenu.duplicate'),
          enable: t('timeline.contextMenu.show'),
          disable: t('timeline.contextMenu.hide'),
          lock: t('timeline.clip.lock'),
          unlock: t('timeline.clip.unlock'),
          mute: t('timeline.contextMenu.mute'),
          unmute: t('timeline.contextMenu.unmute'),
          separateAudio: t('timeline.contextMenu.separateAudio'),
          unseparateAudio: t('timeline.contextMenu.unseparateAudio'),
          sendToAgent: t('timeline.contextMenu.sendToAgent'),
          deleteClip: t('timeline.contextMenu.delete'),
        },
        icons: { sendToAgent: <SendIcon size={14} /> },
        actions: {
          split: splitClip,
          copy: () => actions.copySelection(),
          duplicate: (candidate) =>
            controller.duplicate(
              selectedClipIds.has(candidate.clipId) ? selectedIndependentClipIds : candidate.clipId,
            ),
          setEnabled: (candidate, enabled) =>
            controller.command({
              type: 'set-clip-enabled',
              clipId: candidate.clipId,
              enabled,
            }),
          setLocked: (candidate, locked) =>
            controller.command({
              type: 'set-clip-locked',
              clipId: candidate.clipId,
              locked,
            }),
          setMuted,
          separateAudio: (candidate) => controller.separateAudio(candidate.clipId),
          unseparateAudio: (candidate) =>
            controller.command({ type: 'unseparate-audio', videoClipId: candidate.clipId }),
          sendToAgent: (candidate) =>
            controller.sendToAgent({
              kind: 'clip',
              trackId: track.trackId,
              clipId: candidate.clipId,
            }),
          deleteClip: (candidate) => {
            if (selectedClipIds.has(candidate.clipId)) {
              removeSelectedClips();
            } else {
              removeClip(candidate);
            }
          },
        },
      }),
    [
      actions,
      controller,
      playheadSeconds,
      removeClip,
      removeSelectedClips,
      selectedClipIds,
      selectedIndependentClipIds,
      setMuted,
      splitClip,
      t,
    ],
  );
  const createBackgroundItems = useCallback(
    (): MenuItem[] => [
      {
        label: t('timeline.contextMenu.paste'),
        shortcut: 'Cmd+V',
        disabled: !clipboard,
        onClick: () => clipboard && controller.paste(clipboard, playheadSeconds),
      },
      { label: '', separator: true, onClick: () => undefined },
      { label: t('timeline.controls.mediaTrack'), onClick: props.onOpenPackage },
      {
        label: t('timeline.controls.audioTrack'),
        disabled: audioTrackCount >= 3,
        onClick: () => controller.addTrack('Audio'),
      },
      {
        label: t('timeline.controls.subtitleTrack'),
        disabled: subtitleTrackCount >= 1,
        onClick: () => controller.addTrack('Subtitle'),
      },
      { label: '', separator: true, onClick: () => undefined },
      { label: t('timeline.controls.snapping'), onClick: actions.toggleSnapping },
    ],
    [
      actions.toggleSnapping,
      audioTrackCount,
      clipboard,
      controller,
      playheadSeconds,
      props.onOpenPackage,
      subtitleTrackCount,
      t,
    ],
  );
  const createGapItems = useCallback(
    (track: TimelineTrackView, itemIndex: number): MenuItem[] => [
      {
        label: t('timeline.contextMenu.delete'),
        danger: true,
        disabled: track.locked,
        onClick: () =>
          controller.command({ type: 'remove-gap', trackId: track.trackId, itemIndex }),
      },
    ],
    [controller, t],
  );
  const createTrackItems = useCallback(
    (track: TimelineTrackView): MenuItem[] => [
      {
        label: t('timeline.contextMenu.addMedia'),
        disabled: track.locked,
        onClick: () => controller.selectLinkMedia(track.trackId),
      },
      { label: '', separator: true, onClick: () => undefined },
      {
        label: t('timeline.contextMenu.copy'),
        shortcut: 'Cmd+C',
        onClick: () => actions.copySelection(),
      },
      {
        label: t('timeline.contextMenu.renameTrack'),
        disabled: track.locked,
        onClick: () => trackNameEditing.begin(track),
      },
      {
        label: track.enabled ? t('timeline.track.hide') : t('timeline.track.show'),
        onClick: () =>
          controller.command({
            type: 'set-track-enabled',
            trackId: track.trackId,
            enabled: !track.enabled,
          }),
      },
      ...(track.kind === 'Subtitle'
        ? []
        : [
            {
              label: track.audioMuted
                ? t('timeline.contextMenu.unmuteTrack')
                : t('timeline.contextMenu.muteTrack'),
              onClick: () =>
                controller.command({
                  type: 'set-track-muted' as const,
                  trackId: track.trackId,
                  muted: !track.audioMuted,
                }),
            },
          ]),
      {
        label: track.locked ? t('timeline.track.unlock') : t('timeline.track.lock'),
        onClick: () =>
          controller.command({
            type: 'set-track-locked',
            trackId: track.trackId,
            locked: !track.locked,
          }),
      },
      { label: '', separator: true, onClick: () => undefined },
      {
        label: t('timeline.contextMenu.sendToAgent'),
        icon: <SendIcon size={14} />,
        onClick: () => controller.sendToAgent({ kind: 'track', trackId: track.trackId }),
      },
      { label: '', separator: true, onClick: () => undefined },
      {
        label: t('timeline.contextMenu.deleteTrack'),
        disabled: track.kind === 'Video' || track.locked,
        danger: true,
        onClick: () => controller.command({ type: 'remove-track', trackId: track.trackId }),
      },
    ],
    [actions, controller, t, trackNameEditing.begin],
  );
  const contextMenu = useTimelineContextMenu({
    onSelect: (clipId, trackId) => {
      if (!selectedClipIds.has(clipId)) {
        actions.select({ kind: 'clip', clipId, trackId });
      }
    },
    onSelectGap: (trackId, itemIndex) => actions.select({ kind: 'gap', trackId, itemIndex }),
    onSelectTrack: (trackId) => actions.select({ kind: 'track', trackId }),
    onSelectBackground: () => actions.select(undefined),
    createClipItems,
    createGapItems,
    createTrackItems,
    createBackgroundItems,
  });

  const handleClipPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      track: TimelineTrackView,
      itemIndex: number,
      clip: TimelineClipView,
      mode: TimelineClipPointerMode,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!additive && !selectedClipIds.has(clip.clipId)) {
        actions.select({ kind: 'clip', trackId: track.trackId, clipId: clip.clipId });
      }
      const target = event.currentTarget;
      const startClientX = event.clientX;
      const clipRect = target.closest('.cut-basic-clip')?.getBoundingClientRect();
      const grabOffsetSeconds =
        mode === 'place' && clipRect
          ? Math.max(0, event.clientX - clipRect.left) / pixelsPerSecond
          : 0;
      const source = {
        clipId: clip.clipId,
        trackId: track.trackId,
        trackKind: track.kind,
        itemIndex,
      };
      const snapTargets = collectSnapTargets(view?.tracks, clip.clipId);
      let latest: DragUi = {
        layout: {
          clipId: clip.clipId,
          trackId: track.trackId,
          startSeconds: clip.startSeconds,
          durationSeconds: clip.durationSeconds,
        },
      };
      let ended = false;
      target.setPointerCapture(event.pointerId);

      const update = (pointer: PointerEvent) => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const edgeDelta = readTimelineEdgeScrollDelta({
          clientX: pointer.clientX,
          viewportLeft: scroller.getBoundingClientRect().left + TRACK_HEADER_WIDTH,
          viewportRight: scroller.getBoundingClientRect().right,
        });
        if (edgeDelta !== 0) scroller.scrollLeft += edgeDelta;
        if (mode !== 'place') {
          const rawDelta = (pointer.clientX - startClientX) / pixelsPerSecond;
          const trimCapacity = readClipTrimCapacity(clip);
          if (mode === 'trim-start') {
            const delta = Math.min(
              clip.durationSeconds - frameSeconds,
              Math.max(
                -trimCapacity.startExtensionSeconds,
                quantizeTimelineDelta(rawDelta, frameSeconds),
              ),
            );
            latest = {
              layout: { ...latest.layout, durationSeconds: clip.durationSeconds - delta },
              trimStartDeltaSeconds: delta,
            };
          } else {
            const delta = Math.min(
              clip.durationSeconds - frameSeconds,
              Math.max(
                -trimCapacity.endExtensionSeconds,
                quantizeTimelineDelta(-rawDelta, frameSeconds),
              ),
            );
            latest = {
              layout: { ...latest.layout, durationSeconds: clip.durationSeconds - delta },
              trimEndDeltaSeconds: delta,
            };
          }
          setDragUi(latest);
          return;
        }
        const hovered = document
          .elementFromPoint(pointer.clientX, pointer.clientY)
          ?.closest<HTMLElement>('[data-cut-track-id]');
        const targetTrack =
          view?.tracks.find((candidate) => candidate.trackId === hovered?.dataset['cutTrackId']) ??
          track;
        const contentLeft = hovered
          ? hovered.getBoundingClientRect().left + TRACK_HEADER_WIDTH
          : scroller.getBoundingClientRect().left + TRACK_HEADER_WIDTH - scroller.scrollLeft;
        const placement = buildTimelinePointerDragPreview({
          source,
          targetTrack,
          clientX: pointer.clientX,
          contentLeft,
          grabOffsetSeconds,
          pixelsPerSecond,
          duration: Math.max(duration + 30, view?.durationSeconds ?? 0),
          frameSeconds,
          snapTargets: snappingEnabled ? snapTargets : [],
        });
        latest = {
          layout: {
            ...latest.layout,
            startSeconds: placement.pointerTimeSeconds,
            trackId: targetTrack.trackId,
          },
          targetTrackId: targetTrack.trackId,
          targetSeconds: placement.pointerTimeSeconds,
          placement,
        };
        setDragUi(latest);
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', update, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', cancel, true);
        window.removeEventListener('blur', cancel, true);
        document.removeEventListener('visibilitychange', visibility, true);
        target.removeEventListener('lostpointercapture', cancel, true);
        setDragUi(undefined);
      };
      const cancel = () => {
        if (ended) return;
        ended = true;
        cleanup();
      };
      const visibility = () => {
        if (document.visibilityState !== 'visible') cancel();
      };
      const finish = () => {
        if (ended) return;
        ended = true;
        cleanup();
        if (latest.placement?.compatible) {
          const moving = selectedClipIds.has(clip.clipId)
            ? collectSelectedClipLayouts(view, selectedMovableClipIds)
            : [{ clipId: clip.clipId, trackId: track.trackId, startSeconds: clip.startSeconds }];
          const deltaSeconds = latest.placement.pointerTimeSeconds - clip.startSeconds;
          const ordered = orderClipLayoutsForMove(moving, deltaSeconds);
          const commands: CutCommand[] = ordered.map((candidate) => ({
            type: 'place-clip',
            clipId: candidate.clipId,
            toTrackId: moving.length === 1 ? latest.placement!.targetTrackId : candidate.trackId,
            timelineStartFrames: Math.max(
              0,
              Math.round((candidate.startSeconds + deltaSeconds) / frameSeconds),
            ),
            rate,
            overlapPolicy: 'insert',
          }));
          if (commands.length === 1) {
            controller.command(commands[0]!);
          } else {
            controller.batch(commands);
          }
          return;
        }
        const startDeltaFrames = Math.round((latest.trimStartDeltaSeconds ?? 0) * rate);
        const endDeltaFrames = Math.round((latest.trimEndDeltaSeconds ?? 0) * rate);
        if (startDeltaFrames !== 0 || endDeltaFrames !== 0) {
          controller.command({
            type: 'trim',
            clipId: clip.clipId,
            startDeltaFrames,
            endDeltaFrames,
          });
        }
      };
      window.addEventListener('pointermove', update, true);
      window.addEventListener('pointerup', finish, true);
      window.addEventListener('pointercancel', cancel, true);
      window.addEventListener('blur', cancel, true);
      document.addEventListener('visibilitychange', visibility, true);
      target.addEventListener('lostpointercapture', cancel, true);
    },
    [
      actions,
      controller,
      duration,
      frameSeconds,
      pixelsPerSecond,
      rate,
      selectedClipIds,
      selectedIndependentClipIds,
      selectedMovableClipIds,
      snappingEnabled,
      view,
    ],
  );

  const seekFromTimeline = (event: React.MouseEvent) => {
    if (suppressTimelineClickRef.current) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.cut-basic-clip,.cut-basic-track-header,button')) return;
    const row = event.target.closest<HTMLElement>('.cut-basic-track-row');
    const scroller = scrollRef.current;
    if (!row || !scroller) return;
    const seconds =
      (event.clientX - row.getBoundingClientRect().left - TRACK_HEADER_WIDTH) / pixelsPerSecond;
    actions.seek(Math.max(0, Math.min(view?.durationSeconds ?? 0, seconds)));
  };
  const dropMedia = (event: React.DragEvent) => {
    event.preventDefault();
    if (!(event.target instanceof HTMLElement)) return;
    const row = event.target.closest<HTMLElement>('[data-cut-track-id]');
    const trackId = row?.dataset['cutTrackId'];
    const uris = readDroppedMediaUris(event.dataTransfer);
    if (!trackId || uris.length === 0) {
      showToast(t('timeline.dropMediaHere'), 'error');
      return;
    }
    controller.dropLinkMedia(trackId, uris);
  };
  const fitAll = () => {
    const scroller = scrollRef.current;
    if (!scroller || !view) return;
    actions.setPixelsPerSecond(
      Math.max(
        12,
        (scroller.clientWidth - TRACK_HEADER_WIDTH - 24) / Math.max(1, view.durationSeconds),
      ),
    );
    scroller.scrollLeft = 0;
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = nextPlayheadFollowScrollLeft({
      playheadPixels: TRACK_HEADER_WIDTH + playheadSeconds * pixelsPerSecond,
      scrollLeft: scroller.scrollLeft,
      viewportWidth: scroller.clientWidth,
    });
  }, [pixelsPerSecond, playheadSeconds]);

  const beginBoxSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!view || !(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.cut-basic-clip,.cut-basic-track-header,button')) return;
    const startTrack = event.target.closest<HTMLElement>('[data-cut-track-id]');
    const startTrackIndex = view.tracks.findIndex(
      (track) => track.trackId === startTrack?.dataset['cutTrackId'],
    );
    if (startTrackIndex < 0) return;
    const target = event.currentTarget;
    const trackList = target.querySelector<HTMLElement>('.cut-basic-track-list');
    if (!trackList) return;
    const rect = trackList.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    const startSeconds = Math.max(0, (startX - TRACK_HEADER_WIDTH) / pixelsPerSecond);
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    let moved = false;
    const update = (pointer: PointerEvent) => {
      const currentX = pointer.clientX - rect.left;
      const currentY = pointer.clientY - rect.top;
      moved ||= Math.abs(currentX - startX) > 3 || Math.abs(currentY - startY) > 3;
      if (!moved) return;
      setSelectionBoxUi({
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      });
    };
    const finish = (pointer: PointerEvent) => {
      cleanup();
      if (!moved) return;
      suppressTimelineClickRef.current = true;
      window.queueMicrotask(() => {
        suppressTimelineClickRef.current = false;
      });
      const endX = pointer.clientX - rect.left;
      const endTrack = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest<HTMLElement>('[data-cut-track-id]');
      const endTrackIndex = view.tracks.findIndex(
        (track) => track.trackId === endTrack?.dataset['cutTrackId'],
      );
      const selections = collectClipSelectionsInBox(view, {
        leftSeconds: startSeconds,
        rightSeconds: Math.max(0, (endX - TRACK_HEADER_WIDTH) / pixelsPerSecond),
        topTrackIndex: startTrackIndex,
        bottomTrackIndex: endTrackIndex < 0 ? startTrackIndex : endTrackIndex,
      });
      actions.selectManyClips(selections, additive ? 'add' : 'replace');
    };
    const cancel = () => cleanup();
    const cleanup = () => {
      window.removeEventListener('pointermove', update, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', cancel, true);
      setSelectionBoxUi(undefined);
    };
    window.addEventListener('pointermove', update, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', cancel, true);
  };

  return (
    <div className="cut-basic-timeline">
      <TimelineControls
        canAddAudioTrack={audioTrackCount < 3}
        canAddSubtitleTrack={subtitleTrackCount < 1}
        canSplit={canSplit}
        hasSelection={selectedClips.length > 0}
        onAddAudioTrack={() => controller.addTrack('Audio')}
        onAddSubtitleTrack={() => controller.addTrack('Subtitle')}
        onDelete={removeSelectedClips}
        onExport={() => {
          controller.queryExportTasks();
          setShowExportPanel(true);
        }}
        onFitAll={fitAll}
        onLinkMedia={props.onOpenPackage}
        onPixelsPerSecond={actions.setPixelsPerSecond}
        onRedo={() => controller.redo()}
        onSplit={() => selectedClip && splitClip(selectedClip)}
        onToggleOverview={() => actions.setOverviewVisible(!overviewVisible)}
        onToggleSnapping={actions.toggleSnapping}
        onUndo={() => controller.undo()}
        overviewVisible={overviewVisible}
        pixelsPerSecond={pixelsPerSecond}
        snappingEnabled={snappingEnabled}
      />
      {view && overviewVisible ? (
        <TimelineMinimap scrollRef={scrollRef} timelineDurationSeconds={duration} view={view} />
      ) : null}
      <div
        className="cut-basic-timeline-scroll"
        onContextMenu={contextMenu.handleTimelineContextMenu}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropMedia}
        onPointerDown={beginBoxSelection}
        ref={scrollRef}
      >
        <TimelineRuler
          onSeek={actions.seek}
          pixelsPerSecond={pixelsPerSecond}
          totalDuration={duration}
        />
        <div
          className="cut-basic-track-list"
          onClick={seekFromTimeline}
          style={{ width: timelineWidth + TRACK_HEADER_WIDTH }}
        >
          {view?.tracks.map((track, trackIndex) => (
            <TimelineTrack
              dragTargetSeconds={
                dragUi?.targetTrackId === track.trackId ? dragUi.targetSeconds : undefined
              }
              dragOver={trackReordering.dragOverTrackIndex === trackIndex}
              editingTrackName={
                trackNameEditing.editingTrackId === track.trackId
                  ? trackNameEditing.editingTrackName
                  : undefined
              }
              key={track.trackId}
              layoutDraft={dragUi?.layout}
              onClipContextMenu={contextMenu.handleClipContextMenu}
              onGapContextMenu={contextMenu.handleGapContextMenu}
              onClipPointerDown={handleClipPointerDown}
              onBeginTrackRename={trackNameEditing.begin}
              onCancelTrackRename={trackNameEditing.cancel}
              onChangeTrackName={trackNameEditing.setEditingTrackName}
              onToggleClipMute={(clip) => setMuted(clip, !clip.audio.muted)}
              onToggleTrackEnabled={(candidate) =>
                controller.command({
                  type: 'set-track-enabled',
                  trackId: candidate.trackId,
                  enabled: !candidate.enabled,
                })
              }
              onToggleTrackLock={(candidate) =>
                controller.command({
                  type: 'set-track-locked',
                  trackId: candidate.trackId,
                  locked: !candidate.locked,
                })
              }
              onToggleTrackMute={(candidate) =>
                controller.command({
                  type: 'set-track-muted',
                  trackId: candidate.trackId,
                  muted: !candidate.audioMuted,
                })
              }
              onRemoveTrack={(candidate) =>
                controller.command({
                  type: 'remove-track',
                  trackId: candidate.trackId,
                })
              }
              onSelectClip={(trackId, clipId, additive) =>
                actions.select({ kind: 'clip', trackId, clipId }, additive ? 'toggle' : 'replace')
              }
              onSelectGap={(trackId, itemIndex) =>
                actions.select({ kind: 'gap', trackId, itemIndex })
              }
              onSelectTrack={(trackId) => {
                if (!suppressTimelineClickRef.current) {
                  actions.select({ kind: 'track', trackId });
                }
              }}
              onSaveTrackName={trackNameEditing.save}
              onTrackDragEnd={trackReordering.end}
              onTrackDragOver={trackReordering.over}
              onTrackDragStart={trackReordering.start}
              onTrackDrop={trackReordering.drop}
              onTrackContextMenu={contextMenu.handleTrackContextMenu}
              pixelsPerSecond={pixelsPerSecond}
              representations={representations}
              selectedClipIds={selectedClipIds}
              timelineWidth={timelineWidth}
              track={track}
              trackNameInputRef={trackNameEditing.trackNameInputRef}
              stackIndex={trackIndex}
            />
          ))}
          <div
            className="cut-basic-playhead"
            style={{ left: TRACK_HEADER_WIDTH + playheadSeconds * pixelsPerSecond }}
          >
            <span />
          </div>
          {selectionBoxUi ? (
            <div className="cut-basic-selection-box" style={selectionBoxUi} />
          ) : null}
        </div>
      </div>
      <ExportPanel isOpen={showExportPanel} onClose={() => setShowExportPanel(false)} />
      {contextMenu.contextMenu ? (
        <ContextMenu
          items={[...contextMenu.contextMenu.items]}
          onClose={contextMenu.closeContextMenu}
          x={contextMenu.contextMenu.x}
          y={contextMenu.contextMenu.y}
        />
      ) : null}
    </div>
  );
}

function findSelectedClip(
  tracks: readonly TimelineTrackView[] | undefined,
  selection: CutPresentationSelection | undefined,
): TimelineClipView | undefined {
  if (!tracks || selection?.kind !== 'clip') return undefined;
  const item = tracks
    .find((track) => track.trackId === selection.trackId)
    ?.items.find((candidate) => candidate.kind === 'clip' && candidate.clipId === selection.clipId);
  return item?.kind === 'clip' ? item : undefined;
}

function collectSnapTargets(
  tracks: readonly TimelineTrackView[] | undefined,
  excludedClipId: string,
): readonly number[] {
  if (!tracks) return [0];
  return [
    0,
    ...tracks.flatMap((track) =>
      track.items.flatMap((item) =>
        item.kind === 'clip' && item.clipId !== excludedClipId
          ? [item.startSeconds, item.startSeconds + item.durationSeconds]
          : [],
      ),
    ),
  ];
}
