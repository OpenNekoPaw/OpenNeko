// =============================================================================
// Apply Element Operations — 元素操作的 apply 实现
// =============================================================================

import type { TimelineElement, MediaElement } from '../types/element';
import type { ElementOperation, ElementSplitOperation } from './types';
import type { HasTracks } from './helpers';
import { findTrack, findElement, updateTrackInProject, updateElementInProject } from './helpers';

export function applyElementOperation<T extends HasTracks>(data: T, op: ElementOperation): T {
  switch (op.type) {
    case 'element.add': {
      const { trackId, element, index } = op.payload;
      return updateTrackInProject(data, trackId, (track) => {
        const newElements = [...track.elements];
        if (index !== undefined) {
          newElements.splice(index, 0, element);
        } else {
          newElements.push(element);
        }
        return { ...track, elements: newElements };
      });
    }

    case 'element.remove': {
      const { trackId, elementId } = op.payload;
      return updateTrackInProject(data, trackId, (track) => {
        const { element } = findElement(track, elementId);
        const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
        let newElements = track.elements.filter((e) => e.id !== elementId);

        // 涟纹编辑：后续元素前移
        if (op.before.rippleAffected && op.before.rippleAffected.length > 0) {
          const affectedIds = new Set(op.before.rippleAffected.map((a) => a.elementId));
          newElements = newElements.map((e) => {
            if (affectedIds.has(e.id)) {
              return { ...e, startTime: e.startTime - effectiveDuration };
            }
            return e;
          });
        }

        return { ...track, elements: newElements };
      });
    }

    case 'element.update': {
      const { trackId, elementId, updates } = op.payload;
      return updateElementInProject(data, trackId, elementId, (element) => {
        const merged = { ...element, ...updates } as TimelineElement;
        // 如果更新 duration 且 trimStart + trimEnd >= newDuration，重置 trim
        if (updates.duration !== undefined) {
          if (merged.trimStart + merged.trimEnd >= merged.duration) {
            return { ...merged, trimStart: 0, trimEnd: 0 };
          }
        }
        return merged;
      });
    }

    case 'element.move': {
      const { fromTrackId, toTrackId, elementId } = op.payload;
      // 从源 track 移除
      const { track: fromTrack } = findTrack(data, fromTrackId);
      const { element } = findElement(fromTrack, elementId);

      let result = updateTrackInProject(data, fromTrackId, (track) => ({
        ...track,
        elements: track.elements.filter((e) => e.id !== elementId),
      }));

      // 添加到目标 track
      result = updateTrackInProject(result, toTrackId, (track) => ({
        ...track,
        elements: [...track.elements, element],
      }));

      return result;
    }

    case 'element.toggle': {
      const { trackId, elementId, field } = op.payload;
      return updateElementInProject(
        data,
        trackId,
        elementId,
        (element) =>
          ({
            ...element,
            [field]: !element[field],
          }) as TimelineElement,
      );
    }

    case 'element.linkAudio': {
      const { videoTrackId, videoElementId, audioTrackId, audioElement, audioTrack } = op.payload;
      let result = data;

      // 如果需要创建新的 audio track
      if (audioTrack) {
        result = { ...result, tracks: [...result.tracks, audioTrack] };
      }

      // 添加 audio element 到 audio track
      result = updateTrackInProject(result, audioTrackId, (track) => ({
        ...track,
        elements: [...track.elements, audioElement],
      }));

      // 更新视频元素的 linkedAudioId
      result = updateElementInProject(
        result,
        videoTrackId,
        videoElementId,
        (element) =>
          ({
            ...element,
            linkedAudioId: audioElement.id,
          }) as TimelineElement,
      );

      return result;
    }

    case 'element.unlinkAudio': {
      const { videoTrackId, videoElementId } = op.payload;
      const { linkedAudioId, audioTrackId } = op.before;

      // 清除视频元素的 linkedAudioId
      let result = updateElementInProject(data, videoTrackId, videoElementId, (element) => {
        const { linkedAudioId: _, ...rest } = element as MediaElement;
        return rest as TimelineElement;
      });

      // 删除 audio element
      result = updateTrackInProject(result, audioTrackId, (track) => ({
        ...track,
        elements: track.elements.filter((e) => e.id !== linkedAudioId),
      }));

      // 如果 audio track 是专门创建的，也删除
      if (op.before.audioTrack) {
        result = { ...result, tracks: result.tracks.filter((t) => t.id !== audioTrackId) };
      }

      return result;
    }
  }
}

export function applyElementSplitOperation<T extends HasTracks>(
  data: T,
  op: ElementSplitOperation,
): T {
  switch (op.type) {
    case 'element.splitAt': {
      const { trackId, elementId, splitPoint, rightElement } = op.payload;
      // 修改原元素的 trimEnd（左半部分）
      let result = updateElementInProject(
        data,
        trackId,
        elementId,
        (element) =>
          ({
            ...element,
            trimEnd: element.duration - splitPoint,
          }) as TimelineElement,
      );

      // 追加右半部分新元素
      result = updateTrackInProject(result, trackId, (track) => ({
        ...track,
        elements: [...track.elements, rightElement],
      }));

      return result;
    }

    case 'element.splitKeepLeft': {
      const { trackId, elementId, splitPoint, newName } = op.payload;
      return updateElementInProject(
        data,
        trackId,
        elementId,
        (element) =>
          ({
            ...element,
            trimEnd: element.duration - splitPoint,
            name: newName,
          }) as TimelineElement,
      );
    }

    case 'element.splitKeepRight': {
      const { trackId, elementId, splitPoint, newStartTime, newName } = op.payload;
      return updateElementInProject(
        data,
        trackId,
        elementId,
        (element) =>
          ({
            ...element,
            startTime: newStartTime,
            trimStart: splitPoint,
            name: newName,
          }) as TimelineElement,
      );
    }
  }
}
