/**
 * StreamingVideoDiffViewer — Real-time H264 dual-stream video diff.
 *
 * Connects two H264StreamClients to the frame server, pairs decoded
 * VideoFrames via FramePairBuffer, and renders diffs via WebGL DiffRenderer.
 *
 * Seek handling follows the neko-preview pattern:
 * 1. Arm seekFilter — reject stale pre-seek frames still in WebSocket buffer
 * 2. Flush FramePairBuffer — discard queued frames
 * 3. Reset H264 decoders — start clean from next keyframe
 */

import { useRef, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import type { DiffMode } from './DiffRenderer';
import type { StreamConfig } from '@neko/shared';
import { useVideoDiffStreaming } from '../../../hooks/useVideoDiffStreaming';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreamingVideoDiffViewerProps {
  streamConfig: StreamConfig;
  diffMode: DiffMode;
  sliderPosition: number;
  onSliderChange?: (pos: number) => void;
  /** Send stream control messages (play/pause/seek) to extension */
  onStreamControl?: (
    action: 'play' | 'pause' | 'seek',
    payload?: { time?: number; speed?: number },
  ) => void;
  /** Report current playback time (seconds) from frame PTS */
  onTimeUpdate?: (time: number) => void;
  /** Report stream errors to parent for UI visibility */
  onError?: (error: string) => void;
  /** Pre-created AudioContext from user gesture to satisfy autoplay policy */
  audioContext?: AudioContext;
  /** Called when either video stream reaches end-of-stream */
  onStreamEnd?: () => void;
}

/** Imperative handle exposed via ref for parent-driven seek and static rendering */
export interface StreamingVideoDiffViewerHandle {
  /** Locally reset decoders and buffers for a seek at `time` (seconds) */
  seek(time: number): void;
  /** Render a static frame pair (Blob URLs) through the existing DiffRenderer */
  renderStaticPair(blobUrlA: string, blobUrlB: string): Promise<void>;
  /** Pause audio output (mute + discard incoming packets) */
  pauseAudio(): void;
  /** Resume audio output */
  resumeAudio(): void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const StreamingVideoDiffViewer = memo(
  forwardRef<StreamingVideoDiffViewerHandle, StreamingVideoDiffViewerProps>(
    function StreamingVideoDiffViewer(
      {
        streamConfig,
        diffMode,
        sliderPosition,
        onSliderChange,
        onTimeUpdate,
        onError,
        audioContext,
        onStreamEnd,
      },
      ref,
    ) {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      // ── Slider drag state ────────────────────────────────────────────────
      const isDraggingRef = useRef(false);

      const streaming = useVideoDiffStreaming({
        canvasRef,
        streamConfig,
        diffMode,
        sliderPosition,
        onTimeUpdate,
        onError,
        audioContext,
        onStreamEnd,
      });

      // ── Expose seek handle to parent ─────────────────────────────────────
      useImperativeHandle(ref, () => streaming, [streaming]);

      // ── Slider drag handlers (for curtain mode) ──────────────────────────
      const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
          if (diffMode !== 'curtain') return;
          isDraggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          onSliderChange?.(Math.max(0, Math.min(1, pos)));
        },
        [diffMode, onSliderChange],
      );

      const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
          if (!isDraggingRef.current || diffMode !== 'curtain') return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          onSliderChange?.(Math.max(0, Math.min(1, pos)));
        },
        [diffMode, onSliderChange],
      );

      const handlePointerUp = useCallback(() => {
        isDraggingRef.current = false;
      }, []);

      return (
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden bg-black relative"
        >
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={{ cursor: diffMode === 'curtain' ? 'col-resize' : 'default' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {/* Curtain mode slider line indicator */}
          {diffMode === 'curtain' && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/60 pointer-events-none"
              style={{ left: `${sliderPosition * 100}%` }}
            />
          )}
        </div>
      );
    },
  ),
);
