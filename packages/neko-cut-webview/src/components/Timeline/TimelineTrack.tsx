import { memo, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
import {
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  LockIcon,
  TrashIcon,
  UnlockIcon,
  VolumeIcon,
  VolumeLowIcon,
  VolumeOffIcon,
} from '@neko/ui/icons';
import type { ClipRepresentationState } from '../../hooks/useClipRepresentations';
import { useTranslation } from '../../i18n/I18nContext';
import { TimelineElementContent } from './TimelineElementContent';
import { TRACK_HEADER_WIDTH } from './timelineMath';

export type TimelineClipPointerMode = 'place' | 'trim-start' | 'trim-end';

export interface TimelineClipLayoutDraft {
  readonly clipId: string;
  readonly trackId: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface TimelineTrackProps {
  readonly track: TimelineTrackView;
  readonly stackIndex: number;
  readonly timelineWidth: number;
  readonly pixelsPerSecond: number;
  readonly selectedClipIds?: ReadonlySet<string>;
  readonly representations: ReadonlyMap<string, ClipRepresentationState>;
  readonly layoutDraft?: TimelineClipLayoutDraft;
  readonly dragTargetSeconds?: number;
  readonly dragOver: boolean;
  readonly editingTrackName?: string;
  readonly trackNameInputRef: RefObject<HTMLInputElement>;
  readonly onSelectTrack: (trackId: string) => void;
  readonly onBeginTrackRename: (track: TimelineTrackView) => void;
  readonly onCancelTrackRename: () => void;
  readonly onChangeTrackName: (name: string) => void;
  readonly onSaveTrackName: (track: TimelineTrackView) => void;
  readonly onTrackDragStart: (event: React.DragEvent, trackId: string) => void;
  readonly onTrackDragOver: (event: React.DragEvent, trackIndex: number) => void;
  readonly onTrackDrop: (event: React.DragEvent, trackIndex: number) => void;
  readonly onTrackDragEnd: () => void;
  readonly onSelectClip: (trackId: string, clipId: string, additive: boolean) => void;
  readonly onSelectGap: (trackId: string, itemIndex: number) => void;
  readonly onToggleClipMute: (clip: TimelineClipView) => void;
  readonly onToggleTrackEnabled: (track: TimelineTrackView) => void;
  readonly onToggleTrackLock: (track: TimelineTrackView) => void;
  readonly onToggleTrackMute: (track: TimelineTrackView) => void;
  readonly onRemoveTrack: (track: TimelineTrackView) => void;
  readonly onClipPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    track: TimelineTrackView,
    itemIndex: number,
    clip: TimelineClipView,
    mode: TimelineClipPointerMode,
  ) => void;
  readonly onClipContextMenu: (
    event: React.MouseEvent,
    track: TimelineTrackView,
    clip: TimelineClipView,
  ) => void;
  readonly onGapContextMenu: (
    event: React.MouseEvent,
    track: TimelineTrackView,
    itemIndex: number,
  ) => void;
  readonly onTrackContextMenu: (event: React.MouseEvent, track: TimelineTrackView) => void;
}

export const TimelineTrack = memo(function TimelineTrack(props: TimelineTrackProps) {
  const { t } = useTranslation();
  return (
    <div
      className="cut-basic-track-row"
      data-cut-track-id={props.track.trackId}
      data-drag-target={props.dragTargetSeconds === undefined ? 'false' : 'true'}
      data-enabled={props.track.enabled ? 'true' : 'false'}
      data-locked={props.track.locked ? 'true' : 'false'}
      data-track-drag-over={props.dragOver ? 'true' : 'false'}
      draggable={!props.track.locked}
      onDragEnd={props.onTrackDragEnd}
      onDragOver={(event) => props.onTrackDragOver(event, props.stackIndex)}
      onDragStart={(event) => props.onTrackDragStart(event, props.track.trackId)}
      onDrop={(event) => props.onTrackDrop(event, props.stackIndex)}
      onClick={() => props.onSelectTrack(props.track.trackId)}
      onContextMenu={(event) => props.onTrackContextMenu(event, props.track)}
      style={{ width: props.timelineWidth + TRACK_HEADER_WIDTH }}
    >
      <div
        aria-label={props.track.name}
        className="cut-basic-track-header"
        style={{ width: TRACK_HEADER_WIDTH }}
        title={props.track.name}
      >
        <span className="cut-basic-track-type-icon" title={props.track.kind}>
          {trackKindIcon(props.track.kind)}
        </span>
        {props.editingTrackName === undefined ? null : (
          <input
            aria-label={t('timeline.contextMenu.renameTrack')}
            className="cut-basic-track-name-input"
            onBlur={() => props.onSaveTrackName(props.track)}
            onChange={(event) => props.onChangeTrackName(event.currentTarget.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onSaveTrackName(props.track);
              if (event.key === 'Escape') props.onCancelTrackRename();
            }}
            ref={props.trackNameInputRef}
            value={props.editingTrackName}
          />
        )}
        <button
          aria-label={props.track.enabled ? t('timeline.track.hide') : t('timeline.track.show')}
          aria-pressed={props.track.enabled}
          className="cut-basic-track-button cut-basic-track-visibility"
          onClick={(event) => {
            event.stopPropagation();
            props.onToggleTrackEnabled(props.track);
          }}
          type="button"
        >
          {props.track.enabled ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
        </button>
        <button
          aria-label={props.track.locked ? t('timeline.track.unlock') : t('timeline.track.lock')}
          aria-pressed={props.track.locked}
          className="cut-basic-track-button cut-basic-track-lock"
          onClick={(event) => {
            event.stopPropagation();
            props.onToggleTrackLock(props.track);
          }}
          type="button"
        >
          {props.track.locked ? <LockIcon size={13} /> : <UnlockIcon size={13} />}
        </button>
        {props.track.kind === 'Subtitle' ? null : (
          <button
            aria-label={
              props.track.audioMuted
                ? t('timeline.contextMenu.unmuteTrack')
                : t('timeline.contextMenu.muteTrack')
            }
            aria-pressed={props.track.audioMuted}
            className="cut-basic-track-button cut-basic-track-audio"
            disabled={props.track.locked}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggleTrackMute(props.track);
            }}
            type="button"
          >
            {props.track.audioMuted ? <VolumeOffIcon size={13} /> : <VolumeIcon size={13} />}
          </button>
        )}
        <button
          aria-label={t('timeline.contextMenu.deleteTrack')}
          className="cut-basic-track-button cut-basic-track-remove"
          disabled={props.track.kind === 'Video' || props.track.locked}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemoveTrack(props.track);
          }}
          type="button"
        >
          <TrashIcon size={13} />
        </button>
      </div>
      <div className="cut-basic-track-content" style={{ width: props.timelineWidth }}>
        {props.track.items.map((item, itemIndex) => {
          if (item.kind === 'gap') {
            return (
              <div
                className="cut-basic-gap"
                key={`gap-${itemIndex}`}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onSelectGap(props.track.trackId, itemIndex);
                }}
                onContextMenu={(event) => props.onGapContextMenu(event, props.track, itemIndex)}
                style={{
                  left: item.startSeconds * props.pixelsPerSecond,
                  width: item.durationSeconds * props.pixelsPerSecond,
                }}
              />
            );
          }
          const draft = props.layoutDraft?.clipId === item.clipId ? props.layoutDraft : undefined;
          const startSeconds = draft?.startSeconds ?? item.startSeconds;
          const durationSeconds = draft?.durationSeconds ?? item.durationSeconds;
          const width = Math.max(2, durationSeconds * props.pixelsPerSecond);
          const selected = props.selectedClipIds?.has(item.clipId) ?? false;
          const locked = props.track.locked || item.locked;
          const enabled = props.track.enabled && item.enabled;
          return (
            <article
              aria-label={item.name}
              className="cut-basic-clip timeline-element"
              data-kind={props.track.kind}
              data-enabled={enabled ? 'true' : 'false'}
              data-locked={locked ? 'true' : 'false'}
              data-selected={selected ? 'true' : 'false'}
              key={item.clipId}
              onClick={(event) => {
                event.stopPropagation();
                props.onSelectClip(
                  props.track.trackId,
                  item.clipId,
                  event.metaKey || event.ctrlKey || event.shiftKey,
                );
              }}
              onContextMenu={(event) => props.onClipContextMenu(event, props.track, item)}
              onPointerDown={
                locked
                  ? undefined
                  : (event) => props.onClipPointerDown(event, props.track, itemIndex, item, 'place')
              }
              style={{ left: startSeconds * props.pixelsPerSecond, width }}
            >
              {locked ? null : (
                <button
                  aria-label={t('timeline.track.trimStart')}
                  className="cut-basic-trim-handle is-start"
                  onPointerDown={(event) =>
                    props.onClipPointerDown(event, props.track, itemIndex, item, 'trim-start')
                  }
                  type="button"
                />
              )}
              <TimelineElementContent
                clip={item}
                height={48}
                representation={props.representations.get(item.clipId)}
                trackKind={props.track.kind}
                width={width}
              />
              {props.track.kind !== 'Subtitle' ? (
                <button
                  aria-label={
                    item.audio.muted
                      ? t('timeline.contextMenu.unmute')
                      : t('timeline.contextMenu.mute')
                  }
                  className="cut-basic-clip-mute"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onToggleClipMute(item);
                  }}
                  type="button"
                >
                  {item.audio.muted ? <VolumeOffIcon size={13} /> : <VolumeIcon size={13} />}
                </button>
              ) : null}
              {locked ? null : (
                <button
                  aria-label={t('timeline.track.trimEnd')}
                  className="cut-basic-trim-handle is-end"
                  onPointerDown={(event) =>
                    props.onClipPointerDown(event, props.track, itemIndex, item, 'trim-end')
                  }
                  type="button"
                />
              )}
            </article>
          );
        })}
        {props.dragTargetSeconds === undefined ? null : (
          <div
            className="cut-basic-drop-indicator"
            style={{ left: props.dragTargetSeconds * props.pixelsPerSecond }}
          />
        )}
      </div>
    </div>
  );
});

function trackKindIcon(kind: TimelineTrackView['kind']) {
  if (kind === 'Video') return <CameraIcon size={15} />;
  if (kind === 'Audio') return <VolumeLowIcon size={15} />;
  return <FileIcon size={15} />;
}
