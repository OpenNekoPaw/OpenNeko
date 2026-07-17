import React, { useCallback, useMemo, useRef, useState } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { PositionedContextMenu } from '../primitives';
import type { MenuItem } from '../primitives';
import { KeyframeDiamond } from './keyframe-diamond';
import { TimelineRuler } from './timeline-ruler';

export type KeyframeTimelineEasing =
  'linear' | 'ease-in-cubic' | 'ease-out-cubic' | 'ease-in-out-cubic' | (string & {});

export interface KeyframeTimelineKeyframe {
  readonly id: string;
  readonly timeMs: number;
  readonly value: number;
  readonly easing?: KeyframeTimelineEasing;
}

export interface KeyframeTimelineTrack {
  readonly id: string;
  readonly label: string;
  readonly defaultValue: number;
  readonly keyframes: readonly KeyframeTimelineKeyframe[];
}

export interface KeyframeTimelineKeyframeUpdate {
  readonly timeMs?: number;
  readonly value?: number;
  readonly easing?: KeyframeTimelineEasing;
}

export interface KeyframeTimelineProps {
  readonly durationMs: number;
  readonly currentTimeMs: number;
  readonly tracks: readonly KeyframeTimelineTrack[];
  readonly pixelsPerSecond?: number;
  readonly trackHeight?: number;
  readonly onSeek: (timeMs: number) => void;
  readonly onKeyframeAdd: (trackId: string, timeMs: number, value: number) => void;
  readonly onKeyframeRemove: (trackId: string, keyframeId: string) => void;
  readonly onKeyframeUpdate?: (
    trackId: string,
    keyframeId: string,
    updates: KeyframeTimelineKeyframeUpdate,
  ) => void;
  readonly onKeyframeSelect?: (keyframeId: string, multi?: boolean) => void;
  readonly onKeyframeDrag?: (trackId: string, keyframeId: string, newTimeMs: number) => void;
  readonly selectedKeyframeIds?: ReadonlySet<string>;
  readonly className?: string;
}

interface KeyframeContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly trackId: string;
  readonly keyframeId: string;
}

interface KeyframeContextMenuProps {
  readonly state: KeyframeContextMenuState;
  readonly onClose: () => void;
  readonly onKeyframeRemove: KeyframeTimelineProps['onKeyframeRemove'];
  readonly onKeyframeUpdate: KeyframeTimelineProps['onKeyframeUpdate'];
}

const DEFAULT_PIXELS_PER_SECOND = 100;
const DEFAULT_TRACK_HEIGHT = 24;
const RULER_HEIGHT = 24;
const LABEL_WIDTH = 120;

