/**
 * KeyframeTimeline — Shared mini-timeline for keyframe editing.
 *
 * Embedded in neko-puppet and neko-model webviews as a collapsible
 * bottom panel. Follows the adapter pattern: each editor wraps this
 * component with domain-specific logic (parameter vs bone/morph tracks).
 *
 * Internal composition:
 * - TimelineRuler (shared) — ruler bar with tick marks
 * - Track rows — horizontal lanes with KeyframeDiamond markers
 * - Playhead — vertical red line at currentTimeMs
 *
 * Interaction:
 * - Click ruler → seek
 * - Double-click track → add keyframe
 * - Drag diamond → move keyframe in time
 * - Click diamond → select
 * - Right-click diamond → context menu (delete, change easing)
 *
 * CSS class `.neko-keyframe-timeline` is styled via Tailwind.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { EditorKeyframeTrack } from '../types/keyframe-editor';
import type { EasingType } from '../types/easing';
import { TimelineRuler } from './TimelineRuler';
import { KeyframeDiamond } from './KeyframeDiamond';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KeyframeTimelineProps {
  /** Total clip duration in milliseconds */
  durationMs: number;
  /** Current playhead position in milliseconds */
  currentTimeMs: number;
  /** Keyframe tracks to display */
  tracks: EditorKeyframeTrack[];
  /** Pixels per second (zoom control). Default: 100 */
  pixelsPerSecond?: number;
  /** Height per track row in pixels. Default: 24 */
  trackHeight?: number;

  // ── Callbacks ──
  onSeek: (timeMs: number) => void;
  onKeyframeAdd: (trackProperty: string, timeMs: number, value: number) => void;
  onKeyframeRemove: (trackProperty: string, keyframeId: string) => void;
  onKeyframeUpdate?: (
    trackProperty: string,
    keyframeId: string,
    updates: { timeMs?: number; value?: number; easing?: EasingType },
  ) => void;
  onKeyframeSelect?: (keyframeId: string, multi?: boolean) => void;
  onKeyframeDrag?: (trackProperty: string, keyframeId: string, newTimeMs: number) => void;

  /** Currently selected keyframe IDs */
  selectedKeyframeIds?: ReadonlySet<string>;
  /** Additional class name */
  className?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PPS = 100;
const DEFAULT_TRACK_HEIGHT = 24;
const RULER_HEIGHT = 24;
const LABEL_WIDTH = 120;

// ── Component ────────────────────────────────────────────────────────────────

