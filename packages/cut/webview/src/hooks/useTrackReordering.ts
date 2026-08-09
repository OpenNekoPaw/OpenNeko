import { useCallback, useState } from 'react';

export function useTrackReordering(input: {
  readonly onReorder: (trackId: string, targetIndex: number) => void;
}) {
  const [draggingTrackId, setDraggingTrackId] = useState<string>();
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number>();

  const start = useCallback((event: React.DragEvent, trackId: string) => {
    setDraggingTrackId(trackId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', trackId);
  }, []);
  const over = useCallback(
    (event: React.DragEvent, trackIndex: number) => {
      if (!draggingTrackId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverTrackIndex(trackIndex);
    },
    [draggingTrackId],
  );
  const drop = useCallback(
    (event: React.DragEvent, targetIndex: number) => {
      if (!draggingTrackId) return;
      event.preventDefault();
      input.onReorder(draggingTrackId, targetIndex);
      setDraggingTrackId(undefined);
      setDragOverTrackIndex(undefined);
    },
    [draggingTrackId, input],
  );
  const end = useCallback(() => {
    setDraggingTrackId(undefined);
    setDragOverTrackIndex(undefined);
  }, []);

  return { draggingTrackId, dragOverTrackIndex, start, over, drop, end };
}
