import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceRef } from '@neko/shared';
import {
  materializeImageRequestFileUris,
  materializeVideoRequestFileUris,
} from '../media-request-assets';

describe('media request asset materialization', () => {
  it('materializes reference image and mask file URIs through the host adapter', async () => {
    const materializer = createMaterializer({
      '/tmp/reference.png': 'reference',
      '/tmp/mask.png': 'mask',
      '/tmp/control.png': 'control',
    });

    const request = await materializeImageRequestFileUris(
      {
        prompt: 'edit image',
        referenceImageUri: pathToFileURL('/tmp/reference.png').toString(),
        maskUri: pathToFileURL('/tmp/mask.png').toString(),
        controlImageUri: pathToFileURL('/tmp/control.png').toString(),
      },
      materializer,
    );

    expect(request.referenceImageBase64).toBe(Buffer.from('reference').toString('base64'));
    expect(request.maskBase64).toBe(Buffer.from('mask').toString('base64'));
    expect(request.controlImageBase64).toBe(Buffer.from('control').toString('base64'));
    expect(materializer.calls).toEqual(['/tmp/reference.png', '/tmp/mask.png', '/tmp/control.png']);
  });

  it('does not overwrite explicit base64 values', async () => {
    const request = await materializeImageRequestFileUris({
      prompt: 'edit image',
      referenceImageUri: '/tmp/does-not-need-to-exist.png',
      referenceImageBase64: 'already-base64',
    });

    expect(request.referenceImageBase64).toBe('already-base64');
  });

  it('does not overwrite explicit control image base64 values', async () => {
    const request = await materializeImageRequestFileUris({
      prompt: 'control image',
      controlImageUri: '/tmp/does-not-need-to-exist.png',
      controlImageBase64: 'already-control-base64',
    });

    expect(request.controlImageBase64).toBe('already-control-base64');
  });

  it('materializes video reference image file URIs through the host adapter', async () => {
    const materializer = createMaterializer({
      '/tmp/video-reference.png': 'video-reference',
    });

    const request = await materializeVideoRequestFileUris(
      {
        prompt: 'animate image',
        referenceImageUri: pathToFileURL('/tmp/video-reference.png').toString(),
      },
      materializer,
    );

    expect(request.referenceImageBase64).toBe(Buffer.from('video-reference').toString('base64'));
    expect(materializer.calls).toEqual(['/tmp/video-reference.png']);
  });

  it('does not overwrite explicit video reference image base64 values', async () => {
    const request = await materializeVideoRequestFileUris({
      prompt: 'animate image',
      referenceImageUri: '/tmp/does-not-need-to-exist.png',
      referenceImageBase64: 'already-video-base64',
    });

    expect(request.referenceImageBase64).toBe('already-video-base64');
  });

  it('materializes stable first/end frames and reference video through authorized ports', async () => {
    const startFrameRef = createResourceRef('asset:image:start');
    const endFrameRef = createResourceRef('asset:image:end');
    const referenceVideoRef = createResourceRef('asset:video:source');
    const readResourceAsBase64 = vi.fn(async (ref: ResourceRef) => `base64:${ref.id}`);
    const resolveResourceUrl = vi.fn(async (ref: ResourceRef) => `authorized://${ref.id}`);

    const request = await materializeVideoRequestFileUris(
      {
        prompt: 'keyframe transform',
        startFrameRef,
        endFrameRef,
        referenceVideoRef,
      },
      {
        readAsBase64: vi.fn(),
        readResourceAsBase64,
        resolveResourceUrl,
      },
    );

    expect(request.startFrameImageBase64).toBe('base64:asset:image:start');
    expect(request.endFrameImageBase64).toBe('base64:asset:image:end');
    expect(request.sourceVideoUrl).toBe('authorized://asset:video:source');
  });

  it('materializes stable 3D control and appearance refs without changing structured controls', async () => {
    const controlImageRef = createResourceRef('preview:pose:1');
    const appearanceRef = createResourceRef('preview:appearance:1');
    const panoramaRef = createResourceRef('preview:panorama:1');
    const readResourceAsBase64 = vi.fn(async (ref: ResourceRef) => `base64:${ref.id}`);
    const cameraReference = {
      value: {
        cameraId: 'camera-front',
        position: { x: 0, y: 1.4, z: 4 },
        target: { x: 0, y: 1, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
      identity: { sessionId: 'session-camera', revision: 2 },
    } as const;
    const panoramaReference = {
      imageRef: panoramaRef,
      orientation: { yawDeg: 10, pitchDeg: -5, fieldOfViewDeg: 70 },
      identity: { sessionId: 'session-panorama', revision: 3 },
    } as const;

    const request = await materializeImageRequestFileUris(
      {
        prompt: 'role isolated references',
        controlImageRef,
        controlMode: 'pose',
        ipAdapterRefs: [{ imageRef: appearanceRef, mode: 'subject' }],
        cameraReference,
        panoramaReference,
      },
      { readAsBase64: vi.fn(), readResourceAsBase64 },
    );

    expect(request.controlImageBase64).toBe('base64:preview:pose:1');
    expect(request.ipAdapterRefs).toEqual([
      { imageBase64: 'base64:preview:appearance:1', mode: 'subject' },
    ]);
    expect(request.cameraReference).toBe(cameraReference);
    expect(request.panoramaReference).toBe(panoramaReference);
    expect(readResourceAsBase64).toHaveBeenCalledTimes(2);
  });

  it('rejects mixed stable and materialized image control identities', async () => {
    await expect(
      materializeImageRequestFileUris({
        prompt: 'ambiguous control',
        controlImageRef: createResourceRef('preview:pose:1'),
        controlImageBase64: 'legacy-control',
      }),
    ).rejects.toThrow('Stable controlImageRef cannot be combined');
    await expect(
      materializeImageRequestFileUris({
        prompt: 'ambiguous appearance',
        ipAdapterRefs: [
          {
            imageRef: createResourceRef('preview:appearance:1'),
            imageBase64: 'legacy-appearance',
          },
        ],
      }),
    ).rejects.toThrow('Stable IP-Adapter imageRef cannot be combined');
  });

  it('rejects ambiguous stable and legacy video identities', async () => {
    await expect(
      materializeVideoRequestFileUris({
        prompt: 'ambiguous keyframe',
        startFrameRef: createResourceRef('asset:image:start'),
        referenceImageUrl: 'https://example.invalid/start.png',
      }),
    ).rejects.toThrow('Stable startFrameRef cannot be combined');
    await expect(
      materializeVideoRequestFileUris({
        prompt: 'ambiguous reference video',
        referenceVideoRef: createResourceRef('asset:video:source'),
        sourceVideoUrl: 'https://example.invalid/source.mp4',
      }),
    ).rejects.toThrow('Stable referenceVideoRef cannot be combined');
  });

  it('fails visibly when stable ResourceRef materialization is unavailable', async () => {
    await expect(
      materializeVideoRequestFileUris(
        {
          prompt: 'keyframes',
          startFrameRef: createResourceRef('asset:image:start'),
        },
        { readAsBase64: vi.fn() },
      ),
    ).rejects.toThrow('requires authorized host materialization');
  });

  it('fails visibly when file URI materialization has no host adapter', async () => {
    await expect(
      materializeImageRequestFileUris({
        prompt: 'edit image',
        referenceImageUri: pathToFileURL('/tmp/reference.png').toString(),
      }),
    ).rejects.toThrow('requires host content access materialization');
  });
});

function createMaterializer(files: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    async readAsBase64(filePath: string): Promise<string> {
      calls.push(filePath);
      const value = files[filePath];
      if (value === undefined) throw new Error(`unexpected file: ${filePath}`);
      return Buffer.from(value).toString('base64');
    },
  };
}

function createResourceRef(id: string): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `assets/${id.replaceAll(':', '-')}` },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}
