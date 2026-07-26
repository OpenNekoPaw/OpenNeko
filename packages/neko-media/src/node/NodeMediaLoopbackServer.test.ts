import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeMediaLoopbackServer, createPcmPacketTransform } from './NodeMediaLoopbackServer';

describe('NodeMediaLoopbackServer', () => {
  const roots: string[] = [];
  const servers: NodeMediaLoopbackServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('serves opaque file URLs with byte ranges and private-network headers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cut-media-server-'));
    roots.push(root);
    const filePath = path.join(root, 'segment.mp4');
    await writeFile(filePath, '0123456789');
    const server = new NodeMediaLoopbackServer();
    servers.push(server);

    const registration = await server.registerFile(filePath, 'video/mp4');
    const response = await fetch(registration.url, { headers: { Range: 'bytes=2-5' } });

    expect(registration.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/v1\/cut-media\/file\/[0-9a-f-]+$/,
    );
    expect(registration.url).not.toContain(encodeURIComponent(filePath));
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
    expect(await response.text()).toBe('2345');
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
});
