/**
 * useTimelineSelection Hook
 * 管理时间轴选择框逻辑
 */

import { useCallback, useEffect, useMemo, useState, RefObject } from 'react';
import { PIXELS_PER_SECOND, TRACK_HEIGHT, TRACK_LABEL_WIDTH } from '../constants';
import type { TimelineTrack } from '../types';

export interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isSelecting: boolean;
}

export interface SelectionBoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimelineSelectionOptions {
  tracksRef: RefObject<HTMLDivElement>;
  tracks: TimelineTrack[];
  zoomLevel: number;
  clearSelectedElements: () => void;
  setSelectedElements: (elements: Array<{ trackId: string; elementId: string }>) => void;
}

export function useTimelineSelection({
  tracksRef,
  tracks,
  zoomLevel,
  clearSelectedElements,
  setSelectedElements,
}: TimelineSelectionOptions) {
  // Selection box state
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  // Selection box handlers
  const handleSelectionMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start selection if clicking on track background (not on elements)
      if ((e.target as HTMLElement).closest('.timeline-element')) return;
      // Don't start selection if clicking on track labels (for drag reordering)
      if ((e.target as HTMLElement).closest('.track-label')) return;
      // Don't start selection on right-click
      if (e.button !== 0) return;

      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Subtract TRACK_LABEL_WIDTH to convert from container coordinates to content coordinates
      const startX =
        e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
      const startY = e.clientY - rect.top + (tracksRef.current?.scrollTop || 0);

      setSelectionBox({
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        isSelecting: true,
      });

      // Clear selection unless holding shift/cmd
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        clearSelectedElements();
      }
    },
    [clearSelectedElements, tracksRef],
  );

  // Calculate elements within selection box
  // Optimized: O(k*m) where k = tracks in Y range, m = average elements per track
  // Uses early track filtering and binary-search-like element filtering
  const getElementsInSelectionBox = useCallback(() => {
    if (!selectionBox) return [];

    const minX = Math.min(selectionBox.startX, selectionBox.currentX);
    const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
    const minY = Math.min(selectionBox.startY, selectionBox.currentY);
    const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

    // Early exit if selection box is too small (accidental click)
    if (maxX - minX < 5 && maxY - minY < 5) return [];

    // Calculate track index range - O(1) instead of checking all tracks
    const firstTrackIndex = Math.max(0, Math.floor(minY / TRACK_HEIGHT));
    const lastTrackIndex = Math.min(tracks.length - 1, Math.floor(maxY / TRACK_HEIGHT));

    // Early exit if no tracks in range
    if (firstTrackIndex > lastTrackIndex || firstTrackIndex >= tracks.length) return [];

    const selected: Array<{ trackId: string; elementId: string }> = [];
    const pixelsPerSecondZoomed = PIXELS_PER_SECOND * zoomLevel;

    // Convert pixel range to time range for faster element filtering
    const minTime = minX / pixelsPerSecondZoomed;
    const maxTime = maxX / pixelsPerSecondZoomed;

    // Only iterate over tracks within Y range
    for (let trackIndex = firstTrackIndex; trackIndex <= lastTrackIndex; trackIndex++) {
      const track = tracks[trackIndex];
      if (!track) continue;

      // Filter elements by time range
      for (const element of track.elements) {
        const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
        const elementEnd = element.startTime + effectiveDuration;

        // Time-based intersection check (more efficient than pixel calculation)
        if (elementEnd >= minTime && element.startTime <= maxTime) {
          selected.push({ trackId: track.id, elementId: element.id });
        }
      }
    }

    return selected;
  }, [selectionBox, tracks, zoomLevel]);

  // Handle mouse move for selection box
  useEffect(() => {
    if (!selectionBox?.isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Subtract TRACK_LABEL_WIDTH to convert from container coordinates to content coordinates
      const currentX =
        e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
      const currentY = e.clientY - rect.top + (tracksRef.current?.scrollTop || 0);

      setSelectionBox((prev) => (prev ? { ...prev, currentX, currentY } : null));
    };

    const handleMouseUp = () => {
      // Select elements in the box
      const elementsInBox = getElementsInSelectionBox();
      if (elementsInBox.length > 0) {
        setSelectedElements(elementsInBox);
      }
      setSelectionBox(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectionBox?.isSelecting, getElementsInSelectionBox, setSelectedElements, tracksRef]);

  // Calculate selection box rect for rendering
  const selectionBoxRect = useMemo(() => {
    if (!selectionBox) return null;
    return {
      left: Math.min(selectionBox.startX, selectionBox.currentX),
      top: Math.min(selectionBox.startY, selectionBox.currentY),
      width: Math.abs(selectionBox.currentX - selectionBox.startX),
      height: Math.abs(selectionBox.currentY - selectionBox.startY),
    };
  }, [selectionBox]);

  return {
    selectionBox,
    selectionBoxRect,
    handleSelectionMouseDown,
  };
}
