import { memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { buildRulerTicks, timelineTimeFromClientX, TRACK_HEADER_WIDTH } from './timelineMath';

export interface TimelineRulerProps {
  readonly totalDuration: number;
  readonly pixelsPerSecond: number;
  readonly onSeek: (time: number) => void;
}

export const TimelineRuler = memo(function TimelineRuler(props: TimelineRulerProps) {
  const ticks = useMemo(
    () => buildRulerTicks(props.totalDuration, props.pixelsPerSecond),
    [props.pixelsPerSecond, props.totalDuration],
  );
  const seek = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ruler = event.currentTarget;
    const rect = ruler.getBoundingClientRect();
    const move = (clientX: number) =>
      props.onSeek(
        timelineTimeFromClientX(clientX, rect.left, props.pixelsPerSecond, props.totalDuration),
      );
    move(event.clientX);
    ruler.setPointerCapture(event.pointerId);
    const pointerMove = (next: PointerEvent) => move(next.clientX);
    const pointerEnd = () => {
      ruler.removeEventListener('pointermove', pointerMove);
      ruler.removeEventListener('pointerup', pointerEnd);
      ruler.removeEventListener('pointercancel', pointerEnd);
    };
    ruler.addEventListener('pointermove', pointerMove);
    ruler.addEventListener('pointerup', pointerEnd);
    ruler.addEventListener('pointercancel', pointerEnd);
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
