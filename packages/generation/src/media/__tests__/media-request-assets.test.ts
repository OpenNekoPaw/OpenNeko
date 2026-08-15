import { describe, expect, it, vi } from 'vitest';
import { serializeContentReferenceTarget, type ContentLocator } from '@neko/content';
import {
  createContentReadMediaRequestAssetMaterializer,
  materializeImageRequestFileUris,
  materializeVideoRequestFileUris,
} from '../media-request-assets';

describe('media request asset materialization', () => {
  it('reads bounded bytes through ContentReadService and derives only transient data', async () => {
    const locator = workspaceLocator('references/source.png');
    const signal = new AbortController().signal;
    const read = vi.fn(async () => ({
      status: 'ready' as const,
      locator,
      bytes: new TextEncoder().encode('source'),
      offset: 0,
      totalByteLength: 6,
      mimeType: 'image/png',
      fingerprint: { strategy: 'sha256' as const, value: 'digest' },
    }));
    const materializer = createContentReadMediaRequestAssetMaterializer({
      contentRead: {
        read,
        stat: vi.fn(),
      },
      encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
      maxBytes: 1024,
    });

    await expect(materializer.readAsBase64(locator, signal)).resolves.toBe('c291cmNl');
    await expect(materializer.resolveAsUrl?.(locator, signal)).resolves.toBe(
      'data:image/png;base64,c291cmNl',
    );
    expect(read).toHaveBeenCalledWith(locator, { maxBytes: 1024, signal });
  });

  it('reports ContentReadService diagnostics without exposing a physical path', async () => {
    const locator = workspaceLocator('references/missing.png');
    const materializer = createContentReadMediaRequestAssetMaterializer({
      contentRead: {
        read: vi.fn(async () => ({
          status: 'unavailable' as const,
          locator,
          diagnostic: { code: 'content-missing' as const },
        })),
        stat: vi.fn(),
      },
      encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
    });

    await expect(materializer.readAsBase64(locator)).rejects.toThrow(
      'content-missing (workspace-file)',
    );
  });

  it('materializes image locators through the injected Host port', async () => {
    const referenceImageLocator = workspaceLocator('references/source.png');
    const maskLocator = workspaceLocator('masks/source-mask.png');
    const controlImageLocator = workspaceLocator('controls/source-pose.png');
    const readAsBase64 = vi.fn(async (locator: ContentLocator) => `base64:${locatorPath(locator)}`);

    const request = await materializeImageRequestFileUris(
      {
        prompt: 'edit image',
        referenceImageLocator,
        maskLocator,
        controlImageLocator,
      },
      { readAsBase64 },
    );

    expect(request).toEqual({
      prompt: 'edit image',
      referenceImageBase64: 'base64:references/source.png',
      maskBase64: 'base64:masks/source-mask.png',
      controlImageBase64: 'base64:controls/source-pose.png',
    });
    expect(readAsBase64).toHaveBeenNthCalledWith(1, referenceImageLocator);
    expect(readAsBase64).toHaveBeenNthCalledWith(2, maskLocator);
    expect(readAsBase64).toHaveBeenNthCalledWith(3, controlImageLocator);
  });

  it('materializes locator-backed IP-Adapter inputs without changing structured controls', async () => {
    const appearanceLocator = workspaceLocator('references/appearance.png');
    const cameraReference = {
      value: {
        cameraId: 'camera-front',
        position: { x: 0, y: 1.4, z: 4 },
        target: { x: 0, y: 1, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
      identity: { sessionId: 'session-camera', requestId: 'request-camera' },
    } as const;
    const readAsBase64 = vi.fn(async () => 'base64:appearance');

    const request = await materializeImageRequestFileUris(
      {
        prompt: 'role isolated references',
        ipAdapterRefs: [{ imageLocator: appearanceLocator, mode: 'subject' }],
        cameraReference,
      },
      { readAsBase64 },
    );

    expect(request.ipAdapterRefs).toEqual([{ imageBase64: 'base64:appearance', mode: 'subject' }]);
    expect(request.cameraReference).toBe(cameraReference);
    expect(readAsBase64).toHaveBeenCalledWith(appearanceLocator);
  });

  it('materializes video frame and reference-video locators through authorized ports', async () => {
    const startFrameLocator = workspaceLocator('frames/start.png');
    const endFrameLocator = workspaceLocator('frames/end.png');
    const referenceVideoLocator = workspaceLocator('videos/source.mp4');
    const readAsBase64 = vi.fn(async (locator: ContentLocator) => `base64:${locatorPath(locator)}`);
    const resolveAsUrl = vi.fn(
      async (locator: ContentLocator) => `authorized://${locatorPath(locator)}`,
    );

    const request = await materializeVideoRequestFileUris(
      {
        prompt: 'keyframe transform',
        startFrameLocator,
        endFrameLocator,
        referenceVideoLocator,
      },
      { readAsBase64, resolveAsUrl },
    );

    expect(request).toEqual({
      prompt: 'keyframe transform',
      startFrameImageBase64: 'base64:frames/start.png',
      endFrameImageBase64: 'base64:frames/end.png',
      sourceVideoUrl: 'authorized://videos/source.mp4',
    });
    expect(resolveAsUrl).toHaveBeenCalledWith(referenceVideoLocator);
  });

  it('materializes video reference images from locators', async () => {
    const imageLocator = workspaceLocator('references/character.png');
    const readAsBase64 = vi.fn(async () => 'base64:character');

    const request = await materializeVideoRequestFileUris(
      {
        prompt: 'preserve character',
        referenceImages: [{ imageLocator, strength: 0.7, mode: 'subject' }],
      },
      { readAsBase64 },
    );

    expect(request.referenceImages).toEqual([
      { imageBase64: 'base64:character', strength: 0.7, mode: 'subject' },
    ]);
    expect(readAsBase64).toHaveBeenCalledWith(imageLocator);
  });

  it('fails visibly when locator materialization has no Host content access', async () => {
    await expect(
      materializeImageRequestFileUris({
        prompt: 'edit image',
        referenceImageLocator: workspaceLocator('references/source.png'),
      }),
    ).rejects.toThrow('requires host content access');
  });

  it('fails visibly when reference-video URL projection is unavailable', async () => {
    await expect(
      materializeVideoRequestFileUris(
        {
          prompt: 'transform source video',
          referenceVideoLocator: workspaceLocator('videos/source.mp4'),
        },
        { readAsBase64: vi.fn() },
      ),
    ).rejects.toThrow('requires authorized URL materialization');
  });
});

function workspaceLocator(path: string): ContentLocator {
  return { kind: 'workspace-file', path };
}

function locatorPath(locator: ContentLocator): string {
  if (locator.kind === 'package-resource') return locator.resourcePath;
  if (locator.kind === 'document-entry') return serializeContentReferenceTarget(locator.source);
  if (locator.kind === 'media-library') return locator.relativePath;
  return locator.path;
}
