import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopOpenNekoProtocolHandler } from './desktop-openneko-protocol';

describe('Desktop OpenNeko protocol handler', () => {
  let rendererRoot: string | undefined;

  afterEach(async () => {
    if (rendererRoot) await rm(rendererRoot, { recursive: true, force: true });
    rendererRoot = undefined;
  });

  it('dispatches desktop assets and authorized resources through one handler', async () => {
    rendererRoot = await mkdtemp(path.join(tmpdir(), 'desktop-openneko-protocol-'));
    await writeFile(path.join(rendererRoot, 'index.html'), '<main>OpenNeko</main>');
    await writeFile(path.join(rendererRoot, 'pdf.worker.mjs'), 'export default true;');
    await mkdir(path.join(rendererRoot, 'assets'));
    await writeFile(path.join(rendererRoot, 'assets', 'codicon.ttf'), 'font-bytes');
    const handleResource = vi.fn(async () => new Response('resource-bytes'));
    const handle = createDesktopOpenNekoProtocolHandler(rendererRoot, {
      handle: handleResource,
    });

    const appResponse = await handle(new Request('openneko://desktop/index.html'));
    expect(appResponse.status).toBe(200);
    expect(await appResponse.text()).toBe('<main>OpenNeko</main>');
    expect(appResponse.headers.get('Content-Security-Policy')).toContain(
      'media-src openneko://resource',
    );
    const workerResponse = await handle(new Request('openneko://desktop/pdf.worker.mjs'));
    expect(workerResponse.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    const fontResponse = await handle(
      new Request('openneko://desktop/assets/codicon.ttf'),
    );
    expect(fontResponse.status).toBe(200);
    expect(fontResponse.headers.get('Content-Type')).toBe('font/ttf');

    const resourceRequest = new Request('openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(await (await handle(resourceRequest)).text()).toBe('resource-bytes');
    expect(handleResource).toHaveBeenCalledWith(resourceRequest);
  });

  it('rejects unknown hosts without delegating or resolving a filesystem path', async () => {
    rendererRoot = await mkdtemp(path.join(tmpdir(), 'desktop-openneko-protocol-'));
    const handleResource = vi.fn(async () => new Response('unexpected'));
    const handle = createDesktopOpenNekoProtocolHandler(rendererRoot, {
      handle: handleResource,
    });

    const response = await handle(new Request('openneko://media/private/video.mp4'));

    expect(response.status).toBe(404);
    expect(handleResource).not.toHaveBeenCalled();
  });

  it.each([
    'https://desktop.invalid/index.html',
    'openneko://desktop/index.html?unexpected=1',
    'openneko://desktop/assets/codicon.ttf?721d4c0a96379d0c13d3d5596893c348',
  ])('rejects non-canonical protocol URL %s', async (url) => {
    rendererRoot = await mkdtemp(path.join(tmpdir(), 'desktop-openneko-protocol-'));
    await writeFile(path.join(rendererRoot, 'index.html'), '<main>unexpected</main>');
    const handleResource = vi.fn(async () => new Response('unexpected'));
    const handle = createDesktopOpenNekoProtocolHandler(rendererRoot, {
      handle: handleResource,
    });

    expect((await handle(new Request(url))).status).toBe(404);
    expect(handleResource).not.toHaveBeenCalled();
  });
});
