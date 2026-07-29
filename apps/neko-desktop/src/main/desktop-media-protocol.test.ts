import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopMediaDescriptorRegistry,
  createDesktopMediaProtocolResponse,
  fetchDesktopUpstreamMedia,
  parseDesktopMediaRange,
} from './desktop-media-protocol';

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Desktop media protocol', () => {
  it('binds descriptors to one WebContents and releases them with the View session', () => {
    const registry = new DesktopMediaDescriptorRegistry();
    const descriptorId = registry.register({
      descriptorId: 'media:test',
      webContentsId: 10,
      windowId: 'window-1',
      viewId: 'view-1',
      sessionId: 'session-1',
      revision: 'revision-1',
      absolutePath: '/fixture/video.mp4',
      mediaType: 'video/mp4',
    });

    expect(registry.authorize(10, descriptorId)).toBe(true);
    expect(registry.authorize(11, descriptorId)).toBe(false);
    registry.releaseSession('session-1');
    expect(registry.authorize(10, descriptorId)).toBe(false);
    expect(() => registry.resolve(descriptorId)).toThrow('unavailable');
  });

  it('returns GET, HEAD, closed Range, open Range and EOF responses', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-media-protocol-'));
    roots.push(root);
    const filePath = path.join(root, 'sample.bin');
    await writeFile(filePath, Buffer.from('0123456789'));
    const registry = new DesktopMediaDescriptorRegistry();
    registry.register({
      descriptorId: 'media:test',
      webContentsId: 10,
      windowId: 'window-1',
      viewId: 'view-1',
      sessionId: 'session-1',
      revision: 'revision-1',
      absolutePath: filePath,
      mediaType: 'application/octet-stream',
    });
    const url = 'neko-media://desktop/media%3Atest/sample.bin';

    const full = await createDesktopMediaProtocolResponse(registry, new Request(url));
    expect(full.status).toBe(200);
    expect(full.headers.get('access-control-allow-origin')).toBe('neko-app://desktop');
    expect(await full.text()).toBe('0123456789');

    const head = await createDesktopMediaProtocolResponse(
      registry,
      new Request(url, { method: 'HEAD' }),
    );
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');

    const closed = await createDesktopMediaProtocolResponse(
      registry,
      new Request(url, { headers: { Range: 'bytes=2-5' } }),
    );
    expect(closed.status).toBe(206);
    expect(closed.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await closed.text()).toBe('2345');

    const open = await createDesktopMediaProtocolResponse(
      registry,
      new Request(url, { headers: { Range: 'bytes=8-' } }),
    );
    expect(open.status).toBe(206);
    expect(await open.text()).toBe('89');

    const eof = await createDesktopMediaProtocolResponse(
      registry,
      new Request(url, { headers: { Range: 'bytes=10-' } }),
    );
    expect(eof.status).toBe(416);
    expect(eof.headers.get('content-range')).toBe('bytes */10');
  });

  it('rejects malformed and multi-range requests', () => {
    expect(parseDesktopMediaRange('bytes=5-4', 10)).toBe('unsatisfiable');
    expect(parseDesktopMediaRange('bytes=0-1,4-5', 10)).toBe('unsatisfiable');
  });

  it('proxies owner-bound loopback media without exposing the upstream URL', async () => {
    const registry = new DesktopMediaDescriptorRegistry();
    registry.registerUpstream({
      descriptorId: 'media:cut-preview',
      webContentsId: 10,
      windowId: 'window-1',
      viewId: 'cut-view-1',
      sessionId: 'cut-session-1',
      revision: 'preview-1',
      upstreamUrl: 'http://127.0.0.1:4123/v1/cut-media/file/video-1',
      mediaType: 'video/mp4',
    });
    const fetchUpstream = vi.fn(async (request: Request) => {
      expect(request.url).toBe('http://127.0.0.1:4123/v1/cut-media/file/video-1');
      expect(request.headers.get('range')).toBe('bytes=3-');
      return new Response('preview', {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': 'bytes 3-9/10',
        },
      });
    });

    const response = await createDesktopMediaProtocolResponse(
      registry,
      new Request('neko-media://desktop/media%3Acut-preview/preview.mp4', {
        headers: { Range: 'bytes=3-' },
      }),
      fetchUpstream,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('access-control-allow-origin')).toBe('neko-app://desktop');
    expect(await response.text()).toBe('preview');
    expect(fetchUpstream).toHaveBeenCalledOnce();
  });

  it('uses the Main-process Fetch implementation for the internal loopback stream', async () => {
    const fetchImplementation = vi.fn(async () => new Response('preview'));
    vi.stubGlobal('fetch', fetchImplementation);
    const request = new Request('http://127.0.0.1:4123/v1/cut-media/file/video-1');

    const response = await fetchDesktopUpstreamMedia(request);

    expect(await response.text()).toBe('preview');
    expect(fetchImplementation).toHaveBeenCalledWith(request, { redirect: 'error' });
  });

  it('rejects non-loopback upstream registrations', () => {
    const registry = new DesktopMediaDescriptorRegistry();
    expect(() =>
      registry.registerUpstream({
        webContentsId: 10,
        windowId: 'window-1',
        viewId: 'cut-view-1',
        sessionId: 'cut-session-1',
        revision: 'preview-1',
        upstreamUrl: 'https://example.com/video.mp4',
        mediaType: 'video/mp4',
      }),
    ).toThrow('loopback HTTP');
  });
});
