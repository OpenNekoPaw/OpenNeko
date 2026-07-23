import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineView } from '@neko-cut/domain';
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
        { clipId: 'video-clip', kind: 'thumbnail', sampleCount: 2 },
        { clipId: 'audio-clip', kind: 'waveform', peaksPerSecond: 20 },
      ]),
    ).toHaveLength(2);
    expect(() =>
      readClipRepresentationRequests([
        { clipId: 'video-clip', kind: 'thumbnail', sampleCount: 100 },
      ]),
    ).toThrow('bounded options');
  });

  it('derives source-range thumbnails and waveform through media ports', async () => {
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
        { clipId: 'video-clip', kind: 'thumbnail', sampleCount: 2 },
        { clipId: 'audio-clip', kind: 'waveform', peaksPerSecond: 20 },
      ],
      ports: { captureFrame, generateWaveform },
      resolveSource: async (targetUrl) => ({ workspaceRelativePath: targetUrl.slice(3) }),
    });

    expect(captureFrame.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      [2, { width: 160, height: 90 }],
      [4, { width: 160, height: 90 }],
    ]);
    expect(generateWaveform).toHaveBeenCalledWith(
      { workspaceRelativePath: 'audio.wav' },
      { peaksPerSecond: 20 },
      undefined,
    );
    expect(results).toMatchObject([
      { clipId: 'video-clip', kind: 'thumbnail', status: 'ready' },
      {
        clipId: 'audio-clip',
        kind: 'waveform',
        status: 'ready',
        waveform: { peaks: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] },
      },
    ]);
  });

  it('returns per-Clip unavailable diagnostics without fabricating data', async () => {
    const results = await generateClipRepresentations({
      view,
      requests: [{ clipId: 'audio-clip', kind: 'thumbnail', sampleCount: 1 }],
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
        message: 'thumbnail is incompatible with a Audio Clip.',
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
