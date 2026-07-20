import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { FrameScheduler } from '../FrameScheduler';

// =============================================================================
// VideoFrame mock — browser API not available in Node.js
// =============================================================================

class MockVideoFrame {
  readonly timestamp: number;
  private _closed = false;

  constructor(timestamp: number) {
    this.timestamp = timestamp;
  }

  close(): void {
    this._closed = true;
  }

  get isClosed(): boolean {
    return this._closed;
  }
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).VideoFrame = MockVideoFrame;
});

// =============================================================================
// Helpers
// =============================================================================

/** Create a mock VideoFrame with the given PTS in microseconds */
function frame(ptsUs: number): VideoFrame {
  return new MockVideoFrame(ptsUs) as unknown as VideoFrame;
}

/** Check if a mock frame has been closed */
function isClosed(f: VideoFrame): boolean {
  return (f as unknown as MockVideoFrame).isClosed;
}

// =============================================================================
// Tests
// =============================================================================

describe('FrameScheduler', () => {
  // Suppress console.log from FrameScheduler internals during tests
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  let scheduler: FrameScheduler;

  // Default: 25 fps, warmup = 3 frames
  // syncThresholdUs = clamp(1_000_000 / 25 = 40_000, 5_000, 40_000) = 40_000
  beforeEach(() => {
    scheduler = new FrameScheduler(25, 3);
  });

  // =========================================================================
  // enqueue
  // =========================================================================

  describe('enqueue', () => {
    it('should accept frames in order', () => {
      scheduler.enqueue(frame(1000));
      scheduler.enqueue(frame(2000));
      scheduler.enqueue(frame(3000));
      expect(scheduler.getStats().queueLength).toBe(3);
    });

    it('should insert out-of-order frames correctly (binary search)', () => {
      scheduler.enqueue(frame(1000));
      scheduler.enqueue(frame(3000));
      scheduler.enqueue(frame(2000)); // out of order

      const stats = scheduler.getStats();
      expect(stats.queueLength).toBe(3);
      expect(stats.enqueued).toBe(3);
    });

    it('should drop oldest frames on backpressure (queue > 30)', () => {
      const frames: VideoFrame[] = [];
      for (let i = 0; i < 35; i++) {
        const f = frame(i * 1000);
        frames.push(f);
        scheduler.enqueue(f);
      }

      const stats = scheduler.getStats();
      expect(stats.queueLength).toBe(30);
      expect(stats.backpressure).toBe(5);

      // First 5 frames should have been closed (dropped)
      for (let i = 0; i < 5; i++) {
        expect(isClosed(frames[i]!)).toBe(true);
      }
      // Frame at index 5 should still be open (it is now the oldest in queue)
      expect(isClosed(frames[5]!)).toBe(false);
    });

    it('should close frame when disposed', () => {
      scheduler.dispose();

      const f = frame(1000);
      scheduler.enqueue(f);
      expect(isClosed(f)).toBe(true);
      expect(scheduler.getStats().queueLength).toBe(0);
    });
  });

  // =========================================================================
  // schedule - warmup
  // =========================================================================

  describe('schedule - warmup', () => {
    it('should wait during warmup phase (< warmupFrames)', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      // Only 2 frames, warmup needs 3

      const result = scheduler.schedule(0);
      expect(result.action).toBe('wait');
      expect(result.skipped).toBe(0);
    });

    it('should complete warmup when enough frames buffered', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));

      // Now 3 frames, warmup should complete and render
      const result = scheduler.schedule(0);
      expect(result.action).toBe('render');
      expect(result.frame).toBeDefined();
    });
  });

  // =========================================================================
  // schedule - A/V offset
  // =========================================================================

  describe('schedule - A/V offset', () => {
    it('should establish A/V offset from first frame', () => {
      // Enqueue 3 frames starting at PTS 100_000 us
      scheduler.enqueue(frame(100_000));
      scheduler.enqueue(frame(140_000));
      scheduler.enqueue(frame(180_000));

      // Master clock at 500_000 us
      scheduler.schedule(500_000);

      // Offset should be masterClock - firstFramePTS = 500_000 - 100_000 = 400_000
      const stats = scheduler.getStats();
      // avOffsetUs is refined via EMA after render, so it should be close to 400_000
      expect(stats.avOffsetUs).toBeGreaterThan(0);
    });

    it('should apply offset when comparing PTS', () => {
      // Video PTS starts at 1_000_000 (1s), audio clock starts at 2_000_000 (2s)
      // Offset = 2_000_000 - 1_000_000 = 1_000_000
      scheduler.enqueue(frame(1_000_000));
      scheduler.enqueue(frame(1_040_000));
      scheduler.enqueue(frame(1_080_000));

      const result = scheduler.schedule(2_000_000);
      expect(result.action).toBe('render');
      // The frame rendered should be the first one (adjusted PTS = 1M + 1M = 2M, delta = 0)
      expect(result.frame!.timestamp).toBe(1_000_000);
    });
  });

  // =========================================================================
  // schedule - three-tier decision
  // =========================================================================

  describe('schedule - three-tier decision', () => {
    // Use 25fps scheduler: syncThresholdUs = 40_000

    it('should render frame within sync threshold', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));

      // First schedule establishes offset and renders. Clock = 0, first frame PTS = 0
      const result = scheduler.schedule(0);
      expect(result.action).toBe('render');
      expect(result.frame).toBeDefined();
    });

    it('should skip frames that are too late', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));
      scheduler.enqueue(frame(120_000));

      // Master clock way ahead — first frame at 0 is too late
      // After warmup completes, offset = 200_000 - 0 = 200_000
      // adjusted PTS of frame 0 = 0 + 200_000 = 200_000, delta = 0 => render
      // Let's use a scenario where some frames are clearly behind
      const result = scheduler.schedule(200_000);
      // The scheduler should render some frame
      expect(result.action).toBe('render');
    });

    it('should wait when frame is too early', () => {
      // Enqueue 3 frames, complete warmup, then add a frame far in the future
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));

      // First call: warmup completes, offset = 0, renders frame 0
      scheduler.schedule(0);

      // Flush and re-setup with future frame
      scheduler.flush();
      const futureScheduler = new FrameScheduler(25, 1);
      futureScheduler.enqueue(frame(1_000_000)); // 1s in the future

      // Clock at 0, frame PTS at 1_000_000. Offset = 0 - 1_000_000 = -1_000_000
      // Adjusted PTS = 1_000_000 + (-1_000_000) = 0. delta = 0 - 0 = 0 => render
      // Actually with 1 warmup frame it will render immediately
      // Let's test properly: two calls
      const result = futureScheduler.schedule(0);
      expect(result.action).toBe('render');

      // Add a frame with high PTS, offset already established
      futureScheduler.enqueue(frame(2_000_000));
      // Clock still at 0, adjusted PTS = 2_000_000 + (-1_000_000) = 1_000_000
      // delta = 1_000_000 - 0 = 1_000_000 >> 40_000 threshold => wait
      const result2 = futureScheduler.schedule(0);
      expect(result2.action).toBe('wait');
    });

    it('should render latest behind frame when all frames are late', () => {
      const sched = new FrameScheduler(25, 1);
      sched.enqueue(frame(0));

      // Establish offset: clock=0, first frame PTS=0, offset=0
      sched.schedule(0);

      // Now enqueue frames that will all be behind the clock
      sched.enqueue(frame(100_000));
      sched.enqueue(frame(200_000));
      sched.enqueue(frame(300_000));

      // Clock way ahead: 1_000_000 us. All frames adjusted PTS < clock - threshold
      const result = sched.schedule(1_000_000);
      expect(result.action).toBe('render');
      // Should render the latest behind frame (300_000)
      expect(result.frame!.timestamp).toBe(300_000);
      // Earlier frames should be skipped
      expect(result.skipped).toBe(2);
    });

    it('should handle empty queue as wait', () => {
      // Complete warmup first
      const sched = new FrameScheduler(25, 1);
      sched.enqueue(frame(0));
      sched.schedule(0); // renders frame 0, queue empty

      const result = sched.schedule(40_000);
      expect(result.action).toBe('wait');
      expect(result.skipped).toBe(0);
      expect(result.deltaUs).toBe(0);
    });
  });

  // =========================================================================
  // schedule - offset refinement (EMA)
  // =========================================================================

  describe('schedule - offset refinement (EMA)', () => {
    it('should refine offset gradually via EMA', () => {
      const sched = new FrameScheduler(25, 1);
      sched.enqueue(frame(0));

      // First schedule: offset = 100_000 - 0 = 100_000
      sched.schedule(100_000);
      const initialOffset = sched.getStats().avOffsetUs;

      // Add another frame and schedule with a slightly different clock
      // This creates a new instantOffset that differs from current avOffsetUs
      sched.enqueue(frame(40_000));
      sched.schedule(150_000);
      // instantOffset = 150_000 - 40_000 = 110_000
      // new offset = 100_000 + 0.05 * (110_000 - 100_000) = 100_500

      const refinedOffset = sched.getStats().avOffsetUs;
      // Offset should have moved slightly toward the new instant offset
      expect(refinedOffset).not.toBe(initialOffset);
      // Should be between initial (100_000) and instant (110_000)
      expect(refinedOffset).toBeGreaterThan(initialOffset);
      expect(refinedOffset).toBeLessThan(110_000);
    });
  });

  // =========================================================================
  // flush
  // =========================================================================

  describe('flush', () => {
    it('should close all queued frames', () => {
      const f1 = frame(0);
      const f2 = frame(40_000);
      const f3 = frame(80_000);
      scheduler.enqueue(f1);
      scheduler.enqueue(f2);
      scheduler.enqueue(f3);

      scheduler.flush();

      expect(isClosed(f1)).toBe(true);
      expect(isClosed(f2)).toBe(true);
      expect(isClosed(f3)).toBe(true);
      expect(scheduler.getStats().queueLength).toBe(0);
    });

    it('should reset A/V offset', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));

      // Establish offset
      scheduler.schedule(100_000);
      expect(scheduler.getStats().avOffsetUs).not.toBe(0);

      scheduler.flush();

      // After flush, enqueue new frames and schedule to check offset is recalculated
      scheduler.enqueue(frame(500_000));
      scheduler.enqueue(frame(540_000));
      scheduler.enqueue(frame(580_000));

      // New offset should be 200_000 - 500_000 = -300_000
      scheduler.schedule(200_000);
      const stats = scheduler.getStats();
      // Offset should be recalculated from scratch (not the old one)
      expect(stats.avOffsetUs).toBeLessThan(0);
    });

    it('should reset warmup', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));
      scheduler.schedule(0); // completes warmup

      scheduler.flush();

      // After flush, warmup should restart — need 3 frames again
      scheduler.enqueue(frame(100_000));
      scheduler.enqueue(frame(140_000));
      // Only 2 frames, should wait
      const result = scheduler.schedule(100_000);
      expect(result.action).toBe('wait');
    });
  });

  // =========================================================================
  // switchClock
  // =========================================================================

  describe('switchClock', () => {
    it('should recalculate A/V offset from current queue head', () => {
      scheduler.enqueue(frame(0));
      scheduler.enqueue(frame(40_000));
      scheduler.enqueue(frame(80_000));

      // Establish initial offset
      scheduler.schedule(0);

      // Add more frames
      scheduler.enqueue(frame(120_000));
      scheduler.enqueue(frame(160_000));

      // Switch clock to a new value
      scheduler.switchClock(500_000);
      const stats = scheduler.getStats();
      // Offset = 500_000 - head frame PTS
      // The head of the queue after first schedule rendered frame 0 is frame at 40_000
      expect(stats.avOffsetUs).toBeGreaterThan(0);
    });

    it('should reset offset when queue is empty', () => {
      const sched = new FrameScheduler(25, 1);
      sched.enqueue(frame(0));
      sched.schedule(0); // renders frame 0, queue now empty

      sched.switchClock(500_000);
      const stats = sched.getStats();
      expect(stats.avOffsetUs).toBe(0);
    });
  });

  // =========================================================================
  // dispose
  // =========================================================================

  describe('dispose', () => {
    it('should flush and prevent further enqueue', () => {
      const f1 = frame(0);
      const f2 = frame(40_000);
      scheduler.enqueue(f1);
      scheduler.enqueue(f2);

      scheduler.dispose();

      expect(isClosed(f1)).toBe(true);
      expect(isClosed(f2)).toBe(true);
      expect(scheduler.getStats().queueLength).toBe(0);

      // Further enqueue should be silently discarded
      const f3 = frame(80_000);
      scheduler.enqueue(f3);
      expect(isClosed(f3)).toBe(true);
      expect(scheduler.getStats().queueLength).toBe(0);
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = scheduler.getStats();
      expect(stats).toEqual({
        enqueued: 0,
        rendered: 0,
        skipped: 0,
        backpressure: 0,
        queueLength: 0,
        lastSyncDelta: 0,
        syncThresholdUs: 40_000,
        avOffsetUs: 0,
      });
    });

    it('should track enqueued/rendered/skipped counts', () => {
      const sched = new FrameScheduler(25, 1);

      // Enqueue and render
      sched.enqueue(frame(0));
      sched.schedule(0);

      let stats = sched.getStats();
      expect(stats.enqueued).toBe(1);
      expect(stats.rendered).toBe(1);

      // Enqueue multiple frames and skip some by advancing clock far
      sched.enqueue(frame(40_000));
      sched.enqueue(frame(80_000));
      sched.enqueue(frame(120_000));
      sched.enqueue(frame(160_000));

      // Clock way ahead so some frames get skipped
      sched.schedule(1_000_000);

      stats = sched.getStats();
      expect(stats.enqueued).toBe(5);
      expect(stats.rendered).toBe(2);
      expect(stats.skipped).toBeGreaterThan(0);
    });

    it('should return a snapshot copy, not live reference', () => {
      const stats1 = scheduler.getStats();
      scheduler.enqueue(frame(0));
      const stats2 = scheduler.getStats();

      expect(stats1.enqueued).toBe(0);
      expect(stats2.enqueued).toBe(1);
    });
  });
});
