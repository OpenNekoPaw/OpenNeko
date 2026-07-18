/**
 * Track Operations Slice
 * 管理轨道的增删改操作
 *
 * 已迁移到 EditOperation 系统：通过 dispatch 提交操作，
 * 不再直接 pushHistory + set()。
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineTrack, TrackType } from '../../types';
import type { EditOperation } from '@neko/shared';
import { generateId } from '../../utils';
import { createMeta, pickBefore } from '../utils/operation-helpers';

// 依赖接口
interface ProjectDependency {
  project: ProjectData | null;
}

interface DispatchDependency {
  dispatch: (op: EditOperation) => void;
}

export interface TrackOpsSlice {
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  reorderTracks: (sourceIndex: number, targetIndex: number) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  moveTrackUp: (trackId: string) => void;
  moveTrackDown: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
  toggleTrackHidden: (trackId: string) => void;
}

export const createTrackOpsSlice: StateCreator<
  TrackOpsSlice & ProjectDependency & DispatchDependency,
  [],
  [],
  TrackOpsSlice
> = (_set, get) => ({
  addTrack: (type, name) => {
    const { project, dispatch } = get();
    if (!project) return '';

    const trackId = generateId();
    const defaultNames: Record<TrackType, string> = {
      video: 'Video Track',
      media: 'Media Track',
      text: 'Text Track',
      audio: 'Audio Track',
      subtitle: 'Subtitle Track',
      shape: 'Shape Track',
      effect: 'Effect Track',
    };
    const trackName = name || defaultNames[type] || 'Track';
    const newTrack: TimelineTrack = {
      id: trackId,
      name: trackName,
      type,
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    };

    dispatch({
      type: 'track.add',
      meta: createMeta('user', `Add ${trackName}`),
      payload: { track: newTrack },
    });

    return trackId;
  },

  removeTrack: (trackId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index === -1) return;
    const track = project.tracks[index];

    dispatch({
      type: 'track.remove',
      meta: createMeta('user', `Remove ${track.name}`),
      payload: { trackId },
      before: { track, index },
    });
  },

  updateTrack: (trackId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    dispatch({
      type: 'track.update',
      meta: createMeta('user'),
      payload: { trackId, updates },
      before: { updates: pickBefore(track, updates) },
    });
  },

  reorderTracks: (sourceIndex, targetIndex) => {
    const { project, dispatch } = get();
    if (!project) return;
    if (sourceIndex === targetIndex) return;

    const track = project.tracks[sourceIndex];
    if (!track) return;

    dispatch({
      type: 'track.reorder',
      meta: createMeta('user'),
      payload: { trackId: track.id, fromIndex: sourceIndex, toIndex: targetIndex },
    });
  },

  reorderTrack: (trackId, newIndex) => {
    const { project, dispatch } = get();
    if (!project) return;

    const currentIndex = project.tracks.findIndex((t) => t.id === trackId);
    if (currentIndex === -1) return;

    const clampedIndex = Math.max(0, Math.min(newIndex, project.tracks.length - 1));
    if (currentIndex === clampedIndex) return;

    dispatch({
      type: 'track.reorder',
      meta: createMeta('user'),
      payload: { trackId, fromIndex: currentIndex, toIndex: clampedIndex },
    });
  },

  moveTrackUp: (trackId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index <= 0) return;

    dispatch({
      type: 'track.reorder',
      meta: createMeta('user'),
      payload: { trackId, fromIndex: index, toIndex: index - 1 },
    });
  },

  moveTrackDown: (trackId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index === -1 || index >= project.tracks.length - 1) return;

    dispatch({
      type: 'track.reorder',
      meta: createMeta('user'),
      payload: { trackId, fromIndex: index, toIndex: index + 1 },
    });
  },

  toggleTrackLocked: (trackId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    dispatch({
      type: 'track.toggle',
      meta: createMeta('user'),
      payload: { trackId, field: 'locked' },
      before: { value: track.locked },
    });
  },

  toggleTrackHidden: (trackId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    dispatch({
      type: 'track.toggle',
      meta: createMeta('user'),
      payload: { trackId, field: 'hidden' },
      before: { value: track.hidden },
    });
  },
});
