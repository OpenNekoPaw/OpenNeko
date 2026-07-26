export interface PreviewAudioClock {
  readonly isClockReady: boolean;
  getCurrentTime(): number;
}

export interface PreviewVideoClock {
  readonly currentTimeSeconds: number;
  playbackRate: number;
}

export interface CutPreviewClockInput {
  readonly primaryAudio?: PreviewAudioClock;
  readonly video?: PreviewVideoClock;
  readonly primaryMediaOriginSeconds?: number;
  readonly primaryPlaybackRate?: number;
  readonly videoPlaybackRate?: number;
}

export interface CutPreviewClockReading {
  readonly mediaTimeSeconds?: number;
  readonly videoDriftSeconds?: number;
  readonly discontinuity: boolean;
}

const NUDGE_THRESHOLD_SECONDS = 0.04;
const DISCONTINUITY_THRESHOLD_SECONDS = 0.5;
const NUDGE_RATIO = 0.02;

export class CutPreviewClock {
  constructor(private readonly input: CutPreviewClockInput) {}

  read(): CutPreviewClockReading {
    const { primaryAudio, video } = this.input;
    if (primaryAudio?.isClockReady) {
      const mediaTimeSeconds = primaryAudio.getCurrentTime();
      const drift = this.correctVideo(mediaTimeSeconds);
      return {
        mediaTimeSeconds,
        ...(drift !== undefined ? { videoDriftSeconds: drift } : {}),
        discontinuity: drift !== undefined && Math.abs(drift) > DISCONTINUITY_THRESHOLD_SECONDS,
      };
    }
    if (video) {
      const origin = this.input.primaryMediaOriginSeconds ?? 0;
      return {
        mediaTimeSeconds: origin + video.currentTimeSeconds,
        discontinuity: false,
      };
    }
    return { discontinuity: false };
  }

  private correctVideo(primaryMediaTimeSeconds: number): number | undefined {
    const { video, primaryMediaOriginSeconds, primaryPlaybackRate, videoPlaybackRate } = this.input;
    if (
      !video ||
      primaryMediaOriginSeconds === undefined ||
      primaryPlaybackRate === undefined ||
      videoPlaybackRate === undefined
    ) {
      return undefined;
    }
    const timelineDelta =
      (primaryMediaTimeSeconds - primaryMediaOriginSeconds) / primaryPlaybackRate;
    const expectedVideoTime = Math.max(0, timelineDelta * videoPlaybackRate);
    const drift = video.currentTimeSeconds - expectedVideoTime;
    if (Math.abs(drift) <= NUDGE_THRESHOLD_SECONDS) {
      video.playbackRate = videoPlaybackRate;
    } else if (Math.abs(drift) <= DISCONTINUITY_THRESHOLD_SECONDS) {
      video.playbackRate = videoPlaybackRate * (drift > 0 ? 1 - NUDGE_RATIO : 1 + NUDGE_RATIO);
    }
    return drift;
  }
}
