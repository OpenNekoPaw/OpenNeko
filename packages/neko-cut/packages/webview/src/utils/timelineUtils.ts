/**
 * Timeline Utilities
 * 时间线计算工具函数
 *
 * 职责：提供时间范围计算、碰撞检测等纯函数
 */

import { formatMediaTime } from '@neko/neko-client';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 时间范围
 */
export interface TimeRange {
  startTime: number;
  duration: number;
}

/**
 * 带位置的时间范围
 */
export interface PositionedTimeRange extends TimeRange {
  trackId?: string;
}

// =============================================================================
// 时间范围碰撞检测
// =============================================================================

/**
 * 检查两个时间范围是否重叠
 *
 * @param start1 第一个范围的开始时间
 * @param end1 第一个范围的结束时间
 * @param start2 第二个范围的开始时间
 * @param end2 第二个范围的结束时间
 * @returns 是否重叠
 */
export function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * 检查两个 TimeRange 是否重叠
 */
export function timeRangesOverlap(range1: TimeRange, range2: TimeRange): boolean {
  const end1 = range1.startTime + range1.duration;
  const end2 = range2.startTime + range2.duration;
  return rangesOverlap(range1.startTime, end1, range2.startTime, end2);
}

/**
 * 检查一个时间点是否在时间范围内
 */
export function isTimeInRange(time: number, range: TimeRange): boolean {
  return time >= range.startTime && time < range.startTime + range.duration;
}

// =============================================================================
// 位置计算
// =============================================================================

/**
 * 在给定的元素列表中找到不重叠的位置
 *
 * @param existingElements 已存在的元素列表
 * @param desiredStart 期望的开始时间
 * @param duration 元素时长
 * @returns 不重叠的开始时间
 */
export function findNonOverlappingPosition(
  existingElements: TimeRange[],
  desiredStart: number,
  duration: number,
): number {
  // 按开始时间排序
  const sorted = [...existingElements].sort((a, b) => a.startTime - b.startTime);

  let startTime = desiredStart;

  // 检查重叠并调整位置
  for (const elem of sorted) {
    const elemEnd = elem.startTime + elem.duration;

    if (rangesOverlap(startTime, startTime + duration, elem.startTime, elemEnd)) {
      // 将开始时间移动到该元素之后
      startTime = elemEnd;
    }
  }

  return startTime;
}

/**
 * 在给定的元素列表中找到不重叠的位置（考虑待添加的元素）
 *
 * @param existingElements 已存在的元素列表
 * @param pendingElements 待添加的元素列表
 * @param desiredStart 期望的开始时间
 * @param duration 元素时长
 * @returns 不重叠的开始时间
 */
export function findNonOverlappingPositionWithPending(
  existingElements: TimeRange[],
  pendingElements: TimeRange[],
  desiredStart: number,
  duration: number,
): number {
  const allElements = [...existingElements, ...pendingElements];
  return findNonOverlappingPosition(allElements, desiredStart, duration);
}

// =============================================================================
// 元素时长计算
// =============================================================================

/**
 * 计算元素的有效时长（考虑裁剪）
 *
 * @param duration 原始时长
 * @param trimStart 开始裁剪
 * @param trimEnd 结束裁剪
 * @returns 有效时长
 */
export function calculateEffectiveDuration(
  duration: number,
  trimStart: number,
  trimEnd: number,
): number {
  return Math.max(0, duration - trimStart - trimEnd);
}

/**
 * 计算元素的结束时间
 *
 * @param startTime 开始时间
 * @param duration 原始时长
 * @param trimStart 开始裁剪
 * @param trimEnd 结束裁剪
 * @returns 结束时间
 */
export function calculateElementEndTime(
  startTime: number,
  duration: number,
  trimStart: number,
  trimEnd: number,
): number {
  return startTime + calculateEffectiveDuration(duration, trimStart, trimEnd);
}

// =============================================================================
// 轨道时间计算
// =============================================================================

/**
 * 获取轨道的总时长（到最后一个元素结束）
 */
export function getTrackDuration(
  elements: Array<TimeRange & { trimStart?: number; trimEnd?: number }>,
): number {
  if (elements.length === 0) return 0;

  let maxEnd = 0;
  for (const elem of elements) {
    const effectiveDuration = calculateEffectiveDuration(
      elem.duration,
      elem.trimStart ?? 0,
      elem.trimEnd ?? 0,
    );
    const endTime = elem.startTime + effectiveDuration;
    if (endTime > maxEnd) {
      maxEnd = endTime;
    }
  }

  return maxEnd;
}

/**
 * 获取项目的总时长（所有轨道中最长的）
 */
export function getProjectDuration(
  tracks: Array<{ elements: Array<TimeRange & { trimStart?: number; trimEnd?: number }> }>,
): number {
  let maxDuration = 0;

  for (const track of tracks) {
    const trackDuration = getTrackDuration(track.elements);
    if (trackDuration > maxDuration) {
      maxDuration = trackDuration;
    }
  }

  return maxDuration;
}

// =============================================================================
// 时间格式化
// =============================================================================

/**
 * 将秒数格式化为时间字符串 (HH:MM:SS.mmm)
 */
export function formatTime(seconds: number, showMilliseconds = true): string {
  return formatMediaTime(seconds, {
    alwaysHours: true,
    fractionalDigits: showMilliseconds ? 3 : 0,
  });
}

/**
 * 将秒数格式化为简短时间字符串 (MM:SS)
 */
export function formatTimeShort(seconds: number): string {
  return formatMediaTime(seconds, { padMinutes: true, rollHoursIntoMinutes: true });
}

/**
 * 解析时间字符串为秒数
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');

  if (parts.length === 3) {
    // HH:MM:SS or HH:MM:SS.mmm
    const [hours, minutes, secondsWithMs] = parts;
    const [secs, ms = '0'] = secondsWithMs.split('.');
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(secs, 10) +
      parseInt(ms.padEnd(3, '0'), 10) / 1000
    );
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return parseInt(minutes, 10) * 60 + parseInt(seconds, 10);
  }

  return parseFloat(timeStr) || 0;
}

// =============================================================================
// 帧率相关计算
// =============================================================================

/**
 * 将时间对齐到帧
 */
export function snapToFrame(time: number, fps: number): number {
  const frame = Math.round(time * fps);
  return frame / fps;
}

/**
 * 将时间转换为帧数
 */
export function timeToFrames(time: number, fps: number): number {
  return Math.round(time * fps);
}

/**
 * 将帧数转换为时间
 */
export function framesToTime(frames: number, fps: number): number {
  return frames / fps;
}
