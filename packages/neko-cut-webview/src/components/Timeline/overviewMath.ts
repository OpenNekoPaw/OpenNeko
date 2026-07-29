export interface TimelineOverviewViewport {
  readonly leftPercent: number;
  readonly widthPercent: number;
}

export interface TimelineOverviewRange {
  readonly leftPercent: number;
  readonly widthPercent: number;
}

export function readOverviewViewport(input: {
  readonly scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}): TimelineOverviewViewport {
  if (input.scrollWidth <= 0 || input.clientWidth <= 0) {
    return { leftPercent: 0, widthPercent: 100 };
  }
  const widthPercent = Math.min(100, (input.clientWidth / input.scrollWidth) * 100);
  const maxLeftPercent = 100 - widthPercent;
  return {
    leftPercent: Math.min(
      maxLeftPercent,
      Math.max(0, (input.scrollLeft / input.scrollWidth) * 100),
    ),
    widthPercent,
  };
}

export function readOverviewScrollLeft(input: {
  readonly pointerRatio: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}): number {
  const maxScrollLeft = Math.max(0, input.scrollWidth - input.clientWidth);
  const pointerRatio = Math.min(1, Math.max(0, input.pointerRatio));
  return Math.min(
    maxScrollLeft,
    Math.max(0, pointerRatio * input.scrollWidth - input.clientWidth / 2),
  );
}

export function toOverviewPercent(seconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / durationSeconds) * 100));
}

export function readOverviewRange(input: {
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly timelineSeconds: number;
}): TimelineOverviewRange {
  const start = toOverviewPercent(input.startSeconds, input.timelineSeconds);
  const end = toOverviewPercent(
    input.startSeconds + Math.max(0, input.durationSeconds),
    input.timelineSeconds,
  );
  return { leftPercent: start, widthPercent: Math.max(0, end - start) };
}
