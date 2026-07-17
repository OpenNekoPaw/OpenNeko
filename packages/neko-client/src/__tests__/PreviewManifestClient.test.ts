import { describe, expect, it, vi } from 'vitest';
import { EngineClient, type PreviewManifest } from '../index';

function createDispatchResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function body(data: unknown): unknown {
  return { id: 'req-1', status: 'ok', data };
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) {
    throw new Error('fetch was not called');
  }
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient preview manifest surface', () => {
  it('registers preview assets through previews dispatch', async () => {
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId: 'asset-1',
      token: 'token-1',
      kind: 'image',
      status: 'ready',
      sourceName: 'pano.jpg',
      sourceUrl: 'http://127.0.0.1:3456/v1/preview/file/token-1',
      projection: { type: 'equirectangular', confidence: 'explicit', source: 'metadata' },
      media: {
        dimensions: { width: 4096, height: 2048 },
        fileSizeBytes: 42,
        mimeType: 'image/jpeg',
        dynamicRange: 'sdr',
      },
      variants: [],
      createdAt: '2026-05-07T00:00:00.000Z',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createDispatchResponse(body(manifest)));
    const client = new EngineClient(3456);

    await expect(
      client.registerPreviewAsset({
        source: '${PROJECT}/assets/pano.jpg',
        kind: 'image',
        expectedProjection: 'equirectangular',
      }),
    ).resolves.toEqual(manifest);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/dispatch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'previews',
        action: 'register-asset',
        options: {
          source: '${PROJECT}/assets/pano.jpg',
          kind: 'image',
          expectedProjection: 'equirectangular',
        },
      }),
    );

    fetchMock.mockRestore();
  });

  it('requests manifest-linked variants and builds token URLs', async () => {
    const variant = {
      id: 'crop-1',
      assetId: 'asset-1',
      role: 'fov-crop',
      url: 'http://127.0.0.1:3456/v1/preview/file/crop-token',
      mimeType: 'image/jpeg',
    } as const;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createDispatchResponse(body(variant)));
    const client = new EngineClient(3456);

    await expect(
      client.requestPreviewVariant('asset-1', {
        role: 'fov-crop',
        viewState: {
          mode: 'sphere',
          yawDeg: 30,
          pitchDeg: 5,
          rollDeg: 0,
          fovDeg: 80,
          exposure: 0,
          toneMapping: 'aces',
        },
        width: 512,
        height: 512,
      }),
    ).resolves.toEqual(variant);
    expect(client.getPreviewTokenUrl('token-1')).toBe(
      'http://127.0.0.1:3456/v1/preview/file/token-1',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/dispatch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'previews',
        action: 'request-variant',
        id: 'asset-1',
        options: expect.objectContaining({ role: 'fov-crop', width: 512, height: 512 }),
      }),
    );

    fetchMock.mockRestore();
  });

  it('unregisters preview assets best-effort', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const client = new EngineClient(3456);

    await expect(client.unregisterPreviewAsset('asset-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/dispatch',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockRestore();
  });

  it('throws dispatch errors for failed preview register and variant requests', async () => {
    const registerMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createDispatchResponse({
        id: 'req-1',
        status: 'error',
        error: { message: 'missing preview source' },
      }),
    );
    const client = new EngineClient(3456);

    await expect(
      client.registerPreviewAsset({ source: '/missing.jpg', kind: 'image' }),
    ).rejects.toThrow('missing preview source');
    registerMock.mockRestore();

    const variantMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createDispatchResponse({
        id: 'req-2',
        status: 'error',
        error: { message: 'asset not found' },
      }),
    );
    await expect(
      client.requestPreviewVariant('asset-1', { role: 'thumbnail', width: 320, height: 180 }),
    ).rejects.toThrow('asset not found');
    variantMock.mockRestore();
  });

  it('persists preview asset metadata through previews dispatch', async () => {
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId: 'asset-1',
      token: 'token-1',
      kind: 'image',
      status: 'ready',
      sourceName: 'pano.jpg',
      sourceUrl: '/v1/preview/file/token-1',
      projection: { type: 'flat', confidence: 'manual', source: 'manual' },
      media: {
        dimensions: { width: 1000, height: 500 },
        fileSizeBytes: 42,
        mimeType: 'image/jpeg',
        dynamicRange: 'sdr',
      },
      variants: [],
      createdAt: '2026-05-07T00:00:00.000Z',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createDispatchResponse(body(manifest)));
    const client = new EngineClient(3456);

    await expect(
      client.updatePreviewAssetMetadata('asset-1', { projectionType: 'flat' }),
    ).resolves.toEqual(manifest);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/dispatch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'previews',
        action: 'update-metadata',
        id: 'asset-1',
        options: { projectionType: 'flat' },
      }),
    );

    fetchMock.mockRestore();
  });
});
