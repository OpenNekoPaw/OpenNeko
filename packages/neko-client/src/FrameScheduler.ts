/**
 * FrameScheduler - Video frame scheduling based on master clock
 *
 * Receives decoded VideoFrames from the H264 decoder, buffers them in PTS order,
 * and decides per-frame whether to render, skip, or wait based on the audio
 * master clock.
 *
 * A/V PTS alignment:
 *   Audio and video streams may have different PTS epoch bases (e.g. audio PTS
 *   starts at 10s while video PTS starts at 0s). On the first schedule() call
 *   with a queued frame, the scheduler measures the offset between the master
 *   clock and the first video frame PTS, then applies this offset to all
 *   subsequent comparisons. This offset is reset on flush() (seek/stop).
 *
 * Three-tier decision at each rAF tick:
 *   - SKIP:   frame.timestamp < masterClockUs - SYNC_THRESHOLD  (too late)
 *   - RENDER: |delta| <= SYNC_THRESHOLD                          (on time)
 *   - WAIT:   frame.timestamp > masterClockUs + SYNC_THRESHOLD  (too early)
 */

import { getLogger } from './utils/logger';

const logger = getLogger('FrameScheduler');

// =============================================================================
// Types
// =============================================================================

export type ScheduleAction = 'render' | 'skip' | 'wait';

export interface ScheduleResult {
  action: ScheduleAction;
  /** The frame to render (only when action === 'render') */
  frame?: VideoFrame;
  /** Number of frames skipped in this call */
  skipped: number;
  /** PTS delta: frame.timestamp - masterClockUs (only for render/wait) */
  deltaUs: number;
}

export interface FrameSchedulerStats {
  enqueued: number;
  rendered: number;
  skipped: number;
  /** Frames dropped due to backpressure (queue overflow) */
  backpressure: number;
  queueLength: number;
  /** Last sync delta in microseconds */
  lastSyncDelta: number;
  /** Adaptive sync threshold in microseconds (half-frame duration, clamped to [5ms, 40ms]) */
  syncThresholdUs: number;
  /** A/V PTS offset in microseconds (masterClock - videoPTS at first frame) */
  avOffsetUs: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum queue depth before oldest frames are discarded */
const MAX_QUEUE_LENGTH = 30;

/** Minimum sync threshold (5ms) — avoids overly aggressive skipping at high fps */
const MIN_SYNC_THRESHOLD_US = 5_000;

/** Maximum sync threshold (40ms) — keeps sync perceptible for very low fps */
const MAX_SYNC_THRESHOLD_US = 40_000;

// =============================================================================
// FrameScheduler
// =============================================================================

export class FrameScheduler {
  private queue: VideoFrame[] = [];
  private readonly syncThresholdUs: number;
  private readonly warmupFrames: number;
  private warmupComplete = false;
  private stats: FrameSchedulerStats;
  private disposed = false;

  /**
   * Offset between audio master clock PTS and video frame PTS (microseconds).
   * Computed on first schedule() call: avOffsetUs = masterClockUs - firstFrame.timestamp.
   * Applied to video PTS before comparison: adjustedPTS = frame.timestamp + avOffsetUs.
   * Continuously refined via EMA to track clock drift between engine and client.
   */
  private avOffsetUs: number | null = null;

  /** EMA smoothing factor for offset drift correction (0 = no update, 1 = instant) */
  private static readonly OFFSET_EMA_ALPHA = 0.05;

