/**
 * FramePairBuffer — PTS-based frame pairing for dual video streams.
 *
 * Receives decoded VideoFrames from two independent H264 streams (A = current, B = previous),
 * buffers them, and emits paired frames when their PTS values match within tolerance.
 *
 * Design:
 * - Each stream maintains a sorted queue (ascending PTS)
 * - On every feed(), scans the opposite queue for a matching PTS within tolerance
 * - Matched pairs are emitted via `onPair` callback
 * - Stale frames (PTS too far behind latest) are closed to prevent memory leaks
 * - `flush()` closes all buffered frames (used on seek)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FramePair {
  /** Current version frame */
  frameA: VideoFrame;
  /** Previous version frame */
  frameB: VideoFrame;
  /** Matched PTS in microseconds */
  pts: number;
}

export interface FramePairBufferConfig {
  /** PTS matching tolerance in microseconds (default: half-frame duration) */
  toleranceUs: number;
  /** Max buffered frames per stream before dropping oldest (default: 10) */
  maxBufferSize: number;
  /** Called when a valid pair is found */
  onPair: (pair: FramePair) => void;
  /** Called when one stream has ended and a frame arrives from the other.
   *  The frame is NOT closed — the callback owns it. */
  onSingle?: (frame: VideoFrame, side: 'A' | 'B') => void;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface BufferedFrame {
  frame: VideoFrame;
  pts: number; // microseconds
}

// ─── FramePairBuffer ─────────────────────────────────────────────────────────

export class FramePairBuffer {
  private queueA: BufferedFrame[] = [];
  private queueB: BufferedFrame[] = [];
  private readonly toleranceUs: number;
  private readonly maxBufferSize: number;
  private readonly onPair: (pair: FramePair) => void;
  private readonly onSingle: ((frame: VideoFrame, side: 'A' | 'B') => void) | null;
  private disposed = false;
  /** Track whether each stream has signaled end-of-stream */
  private eofA = false;
  private eofB = false;

  constructor(config: FramePairBufferConfig) {
    this.toleranceUs = config.toleranceUs;
    this.maxBufferSize = config.maxBufferSize;
    this.onPair = config.onPair;
    this.onSingle = config.onSingle ?? null;
  }

  /** Feed a frame from stream A (current version) */
  feedA(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }
    // If stream B has ended and its queue is empty, emit as single frame
    if (this.eofB && this.queueB.length === 0) {
      if (this.onSingle) {
        this.onSingle(frame, 'A');
      } else {
        frame.close();
      }
      return;
    }
    this.insertSorted(this.queueA, frame);
    this.tryMatch();
  }

  /** Feed a frame from stream B (previous version) */
  feedB(frame: VideoFrame): void {
    if (this.disposed) {
      frame.close();
      return;
    }
    // If stream A has ended and its queue is empty, emit as single frame
    if (this.eofA && this.queueA.length === 0) {
      if (this.onSingle) {
        this.onSingle(frame, 'B');
      } else {
        frame.close();
      }
      return;
    }
    this.insertSorted(this.queueB, frame);
    this.tryMatch();
  }

  /** Flush all buffered frames (e.g. on seek). Closes all VideoFrames. */
  flush(): void {
    for (const bf of this.queueA) bf.frame.close();
    for (const bf of this.queueB) bf.frame.close();
    this.queueA = [];
    this.queueB = [];
    this.eofA = false;
    this.eofB = false;
  }

  /**
   * Mark a stream as ended (EOF). When the opposite stream has also ended
   * or we can't match any more frames, remaining frames are drained (closed).
   * This prevents the buffer from filling up and freezing when one video
   * is shorter than the other.
   */
  markEndOfStream(stream: 'A' | 'B'): void {
    if (stream === 'A') this.eofA = true;
    else this.eofB = true;
    this.drainIfDone();
  }

  /** Dispose — release all resources */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flush();
  }

  // ─── Private ─────────────────────────────────────────────────────────

  /** Insert frame into queue sorted by PTS ascending */
  private insertSorted(queue: BufferedFrame[], frame: VideoFrame): void {
    const pts = frame.timestamp; // microseconds
    const entry: BufferedFrame = { frame, pts };

    // Fast path: append (most common — frames arrive in order)
    if (queue.length === 0 || pts >= queue[queue.length - 1].pts) {
      queue.push(entry);
    } else {
      // Binary search insert position
      let lo = 0;
      let hi = queue.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (queue[mid].pts < pts) lo = mid + 1;
        else hi = mid;
      }
      queue.splice(lo, 0, entry);
    }

    // Evict oldest if over capacity
    this.evictOldest(queue);
  }

  /** Try to match frames across queues */
  private tryMatch(): void {
    if (this.queueA.length === 0 || this.queueB.length === 0) return;

    let matched = true;
    while (matched && this.queueA.length > 0 && this.queueB.length > 0) {
      matched = false;

      const a = this.queueA[0];
      const b = this.queueB[0];
      const diff = Math.abs(a.pts - b.pts);

      if (diff <= this.toleranceUs) {
        // Match found — remove both and emit
        this.queueA.shift();
        this.queueB.shift();
        this.onPair({
          frameA: a.frame,
          frameB: b.frame,
          pts: Math.min(a.pts, b.pts),
        });
        matched = true;
      } else if (a.pts < b.pts) {
        // A is behind — drop it (stale)
        this.queueA.shift();
        a.frame.close();
        matched = true; // continue scanning
      } else {
        // B is behind — drop it (stale)
        this.queueB.shift();
        b.frame.close();
        matched = true; // continue scanning
      }
    }

    // After matching, drain remaining frames if one stream has ended
    this.drainIfDone();
  }

  /** Evict oldest frames if queue exceeds max size */
  private evictOldest(queue: BufferedFrame[]): void {
    while (queue.length > this.maxBufferSize) {
      const evicted = queue.shift();
      evicted?.frame.close();
    }
  }

  /**
   * Drain remaining frames when matching is no longer possible.
   * If onSingle is configured, emit remaining frames; otherwise close them.
   * Called after markEndOfStream and after tryMatch.
   */
  private drainIfDone(): void {
    // If stream A ended and its queue is empty, drain B frames
    if (this.eofA && this.queueA.length === 0 && this.queueB.length > 0) {
      for (const bf of this.queueB) {
        if (this.onSingle) {
          this.onSingle(bf.frame, 'B');
        } else {
          bf.frame.close();
        }
      }
      this.queueB = [];
    }
    // If stream B ended and its queue is empty, drain A frames
    if (this.eofB && this.queueB.length === 0 && this.queueA.length > 0) {
      for (const bf of this.queueA) {
        if (this.onSingle) {
          this.onSingle(bf.frame, 'A');
        } else {
          bf.frame.close();
        }
      }
      this.queueA = [];
    }
  }
}
