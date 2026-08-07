import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { CutMediaRuntimeAdapter, CutPreviewSession, TimelineView } from '@neko/cut-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CutPreviewRuntimeController } from './CutPreviewRuntimeController';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('CutPreviewRuntimeController', () => {
  it('releases a late preview request without replacing the current request', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-cut-preview-request-'));
    roots.push(workspacePath);
    const documentPath = path.join(workspacePath, 'story.otio');
    await Promise.all([
      writeFile(documentPath, '{}'),
      writeFile(path.join(workspacePath, 'video.mp4'), 'fixture'),
    ]);
    let resolveFirst: ((session: CutPreviewSession) => void) | undefined;
    const firstSession = new Promise<CutPreviewSession>((resolve) => {
      resolveFirst = resolve;
    });
    const startPreview = vi
      .fn<CutMediaRuntimeAdapter['startPreview']>()
      .mockImplementationOnce(async () => firstSession)
      .mockResolvedValueOnce(previewSession('video-session-2'));
    const stopPreview = vi.fn(async () => undefined);
    const adapter = mediaAdapter({ startPreview, stopPreview });
    const controller = new CutPreviewRuntimeController({
      documentPath,
      workspacePath,
      mediaAdapter: adapter,
    });

    const late = controller.start(timelineView(), {
      timelineTimeSeconds: 0,
      previewRequestId: 'preview-request-1',
    });
    const lateOutcome = late.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(startPreview).toHaveBeenCalledTimes(1));
    const current = controller.start(timelineView(), {
      timelineTimeSeconds: 0,
      previewRequestId: 'preview-request-2',
    });

    await expect(current).resolves.toMatchObject({
      type: 'cut:preview-ready',
      previewRequestId: 'preview-request-2',
      video: { url: 'openneko://resource/video-session-2' },
    });
    resolveFirst?.(previewSession('video-session-1'));
    await expect(lateOutcome).resolves.toEqual(
      expect.objectContaining({
        message: expect.stringContaining('preview-request-1 was superseded'),
      }),
    );
    expect(stopPreview).toHaveBeenCalledWith('video-session-1');
    expect(stopPreview).not.toHaveBeenCalledWith('video-session-2');

    await expect(controller.activate('preview-request-2')).resolves.toEqual({
      type: 'cut:preview-activated',
      previewRequestId: 'preview-request-2',
    });
    await controller.dispose();
  });
});

function previewSession(sessionId: string): CutPreviewSession {
  return {
    sessionId,
    video: {
      url: `openneko://resource/${sessionId}`,
      mimeType: 'video/mp4',
      preparationProfile: 'h264-mp4-direct',
      mediaTimeOriginSeconds: 0,
      durationSeconds: 2,
    },
  };
}

function timelineView(): TimelineView {
  return {
    documentUri: 'story.otio',
    sessionId: 'cut-session-1',
    name: 'Story',
    durationSeconds: 2,
    tracks: [
      {
        trackId: 'video-track-1',
        name: 'Video',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'clip-1',
            name: 'Clip',
            targetUrl: 'video.mp4',
            startSeconds: 0,
            durationSeconds: 2,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: { muted: true, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
          },
        ],
      },
    ],
  };
}

function mediaAdapter(
  overrides: Pick<CutMediaRuntimeAdapter, 'startPreview' | 'stopPreview'>,
): CutMediaRuntimeAdapter {
  return {
    probe: vi.fn(async () => ({
      durationSeconds: 2,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      hasVideo: true,
      hasAudio: false,
      audioStreams: [],
    })),
    captureFrame: vi.fn(),
    generateWaveform: vi.fn(),
    startPreview: overrides.startPreview,
    resumePreview: vi.fn(async () => undefined),
    stopPreview: overrides.stopPreview,
    startPcmMix: vi.fn(),
    resumePcm: vi.fn(async () => undefined),
    stopPcm: vi.fn(async () => undefined),
    export: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
}
