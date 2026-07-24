import { memo, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { TimelineView } from '@neko-cut/domain';
import { useTranslation } from '../../../i18n/I18nContext';
import { TRACK_HEADER_WIDTH } from '../timelineMath';
import { readOverviewRange, readOverviewScrollLeft, readOverviewViewport } from '../overviewMath';

export interface TimelineMinimapProps {
  readonly view: TimelineView;
  readonly scrollRef: RefObject<HTMLDivElement>;
  readonly timelineDurationSeconds: number;
}

export const TimelineMinimap = memo(function TimelineMinimap(props: TimelineMinimapProps) {
  const { t } = useTranslation();
  const overviewRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ leftPercent: 0, widthPercent: 100 });
  const update = useCallback(() => {
    const element = props.scrollRef.current;
    if (!element) return;
    setViewport(readOverviewViewport(element));
  }, [props.scrollRef]);

  useEffect(() => {
    const element = props.scrollRef.current;
    if (!element) return;
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [props.scrollRef, update]);

  const navigate = useCallback(
    (clientX: number) => {
      const overview = overviewRef.current;
      const scroller = props.scrollRef.current;
      if (!overview || !scroller) return;
      const rect = overview.getBoundingClientRect();
      scroller.scrollLeft = readOverviewScrollLeft({
        pointerRatio: (clientX - rect.left) / rect.width,
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
      });
    },
    [props.scrollRef],
  );
  const navigateWithKeyboard = (event: React.KeyboardEvent) => {
    const scroller = props.scrollRef.current;
    if (!scroller || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    scroller.scrollLeft +=
      event.key === 'ArrowLeft' ? -scroller.clientWidth / 3 : scroller.clientWidth / 3;
  };

  return (
    <div className="cut-basic-overview-row">
      <div className="cut-basic-overview-spacer" style={{ width: TRACK_HEADER_WIDTH }} />
      <div
        aria-label={t('timeline.basic.overview')}
        aria-valuemax={Math.round(props.timelineDurationSeconds * 1000)}
        aria-valuemin={0}
        aria-valuenow={Math.round(
          (viewport.leftPercent / 100) * props.timelineDurationSeconds * 1000,
        )}
        className="cut-basic-overview"
        onClick={(event) => navigate(event.clientX)}
        onKeyDown={navigateWithKeyboard}
        ref={overviewRef}
        role="scrollbar"
        tabIndex={0}
      >
        {props.view.tracks.flatMap((track, trackIndex) =>
          track.items.flatMap((item, itemIndex) => {
            if (item.kind !== 'clip') return [];
            const range = readOverviewRange({
              startSeconds: item.startSeconds,
              durationSeconds: item.durationSeconds,
              timelineSeconds: props.timelineDurationSeconds,
            });
            return [
              <span
                className="cut-basic-overview-clip"
                data-kind={track.kind}
                key={`${track.trackId}-${item.clipId}-${itemIndex}`}
                style={{
                  left: `${range.leftPercent}%`,
                  top: `${4 + trackIndex * 9}px`,
                  width: `${range.widthPercent}%`,
                }}
              />,
            ];
          }),
        )}
        <span
          className="cut-basic-overview-viewport"
          style={{ left: `${viewport.leftPercent}%`, width: `${viewport.widthPercent}%` }}
        />
      </div>
    </div>
  );
});
