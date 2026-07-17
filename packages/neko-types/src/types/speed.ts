// =============================================================================
// Speed Properties (变速属性)
// =============================================================================

import { EasingType } from './easing';

/** Time remap keyframe */
export interface TimeRemapKeyframe {
  /** Unique identifier */
  id: string;
  /** Output time (position on timeline) */
  outputTime: number;
  /** Input time (position in source media) */
  inputTime: number;
  /** Easing to next keyframe */
  easing: EasingType;
}

/** Time remap data for variable speed */
export interface TimeRemapData {
  /** Whether time remapping is enabled */
  enabled: boolean;
  /** Keyframes for time remapping */
  keyframes: TimeRemapKeyframe[];
}

/** Speed control properties */
export interface SpeedProperties {
  /** Playback speed (1 = normal, 0.5 = half speed, 2 = double speed) */
  speed: number;
  /** Whether to preserve audio pitch when changing speed */
  preservePitch: boolean;
  /** Whether playback is reversed */
  reverse: boolean;
  /** Time remapping data (for complex speed changes) */
  timeRemap?: TimeRemapData;
}

export const DEFAULT_SPEED_PROPERTIES: SpeedProperties = {
  speed: 1,
  preservePitch: true,
  reverse: false,
};
