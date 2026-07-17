// =============================================================================
// UIStateSlice Tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { UIStateSlice } from '../uiStateSlice';
import { createUIStateSlice } from '../uiStateSlice';

// -- Test helpers ----------------------------------------------------------

function createTestStore() {
  return create<UIStateSlice>()((set, get, store) => ({
    ...createUIStateSlice(set, get, store),
  }));
}

// -- Tests -----------------------------------------------------------------

describe('uiStateSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('should start with zoomLevel = 1', () => {
      expect(store.getState().zoomLevel).toBe(1);
    });

    it('should start with previewQuality = "high"', () => {
      expect(store.getState().previewQuality).toBe('high');
    });

    it('should start with showFpsCounter = false', () => {
      expect(store.getState().showFpsCounter).toBe(false);
    });

    it('should start with currentFps = 0', () => {
      expect(store.getState().currentFps).toBe(0);
    });

    it('should start with snappingEnabled = true', () => {
      expect(store.getState().snappingEnabled).toBe(true);
    });

    it('should start with rippleEditingEnabled = false', () => {
      expect(store.getState().rippleEditingEnabled).toBe(false);
    });

    it('should start with showClipThumbnails = true', () => {
      expect(store.getState().showClipThumbnails).toBe(true);
    });

    it('should start with showMinimap = true', () => {
      expect(store.getState().showMinimap).toBe(true);
    });

    it('should start with frameAlignEnabled = false', () => {
      expect(store.getState().frameAlignEnabled).toBe(false);
    });

    it('should start with isPiPActive = false', () => {
      expect(store.getState().isPiPActive).toBe(false);
    });

    it('should start with snapIndicatorTime = null', () => {
      expect(store.getState().snapIndicatorTime).toBeNull();
    });

    it('should start with dragTargetTrackId = null', () => {
      expect(store.getState().dragTargetTrackId).toBeNull();
    });

    it('should start with propertyPanelWidth = 280', () => {
      expect(store.getState().propertyPanelWidth).toBe(280);
    });

    it('should start with propertyPanelVisible = false', () => {
      expect(store.getState().propertyPanelVisible).toBe(false);
    });
  });

  describe('setZoomLevel', () => {
    it('should set zoom level to a valid value', () => {
      store.getState().setZoomLevel(2.5);
      expect(store.getState().zoomLevel).toBe(2.5);
    });

    it('should clamp zoom to minimum (0.1)', () => {
      store.getState().setZoomLevel(0.01);
      expect(store.getState().zoomLevel).toBe(0.1);
    });

    it('should clamp zoom to maximum (10)', () => {
      store.getState().setZoomLevel(15);
      expect(store.getState().zoomLevel).toBe(10);
    });

    it('should accept boundary value 0.1', () => {
      store.getState().setZoomLevel(0.1);
      expect(store.getState().zoomLevel).toBe(0.1);
    });

    it('should accept boundary value 10', () => {
      store.getState().setZoomLevel(10);
      expect(store.getState().zoomLevel).toBe(10);
    });

    it('should clamp negative values to minimum', () => {
      store.getState().setZoomLevel(-5);
      expect(store.getState().zoomLevel).toBe(0.1);
    });
  });

  describe('setPreviewQuality', () => {
    it('should set quality to "full"', () => {
      store.getState().setPreviewQuality('full');
      expect(store.getState().previewQuality).toBe('full');
    });

    it('should set quality to "medium"', () => {
      store.getState().setPreviewQuality('medium');
      expect(store.getState().previewQuality).toBe('medium');
    });

    it('should set quality to "low"', () => {
      store.getState().setPreviewQuality('low');
      expect(store.getState().previewQuality).toBe('low');
    });
  });

  describe('toggleFpsCounter', () => {
    it('should toggle from false to true', () => {
      store.getState().toggleFpsCounter();
      expect(store.getState().showFpsCounter).toBe(true);
    });

    it('should toggle from true to false', () => {
      store.getState().toggleFpsCounter();
      store.getState().toggleFpsCounter();
      expect(store.getState().showFpsCounter).toBe(false);
    });
  });

  describe('setCurrentFps', () => {
    it('should set current fps value', () => {
      store.getState().setCurrentFps(59.94);
      expect(store.getState().currentFps).toBe(59.94);
    });

    it('should allow 0 fps', () => {
      store.getState().setCurrentFps(0);
      expect(store.getState().currentFps).toBe(0);
    });
  });

  describe('setPerformanceStats', () => {
    it('should partially update performance stats', () => {
      store.getState().setPerformanceStats({ measuredFps: 60, memoryUsedMB: 512 });
      expect(store.getState().performanceStats.measuredFps).toBe(60);
      expect(store.getState().performanceStats.memoryUsedMB).toBe(512);
    });

    it('should preserve other stats when updating partially', () => {
      store.getState().setPerformanceStats({ measuredFps: 30 });
      store.getState().setPerformanceStats({ memoryUsedMB: 256 });
      expect(store.getState().performanceStats.measuredFps).toBe(30);
      expect(store.getState().performanceStats.memoryUsedMB).toBe(256);
    });

    it('should update resolution and bitrate strings', () => {
      store.getState().setPerformanceStats({
        resolution: '1920x1080',
        bitrate: '10 Mbps',
      });
      expect(store.getState().performanceStats.resolution).toBe('1920x1080');
      expect(store.getState().performanceStats.bitrate).toBe('10 Mbps');
    });

    it('should update engine pipeline stats', () => {
      store.getState().setPerformanceStats({
        engineHwDecodeMs: 2.5,
        engineCompositeMs: 1.2,
        engineAvgFps: 58,
      });
      expect(store.getState().performanceStats.engineHwDecodeMs).toBe(2.5);
      expect(store.getState().performanceStats.engineCompositeMs).toBe(1.2);
      expect(store.getState().performanceStats.engineAvgFps).toBe(58);
    });
  });

  describe('toggleSnapping', () => {
    it('should toggle from true to false', () => {
      expect(store.getState().snappingEnabled).toBe(true);
      store.getState().toggleSnapping();
      expect(store.getState().snappingEnabled).toBe(false);
    });

    it('should toggle from false to true', () => {
      store.getState().toggleSnapping();
      store.getState().toggleSnapping();
      expect(store.getState().snappingEnabled).toBe(true);
    });
  });

  describe('toggleRippleEditing', () => {
    it('should toggle from false to true', () => {
      store.getState().toggleRippleEditing();
      expect(store.getState().rippleEditingEnabled).toBe(true);
    });

    it('should toggle back to false', () => {
      store.getState().toggleRippleEditing();
      store.getState().toggleRippleEditing();
      expect(store.getState().rippleEditingEnabled).toBe(false);
    });
  });

  describe('toggleClipThumbnails', () => {
    it('should toggle from true to false', () => {
      store.getState().toggleClipThumbnails();
      expect(store.getState().showClipThumbnails).toBe(false);
    });

    it('should toggle back to true', () => {
      store.getState().toggleClipThumbnails();
      store.getState().toggleClipThumbnails();
      expect(store.getState().showClipThumbnails).toBe(true);
    });
  });

  describe('toggleMinimap', () => {
    it('should toggle from true to false', () => {
      store.getState().toggleMinimap();
      expect(store.getState().showMinimap).toBe(false);
    });

    it('should toggle back to true', () => {
      store.getState().toggleMinimap();
      store.getState().toggleMinimap();
      expect(store.getState().showMinimap).toBe(true);
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

  describe('setIsPiPActive', () => {
    it('should set PiP active', () => {
      store.getState().setIsPiPActive(true);
      expect(store.getState().isPiPActive).toBe(true);
    });

    it('should set PiP inactive', () => {
      store.getState().setIsPiPActive(true);
      store.getState().setIsPiPActive(false);
      expect(store.getState().isPiPActive).toBe(false);
    });
  });

  describe('setSnapIndicatorTime', () => {
    it('should set snap indicator time', () => {
      store.getState().setSnapIndicatorTime(5.5);
      expect(store.getState().snapIndicatorTime).toBe(5.5);
    });

    it('should clear snap indicator with null', () => {
      store.getState().setSnapIndicatorTime(5.5);
      store.getState().setSnapIndicatorTime(null);
      expect(store.getState().snapIndicatorTime).toBeNull();
    });
  });

  describe('setDragTargetTrackId', () => {
    it('should set drag target track ID', () => {
      store.getState().setDragTargetTrackId('track-1');
      expect(store.getState().dragTargetTrackId).toBe('track-1');
    });

    it('should clear drag target with null', () => {
      store.getState().setDragTargetTrackId('track-1');
      store.getState().setDragTargetTrackId(null);
      expect(store.getState().dragTargetTrackId).toBeNull();
    });
  });

  describe('setPropertyPanelWidth', () => {
    it('should set a width within bounds', () => {
      store.getState().setPropertyPanelWidth(320);
      expect(store.getState().propertyPanelWidth).toBe(320);
    });

    it('should clamp the property panel width to the minimum', () => {
      store.getState().setPropertyPanelWidth(120);
      expect(store.getState().propertyPanelWidth).toBe(200);
    });

    it('should clamp the property panel width to the maximum', () => {
      store.getState().setPropertyPanelWidth(480);
      expect(store.getState().propertyPanelWidth).toBe(400);
    });
  });
});
