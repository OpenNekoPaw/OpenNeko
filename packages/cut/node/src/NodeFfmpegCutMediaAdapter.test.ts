import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CutExportRequest } from '@neko/cut-domain';
import type { FfmpegProcessPort, NodeMediaPublisher, RunningProcess } from '@neko/media/node';
import { NodeFfmpegCutMediaAdapter } from './NodeFfmpegCutMediaAdapter';

describe('NodeFfmpegCutMediaAdapter PCM lifecycle', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('treats publisher release as cancellation without an unhandled source stream error', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'openneko-cut-pcm-release-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'audio.wav'), 'fixture');
    const rawStdout = new PassThrough();
    let createStream: ((signal: AbortSignal) => RunningProcess) | undefined;
    const publisher: NodeMediaPublisher = {
      registerFile: vi.fn(),
      registerPcm: vi.fn(async (factory) => {
        createStream = factory;
        return {
          token: 'pcm-token-1',
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
          prime: vi.fn(),
        };
      }),
      unregister: vi.fn(),
    };
    const processPort: FfmpegProcessPort = {
      run: vi.fn(async () => ({
        stdout: Buffer.from(
          JSON.stringify({
            streams: [
              {
                index: 0,
                codec_type: 'audio',
                codec_name: 'pcm_s16le',
                sample_rate: '48000',
                channels: 2,
                duration: '4',
              },
            ],
            format: { duration: '4' },
          }),
        ),
        stderr: '',
      })),
      streamFfmpeg: vi.fn((_args, signal) => {
        const completion = new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
        void completion.catch((error: unknown) =>
          rawStdout.destroy(error instanceof Error ? error : new Error(String(error))),
        );
        return { stdout: rawStdout, completion, terminate: vi.fn() };
      }),
    };
    const adapter = new NodeFfmpegCutMediaAdapter(workspaceRoot, {
      process: processPort,
      publisher,
    });
    await adapter.startPcmMix(
      [
        {
          source: { workspaceRelativePath: 'audio.wav' },
          sourceStartSeconds: 0,
          playbackRate: 1,
          gainDb: 0,
          clipPositionSeconds: 0,
          clipDurationSeconds: 4,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
        },
      ],
      { timelineStartSeconds: 0, durationSeconds: 2, startPaused: true },
    );
    expect(createStream).toBeTypeOf('function');
    if (!createStream) throw new Error('PCM publisher did not receive its stream factory.');
    const cancellation = new AbortController();
    const running = createStream(cancellation.signal);
    const framedError = vi.fn();
    running.stdout.on('error', framedError);

    cancellation.abort(new Error('Desktop resource registration was released.'));

    await expect(running.completion).resolves.toBeUndefined();
    expect(rawStdout.listenerCount('error')).toBeGreaterThan(0);
    expect(framedError).not.toHaveBeenCalled();
    await adapter.dispose();
  });

  it('anchors delayed export audio to full timeline silence before loudness measurement', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'openneko-cut-export-audio-'));
    roots.push(workspaceRoot);
    await Promise.all([mkdir(join(workspaceRoot, 'edits')), mkdir(join(workspaceRoot, 'exports'))]);
    await Promise.all([
      writeFile(join(workspaceRoot, 'source.mp4'), 'fixture'),
      writeFile(join(workspaceRoot, 'edits', 'story.otio'), 'fixture'),
    ]);
    const ffmpegCalls: string[][] = [];
    const processPort: FfmpegProcessPort = {
      run: vi.fn(async (command, args) => {
        if (command === 'ffprobe') {
          return {
            stdout: Buffer.from(
              JSON.stringify({
                streams: [
                  {
                    index: 0,
                    codec_type: 'video',
                    codec_name: 'h264',
                    pix_fmt: 'yuv420p',
                    width: 640,
                    height: 360,
                    avg_frame_rate: '30/1',
                    duration: '6',
                  },
                  {
                    index: 1,
                    codec_type: 'audio',
                    codec_name: 'aac',
                    sample_rate: '48000',
                    channels: 2,
                    duration: '6',
                  },
                ],
                format: { duration: '6' },
              }),
            ),
            stderr: '',
          };
        }
        ffmpegCalls.push([...args]);
        if (args.at(-1) === '-') {
          return {
            stdout: Buffer.alloc(0),
            stderr: loudnessMeasurement(),
          };
        }
        const outputPath = args.at(-1);
        if (!outputPath) throw new Error('Fixture export command has no output path.');
        await writeFile(outputPath, 'rendered');
        return { stdout: Buffer.alloc(0), stderr: '' };
      }),
      streamFfmpeg: vi.fn(() => {
        throw new Error('Streaming is not part of this export scenario.');
      }),
    };
    const adapter = new NodeFfmpegCutMediaAdapter(workspaceRoot, { process: processPort });

    await adapter.export(delayedAudioExportRequest(workspaceRoot));

    const measurement = ffmpegCalls.find((args) => args.at(-1) === '-');
    const filter = measurement?.[measurement.indexOf('-filter_complex') + 1];
    expect(filter).toContain('anullsrc=r=48000:cl=stereo:d=6[asilence]');
    expect(filter).toContain('[asilence][aseg0][aseg1]amix=inputs=3:duration=longest:normalize=0');
    await adapter.dispose();
  });
});

function delayedAudioExportRequest(workspaceRoot: string): CutExportRequest {
  const clip = (clipId: string, startSeconds: number, sourceStartSeconds: number) => ({
    kind: 'clip' as const,
    clipId,
    name: clipId,
    targetUrl: '../source.mp4',
    startSeconds,
    durationSeconds: 2,
    sourceStartSeconds,
    playbackRate: 1,
    enabled: true,
    locked: false,
    audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
  });
  return {
    timeline: {
      documentUri: pathToFileURL(join(workspaceRoot, 'edits', 'story.otio')).href,
      sessionId: 'session-1',
      name: 'Delayed audio',
      durationSeconds: 6,
      tracks: [
        {
          trackId: 'video-1',
          name: 'Video 1',
          kind: 'Video',
          enabled: true,
          locked: false,
          audioMuted: false,
          items: [clip('clip-1', 2, 2), clip('clip-2', 4, 0)],
        },
      ],
    },
    outputWorkspaceRelativePath: 'exports/delayed.mp4',
    settings: {
      outputName: 'delayed',
      container: 'mp4',
      width: 640,
      height: 360,
      framesPerSecond: 30,
      videoBitrate: 1_000_000,
      includeAudio: true,
      audioBitrate: 128_000,
      audioSampleRate: 48_000,
    },
  };
}

function loudnessMeasurement(): string {
  return JSON.stringify({
    input_i: '-14.00',
    input_tp: '-1.20',
    input_lra: '2.00',
    input_thresh: '-24.00',
    target_offset: '0.00',
  });
}
