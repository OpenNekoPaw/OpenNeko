/**
 * Speed Control Utilities
 * 速度控制工具 - 处理变速、倒放和时间重映射
 */

import { formatMediaTimeCentiseconds } from '@neko/neko-client';
import type { EasingType } from '../types/animation';
import { applyEasing } from './animation';

// =============================================================================
// Speed Properties Types
// =============================================================================

/**
 * Time remap keyframe for advanced speed control
 * 时间重映射关键帧
 */
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

/**
 * Time remap data for variable speed
 * 时间重映射数据（用于变速曲线）
 */
export interface TimeRemapData {
  /** Whether time remapping is enabled */
  enabled: boolean;
  /** Keyframes for time remapping */
  keyframes: TimeRemapKeyframe[];
}

/**
 * Speed control properties for an element
 * 元素的速度控制属性
 */
export interface SpeedProperties {
  /** Playback speed (0.1 - 4.0, 1.0 = normal) */
  speed: number;
  /** Whether to play in reverse */
  reverse: boolean;
  /** Preserve audio pitch when changing speed */
  preservePitch: boolean;
  /** Advanced time remapping (optional) */
  timeRemap?: TimeRemapData;
}

// =============================================================================
// Speed Presets
// =============================================================================

/**
 * Common speed presets
 * 常用速度预设
 */
export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

/**
 * Speed preset translation keys for i18n
 * 速度预设的翻译键
 */
export const SPEED_PRESET_I18N_KEYS: Record<number, string> = {
  0.25: 'speed.preset.quarterSpeed',
  0.5: 'speed.preset.halfSpeed',
  0.75: 'speed.preset.threeQuarterSpeed',
  1: 'speed.preset.normalSpeed',
  1.25: 'speed.preset.oneAndQuarterSpeed',
  1.5: 'speed.preset.oneAndHalfSpeed',
  2: 'speed.preset.doubleSpeed',
  4: 'speed.preset.quadrupleSpeed',
};

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default speed properties
 * 创建默认速度属性
 */
export function createDefaultSpeedProperties(): SpeedProperties {
  return {
    speed: 1,
    reverse: false,
    preservePitch: true,
  };
}

/**
 * Create a time remap keyframe
 * 创建时间重映射关键帧
 */
