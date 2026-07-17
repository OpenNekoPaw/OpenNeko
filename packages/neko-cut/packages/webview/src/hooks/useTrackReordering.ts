/**
 * useTrackReordering Hook
 * 管理轨道拖拽重新排序
 */

import { useCallback, useState } from 'react';

export interface TrackReorderingOptions {
  reorderTrack: (trackId: string, targetIndex: number) => void;
}

export function useTrackReordering({ reorderTrack }: TrackReorderingOptions) {
  // Track drag reordering state
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);

  // Track drag reordering handlers
  const handleTrackDragStart = useCallback((e: React.DragEvent, trackId: string) => {
    setDraggingTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', trackId);
    // Add a subtle drag image
    const target = e.currentTarget as HTMLElement;
    if (target) {
      e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
    }
  }, []);

  const handleTrackDragOver = useCallback(
    (e: React.DragEvent, trackIndex: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingTrackId) {
        setDragOverTrackIndex(trackIndex);
      }
    },
    [draggingTrackId],
  );

  const handleTrackDragLeave = useCallback(() => {
    setDragOverTrackIndex(null);
  }, []);

  const handleTrackDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (draggingTrackId) {
        reorderTrack(draggingTrackId, targetIndex);
      }
      setDraggingTrackId(null);
      setDragOverTrackIndex(null);
    },
    [draggingTrackId, reorderTrack],
  );

  const handleTrackDragEnd = useCallback(() => {
    setDraggingTrackId(null);
    setDragOverTrackIndex(null);
  }, []);

  return {
    draggingTrackId,
    dragOverTrackIndex,
    handleTrackDragStart,
    handleTrackDragOver,
    handleTrackDragLeave,
    handleTrackDrop,
    handleTrackDragEnd,
  };
}
