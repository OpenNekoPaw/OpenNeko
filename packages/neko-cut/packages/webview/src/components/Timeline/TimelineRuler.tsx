import { memo, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { buildRulerTicks, timelineTimeFromClientX, TRACK_HEADER_WIDTH } from './timelineMath';

export interface TimelineRulerProps {
  readonly totalDuration: number;
  readonly pixelsPerSecond: number;
  readonly onSeek: (time: number) => void;
}

export const TimelineRuler = memo(function TimelineRuler(props: TimelineRulerProps) {
  const cleanupGestureRef = useRef<() => void>();
  const ticks = useMemo(
    () => buildRulerTicks(props.totalDuration, props.pixelsPerSecond),
    [props.pixelsPerSecond, props.totalDuration],
  );
  useEffect(() => () => cleanupGestureRef.current?.(), []);
  const seek = (event: ReactPointerEvent<HTMLDivElement>) => {
    cleanupGestureRef.current?.();
    const ruler = event.currentTarget;
    const pointerId = event.pointerId;
    const rect = ruler.getBoundingClientRect();
    const move = (clientX: number) =>
      props.onSeek(
        timelineTimeFromClientX(clientX, rect.left, props.pixelsPerSecond, props.totalDuration),
      );
    move(event.clientX);
    ruler.setPointerCapture(pointerId);
    const pointerMove = (next: PointerEvent) => {
      if (next.pointerId === pointerId) move(next.clientX);
    };
    const cleanup = () => {
      ruler.removeEventListener('pointermove', pointerMove);
      ruler.removeEventListener('pointerup', pointerEnd);
      ruler.removeEventListener('pointercancel', pointerEnd);
      ruler.removeEventListener('lostpointercapture', lostPointerCapture);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibilityChange);
      if (cleanupGestureRef.current === cleanup) cleanupGestureRef.current = undefined;
    };
    const cancel = () => {
      if (ruler.hasPointerCapture?.(pointerId)) ruler.releasePointerCapture(pointerId);
      cleanup();
    };
    const pointerEnd = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      cancel();
    };
    const lostPointerCapture = (next: PointerEvent) => {
      if (next.pointerId === pointerId) cleanup();
    };
    const visibilityChange = () => {
      if (document.hidden) cancel();
    };
    ruler.addEventListener('pointermove', pointerMove);
    ruler.addEventListener('pointerup', pointerEnd);
    ruler.addEventListener('pointercancel', pointerEnd);
    ruler.addEventListener('lostpointercapture', lostPointerCapture);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibilityChange);
    cleanupGestureRef.current = cancel;
  };
  return (
    <div className="cut-basic-ruler-row">
      <div className="cut-basic-ruler-spacer" style={{ width: TRACK_HEADER_WIDTH }} />
      <div
        className="cut-basic-ruler"
        onPointerDown={seek}
        style={{ width: Math.max(1, props.totalDuration * props.pixelsPerSecond) }}
      >
        {ticks.map((tick) => (
          <span
            className="cut-basic-ruler-tick"
            data-major={tick.major ? 'true' : 'false'}
            key={`${tick.seconds}-${tick.major}`}
            style={{ left: tick.seconds * props.pixelsPerSecond }}
          >
            {tick.label ? <span>{tick.label}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
});
