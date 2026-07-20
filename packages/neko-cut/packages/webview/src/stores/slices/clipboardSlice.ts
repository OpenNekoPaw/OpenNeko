/**
 * Clipboard Slice
 * 管理剪贴板操作(复制/粘贴)
 *
 * 已迁移到 EditOperation 系统：pasteAtTime 通过 dispatch clipboard.paste 操作。
 *
 * 使用 timelineUtils 提供的工具函数进行碰撞检测
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineElement, TimelineTrack, TrackType } from '../../types';
import type { EditOperation } from '@neko/shared';
import {
  rangesOverlap,
  calculateEffectiveDuration,
  type TimeRange,
} from '../../utils/timelineUtils';
import { generateId } from '../../utils';
import { createMeta } from '../utils/operation-helpers';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface SelectionDependency {
  selectedElements: Array<{ trackId: string; elementId: string }>;
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

export interface ClipboardSlice {
  // State
  clipboard: {
    items: Array<{ trackType: TrackType; element: Omit<TimelineElement, 'id'> }>;
  } | null;

  // Actions
  /** 复制选中的元素到剪贴板 */
  copySelected: () => void;
  /** 在指定时间粘贴剪贴板内容 */
  pasteAtTime: (time: number) => void;
  /** 清空剪贴板 */
  clearClipboard: () => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 在轨道上找到不重叠的位置
 * 使用 timelineUtils 的碰撞检测函数
 */
function findNonOverlappingPositionOnTrack(
  existingElements: TimeRange[],
  pendingElements: TimeRange[],
  desiredStart: number,
  duration: number,
): number {
  // 合并所有元素并排序
  const allElements = [...existingElements, ...pendingElements].sort(
    (a, b) => a.startTime - b.startTime,
  );

  let startTime = desiredStart;

  // 检查重叠并调整位置
  for (const elem of allElements) {
    const elemEnd = elem.startTime + elem.duration;

    if (rangesOverlap(startTime, startTime + duration, elem.startTime, elemEnd)) {
      // 将开始时间移动到该元素之后
      startTime = elemEnd;
    }
  }

  return startTime;
}

/**
 * 将轨道元素转换为 TimeRange 格式
 */
function elementToTimeRange(element: TimelineElement): TimeRange {
  return {
    startTime: element.startTime,
    duration: calculateEffectiveDuration(element.duration, element.trimStart, element.trimEnd),
  };
}

interface PasteTrackBlock {
  startTime: number;
  endTime: number;
}

function updatePasteTrackBlock(
  blocks: Map<string, PasteTrackBlock>,
  trackId: string,
  startTime: number,
  duration: number,
): void {
  const endTime = startTime + duration;
  const current = blocks.get(trackId);

  if (!current) {
    blocks.set(trackId, { startTime, endTime });
    return;
  }

  blocks.set(trackId, {
    startTime: Math.min(current.startTime, startTime),
    endTime: Math.max(current.endTime, endTime),
  });
}

