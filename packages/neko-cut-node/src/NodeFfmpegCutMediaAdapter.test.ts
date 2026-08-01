import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
