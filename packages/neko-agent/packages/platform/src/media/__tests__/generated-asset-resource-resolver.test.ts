import { describe, expect, it, vi } from 'vitest';
import {
  createGeneratedAssetRevisionRef,
  createResourceFingerprint,
  createResourceRef,
  type GeneratedImage,
} from '@neko/shared';
import { createGeneratedAssetResourceResolver } from '../generated-asset-resource-resolver';

describe('createGeneratedAssetResourceResolver', () => {
  it('resolves a pathless lifecycle ref through generated-output metadata', async () => {
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    });
    const generatedOutput: GeneratedImage = {
      type: 'generated-image',
      id: 'generated-1',
      path: '/workspace/neko/generated/image/generated-1.png',
      lifecycle,
      mimeType: 'image/png',
      generatedAt: '2026-07-14T00:00:00.000Z',
      width: 1024,
      height: 768,
      ratio: '4:3',
    };
    const get = vi.fn(() => generatedOutput);
    const resolve = createGeneratedAssetResourceResolver({ get });

    expect(lifecycle.resourceRef.source).not.toHaveProperty('filePath');
    await expect(resolve(lifecycle.resourceRef)).resolves.toEqual({
      path: generatedOutput.path,
      mimeType: 'image/png',
      width: 1024,
      height: 768,
    });
    expect(get).toHaveBeenCalledWith('generated-1');
  });

  it('does not route non-generated resources or missing generated outputs', async () => {
    const get = vi.fn(() => undefined);
    const resolve = createGeneratedAssetResourceResolver({ get });
    const fileRef = createResourceRef({
      scope: 'project',
      provider: 'source-file',
      kind: 'file',
      source: { kind: 'file', filePath: 'images/source.png' },
      locator: { kind: 'file', path: 'images/source.png' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'source-v1' }),
    });

    await expect(resolve(fileRef)).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();

    const generatedRef = createGeneratedAssetRevisionRef({
      assetId: 'missing',
      contentDigest: 'sha256:missing',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-missing' },
    }).resourceRef;
    await expect(resolve(generatedRef)).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith('missing');
  });
});
