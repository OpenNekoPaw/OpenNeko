/**
 * TimelineRuler Component — adapter wrapping the shared TimelineRuler.
 *
 * Preserves the neko-cut layout structure:
 *   [TRACK_LABEL_WIDTH spacer] | [shared canvas ruler]
 *
 * The ruler canvas is viewport-width and redraws based on the tracks
 * container's scroll position (scrollRef). It does NOT scroll itself.
 */

import { memo } from 'react';
import type { RefObject } from 'react';
import { TimelineRuler as SharedRuler } from '@neko/ui/creative';
import { PIXELS_PER_SECOND, RULER_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';

export interface TimelineRulerProps {
  totalDuration: number;
  zoomLevel: number;
  timelineWidth: number;
  /** The scrollable tracks container — ruler mirrors its scrollLeft via redraw. */
  scrollRef: RefObject<HTMLDivElement>;
  seek: (time: number) => void;
}

export const TimelineRuler = memo(function TimelineRuler({
  totalDuration,
  zoomLevel,
  scrollRef,
  seek,
}: TimelineRulerProps) {
  return (
    <div className="flex border-b border-vscode-panel-border">
      {/* Spacer aligned with track label column */}
      <div
        className="shrink-0 border-r border-vscode-panel-border bg-vscode-sidebar-bg"
        style={{ width: TRACK_LABEL_WIDTH }}
      />

      {/* Ruler area — fills remaining width, no scrolling needed */}
      <div className="flex-1 overflow-hidden" style={{ height: RULER_HEIGHT }}>
        <SharedRuler
          duration={totalDuration}
          pixelsPerSecond={PIXELS_PER_SECOND * zoomLevel}
          onSeek={seek}
          height={RULER_HEIGHT}
          scrollRef={scrollRef}
        />
      </div>
    </div>
  );
});
