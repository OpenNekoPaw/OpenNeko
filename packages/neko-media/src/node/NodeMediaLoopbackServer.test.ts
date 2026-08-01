import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { ILogger } from '@neko/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeMediaLoopbackServer, createPcmPacketTransform } from './NodeMediaLoopbackServer';

describe('NodeMediaLoopbackServer', () => {
  const roots: string[] = [];
  const servers: NodeMediaLoopbackServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('serves opaque file URLs with byte ranges and exact private-network CORS', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cut-media-server-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, '0123456789');
    const server = new NodeMediaLoopbackServer({
      allowedOrigins: ['neko-app://desktop'],
    });
    servers.push(server);

    const registration = await server.registerFile(filePath, 'video/mp4');
    const response = await fetch(registration.url, { headers: { Range: 'bytes=2-5' } });

    expect(registration.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/v1\/resources\/[A-Za-z0-9_-]{32}$/,
    );
    expect(registration.url).not.toContain(encodeURIComponent(filePath));
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('2345');

    const corsRange = await fetch(registration.url, {
      headers: {
        Origin: 'neko-app://desktop',
        Range: 'bytes=2-5',
      },
    });
    expect(corsRange.status).toBe(206);
    expect(corsRange.headers.get('access-control-allow-origin')).toBe('neko-app://desktop');
    expect(corsRange.headers.get('access-control-expose-headers')).toBe(
      'Accept-Ranges, Content-Length, Content-Range, Content-Type',
    );
    expect(corsRange.headers.get('accept-ranges')).toBe('bytes');
    expect(corsRange.headers.get('content-range')).toBe('bytes 2-5/10');

    const preflight = await fetch(registration.url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'neko-app://desktop',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Range',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('neko-app://desktop');
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');
    expect(
      (
        await fetch(registration.url, {
          headers: { Origin: 'https://unexpected.example' },
        })
      ).status,
    ).toBe(403);
  });

  it('supports full, HEAD, open, closed and suffix ranges without consuming the token', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-server-ranges-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, '0123456789');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4');

    const head = await fetch(registration.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
    expect(await (await fetch(registration.url)).text()).toBe('0123456789');
    expect(await (await fetch(registration.url, { headers: { Range: 'bytes=4-' } })).text()).toBe(
      '456789',
    );
    expect(await (await fetch(registration.url, { headers: { Range: 'bytes=-3' } })).text()).toBe(
      '789',
    );
    const invalid = await fetch(registration.url, { headers: { Range: 'bytes=2-3,5-6' } });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toBe('bytes */10');
  });

  it('supports repeated concurrent ranges for one frozen source revision', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-server-concurrent-ranges-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, '0123456789');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4', 'revision-1');

    const responses = await Promise.all(
      ['bytes=0-2', 'bytes=3-5', 'bytes=7-', 'bytes=-2', 'bytes=0-2'].map((range) =>
        fetch(registration.url, { headers: { Range: range } }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([206, 206, 206, 206, 206]);
    await expect(Promise.all(responses.map((response) => response.text()))).resolves.toEqual([
      '012',
      '345',
      '789',
      '89',
      '012',
    ]);
  });

  it('rejects origin-less or over-broad preflight requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-server-preflight-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, 'bytes');
    const server = new NodeMediaLoopbackServer({
      allowedOrigins: ['neko-app://desktop'],
    });
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4');

    expect(
      (
        await fetch(registration.url, {
          method: 'OPTIONS',
          headers: { 'Access-Control-Request-Method': 'GET' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(registration.url, {
          method: 'OPTIONS',
          headers: {
            Origin: 'neko-app://desktop',
            'Access-Control-Request-Method': 'POST',
          },
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await fetch(registration.url, {
          method: 'OPTIONS',
          headers: {
            Origin: 'neko-app://desktop',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization',
          },
        })
      ).status,
    ).toBe(403);
  });

  it('does not report a browser-aborted Range response as a loopback failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cut-media-server-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, Buffer.alloc(4 * 1024 * 1024));
    const { logger, error } = createTestLogger();
    const server = new NodeMediaLoopbackServer(logger);
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4');

    await new Promise<void>((resolve, reject) => {
      const request = get(registration.url, { headers: { Range: 'bytes=0-' } }, (response) => {
        response.destroy();
        resolve();
      });
      request.once('error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(error).not.toHaveBeenCalled();
    const laterResponse = await fetch(registration.url, {
      headers: { Range: 'bytes=2-5' },
    });
    expect(laterResponse.status).toBe(206);
  });

  it('aborts an open Range response when its file token is revoked', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cut-media-server-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, '');
    await truncate(filePath, 32 * 1024 * 1024);
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4');

    await new Promise<void>((resolve, reject) => {
      const request = get(registration.url, { headers: { Range: 'bytes=0-' } }, (response) => {
        response.once('error', (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error);
        });
        response.once('close', () => {
          try {
            expect(response.complete).toBe(false);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        response.once('data', () => server.unregister(registration.token));
      });
      request.once('error', reject);
    });

    expect((await fetch(registration.url)).status).toBe(404);
  });

  it('frames PCM only after explicit priming and rejects a second consumer', async () => {
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    const raw = Buffer.alloc(960 * 2 * Float32Array.BYTES_PER_ELEMENT);
    const framed = Readable.from([raw]).pipe(
      createPcmPacketTransform({
        sampleRate: 48_000,
        channels: 2,
        startTimeSeconds: 3,
        playbackRate: 1.5,
      }),
    );
    const registration = await server.registerPcm(() => ({
      stdout: framed,
      completion: Promise.resolve(),
      terminate: () => undefined,
    }));

    const response = await fetch(registration.url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.openneko.pcm');
    expect((await fetch(registration.url)).status).toBe(409);
    expect(
      (
        await fetch(registration.url, {
          method: 'HEAD',
          headers: { Range: 'bytes=0-10' },
        })
      ).status,
    ).toBe(416);

    registration.prime();
    const packet = Buffer.from(await response.arrayBuffer());
    expect(packet.readBigInt64LE(0)).toBe(3_000_000n);
    expect(packet.readBigInt64LE(8)).toBe(20_000n);
    expect(packet.readUInt32LE(16)).toBe(48_000);
    expect(packet.readUInt16LE(20)).toBe(2);
    expect(packet.byteLength).toBe(22 + raw.byteLength);
  });

  it('ends an unactivated PCM response cleanly when the session is stopped', async () => {
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    let streamCreated = false;
    const registration = await server.registerPcm(() => {
      streamCreated = true;
      return {
        stdout: Readable.from([]),
        completion: Promise.resolve(),
        terminate: () => undefined,
      };
    });

    const response = await fetch(registration.url);
    server.unregister(registration.token);

    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(streamCreated).toBe(false);
  });

  it('cancels PCM ownership when the browser disconnects during a seek', async () => {
    const { logger, error } = createTestLogger();
    const server = new NodeMediaLoopbackServer(logger);
    servers.push(server);
    let processSignal: AbortSignal | undefined;
    const stdout = new PassThrough();
    let settleCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      settleCompletion = resolve;
    });
    const terminate = vi.fn(() => {
      stdout.end();
      settleCompletion();
    });
    const registration = await server.registerPcm((signal) => {
      processSignal = signal;
      signal.addEventListener(
        'abort',
        () => {
          stdout.end();
          settleCompletion();
        },
        { once: true },
      );
      return { stdout, completion, terminate };
    });
    registration.prime();

    await new Promise<void>((resolve, reject) => {
      const request = get(registration.url, (response) => {
        response.once('data', () => {
          response.destroy();
          resolve();
        });
        stdout.write(Buffer.alloc(64));
      });
      request.once('error', reject);
    });
    await vi.waitFor(() => expect(processSignal?.aborted).toBe(true));

    expect(error).not.toHaveBeenCalled();
  });

  it('revokes tokens and rejects unsafe or unknown routes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cut-media-server-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, 'bytes');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4');

    server.unregister(registration.token);

    expect((await fetch(registration.url)).status).toBe(404);
    expect((await fetch(`${registration.url}/../../secret`)).status).toBe(404);
  });

  it('returns a redacted revision conflict when a registered source disappears', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-server-redaction-'));
    roots.push(root);
    const filePath = path.join(root, 'secret-source.mp4');
    await writeFile(filePath, 'bytes');
    const { logger, error } = createTestLogger();
    const server = new NodeMediaLoopbackServer(logger);
    servers.push(server);
    const registration = await server.registerFile(filePath, 'video/mp4', 'revision-1');

    await rm(filePath);
    const response = await fetch(registration.url);
    const body = await response.text();

    expect(response.status).toBe(409);
    expect(body).toBe('media resource revision changed');
    expect(error).not.toHaveBeenCalled();
    expect(body).not.toContain(filePath);
  });

  it('serves only frozen allowlisted resource-set entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-resource-set-'));
    roots.push(root);
    const modelPath = path.join(root, 'scene.gltf');
    const bufferPath = path.join(root, 'scene.bin');
    await writeFile(modelPath, '{"buffers":[{"uri":"scene.bin"}]}');
    await writeFile(bufferPath, 'buffer');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);

    const registration = await server.registerResourceSet(
      [
        { virtualPath: 'scene.gltf', path: modelPath, contentType: 'model/gltf+json' },
        {
          virtualPath: 'scene.bin',
          path: bufferPath,
          contentType: 'application/octet-stream',
        },
      ],
      'scene.gltf',
    );

    expect(await (await fetch(registration.entryUrl)).text()).toContain('scene.bin');
    const dependency = await fetch(new URL('scene.bin', registration.entryUrl));
    expect(dependency.headers.get('content-type')).toBe('application/octet-stream');
    expect(dependency.headers.get('content-length')).toBe('6');
    expect(await dependency.text()).toBe('buffer');
    expect((await fetch(new URL('unknown.png', registration.entryUrl))).status).toBe(404);
    await expect(
      server.registerResourceSet(
        [{ virtualPath: '../secret', path: bufferPath, contentType: 'application/octet-stream' }],
        '../secret',
      ),
    ).rejects.toThrow('unsafe segment');

    registration.release();
    expect((await fetch(registration.entryUrl)).status).toBe(404);
  });

  it('serves a bounded local manifest and exact segments without claiming live playback', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-resource-set-manifest-'));
    roots.push(root);
    const manifestPath = path.join(root, 'preview.m3u8');
    const firstSegmentPath = path.join(root, 'segment-0001.m4s');
    const secondSegmentPath = path.join(root, 'segment-0002.m4s');
    await writeFile(
      manifestPath,
      '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\nsegment-0001.m4s\nsegment-0002.m4s\n#EXT-X-ENDLIST\n',
    );
    await writeFile(firstSegmentPath, 'segment-one');
    await writeFile(secondSegmentPath, 'segment-two');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);

    const registration = await server.registerResourceSet(
      [
        {
          virtualPath: 'preview.m3u8',
          path: manifestPath,
          contentType: 'application/vnd.apple.mpegurl',
        },
        {
          virtualPath: 'segment-0001.m4s',
          path: firstSegmentPath,
          contentType: 'video/iso.segment',
        },
        {
          virtualPath: 'segment-0002.m4s',
          path: secondSegmentPath,
          contentType: 'video/iso.segment',
        },
      ],
      'preview.m3u8',
    );

    const manifest = await fetch(registration.entryUrl);
    expect(manifest.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(await manifest.text()).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(await (await fetch(new URL('segment-0002.m4s', registration.entryUrl))).text()).toBe(
      'segment-two',
    );
    expect((await fetch(new URL('segment-live.m4s', registration.entryUrl))).status).toBe(404);
    await expect(
      server.registerResourceSet(
        [
          {
            virtualPath: 'https://stream.example/live.m4s',
            path: firstSegmentPath,
            contentType: 'video/iso.segment',
          },
        ],
        'https://stream.example/live.m4s',
      ),
    ).rejects.toThrow('path must be relative');
  });
});

function createTestLogger(): {
  readonly logger: ILogger;
  readonly error: ReturnType<typeof vi.fn>;
} {
  const error = vi.fn<(message: string, errorOrData?: unknown) => void>();
  const logger: ILogger = {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error,
    child: () => logger,
    setLevel: vi.fn(),
  };
  return { logger, error };
}
