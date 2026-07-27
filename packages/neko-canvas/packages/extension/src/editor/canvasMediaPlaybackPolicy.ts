export type CanvasPlaybackMediaType = 'video' | 'audio' | 'auto';

export interface CanvasPlaybackProbeProjection {
  readonly width: number;
  readonly hasAudio: boolean;
}

export interface CanvasPlaybackTrackSelection {
  readonly video: boolean;
  readonly audio: boolean;
}

export function selectCanvasPlaybackTracks(
  mediaType: CanvasPlaybackMediaType,
  mediaInfo: CanvasPlaybackProbeProjection,
): CanvasPlaybackTrackSelection {
  return {
    video: mediaType === 'video' || (mediaType === 'auto' && mediaInfo.width > 0),
    audio: mediaInfo.hasAudio,
  };
}