  /**
   * @param fps Frame rate of the video. Used to compute an adaptive sync
   *            threshold of half a frame duration, clamped to [5ms, 40ms].
   * @param warmupFrames Minimum frames to buffer before first render.
   *            Audio keeps playing during warmup, creating a natural A/V offset
   *            that gives the decode pipeline a jitter buffer. Default: 3 frames.
   */
  constructor(fps: number = 25, warmupFrames: number = 3) {
    // Use full frame duration (not half) as sync threshold to absorb
    // decode-time jitter on loopback / low-latency paths.
    const fullFrameUs = Math.round(1_000_000 / fps);
    this.syncThresholdUs = Math.max(
      MIN_SYNC_THRESHOLD_US,
      Math.min(MAX_SYNC_THRESHOLD_US, fullFrameUs),
    );
    this.warmupFrames = warmupFrames;
    this.stats = {
      enqueued: 0,
      rendered: 0,
      skipped: 0,
      backpressure: 0,
      queueLength: 0,
      lastSyncDelta: 0,
      syncThresholdUs: this.syncThresholdUs,
      avOffsetUs: 0,
    };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Enqueue a decoded VideoFrame.
   *
   * Frames are inserted in PTS order. The common case (monotonic PTS) is
   * an O(1) tail append; out-of-order frames use binary search insertion.
   *
   * When the queue exceeds MAX_QUEUE_LENGTH, the oldest frame is closed
   * and discarded (backpressure).
   */
  enqueue(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }

    this.stats.enqueued++;

    // Fast path: monotonic PTS → append
    const len = this.queue.length;
    if (len === 0 || frame.timestamp >= this.queue[len - 1]!.timestamp) {
      this.queue.push(frame);
    } else {
      // Out-of-order: binary search insert position
      const idx = this.bisectRight(frame.timestamp);
      this.queue.splice(idx, 0, frame);
    }

    // Backpressure: drop oldest when over capacity
    while (this.queue.length > MAX_QUEUE_LENGTH) {
      const dropped = this.queue.shift()!;
      dropped.close();
      this.stats.backpressure++;
    }

    this.stats.queueLength = this.queue.length;
  }

  /**
   * Decide what to do with the head frame given the current master clock.
   *
   * This should be called once per rAF tick. It may skip multiple frames
   * if video has fallen behind, then return the first renderable frame
   * or a 'wait' result if the next frame is still in the future.
   */
  schedule(masterClockUs: number): ScheduleResult {
    let skipped = 0;

    // Warmup phase: wait until we have enough frames buffered before rendering.
    // During warmup the audio master clock keeps advancing, creating a natural
    // time offset. When warmup completes and A/V offset is established,
    // the queued frames become a jitter buffer that absorbs decode timing variations.
    if (!this.warmupComplete) {
      if (this.queue.length < this.warmupFrames) {
        this.stats.queueLength = this.queue.length;
        return { action: 'wait', skipped: 0, deltaUs: 0 };
      }
      this.warmupComplete = true;
      logger.info(`Warmup complete: buffered ${this.queue.length} frames`);
    }

    // Establish A/V PTS offset on first call with a queued frame.
    // This aligns the video PTS timeline to the audio master clock timeline,
    // compensating for different PTS epoch bases between audio and video streams.
    if (this.avOffsetUs === null && this.queue.length > 0) {
      this.avOffsetUs = masterClockUs - this.queue[0]!.timestamp;
      this.stats.avOffsetUs = this.avOffsetUs;
      logger.info(
        `A/V offset established: ${(this.avOffsetUs / 1000).toFixed(1)}ms (masterClock=${(masterClockUs / 1_000_000).toFixed(3)}s firstFramePTS=${(this.queue[0]!.timestamp / 1_000_000).toFixed(3)}s)`,
      );
    }

    const offset = this.avOffsetUs ?? 0;

    // Walk the queue: skip old frames, but always keep the latest
    // behind frame as a candidate to render. This ensures we show
    // the most recent available frame even when video delivery lags
    // behind the audio master clock.
    let lastBehind: VideoFrame | null = null;

    while (this.queue.length > 0) {
      const head = this.queue[0]!;
      const adjustedPts = head.timestamp + offset;
      const delta = adjustedPts - masterClockUs;

      if (delta < -this.syncThresholdUs) {
        // Frame is behind the clock
        this.queue.shift();

        // Close the previous behind-frame (truly stale), keep this one
        if (lastBehind) {
          lastBehind.close();
          skipped++;
          this.stats.skipped++;
        }
        lastBehind = head;
        continue;
      }

      if (delta <= this.syncThresholdUs) {
        // Frame is within tolerance
        if (lastBehind) {
          // Render the behind frame first; leave this on-time frame
          // in the queue for the next rAF tick. This avoids dropping
          // frames when the decoder outputs a small burst.
          this.refineOffset(masterClockUs, lastBehind.timestamp);
          const behindDelta = lastBehind.timestamp + this.avOffsetUs! - masterClockUs;
          this.stats.rendered++;
          this.stats.lastSyncDelta = behindDelta;
          this.stats.queueLength = this.queue.length;
          return { action: 'render', frame: lastBehind, skipped, deltaUs: behindDelta };
        }
        this.refineOffset(masterClockUs, head.timestamp);
        this.queue.shift();
        this.stats.rendered++;
        this.stats.lastSyncDelta = delta;
        this.stats.queueLength = this.queue.length;
        return { action: 'render', frame: head, skipped, deltaUs: delta };
      }

      // Frame is in the future — wait
      // But if we have a behind candidate, render it (best effort)
      if (lastBehind) {
        this.refineOffset(masterClockUs, lastBehind.timestamp);
        const behindDelta = lastBehind.timestamp + this.avOffsetUs! - masterClockUs;
        this.stats.rendered++;
        this.stats.lastSyncDelta = behindDelta;
        this.stats.queueLength = this.queue.length;
        return { action: 'render', frame: lastBehind, skipped, deltaUs: behindDelta };
      }

      this.stats.lastSyncDelta = delta;
      this.stats.queueLength = this.queue.length;
      return { action: 'wait', skipped, deltaUs: delta };
    }

    // Queue exhausted — if we held a behind frame, render it (best available)
    if (lastBehind) {
      this.refineOffset(masterClockUs, lastBehind.timestamp);
      const behindDelta = lastBehind.timestamp + this.avOffsetUs! - masterClockUs;
      this.stats.rendered++;
      this.stats.lastSyncDelta = behindDelta;
      this.stats.queueLength = 0;
      return { action: 'render', frame: lastBehind, skipped, deltaUs: behindDelta };
    }

    // Queue truly empty
    this.stats.queueLength = 0;
    return { action: 'wait', skipped, deltaUs: 0 };
  }