function collectPasteRippleOps(track: TimelineTrack, block: PasteTrackBlock): EditOperation[] {
  const delta = block.endTime - block.startTime;
  if (delta <= 0) return [];

  return track.elements
    .filter((element) => {
      const elementRange = elementToTimeRange(element);
      const elementEnd = elementRange.startTime + elementRange.duration;
      return element.startTime >= block.startTime || elementEnd > block.startTime;
    })
    .map((element) => ({
      type: 'element.update' as const,
      meta: createMeta('system', 'Ripple paste shift'),
      payload: {
        trackId: track.id,
        elementId: element.id,
        updates: {
          startTime: element.startTime + delta,
        },
      },
      before: {
        updates: {
          startTime: element.startTime,
        },
      },
    }));
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createClipboardSlice: StateCreator<
  ClipboardSlice & ProjectDependency & SelectionDependency & DispatchDependency & UIStateDependency,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
  // Initial state
  clipboard: null,

  // Actions
  copySelected: () => {
    const { project, selectedElements } = get();
    if (!project || selectedElements.length === 0) return;

    const items: Array<{ trackType: TrackType; element: Omit<TimelineElement, 'id'> }> = [];
    for (const { trackId, elementId } of selectedElements) {
      const track = project.tracks.find((t) => t.id === trackId);
      const element = track?.elements.find((e) => e.id === elementId);
      if (track && element) {
        const { id: _id, ...rest } = element;
        items.push({ trackType: track.type, element: rest });
      }
    }
    set({ clipboard: { items } });
  },

  pasteAtTime: (time) => {
    const { clipboard, project, dispatch, dispatchBatch, rippleEditingEnabled } = get();
    if (!clipboard || clipboard.items.length === 0 || !project) return;

    const minStart = Math.min(...clipboard.items.map((x) => x.element.startTime));

    // Pre-compute all paste items with collision detection
    const pasteItems: Array<{
      trackId: string;
      element: TimelineElement;
      newTrack?: TimelineTrack;
    }> = [];

    // Track new tracks we'll create (for finding existing vs new)
    const newTracks = new Map<TrackType, TimelineTrack>();

    // Track pending elements per track (for collision detection across paste items)
    const pendingElements = new Map<string, TimeRange[]>();
    const pasteTrackBlocks = new Map<string, PasteTrackBlock>();

    for (const item of clipboard.items) {
      let trackId: string;
      let targetTrack = project.tracks.find((t) => t.type === item.trackType);
      let newTrack: TimelineTrack | undefined;

      if (!targetTrack) {
        // Check if we already created a track for this type
        const existing = newTracks.get(item.trackType);
        if (existing) {
          trackId = existing.id;
          targetTrack = undefined; // no existing elements
        } else {
          // Create new track as part of the operation
          trackId = generateId();
          newTrack = {
            id: trackId,
            name: `${item.trackType.charAt(0).toUpperCase() + item.trackType.slice(1)} Track`,
            type: item.trackType,
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          };
          newTracks.set(item.trackType, newTrack);
        }
      } else {
        trackId = targetTrack.id;
      }

      const relativeOffset = item.element.startTime - minStart;
      const desiredStartTime = Math.max(0, time + relativeOffset);
      const elementDuration = calculateEffectiveDuration(
        item.element.duration,
        item.element.trimStart,
        item.element.trimEnd,
      );

      // Get existing elements on the target track
      const existingElements: TimeRange[] = targetTrack
        ? targetTrack.elements.map(elementToTimeRange)
        : [];

      // Get pending elements already computed for this track
      const pending = pendingElements.get(trackId) || [];

      const actualStartTime = rippleEditingEnabled
        ? desiredStartTime
        : findNonOverlappingPositionOnTrack(
            existingElements,
            pending,
            desiredStartTime,
            elementDuration,
          );

      // Record pending element for future collision checks
      if (!pendingElements.has(trackId)) {
        pendingElements.set(trackId, []);
      }
      pendingElements.get(trackId)!.push({
        startTime: actualStartTime,
        duration: elementDuration,
      });
      updatePasteTrackBlock(pasteTrackBlocks, trackId, actualStartTime, elementDuration);

      // Build element with new ID
      const elementId = generateId();
      pasteItems.push({
        trackId,
        element: {
          ...item.element,
          id: elementId,
          startTime: actualStartTime,
        } as TimelineElement,
        newTrack,
      });
    }

    const pasteOp: EditOperation = {
      type: 'clipboard.paste',
      meta: createMeta('user', `Paste ${pasteItems.length} element(s)`),
      payload: { items: pasteItems },
    };

    if (!rippleEditingEnabled) {
      dispatch(pasteOp);
      return;
    }

    const rippleOps = Array.from(pasteTrackBlocks.entries()).flatMap(([trackId, block]) => {
      const track = project.tracks.find((candidate) => candidate.id === trackId);
      return track ? collectPasteRippleOps(track, block) : [];
    });

    if (rippleOps.length === 0) {
      dispatch(pasteOp);
      return;
    }

    dispatchBatch([...rippleOps, pasteOp]);
  },

  clearClipboard: () => set({ clipboard: null }),
});
