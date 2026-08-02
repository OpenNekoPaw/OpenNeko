import { describe, expect, it } from 'vitest';
import { FfmpegCommandError, NodeFfmpegProcess } from './NodeFfmpegProcess';

describe('NodeFfmpegProcess', () => {
  it('fails the stdout consumer when FFmpeg exits after closing a partial stdout stream', async () => {
    const processPort = new NodeFfmpegProcess({
      ffmpeg: process.execPath,
      ffprobe: process.execPath,
    });
    const running = processPort.streamFfmpeg([
      '-e',
      [
        "process.stdout.write('partial', () => {",
        '  process.stdout.end(() => {',
        '    setTimeout(() => process.exit(7), 50);',
        '  });',
        '});',
      ].join('\n'),
    ]);

    const consume = async (): Promise<void> => {
      for await (const _chunk of running.stdout) {
        // Consume until the process completion determines EOF or failure.
      }
    };

    await expect(consume()).rejects.toBeInstanceOf(FfmpegCommandError);
    await expect(running.completion).rejects.toBeInstanceOf(FfmpegCommandError);
  });
});
