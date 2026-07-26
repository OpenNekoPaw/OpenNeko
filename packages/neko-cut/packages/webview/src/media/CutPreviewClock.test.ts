import { describe, expect, it } from 'vitest';
import { CutPreviewClock, type PreviewAudioClock, type PreviewVideoClock } from './CutPreviewClock';

describe('CutPreviewClock', () => {
  it('uses PCM as the authoritative clock and restores nominal video rate in sync', () => {
    const audio = audioClock(11);
    const video = videoClock(1.01, 0.9);
    const clock = new CutPreviewClock({
      primaryAudio: audio,
      video,
      primaryMediaOriginSeconds: 10,
      primaryPlaybackRate: 1,
      videoPlaybackRate: 1,
    });

    const reading = clock.read();

    expect(reading.mediaTimeSeconds).toBe(11);
    expect(reading.discontinuity).toBe(false);
    expect(reading.videoDriftSeconds).toBeCloseTo(0.01);
    expect(video.playbackRate).toBe(1);
  });

  it('nudges video for recoverable PCM drift and reports discontinuities', () => {
    const recoverableVideo = videoClock(0.9, 1);
    const recoverable = new CutPreviewClock({
      primaryAudio: audioClock(11),
      video: recoverableVideo,
      primaryMediaOriginSeconds: 10,
      primaryPlaybackRate: 1,
      videoPlaybackRate: 1,
    }).read();
    expect(recoverable.discontinuity).toBe(false);
    expect(recoverableVideo.playbackRate).toBeCloseTo(1.02);

    const discontinuous = new CutPreviewClock({
      primaryAudio: audioClock(11),
      video: videoClock(0.25, 1),
      primaryMediaOriginSeconds: 10,
      primaryPlaybackRate: 1,
      videoPlaybackRate: 1,
    }).read();
    expect(discontinuous.discontinuity).toBe(true);
  });

  it('uses muted video time for a video-only interval', () => {
    const reading = new CutPreviewClock({
      video: videoClock(2.5, 1),
      primaryMediaOriginSeconds: 4,
    }).read();

    expect(reading).toEqual({ mediaTimeSeconds: 6.5, discontinuity: false });
  });

  it('reports a secondary PCM track that diverges from the primary timeline clock', () => {
    const reading = new CutPreviewClock({
      primaryAudio: audioClock(11),
      secondaryAudio: [
        {
          clock: audioClock(22.2),
          mediaOriginSeconds: 20,
          playbackRate: 2,
        },
      ],
      primaryMediaOriginSeconds: 10,
      primaryPlaybackRate: 1,
    }).read();

    expect(reading.audioDriftSeconds).toBeCloseTo(0.1);
    expect(reading.discontinuity).toBe(true);
  });
});

function audioClock(time: number): PreviewAudioClock {
  return { isClockReady: true, getCurrentTime: () => time };
}

function videoClock(time: number, playbackRate: number): PreviewVideoClock {
  return {
    currentTimeSeconds: time,
    playbackRate,
  };
}
