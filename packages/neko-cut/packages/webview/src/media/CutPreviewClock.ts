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
  readonly secondaryAudio?: readonly {
    readonly clock: PreviewAudioClock;
    readonly mediaOriginSeconds: number;
    readonly playbackRate: number;
  }[];
  readonly video?: PreviewVideoClock;
  readonly primaryMediaOriginSeconds?: number;
  readonly primaryPlaybackRate?: number;
  readonly videoPlaybackRate?: number;
  readonly videoClockOriginSeconds?: number;
}

export interface CutPreviewClockReading {
  readonly mediaTimeSeconds?: number;
  readonly videoDriftSeconds?: number;
  readonly audioDriftSeconds?: number;
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
      const videoDrift = this.correctVideo(mediaTimeSeconds);
      const audioDrift = this.secondaryAudioDrift(mediaTimeSeconds);
      return {
        mediaTimeSeconds,
        ...(videoDrift !== undefined ? { videoDriftSeconds: videoDrift } : {}),
        ...(audioDrift !== undefined ? { audioDriftSeconds: audioDrift } : {}),
        discontinuity:
          (videoDrift !== undefined && Math.abs(videoDrift) > DISCONTINUITY_THRESHOLD_SECONDS) ||
          (audioDrift !== undefined && Math.abs(audioDrift) > NUDGE_THRESHOLD_SECONDS),
      };
    }
    if (video) {
      const origin = this.input.primaryMediaOriginSeconds ?? 0;
      const videoOrigin = this.input.videoClockOriginSeconds ?? 0;
      return {
        mediaTimeSeconds: origin + Math.max(0, video.currentTimeSeconds - videoOrigin),
        discontinuity: false,
      };
    }
    return { discontinuity: false };
  }

  private secondaryAudioDrift(primaryMediaTimeSeconds: number): number | undefined {
    const { primaryMediaOriginSeconds, primaryPlaybackRate, secondaryAudio } = this.input;
    if (
      primaryMediaOriginSeconds === undefined ||
      primaryPlaybackRate === undefined ||
      !secondaryAudio ||
      secondaryAudio.length === 0
    ) {
      return undefined;
    }
    const primaryTimelineDelta =
      (primaryMediaTimeSeconds - primaryMediaOriginSeconds) / primaryPlaybackRate;
    let largestDrift: number | undefined;
    for (const secondary of secondaryAudio) {
      if (!secondary.clock.isClockReady) continue;
      const secondaryTimelineDelta =
        (secondary.clock.getCurrentTime() - secondary.mediaOriginSeconds) / secondary.playbackRate;
      const drift = secondaryTimelineDelta - primaryTimelineDelta;
      if (largestDrift === undefined || Math.abs(drift) > Math.abs(largestDrift)) {
        largestDrift = drift;
      }
    }
    return largestDrift;
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
    const expectedVideoTime =
      (this.input.videoClockOriginSeconds ?? 0) + Math.max(0, timelineDelta * videoPlaybackRate);
    const drift = video.currentTimeSeconds - expectedVideoTime;
    if (Math.abs(drift) <= NUDGE_THRESHOLD_SECONDS) {
      video.playbackRate = videoPlaybackRate;
    } else if (Math.abs(drift) <= DISCONTINUITY_THRESHOLD_SECONDS) {
      video.playbackRate = videoPlaybackRate * (drift > 0 ? 1 - NUDGE_RATIO : 1 + NUDGE_RATIO);
    }
    return drift;
  }
}
