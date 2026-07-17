/**
 * Element Split Slice
 * 管理元素分割操作
 *
 * 已迁移到 EditOperation 系统：通过 dispatch 提交操作，
 * 不再调用 ElementOps.updateElement/addElement。
 *
 * 依赖: Project, Playback, Dispatch
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineElement } from '../../types';
import type { EditOperation } from '@neko/shared';
import { generateId } from '../../utils';
import { createMeta } from '../utils/operation-helpers';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface PlaybackDependency {
  currentTime: number;
}

interface DispatchDependency {
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;
}

interface UIStateDependency {
  rippleEditingEnabled: boolean;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface ElementSplitSlice {
  /** 在播放头位置分割元素，生成两个元素 */
  splitAtPlayhead: (trackId: string, elementId: string) => void;
  /** 在播放头位置分割，只保留左侧部分 */
  splitAndKeepLeft: (trackId: string, elementId: string) => void;
  /** 在播放头位置分割，只保留右侧部分 */
  splitAndKeepRight: (trackId: string, elementId: string) => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 查找元素并计算有效时长
 */
function findElementWithDuration(
  project: ProjectData,
  trackId: string,
  elementId: string,
): { element: TimelineElement; effectiveDuration: number; elementEnd: number } | null {
  const track = project.tracks.find((t) => t.id === trackId);
  const element = track?.elements.find((e) => e.id === elementId);
  if (!element) return null;

  const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
  const elementEnd = element.startTime + effectiveDuration;

  return { element, effectiveDuration, elementEnd };
}

/**
 * 检查播放头是否在元素范围内
 */
function isPlayheadInElement(
  currentTime: number,
  elementStart: number,
  elementEnd: number,
): boolean {
  return currentTime > elementStart && currentTime < elementEnd;
}

/**
 * 计算分割点（相对于元素原始时长）
 */
function calculateSplitPoint(currentTime: number, elementStart: number, trimStart: number): number {
  return currentTime - elementStart + trimStart;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createElementSplitSlice: StateCreator<
  ElementSplitSlice &
    ProjectDependency &
    PlaybackDependency &
    DispatchDependency &
    UIStateDependency,
  [],
  [],
  ElementSplitSlice
> = (_set, get) => ({
  splitAtPlayhead: (trackId, elementId) => {
    const { project, currentTime, dispatch, dispatchBatch, rippleEditingEnabled } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);

    // 构建右半部分新元素（含新 ID）
    const rightElement: TimelineElement = {
      ...element,
      id: generateId(),
      startTime: currentTime,
      trimStart: splitPoint,
      trimEnd: element.trimEnd,
      name: `${element.name} (split)`,
    };

    const splitOp: EditOperation = {
      type: 'element.splitAt',
      meta: createMeta('user', `Split ${element.name}`),
      payload: {
        trackId,
        elementId,
        splitPoint,
        rightElement,
      },
      before: { trimEnd: element.trimEnd },
    };

    if (rippleEditingEnabled) {
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      const rippleDelta = rightElement.duration - rightElement.trimStart - rightElement.trimEnd;
      const rippleOps: EditOperation[] =
        track?.elements
          .filter((candidate) => candidate.id !== elementId && candidate.startTime >= currentTime)
          .map((candidate) => ({
            type: 'element.update' as const,
            meta: createMeta('system', 'Ripple shift after split'),
            payload: {
              trackId,
              elementId: candidate.id,
              updates: {
                startTime: candidate.startTime + rippleDelta,
              },
            },
            before: {
              updates: {
                startTime: candidate.startTime,
              },
            },
          })) ?? [];

      if (rippleOps.length > 0) {
        dispatchBatch([splitOp, ...rippleOps]);
        return;
      }
    }

    dispatch(splitOp);
  },

  splitAndKeepLeft: (trackId, elementId) => {
    const { project, currentTime, dispatch } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);
    const newName = `${element.name} (left)`;

    dispatch({
      type: 'element.splitKeepLeft',
      meta: createMeta('user', `Keep left of ${element.name}`),
      payload: { trackId, elementId, splitPoint, newName },
      before: { trimEnd: element.trimEnd, name: element.name },
    });
  },

  splitAndKeepRight: (trackId, elementId) => {
    const { project, currentTime, dispatch } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);
    const newName = `${element.name} (right)`;

    dispatch({
      type: 'element.splitKeepRight',
      meta: createMeta('user', `Keep right of ${element.name}`),
      payload: {
        trackId,
        elementId,
        splitPoint,
        newStartTime: currentTime,
        newName,
      },
      before: {
        startTime: element.startTime,
        trimStart: element.trimStart,
        name: element.name,
      },
    });
  },
});
