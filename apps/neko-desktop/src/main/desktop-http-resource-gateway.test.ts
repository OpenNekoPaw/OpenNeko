import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ILogger } from '@neko/shared';
import { DesktopHttpResourceGateway } from './desktop-http-resource-gateway';

describe('DesktopHttpResourceGateway', () => {
  const roots: string[] = [];
  const gateways: DesktopHttpResourceGateway[] = [];

  afterEach(async () => {
    await Promise.all(gateways.splice(0).map((gateway) => gateway.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('starts one exact loopback origin and revokes an owner-scoped file lease', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-http-gateway-'));
    roots.push(root);
    const sourcePath = path.join(root, 'preview.mp4');
    await writeFile(sourcePath, '0123456789');
    const gateway = createGateway();
    gateways.push(gateway);

    const origin = await gateway.start();
    const lease = await gateway.registerFile(
      {
        windowId: 'window-1',
        viewId: 'preview-1',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
        revision: 'revision-1',
        generation: 'generation-1',
      },
      {
        absolutePath: sourcePath,
        mediaType: 'video/mp4',
        revision: 'revision-1',
      },
    );

    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(lease.url.startsWith(`${origin}/v1/resources/`)).toBe(true);
    expect(lease.url).not.toContain(sourcePath);
    expect(await (await fetch(lease.url)).text()).toBe('0123456789');

    gateway.releaseSession('session-1');
    expect((await fetch(lease.url)).status).toBe(404);
  });

  it('isolates sessions and releases all capabilities owned by a Window', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-http-gateway-'));
    roots.push(root);
    const sourcePath = path.join(root, 'preview.wav');
    await writeFile(sourcePath, 'wave');
    const gateway = createGateway();
    gateways.push(gateway);
    const first = await register(gateway, sourcePath, 'window-1', 'session-1');
    const second = await register(gateway, sourcePath, 'window-1', 'session-2');
    const other = await register(gateway, sourcePath, 'window-2', 'session-3');

    first.release();
    expect((await fetch(first.url)).status).toBe(404);
    expect((await fetch(second.url)).status).toBe(200);
    expect((await fetch(other.url)).status).toBe(200);

    gateway.releaseWindow('window-1');
    expect((await fetch(second.url)).status).toBe(404);
    expect((await fetch(other.url)).status).toBe(200);
  });

  it('releases only the exact generation and View owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-http-gateway-'));
    roots.push(root);
    const sourcePath = path.join(root, 'preview.wav');
    await writeFile(sourcePath, 'wave');
    const gateway = createGateway();
    gateways.push(gateway);
    const first = await register(gateway, sourcePath, 'window-1', 'session-1', {
      viewId: 'view-1',
      generation: 'generation-1',
    });
    const replacement = await register(gateway, sourcePath, 'window-1', 'session-1', {
      viewId: 'view-1',
      generation: 'generation-2',
    });
    const sibling = await register(gateway, sourcePath, 'window-1', 'session-2', {
      viewId: 'view-2',
      generation: 'generation-1',
    });

    gateway.releaseGeneration({
      windowId: 'window-1',
      viewId: 'view-1',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
      generation: 'generation-1',
    });
    expect((await fetch(first.url)).status).toBe(404);
    expect((await fetch(replacement.url)).status).toBe(200);
    expect((await fetch(sibling.url)).status).toBe(200);

    gateway.releaseView('window-1', 'view-1');
    expect((await fetch(replacement.url)).status).toBe(404);
    expect((await fetch(sibling.url)).status).toBe(200);
  });

  it('owns file and one-shot PCM registrations created through a scoped media publisher', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-http-gateway-'));
    roots.push(root);
    const sourcePath = path.join(root, 'cut-preview.mp4');
    await writeFile(sourcePath, 'video');
    const gateway = createGateway();
    gateways.push(gateway);
    const publisher = gateway.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'cut-1',
      sessionId: 'cut-session-1',
      endpointEpoch: 'endpoint-1',
      revision: 'revision-1',
    });
    const file = await publisher.registerFile(sourcePath, 'video/mp4', 'revision-1');
    const pcm = await publisher.registerPcm(() => {
      const stdout = new PassThrough();
      stdout.end('pcm');
      return {
        stdout,
        completion: Promise.resolve(),
        terminate: vi.fn(),
      };
    });
    pcm.prime();

    expect(await (await fetch(file.url)).text()).toBe('video');
    expect(await (await fetch(pcm.url)).text()).toBe('pcm');

    gateway.releaseView('window-1', 'cut-1');
    expect((await fetch(file.url)).status).toBe(404);
    expect((await fetch(pcm.url)).status).toBe(404);
    expect(() => publisher.unregister(file.token)).not.toThrow();
  });

  it('does not let one scoped publisher release another publisher registration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-http-gateway-'));
    roots.push(root);
    const sourcePath = path.join(root, 'preview.wav');
    await writeFile(sourcePath, 'wave');
    const gateway = createGateway();
    gateways.push(gateway);
    const first = gateway.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'canvas-1',
      sessionId: 'canvas-session-1',
      endpointEpoch: 'endpoint-1',
      revision: 'revision-1',
    });
    const second = gateway.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'canvas-2',
      sessionId: 'canvas-session-2',
      endpointEpoch: 'endpoint-1',
      revision: 'revision-1',
    });
    const registration = await second.registerFile(sourcePath, 'audio/wav', 'revision-1');

    expect(() => first.unregister(registration.token)).toThrow(
      'cannot release another owner registration',
    );
    expect((await fetch(registration.url)).status).toBe(200);
  });

  it('closes the listener, aborts an active PCM producer and rejects publisher reuse on app quit', async () => {
    const gateway = createGateway();
    gateways.push(gateway);
    const origin = await gateway.start();
    const publisher = gateway.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'cut-1',
      sessionId: 'cut-session-1',
      endpointEpoch: 'endpoint-1',
      revision: 'revision-1',
    });
    const stdout = new PassThrough();
    const terminate = vi.fn(() => stdout.end());
    let producerSignal: AbortSignal | undefined;
    const pcm = await publisher.registerPcm((signal) => {
      producerSignal = signal;
      signal.addEventListener('abort', terminate, { once: true });
      return {
        stdout,
        completion: new Promise<void>((resolve) => stdout.once('end', resolve)),
        terminate,
      };
    });
    pcm.prime();
    const response = await fetch(pcm.url);
    stdout.write('pcm');
    await response.body?.getReader().read();

    await gateway.dispose();

    expect(producerSignal?.aborted).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
    await expect(fetch(origin)).rejects.toThrow();
    await expect(
      publisher.registerPcm(() => ({
        stdout: new PassThrough(),
        completion: Promise.resolve(),
        terminate: vi.fn(),
      })),
    ).rejects.toThrow('gateway is disposed');
  });
});

function createGateway(): DesktopHttpResourceGateway {
  return new DesktopHttpResourceGateway({
    allowedOrigins: ['neko-app://desktop'],
    logger: createLogger(),
  });
}

async function register(
  gateway: DesktopHttpResourceGateway,
  absolutePath: string,
  windowId: string,
  sessionId: string,
  owner: {
    readonly viewId?: string;
    readonly generation?: string;
  } = {},
) {
  return gateway.registerFile(
    {
      windowId,
      viewId: owner.viewId ?? `view:${sessionId}`,
      sessionId,
      endpointEpoch: 'endpoint-1',
      revision: 'revision-1',
      generation: owner.generation ?? 'generation-1',
    },
    {
      absolutePath,
      mediaType: 'audio/wav',
      revision: 'revision-1',
    },
  );
}

function createLogger(): ILogger {
  const logger: ILogger = {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
    setLevel: vi.fn(),
  };
  return logger;
}
