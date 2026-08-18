import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DesktopDshSubprocessSupervisor } from './desktop-dsh-subprocess-supervisor';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('DesktopDshSubprocessSupervisor', () => {
  it('requires explicit absolute executable, cwd, and positive stop timeout', () => {
    const cwd = '/tmp';
    expect(
      () =>
        new DesktopDshSubprocessSupervisor({
          executable: 'dsh',
          args: [],
          cwd,
          environment: {},
        }),
    ).toThrow(/executable must be an absolute path/);
    expect(
      () =>
        new DesktopDshSubprocessSupervisor({
          executable: process.execPath,
          args: [],
          cwd: 'relative',
          environment: {},
        }),
    ).toThrow(/working directory must be an absolute path/);
    expect(
      () =>
        new DesktopDshSubprocessSupervisor({
          executable: process.execPath,
          args: [],
          cwd,
          environment: {},
          stopTimeoutMs: 0,
        }),
    ).toThrow(/stop timeout must be a positive integer/);
  });

  it('exposes ACP bytes on stdout, diagnostics on stderr, and stops idempotently', async () => {
    const cwd = await createRoot();
    const stderr: string[] = [];
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: [
        '-e',
        "process.stdout.write('protocol-bytes'); process.stderr.write('diagnostic'); process.stdin.resume(); process.on('SIGTERM', () => process.exit(0))",
      ],
      cwd,
      environment: {},
      onStderr: (chunk) => stderr.push(chunk),
    });
    const handle = supervisor.start();
    const iterator = handle.transport.readable[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(Buffer.from(first.value ?? []).toString('utf8')).toBe('protocol-bytes');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stderr.join('')).toContain('diagnostic');
    await handle.stop();
    const exit = await handle.closed;
    expect(exit.code === 0 || exit.signal === 'SIGTERM').toBe(true);
    await expect(handle.stop()).resolves.toBeUndefined();
    await expect(handle.dispose()).resolves.toBeUndefined();
    await expect(supervisor.dispose()).resolves.toBeUndefined();
  });

  it('passes only the controlled environment to the child', async () => {
    const cwd = await createRoot();
    const dshHome = join(cwd, 'dsh-home');
    const home = join(cwd, 'home');
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: [
        '-e',
        `process.stdout.write(JSON.stringify({ dshHome: process.env.DSH_HOME ?? null, home: process.env.HOME ?? null, secret: process.env.SECRET ?? null, pathPresent: Object.prototype.hasOwnProperty.call(process.env, 'PATH'), workspace: process.env.WORKSPACE ?? null })); process.stdin.resume(); process.on('SIGTERM', () => process.exit(0))`,
      ],
      cwd,
      environment: {
        DSH_HOME: dshHome,
        HOME: home,
        SECRET: 'top-secret',
      },
    });
    const handle = supervisor.start();
    const iterator = handle.transport.readable[Symbol.asyncIterator]();
    const first = await iterator.next();
    const seen = JSON.parse(Buffer.from(first.value ?? []).toString('utf8')) as {
      dshHome: string | null;
      home: string | null;
      secret: string | null;
      pathPresent: boolean;
      workspace: string | null;
    };
    expect(seen).toEqual({
      dshHome,
      home,
      secret: 'top-secret',
      pathPresent: false,
      workspace: null,
    });
    await handle.dispose();
  });

  it('reports an unexpected child exit, clears ownership, and never starts a fallback', async () => {
    const cwd = await createRoot();
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: ['-e', 'process.exit(17)'],
      cwd,
      environment: {},
    });
    const handle = supervisor.start();

    await expect(handle.closed).rejects.toThrow(/exited unexpectedly: code=17/);
    await expect(handle.dispose()).resolves.toBeUndefined();
    const next = supervisor.start();
    await expect(next.closed).rejects.toThrow(/exited unexpectedly: code=17/);
    await expect(next.dispose()).resolves.toBeUndefined();
  });

  it('rejects duplicate starts while the child owns the transport', async () => {
    const cwd = await createRoot();
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: ['-e', "process.stdin.resume(); process.on('SIGTERM', () => process.exit(0))"],
      cwd,
      environment: {},
    });
    const handle = supervisor.start();

    expect(() => supervisor.start()).toThrow(/already running/);
    await handle.stop();
  });

  it('surfaces spawn errors and clears the owned handle for a later explicit start', async () => {
    const cwd = await createRoot();
    const missing = join(cwd, 'missing-dsh');
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: missing,
      args: [],
      cwd,
      environment: {},
      stopTimeoutMs: 50,
    });
    const handle = supervisor.start();

    await expect(handle.closed).rejects.toThrow();
    await expect(handle.dispose()).resolves.toBeUndefined();
    const next = supervisor.start();
    await expect(next.closed).rejects.toThrow();
    await expect(next.dispose()).resolves.toBeUndefined();
  });

  it('fails visibly on stop timeout, force-kills, and keeps stop idempotent', async () => {
    const cwd = await createRoot();
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: [
        '-e',
        "process.stdout.write('ready'); process.stdin.resume(); process.on('SIGTERM', () => { process.stdout.write('ignore'); }); setInterval(() => {}, 1000)",
      ],
      cwd,
      environment: {},
      stopTimeoutMs: 50,
    });
    const handle = supervisor.start();
    const iterator = handle.transport.readable[Symbol.asyncIterator]();
    const ready = await iterator.next();
    expect(Buffer.from(ready.value ?? []).toString('utf8')).toBe('ready');
    const earlyExit = await Promise.race([
      handle.closed.then(
        () => true,
        () => true,
      ),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);
    expect(earlyExit).toBe(false);

    await expect(handle.stop()).rejects.toThrow(/did not stop within 50ms/);
    await expect(handle.closed).resolves.toMatchObject({ code: null, signal: 'SIGKILL' });
    await expect(handle.stop()).rejects.toThrow(/did not stop within 50ms/);
  });

  it('restarts only through supervisor ownership after the old child is stopped', async () => {
    const cwd = await createRoot();
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: [
        '-e',
        "process.stdout.write('first'); process.stdin.resume(); process.on('SIGTERM', () => process.exit(0))",
      ],
      cwd,
      environment: {},
    });
    const first = supervisor.start();
    const firstIterator = first.transport.readable[Symbol.asyncIterator]();
    const firstChunk = await firstIterator.next();
    expect(Buffer.from(firstChunk.value ?? []).toString('utf8')).toBe('first');

    const second = await supervisor.restart();
    expect(second).not.toBe(first);
    const firstExit = await first.closed;
    expect(firstExit.code === 0 || firstExit.signal === 'SIGTERM').toBe(true);

    const secondIterator = second.transport.readable[Symbol.asyncIterator]();
    const secondChunk = await secondIterator.next();
    expect(Buffer.from(secondChunk.value ?? []).toString('utf8')).toBe('first');
    await supervisor.dispose();
    const secondExit = await second.closed;
    expect(secondExit.code === 0 || secondExit.signal === 'SIGTERM').toBe(true);
  });

  it('rejects restart when no owned subprocess is running', async () => {
    const cwd = await createRoot();
    const supervisor = new DesktopDshSubprocessSupervisor({
      executable: process.execPath,
      args: [],
      cwd,
      environment: {},
    });

    await expect(supervisor.restart()).rejects.toThrow(/not running/);
    await expect(supervisor.dispose()).resolves.toBeUndefined();
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-supervisor-'));
  roots.push(root);
  return root;
}