export function createTimeRemapKeyframe(
  outputTime: number,
  inputTime: number,
  easing: EasingType = 'linear',
): TimeRemapKeyframe {
  return {
    id: `trk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    outputTime,
    inputTime,
    easing,
  };
}

/**
 * Create default time remap data for an element
 * 为元素创建默认时间重映射数据
 */
export function createDefaultTimeRemap(duration: number): TimeRemapData {
  return {
    enabled: false,
    keyframes: [createTimeRemapKeyframe(0, 0), createTimeRemapKeyframe(duration, duration)],
  };
}

// =============================================================================
// Speed Calculations
// =============================================================================

/**
 * Calculate the effective duration after speed change
 * 计算变速后的有效时长
 *
 * @param originalDuration - Original media duration
 * @param speed - Speed properties
 * @returns Adjusted duration
 */
export function getSpeedAdjustedDuration(
  originalDuration: number,
  speed: SpeedProperties | undefined,
): number {
  if (!speed) return originalDuration;

  // If time remap is enabled, use the last output time
  if (speed.timeRemap?.enabled && speed.timeRemap.keyframes.length >= 2) {
    const sorted = [...speed.timeRemap.keyframes].sort((a, b) => a.outputTime - b.outputTime);
    return sorted[sorted.length - 1].outputTime;
  }

  return originalDuration / speed.speed;
}

/**
 * Calculate source media time from output (timeline) time
 * 根据输出时间（时间轴）计算源媒体时间
 *
 * @param outputTime - Time on the timeline
 * @param speed - Speed properties
 * @param originalDuration - Original media duration
 * @returns Source media time
 */
export function getSourceTimeFromOutputTime(
  outputTime: number,
  speed: SpeedProperties | undefined,
  originalDuration: number,
): number {
  if (!speed) return outputTime;

  // Use time remap if enabled
  if (speed.timeRemap?.enabled && speed.timeRemap.keyframes.length >= 2) {
    return calculateTimeRemapValue(outputTime, speed.timeRemap.keyframes);
  }

  // Simple speed calculation
  let sourceTime = outputTime * speed.speed;

  // Handle reverse playback
  if (speed.reverse) {
    sourceTime = originalDuration - sourceTime;
  }

  return Math.max(0, Math.min(sourceTime, originalDuration));
}

/**
 * Calculate output time from source media time
 * 根据源媒体时间计算输出时间
 *
 * @param sourceTime - Time in source media
 * @param speed - Speed properties
 * @param originalDuration - Original media duration
 * @returns Output (timeline) time
 */
export function getOutputTimeFromSourceTime(
  sourceTime: number,
  speed: SpeedProperties | undefined,
  originalDuration: number,
): number {
  if (!speed) return sourceTime;

  // Handle reverse playback
  let adjustedSourceTime = sourceTime;
  if (speed.reverse) {
    adjustedSourceTime = originalDuration - sourceTime;
  }

  // Use time remap if enabled
  if (speed.timeRemap?.enabled && speed.timeRemap.keyframes.length >= 2) {
    return calculateInverseTimeRemap(adjustedSourceTime, speed.timeRemap.keyframes);
  }

  return adjustedSourceTime / speed.speed;
}

/**
 * Calculate the instantaneous speed at a given output time
 * 计算给定输出时间的瞬时速度
 *
 * @param outputTime - Time on the timeline
 * @param speed - Speed properties
 * @returns Instantaneous speed multiplier
 */
export function getInstantSpeed(outputTime: number, speed: SpeedProperties | undefined): number {
  if (!speed) return 1;

  if (speed.timeRemap?.enabled && speed.timeRemap.keyframes.length >= 2) {
    const epsilon = 0.001;
    const t1 = calculateTimeRemapValue(outputTime, speed.timeRemap.keyframes);
    const t2 = calculateTimeRemapValue(outputTime + epsilon, speed.timeRemap.keyframes);
    return Math.abs(t2 - t1) / epsilon;
  }

  return speed.reverse ? -speed.speed : speed.speed;
}

// =============================================================================
// Time Remap Calculations
// =============================================================================

/**
 * Calculate interpolated input time from output time using time remap keyframes
 * 使用时间重映射关键帧计算插值后的输入时间
 *
 * @param outputTime - Time on the timeline
 * @param keyframes - Time remap keyframes
 * @returns Interpolated source time
 */
export function calculateTimeRemapValue(
  outputTime: number,
  keyframes: TimeRemapKeyframe[],
): number {
  if (keyframes.length === 0) return outputTime;

  const sorted = [...keyframes].sort((a, b) => a.outputTime - b.outputTime);

  // Before first keyframe
  if (outputTime <= sorted[0].outputTime) {
    return sorted[0].inputTime;
  }

  // After last keyframe
  if (outputTime >= sorted[sorted.length - 1].outputTime) {
    return sorted[sorted.length - 1].inputTime;
  }

  // Find surrounding keyframes and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    if (outputTime >= sorted[i].outputTime && outputTime < sorted[i + 1].outputTime) {
      const prev = sorted[i];
      const next = sorted[i + 1];

      const duration = next.outputTime - prev.outputTime;
      const progress = duration > 0 ? (outputTime - prev.outputTime) / duration : 0;
      const easedProgress = applyEasing(progress, prev.easing);

      return prev.inputTime + (next.inputTime - prev.inputTime) * easedProgress;
    }
  }

  return outputTime;
}

/**
 * Calculate output time from input time (inverse of time remap)
 * 从输入时间计算输出时间（时间重映射的逆运算）
 *
 * @param inputTime - Source media time
 * @param keyframes - Time remap keyframes
 * @returns Estimated output time
 */
export function calculateInverseTimeRemap(
  inputTime: number,
  keyframes: TimeRemapKeyframe[],
): number {
  if (keyframes.length === 0) return inputTime;

  const sorted = [...keyframes].sort((a, b) => a.outputTime - b.outputTime);

  // Simple linear search for now (could be optimized with binary search)
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];

    const minInput = Math.min(prev.inputTime, next.inputTime);
    const maxInput = Math.max(prev.inputTime, next.inputTime);

    if (inputTime >= minInput && inputTime <= maxInput) {
      // Linear approximation (ignoring easing for inverse)
      const inputProgress = (inputTime - prev.inputTime) / (next.inputTime - prev.inputTime);
      return prev.outputTime + inputProgress * (next.outputTime - prev.outputTime);
    }
  }

  // If not found in any segment, extrapolate from nearest end
  if (inputTime < sorted[0].inputTime) {
    return sorted[0].outputTime;
  }
  return sorted[sorted.length - 1].outputTime;
}

// =============================================================================
// Speed Validation
// =============================================================================

/**
 * Validate speed value
 * 验证速度值
 */
export function isValidSpeed(speed: number): boolean {
  return speed >= 0.1 && speed <= 4.0;
}

/**
 * Clamp speed to valid range
 * 将速度限制在有效范围内
 */
export function clampSpeed(speed: number): number {
  return Math.max(0.1, Math.min(4.0, speed));
}

// =============================================================================
// Speed Display Utilities
// =============================================================================

/**
 * Format speed for display
 * 格式化速度以供显示
 */
export function formatSpeed(speed: number): string {
  return `${speed.toFixed(2)}x`;
}

/**
 * Format time for display
 * 格式化时间以供显示
 */
export function formatTime(seconds: number): string {
  return formatMediaTimeCentiseconds(seconds);
}
