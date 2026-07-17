export interface VideoSeekGate {
  minFrameTimeSeconds: number;
  maxFrameTimeSeconds: number;
}

export interface VideoSchedulerStats {
  avOffsetUs: number;
}

const POST_SEEK_PAST_TOLERANCE_SECONDS = 0.1;
const MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS = 0.25;

export function createVideoSeekGate(
  targetTimeSeconds: number,
  schedulerStats: VideoSchedulerStats | null,
  fps: number,
): VideoSeekGate {
  const avOffsetSeconds = schedulerStats ? schedulerStats.avOffsetUs / 1_000_000 : 0;
  const targetFrameTimeSeconds = targetTimeSeconds - avOffsetSeconds;
  const frameDurationSeconds = fps > 0 ? 1 / fps : MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS;
  const futureToleranceSeconds = Math.max(
    MIN_POST_SEEK_FUTURE_TOLERANCE_SECONDS,
    frameDurationSeconds * 2,
  );

  return {
    minFrameTimeSeconds: targetFrameTimeSeconds - POST_SEEK_PAST_TOLERANCE_SECONDS,
    maxFrameTimeSeconds: targetFrameTimeSeconds + futureToleranceSeconds,
  };
}

export function shouldAcceptVideoFrameAfterSeek(
  frameTimestampUs: number,
  gate: VideoSeekGate | null,
): boolean {
  if (!gate) return true;

  const frameTimeSeconds = frameTimestampUs / 1_000_000;
  return (
    frameTimeSeconds >= gate.minFrameTimeSeconds && frameTimeSeconds <= gate.maxFrameTimeSeconds
  );
}
