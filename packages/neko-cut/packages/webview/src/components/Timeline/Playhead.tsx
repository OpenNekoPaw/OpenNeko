import { memo } from 'react';
import { useDrag } from '@neko/ui/hooks';
import { useEditorStore } from '../../stores/editor-store';

interface PlayheadProps {
  currentTime: number;
  zoomLevel: number;
  pixelsPerSecond: number;
  height: number;
}

interface PlayheadCtx {
  startX: number;
  startLeft: number;
  totalDuration: number;
}

export const Playhead = memo(function Playhead({
  currentTime,
  zoomLevel,
  pixelsPerSecond,
  height,
}: PlayheadProps) {
  const { seek, getTotalDuration, pause } = useEditorStore();

  const left = currentTime * pixelsPerSecond * zoomLevel;

  const { isDragging, bindDrag } = useDrag<PlayheadCtx>({
    onStart: (e) => {
      pause(); // Pause playback when dragging
      return {
        startX: e.clientX,
        startLeft: left,
        totalDuration: getTotalDuration() || 60,
      };
    },
    onMove: (e, ctx) => {
      const deltaX = e.clientX - ctx.startX;
      const newLeft = ctx.startLeft + deltaX;
      const newTime = Math.max(
        0,
        Math.min(ctx.totalDuration, newLeft / (pixelsPerSecond * zoomLevel)),
      );
      seek(newTime);
    },
    onEnd: () => {},
  });

  return (
    <div className="absolute top-0 z-20 pointer-events-none" style={{ left, height }}>
      {/* Playhead line */}
      <div className={`w-0.5 h-full ${isDragging ? 'bg-red-400' : 'bg-red-500'}`} />

      {/* Playhead handle */}
      <div
        className={`absolute -top-2 -left-2 w-4 h-4 pointer-events-auto cursor-ew-resize transition-transform
          ${isDragging ? 'scale-110' : 'hover:scale-110'}
        `}
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 50%)',
          backgroundColor: isDragging ? '#f87171' : '#ef4444',
        }}
        {...bindDrag}
      />
    </div>
  );
});
