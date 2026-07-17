export type InlineVideoClockSource = 'wall' | 'audio';

export interface InlineVideoMutableRef<T> {
  current: T;
}

export interface InlineVideoSeekClockState {
  currentTimeRef: InlineVideoMutableRef<number>;
  playStartTimeRef: InlineVideoMutableRef<number>;
  playWallTimeRef: InlineVideoMutableRef<number>;
  clockSourceRef: InlineVideoMutableRef<InlineVideoClockSource>;
}

export interface InlineVideoSeekPipeline {
  scheduler: { flush(): void } | null;
  videoClient: { resetDecoder?: () => void } | null;
  audioClient: { resetClock(): void } | null;
}

export interface InlineVideoSeekResetOptions {
  time: number;
  now: () => number;
  clock: InlineVideoSeekClockState;
  pipeline: InlineVideoSeekPipeline;
}

export function resetInlineVideoPlaybackForSeek({
  time,
  now,
  clock,
  pipeline,
}: InlineVideoSeekResetOptions): void {
  clock.currentTimeRef.current = time;
  clock.playStartTimeRef.current = time;
  clock.playWallTimeRef.current = now();
  clock.clockSourceRef.current = 'wall';

  pipeline.scheduler?.flush();
  pipeline.videoClient?.resetDecoder?.();
  pipeline.audioClient?.resetClock();
}

export interface InlineVideoSeekGate {
  minFrameTimeSeconds: number;
  maxFrameTimeSeconds: number;
}

const POST_SEEK_FRAME_TOLERANCE_SECONDS = 0.1;
const MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS = 0.25;

export interface InlineVideoSchedulerStats {
  avOffsetUs: number;
}

export function createInlineVideoSeekGate(
  targetTimeSeconds: number,
  schedulerStats: InlineVideoSchedulerStats | null,
  fps: number,
): InlineVideoSeekGate {
  const avOffsetSeconds = schedulerStats ? schedulerStats.avOffsetUs / 1_000_000 : 0;
  const targetFrameTimeSeconds = targetTimeSeconds - avOffsetSeconds;
  const frameDurationSeconds = fps > 0 ? 1 / fps : MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS;
  const futureToleranceSeconds = Math.max(
    MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS,
    frameDurationSeconds * 2,
  );
  return {
    minFrameTimeSeconds: targetFrameTimeSeconds - POST_SEEK_FRAME_TOLERANCE_SECONDS,
    maxFrameTimeSeconds: targetFrameTimeSeconds + futureToleranceSeconds,
  };
}

export function shouldAcceptInlineVideoFrameAfterSeek(
  frameTimestampUs: number,
  gate: InlineVideoSeekGate | null,
): boolean {
  if (!gate) return true;
  const frameTimeSeconds = frameTimestampUs / 1_000_000;
  return (
    frameTimeSeconds >= gate.minFrameTimeSeconds && frameTimeSeconds <= gate.maxFrameTimeSeconds
  );
}
