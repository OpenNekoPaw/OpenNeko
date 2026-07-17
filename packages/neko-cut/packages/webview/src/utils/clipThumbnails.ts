import type { TimelineElement } from '../types';
import { getSourceTimeFromOutputTime } from './speed';

interface VisibleRange {
  startTime: number;
  endTime: number;
}

export interface ClipThumbnailTimelineRange {
  startTime: number;
  endTime: number;
}

export interface ClipThumbnailRequest {
  key: string;
  displayTime: number;
  sourceTime: number;
  displayDuration: number;
}

const TIME_PRECISION = 1000;
const SOURCE_EDGE_EPSILON_SECONDS = 0.001;

function roundTime(time: number): number {
  return Math.round(time * TIME_PRECISION) / TIME_PRECISION;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPlaybackSpeed(element: TimelineElement): number {
  const speed = element.speed?.speed ?? 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export function getClipTimelineDuration(element: TimelineElement): number {
  return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

function getClipSourceDuration(element: TimelineElement): number {
  const timelineDuration = getClipTimelineDuration(element);
  const timeRemap = element.speed?.timeRemap;
  if (timeRemap?.enabled && timeRemap.keyframes.length >= 2) {
    return Math.max(0, ...timeRemap.keyframes.map((keyframe) => keyframe.inputTime));
  }
  return Math.max(0, timelineDuration * getPlaybackSpeed(element));
}

export function getClipSourceTimeAtDisplayTime(
  element: TimelineElement,
  displayTime: number,
): number {
  const timelineDuration = getClipTimelineDuration(element);
  const sourceDuration = getClipSourceDuration(element);

  if (sourceDuration <= 0 || timelineDuration <= 0) {
    return roundTime(Math.max(0, element.trimStart));
  }

  const sourceOffset = getSourceTimeFromOutputTime(
    clamp(displayTime, 0, timelineDuration),
    element.speed,
    sourceDuration,
  );
  const clampedSourceOffset = clamp(
    sourceOffset,
    0,
    Math.max(0, sourceDuration - SOURCE_EDGE_EPSILON_SECONDS),
  );

  return roundTime(element.trimStart + clampedSourceOffset);
}

export function getClipThumbnailTimelineRange(
  visibleRange: VisibleRange | undefined,
  elementStartTime: number,
  timelineDuration: number,
  interval: number,
): ClipThumbnailTimelineRange {
  if (timelineDuration <= 0) {
    return { startTime: 0, endTime: 0 };
  }

  if (!visibleRange) {
    return { startTime: 0, endTime: roundTime(timelineDuration) };
  }

  const visibleDuration = Math.max(0, visibleRange.endTime - visibleRange.startTime);
  const buffer = visibleDuration * 0.5;
  const elementEndTime = elementStartTime + timelineDuration;
  const visibleStart = Math.max(visibleRange.startTime, elementStartTime);
  const visibleEnd = Math.min(visibleRange.endTime, elementEndTime);

  let startTime = visibleStart - elementStartTime - buffer;
  let endTime = visibleEnd - elementStartTime + buffer;

  startTime = Math.max(0, Math.floor(startTime / interval) * interval);
  endTime = Math.min(timelineDuration, Math.ceil(endTime / interval) * interval);

  return {
    startTime: roundTime(startTime),
    endTime: roundTime(endTime),
  };
}

export function buildClipThumbnailRequests(
  element: TimelineElement,
  range: ClipThumbnailTimelineRange,
  interval: number,
): ClipThumbnailRequest[] {
  const timelineDuration = getClipTimelineDuration(element);
  if (timelineDuration <= 0 || interval <= 0 || range.endTime < range.startTime) {
    return [];
  }

  const requests: ClipThumbnailRequest[] = [];
  const endTime = Math.min(range.endTime, timelineDuration);

  for (let displayTime = range.startTime; displayTime < endTime; displayTime += interval) {
    const roundedDisplayTime = roundTime(displayTime);
    const sourceTime = getClipSourceTimeAtDisplayTime(element, roundedDisplayTime);
    const displayDuration = roundTime(Math.min(interval, timelineDuration - roundedDisplayTime));

    if (displayDuration <= 0) {
      continue;
    }

    requests.push({
      key: `${roundedDisplayTime}:${sourceTime}`,
      displayTime: roundedDisplayTime,
      sourceTime,
      displayDuration,
    });
  }

  if (requests.length === 0 && range.startTime < timelineDuration) {
    const displayTime = roundTime(range.startTime);
    const sourceTime = getClipSourceTimeAtDisplayTime(element, displayTime);
    requests.push({
      key: `${displayTime}:${sourceTime}`,
      displayTime,
      sourceTime,
      displayDuration: roundTime(Math.min(interval, timelineDuration - displayTime)),
    });
  }

  return requests;
}