export function KeyframeTimeline({
  className,
  currentTimeMs,
  durationMs,
  onKeyframeAdd,
  onKeyframeDrag,
  onKeyframeRemove,
  onKeyframeSelect,
  onKeyframeUpdate,
  onSeek,
  pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND,
  selectedKeyframeIds,
  trackHeight = DEFAULT_TRACK_HEIGHT,
  tracks,
}: KeyframeTimelineProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<KeyframeContextMenuState | null>(null);

  const durationSeconds = durationMs / 1000;
  const totalWidth = Math.max(durationSeconds * pixelsPerSecond + 100, 400);
  const playheadLeft = (currentTimeMs / 1000) * pixelsPerSecond;

  const handleRulerSeek = useCallback(
    (timeSeconds: number) => {
      onSeek(timeSeconds * 1000);
    },
    [onSeek],
  );

  const handleTrackDoubleClick = useCallback(
    (track: KeyframeTimelineTrack, event: React.MouseEvent) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left + container.scrollLeft;
      const timeMs = Math.max(0, Math.min(durationMs, (x / pixelsPerSecond) * 1000));
      onKeyframeAdd(track.id, timeMs, track.defaultValue);
    },
    [durationMs, onKeyframeAdd, pixelsPerSecond],
  );

  const handleDiamondClick = useCallback(
    (keyframeId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      onKeyframeSelect?.(keyframeId, event.shiftKey || event.metaKey);
    },
    [onKeyframeSelect],
  );

  const handleDiamondDragStart = useCallback(
    (trackId: string, keyframeId: string, event: React.PointerEvent) => {
      event.stopPropagation();
      const track = tracks.find((candidate) => candidate.id === trackId);
      const keyframe = track?.keyframes.find((candidate) => candidate.id === keyframeId);
      if (!keyframe) return;

      const startX = event.clientX;
      const startTimeMs = keyframe.timeMs;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dtMs = (dx / pixelsPerSecond) * 1000;
        const newTimeMs = Math.max(0, Math.min(durationMs, startTimeMs + dtMs));
        onKeyframeDrag?.(trackId, keyframeId, Math.round(newTimeMs));
      };

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [durationMs, onKeyframeDrag, pixelsPerSecond, tracks],
  );

  const handleDiamondContextMenu = useCallback(
    (trackId: string, keyframeId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, trackId, keyframeId });
    },
    [],
  );

  return (
    <div
      className={className ? `neko-keyframe-timeline ${className}` : 'neko-keyframe-timeline'}
      {...getKeyboardBoundaryMetadata({
        scope: 'timeline',
        ownerId: 'keyframe-timeline',
        ownedKeys: [
          'Delete',
          'Backspace',
          'Enter',
          'Escape',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--neko-divider, rgba(255,255,255,0.06))',
        backgroundColor: 'var(--neko-surface, #242426)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TimelineRuler
            duration={durationSeconds}
            height={RULER_HEIGHT}
            pixelsPerSecond={pixelsPerSecond}
            scrollRef={scrollRef}
            onSeek={handleRulerSeek}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0, overflow: 'hidden' }}>
          {tracks.map((track) => (
            <div
              key={track.id}
              title={track.label}
              style={{
                height: trackHeight,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 8,
                paddingRight: 4,
                borderBottom: '1px solid var(--neko-divider, rgba(255,255,255,0.06))',
                fontSize: 11,
                color: 'var(--neko-fg-secondary, #8e8e93)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {track.label}
            </div>
          ))}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ position: 'relative', width: totalWidth }}>
            {tracks.map((track) => (
              <div
                key={track.id}
                style={{
                  position: 'relative',
                  height: trackHeight,
                  borderBottom: '1px solid var(--neko-divider, rgba(255,255,255,0.06))',
                }}
                onDoubleClick={(event) => handleTrackDoubleClick(track, event)}
              >
                {track.keyframes.map((keyframe) => {
                  const left = (keyframe.timeMs / 1000) * pixelsPerSecond;
                  const isSelected = selectedKeyframeIds?.has(keyframe.id) ?? false;
                  return (
                    <span
                      key={keyframe.id}
                      onContextMenu={(event) =>
                        handleDiamondContextMenu(track.id, keyframe.id, event)
                      }
                    >
                      <KeyframeDiamond
                        left={left}
                        selected={isSelected}
                        title={`${track.label}: ${keyframe.value.toFixed(2)} @ ${(
                          keyframe.timeMs / 1000
                        ).toFixed(2)}s`}
                        onClick={(event) => handleDiamondClick(keyframe.id, event)}
                        onDragStart={(event) =>
                          handleDiamondDragStart(track.id, keyframe.id, event)
                        }
                      />
                    </span>
                  );
                })}
              </div>
            ))}

            <div
              style={{
                position: 'absolute',
                top: 0,
                left: playheadLeft,
                width: 1,
                height: '100%',
                backgroundColor: 'var(--neko-error, #ff453a)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          </div>
        </div>
      </div>

      {contextMenu ? (
        <KeyframeContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onKeyframeRemove={onKeyframeRemove}
          onKeyframeUpdate={onKeyframeUpdate}
        />
      ) : null}
    </div>
  );
}

function KeyframeContextMenu({
  onClose,
  onKeyframeRemove,
  onKeyframeUpdate,
  state,
}: KeyframeContextMenuProps): React.ReactElement {
  const items = useMemo(
    (): readonly MenuItem[] => [
      {
        label: 'Delete Keyframe',
        onClick: () => {
          onKeyframeRemove(state.trackId, state.keyframeId);
        },
      },
      { separator: true },
      {
        label: 'Linear',
        onClick: () => {
          onKeyframeUpdate?.(state.trackId, state.keyframeId, { easing: 'linear' });
        },
      },
      {
        label: 'Ease In',
        onClick: () => {
          onKeyframeUpdate?.(state.trackId, state.keyframeId, { easing: 'ease-in-cubic' });
        },
      },
      {
        label: 'Ease Out',
        onClick: () => {
          onKeyframeUpdate?.(state.trackId, state.keyframeId, { easing: 'ease-out-cubic' });
        },
      },
      {
        label: 'Ease In-Out',
        onClick: () => {
          onKeyframeUpdate?.(state.trackId, state.keyframeId, {
            easing: 'ease-in-out-cubic',
          });
        },
      },
    ],
    [onKeyframeRemove, onKeyframeUpdate, state],
  );

  return <PositionedContextMenu x={state.x} y={state.y} items={items} onClose={onClose} />;
}
