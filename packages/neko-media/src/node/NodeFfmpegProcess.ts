import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough, type Readable } from 'node:stream';

export interface FfmpegExecutablePaths {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

export interface FfmpegRunResult {
  readonly stdout: Buffer;
  readonly stderr: string;
}

export interface RunningProcess {
  readonly stdout: Readable;
  readonly completion: Promise<void>;
  terminate(): void;
}

export interface FfmpegProcessPort {
  run(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<FfmpegRunResult>;
  streamFfmpeg(args: readonly string[], signal?: AbortSignal): RunningProcess;
}

const MAX_STDERR_BYTES = 256 * 1024;

export class NodeFfmpegProcess implements FfmpegProcessPort {
  constructor(private readonly executables: FfmpegExecutablePaths = resolveFfmpegExecutables()) {}

  async run(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<FfmpegRunResult> {
    throwIfAborted(signal);
    const child = this.spawn(executable, args);
    const abort = (): void => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stderrBytes = 0;
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrBytes >= MAX_STDERR_BYTES) return;
        const remaining = MAX_STDERR_BYTES - stderrBytes;
        const bounded = chunk.subarray(0, remaining);
        stderrChunks.push(bounded);
        stderrBytes += bounded.byteLength;
      });
      const [code, terminationSignal] = (await once(child, 'exit')) as [
        number | null,
        NodeJS.Signals | null,
      ];
      throwIfAborted(signal);
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const stdout = Buffer.concat(stdoutChunks);
      if (code !== 0) {
        throw new FfmpegCommandError(executable, args, code, terminationSignal, stderr, stdout);
      }
      return { stdout, stderr };
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  streamFfmpeg(args: readonly string[], signal?: AbortSignal): RunningProcess {
    throwIfAborted(signal);
    const child = this.spawn('ffmpeg', args);
    const output = new PassThrough();
    child.stdout.pipe(output, { end: false });
    const abort = (): void => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    const completion = (async (): Promise<void> => {
      const stderrChunks: Buffer[] = [];
      let stderrBytes = 0;
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrBytes >= MAX_STDERR_BYTES) return;
        const remaining = MAX_STDERR_BYTES - stderrBytes;
        const bounded = chunk.subarray(0, remaining);
        stderrChunks.push(bounded);
        stderrBytes += bounded.byteLength;
      });
      try {
        const [code, terminationSignal] = (await once(child, 'exit')) as [
          number | null,
          NodeJS.Signals | null,
        ];
        throwIfAborted(signal);
        if (code !== 0) {
          throw new FfmpegCommandError(
            'ffmpeg',
            args,
            code,
            terminationSignal,
            Buffer.concat(stderrChunks).toString('utf8'),
          );
        }
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    })();
    void completion.then(
      () => output.end(),
      (error: unknown) => output.destroy(asError(error)),
    );
    return {
      stdout: output,
      completion,
      terminate: () => child.kill('SIGKILL'),
    };
  }

  private spawn(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
  ): ChildProcessWithoutNullStreams {
    return spawn(this.executables[executable], args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }
}

export class FfmpegCommandError extends Error {
  constructor(
    readonly executable: 'ffmpeg' | 'ffprobe',
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly terminationSignal: NodeJS.Signals | null,
    readonly stderr: string,
    readonly stdout: Buffer = Buffer.alloc(0),
  ) {
    const detail = stderr.trim().split(/\r?\n/u).slice(-6).join('\n');
    super(
      `${executable} failed (${exitCode ?? terminationSignal ?? 'unknown'}).${detail ? `\n${detail}` : ''}`,
    );
    this.name = 'FfmpegCommandError';
  }
}

function resolveFfmpegExecutables(
  environment: NodeJS.ProcessEnv = process.env,
): FfmpegExecutablePaths {
  return {
    ffmpeg: environment['NEKO_FFMPEG_PATH']?.trim() || 'ffmpeg',
    ffprobe: environment['NEKO_FFPROBE_PATH']?.trim() || 'ffprobe',
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('FFmpeg operation was cancelled.');
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