export function KeyframeTimeline({
  durationMs,
  currentTimeMs,
  tracks,
  pixelsPerSecond = DEFAULT_PPS,
  trackHeight = DEFAULT_TRACK_HEIGHT,
  onSeek,
  onKeyframeAdd,
  onKeyframeRemove,
  onKeyframeUpdate,
  onKeyframeSelect,
  onKeyframeDrag,
  selectedKeyframeIds,
  className,
}: KeyframeTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    trackProperty: string;
    keyframeId: string;
  } | null>(null);

  const durationSec = durationMs / 1000;
  const totalWidth = Math.max(durationSec * pixelsPerSecond + 100, 400);

  // ── Seek handler ────────────────────────────────────────────────────────

  const handleRulerSeek = useCallback(
    (timeSec: number) => {
      onSeek(timeSec * 1000);
    },
    [onSeek],
  );

  // ── Track double-click → add keyframe ──────────────────────────────────

  const handleTrackDoubleClick = useCallback(
    (track: EditorKeyframeTrack, e: React.MouseEvent) => {
      const container = scrollRef.current;
      if (!container) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const timeMs = Math.max(0, Math.min(durationMs, (x / pixelsPerSecond) * 1000));
      onKeyframeAdd(track.property, timeMs, track.defaultValue);
    },
    [durationMs, pixelsPerSecond, onKeyframeAdd],
  );

  // ── Keyframe diamond click → select ────────────────────────────────────

  const handleDiamondClick = useCallback(
    (keyframeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onKeyframeSelect?.(keyframeId, e.shiftKey || e.metaKey);
    },
    [onKeyframeSelect],
  );

  // ── Keyframe diamond drag → move in time ───────────────────────────────

  const handleDiamondDragStart = useCallback(
    (trackProperty: string, keyframeId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      const container = scrollRef.current;
      if (!container) return;

      const startX = e.clientX;

      // Find current keyframe position
      const track = tracks.find((t) => t.property === trackProperty);
      const kf = track?.keyframes.find((k) => k.id === keyframeId);
      if (!kf) return;
      const startTimeMs = kf.timeMs;

      const handleMove = (moveE: PointerEvent) => {
        const dx = moveE.clientX - startX;
        const dtMs = (dx / pixelsPerSecond) * 1000;
        const newTimeMs = Math.max(0, Math.min(durationMs, startTimeMs + dtMs));
        onKeyframeDrag?.(trackProperty, keyframeId, Math.round(newTimeMs));
      };

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [tracks, pixelsPerSecond, durationMs, onKeyframeDrag],
  );

  // ── Keyframe context menu ──────────────────────────────────────────────

  const handleDiamondContextMenu = useCallback(
    (trackProperty: string, keyframeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, trackProperty, keyframeId });
    },
    [],
  );

  const contextMenuItems = useMemo<MenuItem[]>(() => {
    if (!contextMenu) return [];
    const { trackProperty, keyframeId } = contextMenu;
    return [
      {
        label: 'Delete Keyframe',
        onClick: () => {
          onKeyframeRemove(trackProperty, keyframeId);
          setContextMenu(null);
        },
      },
      { separator: true as const },
      {
        label: 'Linear',
        onClick: () => {
          onKeyframeUpdate?.(trackProperty, keyframeId, { easing: 'linear' });
          setContextMenu(null);
        },
      },
      {
        label: 'Ease In',
        onClick: () => {
          onKeyframeUpdate?.(trackProperty, keyframeId, { easing: 'ease-in-cubic' });
          setContextMenu(null);
        },
      },
      {
        label: 'Ease Out',
        onClick: () => {
          onKeyframeUpdate?.(trackProperty, keyframeId, { easing: 'ease-out-cubic' });
          setContextMenu(null);
        },
      },
      {
        label: 'Ease In-Out',
        onClick: () => {
          onKeyframeUpdate?.(trackProperty, keyframeId, { easing: 'ease-in-out-cubic' });
          setContextMenu(null);
        },
      },
    ];
  }, [contextMenu, onKeyframeRemove, onKeyframeUpdate]);

  // ── Playhead position ──────────────────────────────────────────────────

  const playheadLeft = (currentTimeMs / 1000) * pixelsPerSecond;

  return (
    <div
      className={`neko-keyframe-timeline${className ? ` ${className}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--neko-divider, rgba(255,255,255,0.06))',
        backgroundColor: 'var(--neko-surface, #242426)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Ruler + track header row */}
      <div style={{ display: 'flex' }}>
        {/* Track label spacer */}
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        {/* Ruler */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TimelineRuler
            duration={durationSec}
            pixelsPerSecond={pixelsPerSecond}
            onSeek={handleRulerSeek}
            height={RULER_HEIGHT}
            scrollRef={scrollRef}
          />
        </div>
      </div>

      {/* Track rows */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Track labels (fixed) */}
        <div
          style={{
            width: LABEL_WIDTH,
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {tracks.map((track) => (
            <div
              key={track.property}
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
              title={track.label}
            >
              {track.label}
            </div>
          ))}
        </div>

        {/* Track keyframe lanes (scrollable) */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
        >
          <div style={{ position: 'relative', width: totalWidth }}>
            {/* Track rows */}
            {tracks.map((track) => (
              <div
                key={track.property}
                style={{
                  position: 'relative',
                  height: trackHeight,
                  borderBottom: '1px solid var(--neko-divider, rgba(255,255,255,0.06))',
                }}
                onDoubleClick={(e) => handleTrackDoubleClick(track, e)}
              >
                {track.keyframes.map((kf) => {
                  const left = (kf.timeMs / 1000) * pixelsPerSecond;
                  const isSelected = selectedKeyframeIds?.has(kf.id) ?? false;
                  return (
                    <span
                      key={kf.id}
                      onContextMenu={(e) => handleDiamondContextMenu(track.property, kf.id, e)}
                    >
                      <KeyframeDiamond
                        left={left}
                        selected={isSelected}
                        onClick={(e) => handleDiamondClick(kf.id, e)}
                        onDragStart={(e) => handleDiamondDragStart(track.property, kf.id, e)}
                        title={`${track.label}: ${kf.value.toFixed(2)} @ ${(kf.timeMs / 1000).toFixed(2)}s`}
                      />
                    </span>
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
