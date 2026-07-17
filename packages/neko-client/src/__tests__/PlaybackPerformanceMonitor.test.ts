import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PlaybackPerformanceMonitor } from '../PlaybackPerformanceMonitor';

describe('PlaybackPerformanceMonitor', () => {
  let monitor: PlaybackPerformanceMonitor;
  let perfNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    monitor = new PlaybackPerformanceMonitor();
    perfNowSpy = vi.spyOn(performance, 'now');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // FPS calculation
  // =========================================================================

  describe('FPS calculation', () => {
    it('should return 0 with no frames', () => {
      const snapshot = monitor.getSnapshot();
      expect(snapshot.measuredFps).toBe(0);
    });

    it('should return 0 with only one frame', () => {
      perfNowSpy.mockReturnValue(0);
      monitor.recordFrame();

      const snapshot = monitor.getSnapshot();
      expect(snapshot.measuredFps).toBe(0);
    });

    it('should calculate FPS from frame timestamps', () => {
      // Simulate 10 frames at ~30fps (33.33ms apart) within a 1s window
      for (let i = 0; i < 10; i++) {
        perfNowSpy.mockReturnValue(i * 33.33);
        monitor.recordFrame();
      }

      const snapshot = monitor.getSnapshot();
      // 9 intervals over ~300ms => ~30 fps
      expect(snapshot.measuredFps).toBeCloseTo(30, 0);
    });

    it('should use sliding window (drop old timestamps)', () => {
      // Record frames over a 2 second period
      // First batch: 0-500ms
      for (let i = 0; i < 5; i++) {
        perfNowSpy.mockReturnValue(i * 100);
        monitor.recordFrame();
      }

      // Second batch: 1500-1900ms (outside the 1s window from last frame)
      for (let i = 0; i < 5; i++) {
        perfNowSpy.mockReturnValue(1500 + i * 100);
        monitor.recordFrame();
      }

      const snapshot = monitor.getSnapshot();
      // Only recent frames within FPS_WINDOW_MS (1000ms) should count
      // Frames from 1500-1900ms are within window of 1900ms
      // The old 0-400ms frames should be cleaned out
      expect(snapshot.measuredFps).toBeGreaterThan(0);
      expect(snapshot.totalFrames).toBe(10);
    });
  });

  // =========================================================================
  // Frame time percentiles
  // =========================================================================

  describe('frame time percentiles', () => {
    it('should return 0 with no samples', () => {
      const snapshot = monitor.getSnapshot();
      expect(snapshot.frameTimeP50).toBe(0);
      expect(snapshot.frameTimeP95).toBe(0);
      expect(snapshot.frameTimeP99).toBe(0);
    });

    it('should calculate P50/P95/P99 correctly', () => {
      // Record 100 frames with known intervals
      // Frame intervals will be: 10, 10, 10, ... (all 10ms apart)
      for (let i = 0; i < 101; i++) {
        perfNowSpy.mockReturnValue(i * 10);
        monitor.recordFrame();
      }

      const snapshot = monitor.getSnapshot();
      // All intervals are 10ms, so all percentiles should be 10
      expect(snapshot.frameTimeP50).toBe(10);
      expect(snapshot.frameTimeP95).toBe(10);
      expect(snapshot.frameTimeP99).toBe(10);
    });

    it('should compute percentiles with varied intervals', () => {
      // First frame at t=1 (must be > 0 so lastFrameTimestamp check passes)
      perfNowSpy.mockReturnValue(1);
      monitor.recordFrame();

      // Create varied intervals: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
      let t = 1;
      for (let i = 1; i <= 10; i++) {
        t += i * 10;
        perfNowSpy.mockReturnValue(t);
        monitor.recordFrame();
      }

      const snapshot = monitor.getSnapshot();
      // Sorted intervals: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      // P50: index = ceil(10 * 0.50) - 1 = 4 => 50
      expect(snapshot.frameTimeP50).toBe(50);
      // P95: index = ceil(10 * 0.95) - 1 = 9 => 100
      expect(snapshot.frameTimeP95).toBe(100);
      // P99: index = ceil(10 * 0.99) - 1 = 9 => 100
      expect(snapshot.frameTimeP99).toBe(100);
    });
  });

  // =========================================================================
  // Render time
  // =========================================================================

  describe('render time', () => {
    it('should return 0 with no samples', () => {
      const snapshot = monitor.getSnapshot();
      expect(snapshot.avgRenderTimeMs).toBe(0);
    });

    it('should track average render time', () => {
      monitor.recordRenderTime(2.0);
      monitor.recordRenderTime(4.0);
      monitor.recordRenderTime(6.0);

      const snapshot = monitor.getSnapshot();
      expect(snapshot.avgRenderTimeMs).toBe(4.0);
    });

    it('should cap samples at MAX_RENDER_TIME_SAMPLES (120)', () => {
      // Record 150 samples (exceeds MAX_RENDER_TIME_SAMPLES = 120)
      for (let i = 0; i < 150; i++) {
        monitor.recordRenderTime(1.0);
      }

      // Add one more with a different value to check window effect
      monitor.recordRenderTime(121.0);

      const snapshot = monitor.getSnapshot();
      // Should only keep the last 120 samples: 119 x 1.0 + 1 x 121.0
      // Average = (119 + 121) / 120 = 240 / 120 = 2.0
      expect(snapshot.avgRenderTimeMs).toBe(2.0);
    });
  });

  // =========================================================================
  // Bitrate
  // =========================================================================

  describe('bitrate', () => {
    it('should return 0 with insufficient data', () => {
      const snapshot = monitor.getSnapshot();
      expect(snapshot.bitrateKbps).toBe(0);
    });

    it('should return 0 with only one packet', () => {
      perfNowSpy.mockReturnValue(0);
      monitor.recordPacketSize(1000);

      // getSnapshot calls calculateBitrate which calls performance.now()
      perfNowSpy.mockReturnValue(100);
      const snapshot = monitor.getSnapshot();
      expect(snapshot.bitrateKbps).toBe(0);
    });

    it('should calculate bitrate from packet records', () => {
      // Record packets over 1 second
      perfNowSpy.mockReturnValue(0);
      monitor.recordPacketSize(1000); // 1000 bytes at t=0

      perfNowSpy.mockReturnValue(500);
      monitor.recordPacketSize(1000); // 1000 bytes at t=500ms

      perfNowSpy.mockReturnValue(1000);
      monitor.recordPacketSize(1000); // 1000 bytes at t=1000ms

      // getSnapshot() will call performance.now() for bitrate calculation
      perfNowSpy.mockReturnValue(1000);
      const snapshot = monitor.getSnapshot();

      // Total bytes in window: 3000
      // Duration: 1000ms - 0ms = 1000ms = 1s
      // Bitrate: (3000 * 8) / 1000 / 1 = 24 kbps
      expect(snapshot.bitrateKbps).toBe(24);
    });
  });

  // =========================================================================
  // Dropped frames
  // =========================================================================

  describe('dropped frames', () => {
    it('should track dropped frame count', () => {
      expect(monitor.getSnapshot().droppedFrames).toBe(0);

      monitor.recordDroppedFrames(3);
      expect(monitor.getSnapshot().droppedFrames).toBe(3);

      monitor.recordDroppedFrames(2);
      expect(monitor.getSnapshot().droppedFrames).toBe(5);
    });
  });

  // =========================================================================
  // Reset
  // =========================================================================

  describe('reset', () => {
    it('should clear all data', () => {
      // Accumulate some data
      perfNowSpy.mockReturnValue(0);
      monitor.recordFrame();
      perfNowSpy.mockReturnValue(33);
      monitor.recordFrame();

      monitor.recordRenderTime(5.0);

      perfNowSpy.mockReturnValue(50);
      monitor.recordPacketSize(1000);
      perfNowSpy.mockReturnValue(100);
      monitor.recordPacketSize(2000);

      monitor.recordDroppedFrames(10);

      // Reset
      monitor.reset();

      // Mock performance.now for snapshot
      perfNowSpy.mockReturnValue(200);
      const snapshot = monitor.getSnapshot();

      expect(snapshot.measuredFps).toBe(0);
      expect(snapshot.frameTimeP50).toBe(0);
      expect(snapshot.frameTimeP95).toBe(0);
      expect(snapshot.frameTimeP99).toBe(0);
      expect(snapshot.avgRenderTimeMs).toBe(0);
      expect(snapshot.bitrateKbps).toBe(0);
      expect(snapshot.totalFrames).toBe(0);
      expect(snapshot.droppedFrames).toBe(0);
    });
  });
});
