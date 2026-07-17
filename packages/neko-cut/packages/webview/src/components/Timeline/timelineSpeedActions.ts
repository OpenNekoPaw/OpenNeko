import type { TimelineElement } from '../../types';
import type { SpeedProperties } from '../../utils/speed';
import {
  clampSpeed,
  createDefaultSpeedProperties,
  getSpeedAdjustedDuration,
} from '../../utils/speed';

const MIN_TIMELINE_DURATION = 0.1;

function getSimpleSpeedProperties(
  speed: SpeedProperties | undefined,
  overrides: Partial<SpeedProperties>,
): SpeedProperties {
  const defaults = createDefaultSpeedProperties();

  return {
    speed: overrides.speed ?? speed?.speed ?? defaults.speed,
    preservePitch: overrides.preservePitch ?? speed?.preservePitch ?? defaults.preservePitch,
    reverse: overrides.reverse ?? speed?.reverse ?? defaults.reverse,
  };
}

function isDefaultSpeedProperties(speed: SpeedProperties): boolean {
  return speed.speed === 1 && speed.reverse === false && speed.preservePitch === true;
}

export function buildTimelineSpeedUpdates(
  element: TimelineElement,
  nextPlaybackSpeed: number,
): Partial<TimelineElement> {
  const nextSpeed = getSimpleSpeedProperties(element.speed, {
    speed: clampSpeed(nextPlaybackSpeed),
  });
  const currentSpeed = clampSpeed(element.speed?.speed ?? 1);
  const effectiveDuration = Math.max(
    MIN_TIMELINE_DURATION,
    element.duration - element.trimStart - element.trimEnd,
  );
  const sourceEffectiveDuration = effectiveDuration * currentSpeed;
  const nextEffectiveDuration = Math.max(
    MIN_TIMELINE_DURATION,
    getSpeedAdjustedDuration(sourceEffectiveDuration, nextSpeed),
  );

  return {
    duration: nextEffectiveDuration + element.trimStart + element.trimEnd,
    speed: isDefaultSpeedProperties(nextSpeed) ? undefined : nextSpeed,
  };
}

export function buildTimelineReverseUpdates(element: TimelineElement): Partial<TimelineElement> {
  const nextSpeed = getSimpleSpeedProperties(element.speed, {
    reverse: !(element.speed?.reverse ?? false),
  });

  return {
    speed: isDefaultSpeedProperties(nextSpeed) ? undefined : nextSpeed,
  };
}
