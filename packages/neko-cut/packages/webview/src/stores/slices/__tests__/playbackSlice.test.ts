// =============================================================================
// PlaybackSlice Tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { PlaybackSlice } from '../playbackSlice';
import { createPlaybackSlice } from '../playbackSlice';

// -- Test helpers ----------------------------------------------------------

function createTestStore() {
  return create<PlaybackSlice>()((set, get, store) => ({
    ...createPlaybackSlice(set, get, store),
  }));
}

// -- Tests -----------------------------------------------------------------

describe('playbackSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('should start with isPlaying = false', () => {
      expect(store.getState().isPlaying).toBe(false);
    });

    it('should start with currentTime = 0', () => {
      expect(store.getState().currentTime).toBe(0);
    });

    it('should start with seekRevision = 0', () => {
      expect(store.getState().seekRevision).toBe(0);
    });

    it('should start with playbackSpeed = 1', () => {
      expect(store.getState().playbackSpeed).toBe(1);
    });

    it('should start with frameAlignEnabled = false', () => {
      expect(store.getState().frameAlignEnabled).toBe(false);
    });

    it('should start with previewVolume = 1.0', () => {
      expect(store.getState().previewVolume).toBe(1.0);
    });

    it('should start with previewMuted = false', () => {
      expect(store.getState().previewMuted).toBe(false);
    });
  });

  describe('play', () => {
    it('should set isPlaying to true', () => {
      store.getState().play();
      expect(store.getState().isPlaying).toBe(true);
    });

    it('should remain true if called when already playing', () => {
      store.getState().play();
      store.getState().play();
      expect(store.getState().isPlaying).toBe(true);
    });
  });

  describe('pause', () => {
    it('should set isPlaying to false', () => {
      store.getState().play();
      store.getState().pause();
      expect(store.getState().isPlaying).toBe(false);
    });

    it('should remain false if called when already paused', () => {
      store.getState().pause();
      expect(store.getState().isPlaying).toBe(false);
    });
  });

  describe('togglePlayback', () => {
    it('should toggle from false to true', () => {
      store.getState().togglePlayback();
      expect(store.getState().isPlaying).toBe(true);
    });

    it('should toggle from true to false', () => {
      store.getState().play();
      store.getState().togglePlayback();
      expect(store.getState().isPlaying).toBe(false);
    });

    it('should toggle back and forth', () => {
      store.getState().togglePlayback(); // true
      store.getState().togglePlayback(); // false
      store.getState().togglePlayback(); // true
      expect(store.getState().isPlaying).toBe(true);
    });
  });

  describe('setPlaybackSpeed', () => {
    it('should update playbackSpeed within valid range', () => {
      store.getState().setPlaybackSpeed(1.5);
      expect(store.getState().playbackSpeed).toBe(1.5);
    });

    it('should clamp playbackSpeed to minimum 0.1', () => {
      store.getState().setPlaybackSpeed(-2);
      expect(store.getState().playbackSpeed).toBe(0.1);
    });

    it('should clamp playbackSpeed to maximum 4', () => {
      store.getState().setPlaybackSpeed(8);
      expect(store.getState().playbackSpeed).toBe(4);
    });

    it('should fall back to 1 for invalid values', () => {
      store.getState().setPlaybackSpeed(Number.NaN);
      expect(store.getState().playbackSpeed).toBe(1);
    });
  });

  describe('seek', () => {
    it('should update currentTime', () => {
      store.getState().seek(5.0);
      expect(store.getState().currentTime).toBe(5.0);
    });

    it('should increment seekRevision', () => {
      store.getState().seek(5.0);
      expect(store.getState().seekRevision).toBe(1);
    });

    it('should clamp negative values to 0', () => {
      store.getState().seek(-3.0);
      expect(store.getState().currentTime).toBe(0);
    });

    it('should not frame-align when frameAlignEnabled is false', () => {
      store.getState().seek(1.234, 30);
      expect(store.getState().currentTime).toBe(1.234);
    });

    it('should frame-align when frameAlignEnabled is true', () => {
      store.getState().toggleFrameAlign();
      store.getState().seek(1.234, 30);
      // 1.234 * 30 = 37.02, round = 37, 37 / 30 = 1.2333...
      const expected = Math.round(1.234 * 30) / 30;
      expect(store.getState().currentTime).toBeCloseTo(expected, 10);
    });

    it('should frame-align with default fps=30', () => {
      store.getState().toggleFrameAlign();
      store.getState().seek(0.5);
      // 0.5 * 30 = 15, round = 15, 15 / 30 = 0.5
      expect(store.getState().currentTime).toBe(0.5);
    });

    it('should frame-align at 24fps correctly', () => {
      store.getState().toggleFrameAlign();
      store.getState().seek(1.0, 24);
      // 1.0 * 24 = 24, round = 24, 24 / 24 = 1.0
      expect(store.getState().currentTime).toBe(1.0);
    });

    it('should frame-align at 60fps correctly', () => {
      store.getState().toggleFrameAlign();
      store.getState().seek(0.123, 60);
      // 0.123 * 60 = 7.38, round = 7, 7 / 60 = 0.11666...
      const expected = Math.round(0.123 * 60) / 60;
      expect(store.getState().currentTime).toBeCloseTo(expected, 10);
    });
  });

  describe('seekToFrame', () => {
    it('should always snap to frame boundary', () => {
      store.getState().seekToFrame(1.234, 30);
      const expected = Math.round(1.234 * 30) / 30;
      expect(store.getState().currentTime).toBeCloseTo(expected, 10);
    });

    it('should increment seekRevision', () => {
      store.getState().seekToFrame(1.234, 30);
      expect(store.getState().seekRevision).toBe(1);
    });

    it('should clamp negative values to 0 before aligning', () => {
      store.getState().seekToFrame(-1.0, 30);
      expect(store.getState().currentTime).toBe(0);
    });

    it('should work with default fps=30', () => {
      store.getState().seekToFrame(2.5);
      // 2.5 * 30 = 75, round = 75, 75 / 30 = 2.5
      expect(store.getState().currentTime).toBe(2.5);
    });

    it('should align regardless of frameAlignEnabled state', () => {
      // frameAlignEnabled is false by default
      expect(store.getState().frameAlignEnabled).toBe(false);
      store.getState().seekToFrame(1.111, 30);
      const expected = Math.round(1.111 * 30) / 30;
      expect(store.getState().currentTime).toBeCloseTo(expected, 10);
    });
  });

  describe('toggleFrameAlign', () => {
    it('should toggle from false to true', () => {
      store.getState().toggleFrameAlign();
      expect(store.getState().frameAlignEnabled).toBe(true);
    });

    it('should toggle back to false', () => {
      store.getState().toggleFrameAlign();
      store.getState().toggleFrameAlign();
      expect(store.getState().frameAlignEnabled).toBe(false);
    });
  });

  describe('updatePlaybackTime', () => {
    it('should update currentTime without incrementing seekRevision', () => {
      store.getState().updatePlaybackTime(2.5);
      expect(store.getState().currentTime).toBe(2.5);
      expect(store.getState().seekRevision).toBe(0);
    });

    it('should clamp negative values to 0', () => {
      store.getState().updatePlaybackTime(-1);
      expect(store.getState().currentTime).toBe(0);
    });
  });

  describe('setPreviewVolume', () => {
    it('should set volume to a valid value', () => {
      store.getState().setPreviewVolume(0.5);
      expect(store.getState().previewVolume).toBe(0.5);
    });

    it('should clamp volume to 0 minimum', () => {
      store.getState().setPreviewVolume(-0.5);
      expect(store.getState().previewVolume).toBe(0);
    });

    it('should clamp volume to 1 maximum', () => {
      store.getState().setPreviewVolume(1.5);
      expect(store.getState().previewVolume).toBe(1);
    });

    it('should accept boundary value 0', () => {
      store.getState().setPreviewVolume(0);
      expect(store.getState().previewVolume).toBe(0);
    });

    it('should accept boundary value 1', () => {
      store.getState().setPreviewVolume(1);
      expect(store.getState().previewVolume).toBe(1);
    });
  });

  describe('togglePreviewMute', () => {
    it('should toggle from false to true', () => {
      store.getState().togglePreviewMute();
      expect(store.getState().previewMuted).toBe(true);
    });

    it('should toggle from true to false', () => {
      store.getState().togglePreviewMute();
      store.getState().togglePreviewMute();
      expect(store.getState().previewMuted).toBe(false);
    });
  });
});
