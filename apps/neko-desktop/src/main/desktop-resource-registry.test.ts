import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopResourceRegistry, type DesktopResourceOwner } from './desktop-resource-registry';

describe('DesktopResourceRegistry', () => {
  const roots: string[] = [];
  const registries: DesktopResourceRegistry[] = [];

  afterEach(async () => {
    for (const registry of registries.splice(0)) registry.dispose();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('registers an exact OpenNeko resource and serves repeatable byte ranges', async () => {
    const source = await createFixture('video.mp4', '0123456789');
    const registry = createRegistry();
    const lease = await registry.registerFile(owner(), {
      absolutePath: source,
      mediaType: 'video/mp4',
    });

    expect(lease.url).toMatch(/^openneko:\/\/resource\/[A-Za-z0-9_-]{32}$/u);
    expect(lease.url).not.toContain(source);
    expect(registry.authorizeRequest(lease.url, 101)).toBe(true);
    expect(registry.authorizeRequest(lease.url, 202)).toBe(false);

    const first = await registry.handle(
      new Request(lease.url, { headers: { Range: 'bytes=2-5' } }),
    );
    expect(first.status).toBe(206);
    expect(first.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await first.text()).toBe('2345');

    const suffix = await registry.handle(
      new Request(lease.url, { headers: { Range: 'bytes=-3' } }),
    );
    expect(await suffix.text()).toBe('789');

    const openEnded = await registry.handle(
      new Request(lease.url, { headers: { Range: 'bytes=7-' } }),
    );
    expect(openEnded.status).toBe(206);
    expect(await openEnded.text()).toBe('789');

    const head = await registry.handle(
      new Request(lease.url, { method: 'HEAD', headers: { Range: 'bytes=0-1' } }),
    );
    expect(head.status).toBe(206);
    expect(head.headers.get('Content-Length')).toBe('2');
    expect(await head.text()).toBe('');

    for (const range of ['bytes=20-30', 'bytes=5-2', 'bytes=0-1,4-5']) {
      const invalid = await registry.handle(new Request(lease.url, { headers: { Range: range } }));
      expect(invalid.status).toBe(416);
      expect(invalid.headers.get('Content-Range')).toBe('bytes */10');
    }
  });

  it('revokes only the exact owner and rejects changed source revisions', async () => {
    const source = await createFixture('audio.wav', 'wave');
    const registry = createRegistry();
    registry.bindWindow('window-2', 202);
    const first = await registry.registerFile(owner(), fileSource(source));
    const second = await registry.registerFile(
      owner({ windowId: 'window-2', sessionId: 'session-2' }),
      fileSource(source),
    );

    await writeFile(source, 'changed');
    expect((await registry.handle(new Request(first.url))).status).toBe(409);

    registry.releaseWindow('window-1');
    expect((await registry.handle(new Request(first.url))).status).toBe(404);
    expect((await registry.handle(new Request(second.url))).status).toBe(409);
  });

  it('serves one-shot PCM and terminates it on cancellation', async () => {
    const registry = createRegistry();
    const publisher = registry.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'cut-1',
      sessionId: 'cut-session-1',
      rendererSessionId: 'endpoint-1',
    });
    const stdout = new PassThrough();
    const terminate = vi.fn(() => stdout.end());
    const pcm = await publisher.registerPcm((signal) => {
      signal.addEventListener('abort', terminate, { once: true });
      return {
        stdout,
        completion: Promise.resolve(),
        terminate,
      };
    });
    pcm.prime();

    const response = await registry.handle(new Request(pcm.url));
    const reader = response.body!.getReader();
    stdout.write('pcm');
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('pcm');
    await reader.cancel();

    expect(terminate).toHaveBeenCalledOnce();
    expect((await registry.handle(new Request(pcm.url))).status).toBe(409);
  });

  it('stops waiting when an unprimed PCM request is cancelled', async () => {
    const registry = createRegistry();
    const publisher = registry.createMediaPublisher({
      windowId: 'window-1',
      viewId: 'cut-1',
      sessionId: 'cut-session-1',
      rendererSessionId: 'endpoint-1',
    });
    const createStream = vi.fn();
    const pcm = await publisher.registerPcm(createStream);
    const cancellation = new AbortController();

    const responsePromise = registry.handle(new Request(pcm.url, { signal: cancellation.signal }));
    cancellation.abort(new Error('test cancellation'));

    expect((await responsePromise).status).toBe(410);
    expect(createStream).not.toHaveBeenCalled();
  });

  it('serves only allowlisted resource-set dependencies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-openneko-resource-'));
    roots.push(root);
    const model = path.join(root, 'scene.gltf');
    const buffer = path.join(root, 'scene.bin');
    await writeFile(model, '{"buffers":[{"uri":"scene.bin"}]}');
    await writeFile(buffer, 'buffer');
    const registry = createRegistry();
    const lease = await registry.registerResourceSet(
      owner(),
      [
        { virtualPath: 'scene.gltf', path: model, contentType: 'model/gltf+json' },
        {
          virtualPath: 'scene.bin',
          path: buffer,
          contentType: 'application/octet-stream',
        },
      ],
      'scene.gltf',
    );

    expect(await (await registry.handle(new Request(lease.url))).text()).toContain('scene.bin');
    expect(
      await (await registry.handle(new Request(new URL('scene.bin', lease.url).toString()))).text(),
    ).toBe('buffer');
    expect(
      (await registry.handle(new Request(new URL('missing.bin', lease.url).toString()))).status,
    ).toBe(404);
    expect(
      (
        await registry.handle(
          new Request(`${lease.url.slice(0, lease.url.lastIndexOf('/') + 1)}%2Fetc%2Fpasswd`),
        )
      ).status,
    ).toBe(400);
  });

  it('requires exact absolute files and explicit sender authorization', async () => {
    const registry = createRegistry();
    await expect(
      registry.registerFile(owner(), {
        absolutePath: 'relative/video.mp4',
        mediaType: 'video/mp4',
      }),
    ).rejects.toThrow('absolute file path');

    const source = await createFixture('authorized.mp4', 'video');
    const lease = await registry.registerFile(owner(), fileSource(source));
    expect(registry.authorizeRequest(lease.url, 0)).toBe(false);
    expect(registry.authorizeRequest(lease.url, 202)).toBe(false);
    expect(registry.authorizeRequest(lease.url, 101)).toBe(true);
    registry.releaseView('window-1', 'view-1');
    expect(registry.authorizeRequest(lease.url, 101)).toBe(false);
  });

  async function createFixture(name: string, contents: string): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'desktop-openneko-resource-'));
    roots.push(root);
    const source = path.join(root, name);
    await writeFile(source, contents);
    return source;
  }

  function createRegistry(): DesktopResourceRegistry {
    const registry = new DesktopResourceRegistry();
    registry.bindWindow('window-1', 101);
    registries.push(registry);
    return registry;
  }
});

function owner(overrides: Partial<DesktopResourceOwner> = {}): DesktopResourceOwner {
  return {
    windowId: 'window-1',
    viewId: 'view-1',
    sessionId: 'session-1',
    rendererSessionId: 'endpoint-1',
    ...overrides,
  };
}

function fileSource(absolutePath: string) {
  return {
    absolutePath,
    mediaType: 'audio/wav',
  };
}
