import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CutMediaCorruptionError, type TimelineView } from '@neko-cut/domain';
import { generateClipRepresentations, readClipRepresentationRequests } from './clipRepresentations';

const view: TimelineView = {
  documentUri: 'file:///workspace/project.otio',
  sessionId: 'session-1',
  revision: 2,
  name: 'project',
  durationSeconds: 4,
  tracks: [
    {
      trackId: 'video-1',
      name: 'Video 1',
      kind: 'Video',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [clip('video-clip', '../shot.mp4', 1)],
    },
    {
      trackId: 'audio-1',
      name: 'Audio 1',
      kind: 'Audio',
      enabled: true,
      locked: false,
      audioMuted: false,
      items: [clip('audio-clip', '../audio.wav', 1)],
    },
  ],
};

describe('Cut Clip representations', () => {
  it('bounds the Webview request contract', () => {
    expect(
      readClipRepresentationRequests([
        { clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 0 },
        { clipId: 'audio-clip', kind: 'waveform', peaksPerSecond: 20 },
      ]),
    ).toHaveLength(2);
    expect(() =>
      readClipRepresentationRequests([{ clipId: 'video-clip', kind: 'thumbnail', sampleCount: 2 }]),
    ).toThrow('bounded options');
    expect(() =>
      readClipRepresentationRequests([
        { clipId: 'video-clip', kind: 'thumbnail', density: 63, tileIndex: 0 },
      ]),
    ).toThrow('bounded options');
  });

  it('maps timeline tiles to the Clip source range through media ports', async () => {
    const captureFrame = vi.fn(async (_source, timeSeconds: number) => ({
      dataUrl: `data:image/jpeg;base64,${timeSeconds}`,
    }));
    const generateWaveform = vi.fn(async () => ({
      peaks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.9],
      durationSeconds: 6,
      peaksPerSecond: 2,
    }));
    const results = await generateClipRepresentations({
      view,
      requests: [
        { clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 0 },
        { clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 1 },
        { clipId: 'audio-clip', kind: 'waveform', peaksPerSecond: 20 },
      ],
      ports: { captureFrame, generateWaveform },
      resolveSource: async (targetUrl) => ({ workspaceRelativePath: targetUrl.slice(3) }),
    });

    expect(captureFrame.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      [2.25, { width: 160, height: 90 }],
      [4.25, { width: 160, height: 90 }],
    ]);
    expect(generateWaveform).toHaveBeenCalledWith(
      { workspaceRelativePath: 'audio.wav' },
      { peaksPerSecond: 20 },
      undefined,
    );
    expect(results).toMatchObject([
      {
        clipId: 'video-clip',
        kind: 'thumbnail',
        status: 'ready',
        density: 64,
        tileIndex: 0,
        sourceTimeSeconds: 2.25,
      },
      {
        clipId: 'video-clip',
        kind: 'thumbnail',
        status: 'ready',
        density: 64,
        tileIndex: 1,
        sourceTimeSeconds: 4.25,
      },
      {
        clipId: 'audio-clip',
        kind: 'waveform',
        status: 'ready',
        peaksPerSecond: 20,
        waveform: { peaks: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] },
      },
    ]);
  });

  it('maps tile time through the Clip playback rate', async () => {
    const videoTrack = view.tracks[0];
    if (!videoTrack) throw new Error('Video Track fixture is missing.');
    const videoClip = videoTrack.items[0];
    if (!videoClip || videoClip.kind !== 'clip') {
      throw new Error('Video Clip fixture is missing.');
    }
    const captureFrame = vi.fn(async () => ({
      dataUrl: 'data:image/jpeg;base64,tile',
    }));

    await generateClipRepresentations({
      view: {
        ...view,
        tracks: [
          {
            ...videoTrack,
            items: [{ ...videoClip, playbackRate: 2 }],
          },
        ],
      },
      requests: [{ clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 0 }],
      ports: { captureFrame, generateWaveform: vi.fn() },
      resolveSource: async () => ({ workspaceRelativePath: 'shot.mp4' }),
    });

    expect(captureFrame).toHaveBeenCalledWith(
      { workspaceRelativePath: 'shot.mp4' },
      3.5,
      { width: 160, height: 90 },
      undefined,
    );
  });

  it('returns per-Clip unavailable diagnostics without fabricating data', async () => {
    const results = await generateClipRepresentations({
      view,
      requests: [{ clipId: 'audio-clip', kind: 'thumbnail', density: 64, tileIndex: 0 }],
      ports: {
        captureFrame: vi.fn(),
        generateWaveform: vi.fn(),
      },
      resolveSource: vi.fn(),
    });
    expect(results).toEqual([
      {
        clipId: 'audio-clip',
        kind: 'thumbnail',
        status: 'unavailable',
        density: 64,
        tileIndex: 0,
        message: 'thumbnail is incompatible with a Audio Clip.',
      },
    ]);
  });

  it('isolates a damaged tile without invalidating a neighboring tile', async () => {
    const captureFrame = vi.fn(async (_source, timeSeconds: number) => {
      if (timeSeconds === 2.25) {
        throw new CutMediaCorruptionError(
          'interval',
          'capture frame',
          'Invalid NAL unit at the requested frame.',
        );
      }
      return { dataUrl: `data:image/jpeg;base64,${timeSeconds}` };
    });

    const results = await generateClipRepresentations({
      view,
      requests: [
        { clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 0 },
        { clipId: 'video-clip', kind: 'thumbnail', density: 64, tileIndex: 1 },
      ],
      ports: { captureFrame, generateWaveform: vi.fn() },
      resolveSource: async () => ({ workspaceRelativePath: 'shot.mp4' }),
    });

    expect(results).toEqual([
      {
        clipId: 'video-clip',
        kind: 'thumbnail',
        status: 'unavailable',
        density: 64,
        tileIndex: 0,
        failureScope: 'interval',
        message:
          'Media corruption in interval while attempting capture frame. Invalid NAL unit at the requested frame.',
      },
      {
        clipId: 'video-clip',
        kind: 'thumbnail',
        status: 'ready',
        density: 64,
        tileIndex: 1,
        sourceTimeSeconds: 4.25,
        dataUrl: 'data:image/jpeg;base64,4.25',
      },
    ]);
  });

  it('bounds concurrent frame capture for a virtual tile batch', async () => {
    let active = 0;
    let maximumActive = 0;
    const captureFrame = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { dataUrl: 'data:image/jpeg;base64,tile' };
    });

    await generateClipRepresentations({
      view,
      requests: Array.from({ length: 12 }, () => ({
        clipId: 'video-clip',
        kind: 'thumbnail' as const,
        density: 64 as const,
        tileIndex: 0,
      })),
      ports: { captureFrame, generateWaveform: vi.fn() },
      resolveSource: async () => ({ workspaceRelativePath: 'shot.mp4' }),
    });

    expect(maximumActive).toBe(4);
  });

  it('projects only the available prefix of a partially decoded waveform', async () => {
    const results = await generateClipRepresentations({
      view,
      requests: [{ clipId: 'audio-clip', kind: 'waveform', peaksPerSecond: 2 }],
      ports: {
        captureFrame: vi.fn(),
        generateWaveform: vi.fn(async () => ({
          peaks: [0, 0.1, 0.2, 0.3, 0.4],
          durationSeconds: 6,
          peaksPerSecond: 2,
          partial: {
            availableDurationSeconds: 2.5,
            failureScope: 'stream' as const,
            message: 'AAC suffix is corrupt.',
          },
        })),
      },
      resolveSource: async () => ({ workspaceRelativePath: 'audio.mp4' }),
    });

    expect(results).toEqual([
      {
        clipId: 'audio-clip',
        kind: 'waveform',
        status: 'partial',
        peaksPerSecond: 2,
        waveform: {
          peaks: [0.2, 0.3, 0.4],
          durationSeconds: 4,
          peaksPerSecond: 2,
          partial: {
            availableDurationSeconds: 1.5,
            failureScope: 'stream',
            message: 'AAC suffix is corrupt.',
          },
        },
      },
    ]);
  });

  it('discards an aborted same-revision request before Webview delivery', () => {
    const providerSource = readFileSync(
      new URL('./CutOtioEditorProvider.ts', import.meta.url),
      'utf8',
    );
    const abortGuard = providerSource.indexOf('if (controller.signal.aborted) return;');
    const delivery = providerSource.indexOf("type: 'cut:representations'", abortGuard);

    expect(abortGuard).toBeGreaterThan(-1);
    expect(delivery).toBeGreaterThan(abortGuard);
  });
});

function clip(clipId: string, targetUrl: string, sourceStartSeconds: number) {
  return {
    kind: 'clip' as const,
    clipId,
    name: clipId,
    targetUrl,
    startSeconds: 0,
    durationSeconds: 4,
    sourceStartSeconds,
    playbackRate: 1,
    enabled: true,
    locked: false,
    audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
  };
}