  /**
   * Flush all queued frames (close each VideoFrame).
   * Call on seek, stop, or before dispose.
   */
  flush(): void {
    for (const frame of this.queue) {
      frame.close();
    }
    this.queue.length = 0;
    this.stats.queueLength = 0;
    // Reset A/V offset and warmup so they get recalculated from next frame after seek
    this.avOffsetUs = null;
    this.warmupComplete = false;
  }

  /**
   * Re-align A/V offset to a new master clock value without flushing the queue.
   *
   * Use this when the clock source changes (e.g. wall → audio) so that
   * already-queued frames are not discarded. The offset is recalculated
   * from the head frame's PTS and the supplied clock value.
   */
  switchClock(newMasterClockUs: number): void {
    if (this.queue.length > 0) {
      this.avOffsetUs = newMasterClockUs - this.queue[0]!.timestamp;
      this.stats.avOffsetUs = this.avOffsetUs;
      logger.info(`switchClock: A/V offset recalculated: ${(this.avOffsetUs / 1000).toFixed(1)}ms`);
    } else {
      this.avOffsetUs = null;
      this.stats.avOffsetUs = 0;
      logger.info('switchClock: queue empty, offset reset');
    }
  }

  /**
   * Dispose the scheduler. Flushes remaining frames and prevents
   * further enqueue operations.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flush();
  }

  /**
   * Return a snapshot of scheduling statistics.
   */
  getStats(): FrameSchedulerStats {
    return { ...this.stats };
  }

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Binary search: find the insertion index for `pts` so the queue
   * stays sorted in ascending PTS order.
   */
  private bisectRight(pts: number): number {
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.queue[mid]!.timestamp <= pts) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Refine avOffsetUs via EMA to track slow clock drift between
   * engine wall-clock (PTS) and client master clock.
   * Called each time a frame is rendered.
   */
  private refineOffset(masterClockUs: number, framePts: number): void {
    if (this.avOffsetUs === null) return;
    const instantOffset = masterClockUs - framePts;
    this.avOffsetUs += FrameScheduler.OFFSET_EMA_ALPHA * (instantOffset - this.avOffsetUs);
    this.stats.avOffsetUs = this.avOffsetUs;
  }
}
