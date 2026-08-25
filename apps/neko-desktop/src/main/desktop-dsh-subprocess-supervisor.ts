import {
  spawn as spawnChildProcess,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { isAbsolute } from 'node:path';

import type { DshAcpByteTransport } from '@neko/agent-runtime/acp';

export interface DesktopDshSubprocessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface DesktopDshSubprocessHandle {
  readonly transport: DshAcpByteTransport;
  readonly closed: Promise<DesktopDshSubprocessExit>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface DesktopDshSubprocessSupervisorOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly stopTimeoutMs?: number;
  readonly onStderr?: (chunk: string) => void;
  readonly spawn?: (
    executable: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
}

const DEFAULT_STOP_TIMEOUT_MS = 5_000;

export class DesktopDshSubprocessSupervisor {
  private handle: DesktopDshSubprocessHandle | undefined;

  constructor(private readonly options: DesktopDshSubprocessSupervisorOptions) {
    if (!isAbsolute(options.executable)) {
      throw new Error('Desktop DSH executable must be an absolute path.');
    }
    if (!isAbsolute(options.cwd)) {
      throw new Error('Desktop DSH working directory must be an absolute path.');
    }
    const stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    if (!Number.isSafeInteger(stopTimeoutMs) || stopTimeoutMs <= 0) {
      throw new Error('Desktop DSH stop timeout must be a positive integer.');
    }
  }

  start(): DesktopDshSubprocessHandle {
    if (this.handle !== undefined) {
      throw new Error('Desktop DSH subprocess is already running.');
    }
    const spawn = this.options.spawn ?? spawnChildProcess;
    const child = spawn(this.options.executable, this.options.args, {
      cwd: this.options.cwd,
      env: { ...this.options.environment },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stderr.setEncoding('utf8');
    if (this.options.onStderr !== undefined) {
      child.stderr.on('data', this.options.onStderr);
    }
    const clearCurrentChild = (): void => {
      if (this.handle?.transport.readable === child.stdout) this.handle = undefined;
    };

    let stopping = false;
    let stopPromise: Promise<void> | undefined;
    const closed = waitForExit(child).then(
      (exit) => {
        clearCurrentChild();
        if (!stopping && (exit.code !== 0 || exit.signal !== null)) {
          throw new Error(
            `Desktop DSH subprocess exited unexpectedly: code=${String(exit.code)} signal=${String(exit.signal)}.`,
          );
        }
        return exit;
      },
      (error: unknown) => {
        clearCurrentChild();
        throw error;
      },
    );

    const stop = (): Promise<void> => {
      if (stopPromise !== undefined) return stopPromise;
      stopping = true;
      stopPromise = stopChild(child, closed, this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
      return stopPromise;
    };

    const handle: DesktopDshSubprocessHandle = {
      transport: {
        readable: child.stdout,
        write: (chunk) => writeBytes(child, chunk),
        close: () => closeInput(child),
      },
      closed,
      stop,
      dispose: stop,
    };
    this.handle = handle;
    return handle;
  }

  async restart(): Promise<DesktopDshSubprocessHandle> {
    const current = this.handle;
    if (current === undefined) {
      throw new Error('Desktop DSH subprocess is not running.');
    }
    await current.stop();
    return this.start();
  }

  async dispose(): Promise<void> {
    const current = this.handle;
    if (current === undefined) return;
    await current.dispose();
  }
}

function writeBytes(child: ChildProcessWithoutNullStreams, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    child.stdin.write(chunk, (error) => {
      if (error !== null && error !== undefined) reject(error);
      else resolve();
    });
  });
}

function closeInput(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.stdin.destroyed || child.stdin.writableEnded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    child.stdin.end((error?: Error | null) => {
      if (error !== null && error !== undefined) reject(error);
      else resolve();
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<DesktopDshSubprocessExit> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      child.removeListener('exit', onExit);
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      child.removeListener('error', onError);
      resolve({ code, signal });
    };
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

async function stopChild(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<DesktopDshSubprocessExit>,
  timeoutMs: number,
): Promise<void> {
  const settled = await Promise.race([
    closed.then(
      () => true,
      () => true,
    ),
    new Promise<false>((resolve) => setImmediate(() => resolve(false))),
  ]);
  if (settled) return;
  await closeInput(child);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;
  try {
    const exit = await Promise.race([
      closed,
      new Promise<DesktopDshSubprocessExit>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
          reject(new Error(`Desktop DSH subprocess did not stop within ${timeoutMs}ms.`));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
    if (exit.code !== 0 && exit.signal !== 'SIGTERM') {
      throw new Error(
        `Desktop DSH subprocess stopped abnormally: code=${String(exit.code)} signal=${String(exit.signal)}.`,
      );
    }
  } catch (error) {
    if (timedOut) {
      await closed.catch(() => undefined);
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
