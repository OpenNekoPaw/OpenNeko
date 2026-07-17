/**
 * Element Operations Slice
 * 管理元素的基础增删改操作
 *
 * 已迁移到 EditOperation 系统：通过 dispatch 提交操作，
 * 不再直接 pushHistory + set()。
 *
 * 注意：updateElement 保持 raw set()（无历史记录），
 * 用于实时拖拽等高频操作场景。
 *
 * 职责:
 * - 基础 CRUD 操作 (add, update, remove, move)
 * - 元素属性切换 (hidden, muted)
 * - 视频音频分离操作
 *
 * 分割操作已移至 ElementSplitSlice
 */

import { StateCreator } from 'zustand';
import type {
  ProjectData,
  TimelineElement,
  TrackType,
  TimelineTrack,
  MediaElement,
  AudioElement,
} from '../../types';
import type { EditOperation } from '@neko/shared';
import { generateId } from '../../utils';
import { getMediaProxy } from '../../services/mediaProxyFactory';
import { CENTERED_TRANSFORM } from '@neko/shared';
import { createMeta } from '../utils/operation-helpers';
import { getLogger } from '../../utils/logger';

const logger = getLogger('ElementOpsSlice');

function getEffectiveDuration(element: TimelineElement): number {
  return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

function collectRippleShiftOps(
  track: TimelineTrack,
  startTime: number,
  delta: number,
  excludeElementIds: string[] = [],
): EditOperation[] {
  if (delta === 0) return [];

  const excludeIds = new Set(excludeElementIds);
  return track.elements
    .filter((element) => !excludeIds.has(element.id) && element.startTime >= startTime)
    .map((element) => ({
      type: 'element.update',
      meta: createMeta('system', 'Ripple shift'),
      payload: {
        trackId: track.id,
        elementId: element.id,
        updates: {
          startTime: Math.max(0, element.startTime + delta),
        },
      },
      before: {
        updates: {
          startTime: element.startTime,
        },
      },
    }));
}

/**
 * Detect if video file has audio track via Extension FFmpeg probe
 */
async function detectVideoHasAudio(src: string): Promise<boolean> {
  try {
    const mediaInfo = await getMediaProxy().probeMediaInfo(src);
    return mediaInfo?.hasAudio ?? false;
  } catch (error) {
    logger.warn('Failed to detect audio:', error);
    return false;
  }
}

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface DispatchDependency {
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;
}

interface UIStateDependency {
  rippleEditingEnabled: boolean;
}

interface TrackOpsDependency {
  addTrack: (type: TrackType, name?: string) => string;
}

// =============================================================================
// 音频分离类型
// =============================================================================

/** 音频分离结果 */
export interface SeparateAudioResult {
  /** 是否成功 */
  success: boolean;
  /** 创建的音频元素 ID */
  audioElementId?: string;
  /** 使用的音频轨道 ID */
  audioTrackId?: string;
  /** 是否创建了新轨道 */
  createdNewTrack?: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

// =============================================================================
// 扩展元素类型（添加关联字段）
// =============================================================================

/** 带关联的媒体元素 */
export interface LinkedMediaElement extends MediaElement {
  /** 关联的音频元素 ID（如果已分离） */
  linkedAudioId?: string;
}

/** 带关联的音频元素 */
export interface LinkedAudioElement extends AudioElement {
  /** 关联的视频元素 ID（如果是从视频分离出来的） */
  linkedVideoId?: string;
}

// =============================================================================
// 涟纹编辑工具函数
// =============================================================================

/**
 * 收集涟纹删除影响的元素信息（用于构建 before）
 */
function collectRippleAffected(
  elements: TimelineElement[],
  elementId: string,
): Array<{ elementId: string; startTime: number }> {
  const elementToRemove = elements.find((e) => e.id === elementId);
  if (!elementToRemove) return [];

  const removedDuration =
    elementToRemove.duration - elementToRemove.trimStart - elementToRemove.trimEnd;
  const removedEnd = elementToRemove.startTime + removedDuration;

  return elements
    .filter((e) => e.id !== elementId && e.startTime >= removedEnd)
    .map((e) => ({ elementId: e.id, startTime: e.startTime }));
}

// =============================================================================
// Slice 接口
// =============================================================================

/** 添加媒体元素并自动检测音频的结果 */
export interface AddMediaWithAudioResult {
  /** 视频元素 ID */
  videoElementId: string;
  /** 音频元素 ID（如果检测到音轨） */
  audioElementId?: string;
  /** 音频轨道 ID（如果创建了音频元素） */
  audioTrackId?: string;
  /** 是否创建了新的音频轨道 */
  createdNewAudioTrack?: boolean;
}

export interface ElementOpsSlice {
  // 基础 CRUD 操作
  /** 添加元素到轨道 */
  addElement: (trackId: string, element: Omit<TimelineElement, 'id'>) => string;
  /** 添加媒体元素（自动创建轨道） */
  addMediaElement: (
    trackId: string | null,
    src: string,
    name: string,
    duration: number,
    startTime?: number,
  ) => string;
  /** 添加媒体元素并自动检测音频（视频文件专用） */
  addMediaElementWithAudio: (
    trackId: string | null,
    src: string,
    name: string,
    duration: number,
    startTime?: number,
  ) => Promise<AddMediaWithAudioResult>;
  /** 删除元素（支持涟纹编辑） */
  removeElement: (trackId: string, elementId: string) => void;
  /** 更新元素属性（不记录历史，用于实时拖拽等高频操作） */
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  /** 移动元素到另一轨道 */
  moveElement: (fromTrackId: string, toTrackId: string, elementId: string) => void;

  // 元素属性切换
  /** 切换元素隐藏状态 */
  toggleElementHidden: (trackId: string, elementId: string) => void;
  /** 切换元素静音状态 */
  toggleElementMuted: (trackId: string, elementId: string) => void;

  // 视频音频分离
  /** 分离视频音频 */
  separateVideoAudio: (trackId: string, elementId: string) => Promise<SeparateAudioResult>;
  /** 取消分离（删除关联的音频元素） */
  unseparateVideoAudio: (trackId: string, elementId: string) => void;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createElementOpsSlice: StateCreator<
  ElementOpsSlice & ProjectDependency & DispatchDependency & UIStateDependency & TrackOpsDependency,
  [],
  [],
  ElementOpsSlice
> = (set, get) => ({
  addElement: (trackId, elementData) => {
    const { project, dispatch, dispatchBatch, rippleEditingEnabled } = get();
    if (!project) return '';

    const elementId = generateId();
    const newElement = { ...elementData, id: elementId } as TimelineElement;
    const targetTrack = project.tracks.find((track) => track.id === trackId);
    const addOp: EditOperation = {
      type: 'element.add',
      meta: createMeta('user', `Add ${newElement.name || 'element'}`),
      payload: { trackId, element: newElement },
    };

    if (rippleEditingEnabled && targetTrack) {
      const rippleOps = collectRippleShiftOps(
        targetTrack,
        newElement.startTime,
        getEffectiveDuration(newElement),
      );
      dispatchBatch([...rippleOps, addOp]);
    } else {
      dispatch(addOp);
    }

    return elementId;
  },

  addMediaElement: (trackId, src, name, duration, startTime = 0) => {
    const { project, dispatch, dispatchBatch, rippleEditingEnabled } = get();
    if (!project) return '';

    const ops: EditOperation[] = [];

    // Resolve target track
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const mediaTrack = project.tracks.find((t) => t.type === 'media');
      if (mediaTrack) {
        targetTrackId = mediaTrack.id;
      } else {
        // Create new media track
        targetTrackId = generateId();
        const newTrack: TimelineTrack = {
          id: targetTrackId,
          name: 'Media Track',
          type: 'media',
          elements: [],
          muted: false,
          locked: false,
          hidden: false,
          isMain: false,
        };
        ops.push({
          type: 'track.add',
          meta: createMeta('user', 'Add Media Track'),
          payload: { track: newTrack },
        });
      }
    }

    const targetTrack = project.tracks.find((track) => track.id === targetTrackId);

    // Create element
    const elementId = generateId();
    const newElement = {
      id: elementId,
      type: 'media',
      src,
      name,
      duration,
      startTime,
      trimStart: 0,
      trimEnd: 0,
      transform: CENTERED_TRANSFORM,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      muted: false,
      hidden: false,
      locked: false,
    } as TimelineElement;

    ops.push({
      type: 'element.add',
      meta: createMeta('user', `Add ${name}`),
      payload: { trackId: targetTrackId, element: newElement },
    });

    if (rippleEditingEnabled && targetTrack) {
      const rippleOps = collectRippleShiftOps(
        targetTrack,
        startTime,
        getEffectiveDuration(newElement),
      );
      ops.unshift(...rippleOps);
    }

    if (ops.length === 1) {
      dispatch(ops[0]!);
    } else {
      dispatchBatch(ops);
    }

    return elementId;
  },

  addMediaElementWithAudio: async (trackId, src, name, duration, startTime = 0) => {
    const { project, dispatch, dispatchBatch, rippleEditingEnabled } = get();
    if (!project) return { videoElementId: '' };

    const syncOps: EditOperation[] = [];

    // 1. Resolve or create video track
    let videoTrackId = trackId;
    let videoTrackIndex = -1;
    if (!videoTrackId) {
      const mediaTrack = project.tracks.find((t) => t.type === 'media');
      if (mediaTrack) {
        videoTrackId = mediaTrack.id;
        videoTrackIndex = project.tracks.findIndex((t) => t.id === mediaTrack.id);
      } else {
        videoTrackId = generateId();
        const newTrack: TimelineTrack = {
          id: videoTrackId,
          name: 'Media Track',
          type: 'media',
          elements: [],
          muted: false,
          locked: false,
          hidden: false,
          isMain: false,
        };
        syncOps.push({
          type: 'track.add',
          meta: createMeta('user', 'Add Media Track'),
          payload: { track: newTrack },
        });
        videoTrackIndex = project.tracks.length;
      }
    } else {
      videoTrackIndex = project.tracks.findIndex((t) => t.id === videoTrackId);
    }

    const targetVideoTrack = project.tracks.find((track) => track.id === videoTrackId);

    // 2. Create video element
    const videoElementId = generateId();
    const videoElement = {
      id: videoElementId,
      type: 'media',
      src,
      name,
      duration,
      startTime,
      trimStart: 0,
      trimEnd: 0,
      transform: CENTERED_TRANSFORM,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      muted: false,
      hidden: false,
      locked: false,
    } as TimelineElement;

    syncOps.push({
      type: 'element.add',
      meta: createMeta('user', `Add ${name}`),
      payload: { trackId: videoTrackId, element: videoElement },
    });

    if (rippleEditingEnabled && targetVideoTrack) {
      const rippleOps = collectRippleShiftOps(
        targetVideoTrack,
        startTime,
        getEffectiveDuration(videoElement),
      );
      syncOps.unshift(...rippleOps);
    }

    // Dispatch sync operations immediately
    if (syncOps.length === 1) {
      dispatch(syncOps[0]!);
    } else {
      dispatchBatch(syncOps);
    }

    // 3. Async: detect audio and create linked audio element
    const detectAndCreateAudio = async (): Promise<void> => {
      try {
        const hasAudio = await detectVideoHasAudio(src);
        if (!hasAudio) return;

        const currentProject = get().project;
        if (!currentProject) return;

        // Find or prepare audio track
        let audioTrackId: string | null = null;
        let audioTrack: TimelineTrack | undefined;
        let currentVideoTrackIndex = currentProject.tracks.findIndex((t) => t.id === videoTrackId);
        if (currentVideoTrackIndex === -1) currentVideoTrackIndex = videoTrackIndex;

        // Look for existing audio track below video track
        for (let i = currentVideoTrackIndex + 1; i < currentProject.tracks.length; i++) {
          const candidateTrack = currentProject.tracks[i];
          if (candidateTrack?.type === 'audio') {
            const hasConflict = candidateTrack.elements.some((e) => {
              const eStart = e.startTime;
              const eEnd = e.startTime + e.duration - e.trimStart - e.trimEnd;
              const newStart = startTime;
              const newEnd = startTime + duration;
              return !(newEnd <= eStart || newStart >= eEnd);
            });
            if (!hasConflict) {
              audioTrackId = candidateTrack.id;
              break;
            }
          }
        }

        // Create new audio track if needed
        if (!audioTrackId) {
          const videoTrack = currentProject.tracks[currentVideoTrackIndex];
          const videoTrackName = videoTrack?.name || 'V1';
          const trackNumber = videoTrackName.match(/\d+/)?.[0] || '1';

          audioTrackId = generateId();
          audioTrack = {
            id: audioTrackId,
            name: `A${trackNumber}`,
            type: 'audio',
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          };
        }

        // Create audio element
        const audioElementId = generateId();
        const audioElement = {
          id: audioElementId,
          type: 'audio',
          name: name,
          src: src,
          startTime: startTime,
          duration: duration,
          trimStart: 0,
          trimEnd: 0,
          audio: {
            volume: 1,
            pan: 0,
            muted: false,
          },
          linkedVideoId: videoElementId,
        } as TimelineElement;

        // Dispatch linkAudio operation
        const { dispatch: currentDispatch } = get();
        currentDispatch({
          type: 'element.linkAudio',
          meta: createMeta('system', `Link audio for ${name}`),
          payload: {
            videoTrackId: videoTrackId!,
            videoElementId,
            audioTrackId,
            audioElement,
            audioTrack,
          },
        });

        logger.info(`Audio element created asynchronously: ${audioElementId}`);
      } catch (error) {
        logger.error('Audio detection/creation failed:', error);
      }
    };

    // 4. Async: detect subtitles
    const detectAndCreateSubtitles = async (): Promise<void> => {
      try {
        const subtitleTracks = await getMediaProxy().extractSubtitles(src);
        if (!subtitleTracks || subtitleTracks.length === 0) return;

        logger.info(`Detected ${subtitleTracks.length} subtitle tracks`);

        for (const extractedTrack of subtitleTracks) {
          const trackName =
            extractedTrack.title || `Subtitle ${extractedTrack.language || 'Unknown'}`;

          // Build batch: track.add + all element.add
          const batchOps: EditOperation[] = [];

          const subtitleTrackId = generateId();
          const newTrack: TimelineTrack = {
            id: subtitleTrackId,
            name: trackName,
            type: 'subtitle',
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          };
          batchOps.push({
            type: 'track.add',
            meta: createMeta('system', `Add ${trackName}`),
            payload: { track: newTrack },
          });

          for (const cue of extractedTrack.cues) {
            const elementId = generateId();
            batchOps.push({
              type: 'element.add',
              meta: createMeta('system'),
              payload: {
                trackId: subtitleTrackId,
                element: {
                  id: elementId,
                  type: 'subtitle',
                  name: `${cue.text.substring(0, 30)}${cue.text.length > 30 ? '...' : ''}`,
                  text: cue.text,
                  fontSize: 48,
                  color: '#ffffff',
                  fontFamily: 'Arial',
                  backgroundColor: 'transparent',
                  textAlign: 'center',
                  strokeColor: 'transparent',
                  strokeWidth: 0,
                  duration: cue.endTime - cue.startTime,
                  startTime: cue.startTime,
                  trimStart: 0,
                  trimEnd: 0,
                  transform: CENTERED_TRANSFORM,
                  opacity: 1,
                  blendMode: 'normal',
                  effects: [],
                  muted: false,
                  hidden: false,
                  locked: false,
                } as TimelineElement,
              },
            });
          }

          const { dispatchBatch: batchDispatch } = get();
          batchDispatch(batchOps);
        }
      } catch (error) {
        logger.error('Subtitle detection failed:', error);
      }
    };

    // Await sequentially: the video element is already in the timeline (dispatched
    // above). Awaiting here lets addMediaElementWithAudio's caller (processDropItems)
    // sequence multiple video drops without interleaved audio-track creation races.
    await detectAndCreateAudio();
    await detectAndCreateSubtitles();

    return { videoElementId };
  },

  removeElement: (trackId, elementId) => {
    const { project, rippleEditingEnabled, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const elementIndex = track.elements.findIndex((e) => e.id === elementId);
    if (elementIndex === -1) return;
    const element = track.elements[elementIndex]!;

    // Collect before data
    const rippleAffected = rippleEditingEnabled
      ? collectRippleAffected(track.elements, elementId)
      : undefined;

    dispatch({
      type: 'element.remove',
      meta: createMeta('user', `Remove ${element.name || 'element'}`),
      payload: { trackId, elementId },
      before: {
        element,
        index: elementIndex,
        rippleAffected,
      },
    });
  },

  updateElement: (trackId, elementId, updates) => {
    // Raw set() — no history recording.
    // Used for real-time dragging, property panel slider changes, etc.
    const { project } = get();
    if (!project) return;

    // Validate duration vs trim
    if (updates.duration !== undefined) {
      const track = project.tracks.find((t) => t.id === trackId);
      const element = track?.elements.find((e) => e.id === elementId);
      if (element) {
        const newDuration = updates.duration;
        const minEffectiveDuration = 0.1;

        const trimStart = updates.trimStart ?? element.trimStart;
        const trimEnd = updates.trimEnd ?? element.trimEnd;

        if (trimStart + trimEnd >= newDuration - minEffectiveDuration) {
          updates.trimStart = 0;
          updates.trimEnd = 0;
        }
      }
    }

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId ? ({ ...e, ...updates } as TimelineElement) : e,
                ),
              }
            : t,
        ),
      },
    });
  },

  moveElement: (fromTrackId, toTrackId, elementId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const fromTrack = project.tracks.find((t) => t.id === fromTrackId);
    if (!fromTrack) return;

    const elementIndex = fromTrack.elements.findIndex((e) => e.id === elementId);
    if (elementIndex === -1) return;

    dispatch({
      type: 'element.move',
      meta: createMeta('user'),
      payload: { fromTrackId, toTrackId, elementId },
      before: { fromIndex: elementIndex },
    });
  },

  toggleElementHidden: (trackId, elementId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId);
    if (!element) return;

    dispatch({
      type: 'element.toggle',
      meta: createMeta('user'),
      payload: { trackId, elementId, field: 'hidden' },
      before: { value: element.hidden },
    });
  },

  toggleElementMuted: (trackId, elementId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId);
    if (!element) return;

    dispatch({
      type: 'element.toggle',
      meta: createMeta('user'),
      payload: { trackId, elementId, field: 'muted' },
      before: { value: element.muted },
    });
  },

  separateVideoAudio: async (trackId, elementId) => {
    const { project } = get();
    if (!project) {
      return { success: false, error: 'No project loaded' };
    }

    // 1. Find video element
    const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) {
      return { success: false, error: 'Invalid track' };
    }

    const track = project.tracks[trackIndex]!;
    if (track.type !== 'media') {
      return { success: false, error: 'Track is not a media track' };
    }

    const element = track.elements.find((e) => e.id === elementId);
    if (!element || element.type !== 'media') {
      return { success: false, error: 'Invalid element' };
    }

    const mediaElement = element as LinkedMediaElement;

    // 2. Check if already separated
    if (mediaElement.linkedAudioId) {
      return { success: false, error: 'Audio already separated' };
    }

    // 3. Detect audio track
    try {
      const hasAudio = await detectVideoHasAudio(mediaElement.src);
      if (!hasAudio) {
        return { success: false, error: 'Video has no audio track' };
      }
    } catch (error) {
      logger.error('Audio detection failed:', error);
      return { success: false, error: 'Failed to detect audio' };
    }

    // 4. Re-read project (may have changed during async)
    const currentProject = get().project;
    if (!currentProject) {
      return { success: false, error: 'Project unavailable' };
    }

    // 5. Find or prepare audio track
    let audioTrackId: string | null = null;
    let audioTrack: TimelineTrack | undefined;
    let createdNewTrack = false;

    const currentTrackIndex = currentProject.tracks.findIndex((t) => t.id === trackId);
    for (let i = currentTrackIndex + 1; i < currentProject.tracks.length; i++) {
      const candidateTrack = currentProject.tracks[i];
      if (candidateTrack?.type === 'audio' && candidateTrack.elements.length === 0) {
        audioTrackId = candidateTrack.id;
        break;
      }
    }

    if (!audioTrackId) {
      const videoTrackName = track.name;
      const trackNumber = videoTrackName.match(/\d+/)?.[0] || '1';

      audioTrackId = generateId();
      audioTrack = {
        id: audioTrackId,
        name: `A${trackNumber}`,
        type: 'audio',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      };
      createdNewTrack = true;
    }

    // 6. Create audio element
    const audioElementId = generateId();
    const audioElement = {
      id: audioElementId,
      type: 'audio',
      name: `${mediaElement.name}`,
      src: mediaElement.src,
      startTime: mediaElement.startTime,
      duration: mediaElement.duration,
      trimStart: mediaElement.trimStart,
      trimEnd: mediaElement.trimEnd,
      audio: mediaElement.audio || {
        volume: { baseValue: 1.0 },
        pan: { baseValue: 0 },
        muted: false,
      },
      linkedVideoId: elementId,
    } as TimelineElement;

    // 7. Dispatch single linkAudio operation
    const { dispatch } = get();
    dispatch({
      type: 'element.linkAudio',
      meta: createMeta('user', `Separate audio from ${mediaElement.name}`),
      payload: {
        videoTrackId: trackId,
        videoElementId: elementId,
        audioTrackId,
        audioElement,
        audioTrack,
      },
    });

    return {
      success: true,
      audioElementId,
      audioTrackId,
      createdNewTrack,
    };
  },

  unseparateVideoAudio: (trackId, elementId) => {
    const { project, dispatch } = get();
    if (!project) return;

    // Find video element
    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId);
    if (!element || element.type !== 'media') return;

    const mediaElement = element as LinkedMediaElement;
    const linkedAudioId = mediaElement.linkedAudioId;

    if (!linkedAudioId) {
      logger.warn('No linked audio found');
      return;
    }

    // Find linked audio element and its track
    let audioTrackId: string | null = null;
    let audioElement: TimelineElement | null = null;
    let audioTrack: TimelineTrack | undefined;

    for (const t of project.tracks) {
      if (t.type === 'audio') {
        const found = t.elements.find((e) => e.id === linkedAudioId);
        if (found) {
          audioTrackId = t.id;
          audioElement = found;
          // If track only has this element, it was likely created for this link
          if (t.elements.length === 1) {
            audioTrack = t;
          }
          break;
        }
      }
    }

    if (!audioTrackId || !audioElement) {
      logger.warn('Linked audio track/element not found');
      return;
    }

    dispatch({
      type: 'element.unlinkAudio',
      meta: createMeta('user', `Unseparate audio from ${mediaElement.name}`),
      payload: {
        videoTrackId: trackId,
        videoElementId: elementId,
      },
      before: {
        linkedAudioId,
        audioTrackId,
        audioElement,
        audioTrack,
      },
    });
  },
});
