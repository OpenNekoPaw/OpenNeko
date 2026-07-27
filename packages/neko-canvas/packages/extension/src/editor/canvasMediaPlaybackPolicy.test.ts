import { describe, expect, it } from 'vitest';
import { selectCanvasPlaybackTracks } from './canvasMediaPlaybackPolicy';

describe('Canvas media playback track policy', () => {
  it('keeps explicit video authoritative and adds PCM whenever audio exists', () => {
    expect(selectCanvasPlaybackTracks('video', { width: 0, hasAudio: true })).toEqual({
      video: true,
      audio: true,
    });
  });

  it('does not create a video descriptor for audio-only playback', () => {
    expect(selectCanvasPlaybackTracks('audio', { width: 1920, hasAudio: true })).toEqual({
      video: false,
      audio: true,
    });
  });

  it('uses probe dimensions only for automatic media classification', () => {
    expect(selectCanvasPlaybackTracks('auto', { width: 1920, hasAudio: false })).toEqual({
      video: true,
      audio: false,
    });
    expect(selectCanvasPlaybackTracks('auto', { width: 0, hasAudio: true })).toEqual({
      video: false,
      audio: true,
    });
  });
});
