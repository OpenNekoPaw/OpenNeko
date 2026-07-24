import { useCallback, useState } from 'react';
import type { TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
import type { MenuItem } from '../components/ContextMenu';

interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
}

export function useTimelineContextMenu(input: {
  readonly onSelect: (clipId: string, trackId: string) => void;
  readonly onSelectGap: (trackId: string, itemIndex: number) => void;
  readonly onSelectTrack: (trackId: string) => void;
  readonly onSelectBackground: () => void;
  readonly createClipItems: (track: TimelineTrackView, clip: TimelineClipView) => MenuItem[];
  readonly createGapItems: (track: TimelineTrackView, itemIndex: number) => MenuItem[];
  readonly createTrackItems: (track: TimelineTrackView) => MenuItem[];
  readonly createBackgroundItems: () => MenuItem[];
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();

  const handleClipContextMenu = useCallback(
    (event: React.MouseEvent, track: TimelineTrackView, clip: TimelineClipView) => {
      event.preventDefault();
      event.stopPropagation();
      input.onSelect(clip.clipId, track.trackId);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: input.createClipItems(track, clip),
      });
    },
    [input],
  );

  const handleTimelineContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.cut-basic-clip')) return;
      event.preventDefault();
      input.onSelectBackground();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: input.createBackgroundItems(),
      });
    },
    [input],
  );

  const handleTrackContextMenu = useCallback(
    (event: React.MouseEvent, track: TimelineTrackView) => {
      if (event.target instanceof HTMLElement && event.target.closest('.cut-basic-clip')) return;
      event.preventDefault();
      event.stopPropagation();
      input.onSelectTrack(track.trackId);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: input.createTrackItems(track),
      });
    },
    [input],
  );

  const handleGapContextMenu = useCallback(
    (event: React.MouseEvent, track: TimelineTrackView, itemIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      input.onSelectGap(track.trackId, itemIndex);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: input.createGapItems(track, itemIndex),
      });
    },
    [input],
  );

  const closeContextMenu = useCallback(() => setContextMenu(undefined), []);
  return {
    contextMenu,
    handleClipContextMenu,
    handleGapContextMenu,
    handleTrackContextMenu,
    handleTimelineContextMenu,
    closeContextMenu,
  };
}
