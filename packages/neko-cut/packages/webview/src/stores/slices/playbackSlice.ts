/**
 * Playback Slice
 * 管理播放状态和时间控制
 */

import { StateCreator } from 'zustand';

export interface PlaybackSlice {
  // State
  isPlaying: boolean;
  currentTime: number;
  seekRevision: number;
  playbackSpeed: number;
  frameAlignEnabled: boolean;

  // Audio State
  previewVolume: number; // 预览音量 (0-1)
  previewMuted: boolean; // 预览静音状态

  // Actions
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  updatePlaybackTime: (time: number) => void;
  seek: (time: number, fps?: number) => void;
  seekToFrame: (time: number, fps?: number) => void;
  toggleFrameAlign: () => void;

  // Audio Actions
  setPreviewVolume: (volume: number) => void;
  togglePreviewMute: () => void;
}

export const createPlaybackSlice: StateCreator<PlaybackSlice, [], [], PlaybackSlice> = (
  set,
  get,
) => ({
  // Initial state
  isPlaying: false,
  currentTime: 0,
  seekRevision: 0,
  playbackSpeed: 1,
  frameAlignEnabled: false,

  // Audio initial state
  previewVolume: 1.0, // 默认音量 100%
  previewMuted: false, // 默认不静音

  // Actions
  play: () => set({ isPlaying: true }),

  pause: () => set({ isPlaying: false }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaybackSpeed: (speed) => {
    const normalizedSpeed = Number.isFinite(speed) ? Math.max(0.1, Math.min(4, speed)) : 1;
    set({ playbackSpeed: normalizedSpeed });
  },

  updatePlaybackTime: (time) => {
    set({ currentTime: Math.max(0, time) });
  },

  seek: (time, fps = 30) => {
    const { frameAlignEnabled } = get();
    let alignedTime = Math.max(0, time);
    if (frameAlignEnabled) {
      alignedTime = Math.round(alignedTime * fps) / fps;
    }
    set((state) => ({ currentTime: alignedTime, seekRevision: state.seekRevision + 1 }));
  },

  seekToFrame: (time, fps = 30) => {
    const alignedTime = Math.round(Math.max(0, time) * fps) / fps;
    set((state) => ({ currentTime: alignedTime, seekRevision: state.seekRevision + 1 }));
  },

  toggleFrameAlign: () => set((state) => ({ frameAlignEnabled: !state.frameAlignEnabled })),

  // Audio actions
  setPreviewVolume: (volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    set({ previewVolume: clampedVolume });
  },

  togglePreviewMute: () => set((state) => ({ previewMuted: !state.previewMuted })),
});
