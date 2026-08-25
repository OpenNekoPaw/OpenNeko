import { describe, expect, it, vi } from 'vitest';
import { createPreviewResourceProjectionService } from './resource-projection.js';

describe('Preview resource projection service', () => {
  it('projects seekable files and authorized bytes through the same descriptor path', async () => {
    const registerSource = vi.fn(async ({ source }) => ({
      status: 'ready' as const,
      lease: {
        url: `openneko://resource/${source.kind === 'file' ? 'f'.repeat(32) : 'b'.repeat(32)}`,
        release: vi.fn(),
      },
    }));
    const service = createPreviewResourceProjectionService({
      resolveSource: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ready',
          source: {
            kind: 'file',
            absolutePath: '/authorized/video.webm',
            mediaType: 'video/webm',
            sourceFingerprint: 'stat:1:200',
            byteLength: 200,
          },
        })
        .mockResolvedValueOnce({
          status: 'ready',
          source: {
            kind: 'bytes',
            bytes: new Uint8Array([1, 2, 3]),
            mediaType: 'image/jpeg',
            sourceFingerprint: 'sha256:image',
            byteLength: 3,
          },
        }),
      registerSource,
    });

    const video = await service.project({
      descriptorId: 'preview-video',
      source: { file: { authority: 'workspace', path: 'media/video.webm' } },
      displayName: 'video.webm',
      owner: { surface: 'canvas' },
    });
    const image = await service.project({
      descriptorId: 'preview-image',
      source: {
        file: { authority: 'workspace', path: 'book.epub' },
        selector: { kind: 'entry', path: 'images/page.jpg' },
      },
      displayName: 'page.jpg',
      owner: { surface: 'agent' },
    });

    expect(video).toMatchObject({
      status: 'ready',
      descriptor: { contentKind: 'video', mediaType: 'video/webm' },
    });
    expect(image).toMatchObject({
      status: 'ready',
      descriptor: {
        contentKind: 'image',
        contentLocator: { selector: { kind: 'entry', path: 'images/page.jpg' } },
      },
    });
    expect(registerSource.mock.calls.map(([input]) => input.source.kind)).toEqual([
      'file',
      'bytes',
    ]);
    service.dispose();
  });

  it('returns a typed local diagnostic without registering another source', async () => {
    const registerSource = vi.fn();
    const service = createPreviewResourceProjectionService({
      resolveSource: vi.fn(async () => ({
        status: 'unavailable' as const,
        diagnostic: { code: 'content-unauthorized', message: 'Content is not authorized.' },
      })),
      registerSource,
    });

    await expect(
      service.project({
        descriptorId: 'preview-denied',
        source: { file: { authority: 'workspace', path: 'private/image.png' } },
        displayName: 'image.png',
        owner: { surface: 'agent' },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized', message: 'Content is not authorized.' },
    });
    expect(registerSource).not.toHaveBeenCalled();
    service.dispose();
  });

  it('passes an opaque representation handle to the resolver without persisting it', async () => {
    const resolveSource = vi.fn(async () => ({
      status: 'ready' as const,
      source: {
        kind: 'bytes' as const,
        bytes: new Uint8Array([1]),
        mediaType: 'image/png',
        sourceFingerprint: 'sha256:preview',
        byteLength: 1,
      },
    }));
    const service = createPreviewResourceProjectionService({
      resolveSource,
      registerSource: vi.fn(async () => ({
        status: 'ready' as const,
        lease: { url: `openneko://resource/${'h'.repeat(32)}`, release: vi.fn() },
      })),
    });
    const source = { file: { authority: 'workspace' as const, path: 'document.pdf' } };
    const representationHandle = {
      kind: 'content-representation-handle' as const,
      id: 'page-1',
    };

    const result = await service.project({
      descriptorId: 'preview-page',
      source,
      representationHandle,
      displayName: 'page.png',
      owner: { surface: 'agent' },
    });

    expect(resolveSource).toHaveBeenCalledWith(
      expect.objectContaining({ source, representationHandle }),
    );
    expect(result).toMatchObject({
      status: 'ready',
      descriptor: { contentLocator: source },
    });
    expect(JSON.stringify(result)).not.toContain('content-representation-handle');
    service.dispose();
  });

  it('releases the exact lease when descriptor validation rejects the projection', async () => {
    const release = vi.fn();
    const service = createPreviewResourceProjectionService({
      resolveSource: vi.fn(async () => ({
        status: 'ready' as const,
        source: {
          kind: 'bytes' as const,
          bytes: new Uint8Array([1]),
          mediaType: 'image/png',
          sourceFingerprint: 'sha256:image',
          byteLength: 1,
        },
      })),
      registerSource: vi.fn(async () => ({
        status: 'ready' as const,
        lease: { url: `openneko://resource/${'i'.repeat(32)}`, release },
      })),
    });

    await expect(
      service.project({
        descriptorId: 'invalid\\descriptor',
        source: { file: { authority: 'workspace', path: 'image.png' } },
        displayName: 'image.png',
        owner: { surface: 'agent' },
      }),
    ).rejects.toThrow('Preview descriptor identity is required.');
    expect(release).toHaveBeenCalledOnce();
    service.dispose();
  });

  it('reuses one exact descriptor lease and releases it through the service lifecycle', async () => {
    const release = vi.fn();
    const registerSource = vi.fn(async () => ({
      status: 'ready' as const,
      lease: { url: `openneko://resource/${'r'.repeat(32)}`, release },
    }));
    const service = createPreviewResourceProjectionService({
      resolveSource: vi.fn(async () => ({
        status: 'ready' as const,
        source: {
          kind: 'file' as const,
          absolutePath: '/authorized/audio.mp3',
          mediaType: 'audio/mpeg',
          sourceFingerprint: 'stat:1:100',
          byteLength: 100,
        },
      })),
      registerSource,
    });
    const input = {
      descriptorId: 'preview-audio',
      source: { file: { authority: 'workspace' as const, path: 'audio.mp3' } },
      displayName: 'audio.mp3',
      owner: { surface: 'asset-center' },
    };

    const first = await service.project(input);
    const second = await service.project(input);

    expect(second).toEqual(first);
    expect(registerSource).toHaveBeenCalledOnce();
    service.release('preview-audio');
    expect(release).toHaveBeenCalledOnce();
    service.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases a stale lease when the canonical locator can no longer be resolved', async () => {
    const release = vi.fn();
    const resolveSource = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ready',
        source: {
          kind: 'file',
          absolutePath: '/authorized/video.webm',
          mediaType: 'video/webm',
          sourceFingerprint: 'stat:1:200',
          byteLength: 200,
        },
      })
      .mockResolvedValueOnce({
        status: 'unavailable',
        diagnostic: { code: 'source-missing', message: 'Source is missing.' },
      });
    const service = createPreviewResourceProjectionService({
      resolveSource,
      registerSource: vi.fn(async () => ({
        status: 'ready' as const,
        lease: { url: `openneko://resource/${'s'.repeat(32)}`, release },
      })),
    });
    const input = {
      descriptorId: 'preview-video',
      source: { file: { authority: 'workspace' as const, path: 'video.webm' } },
      displayName: 'video.webm',
      owner: { surface: 'canvas' },
    };

    expect((await service.project(input)).status).toBe('ready');
    expect((await service.project(input)).status).toBe('unavailable');
    expect(release).toHaveBeenCalledOnce();
  });

  it('serializes concurrent projection requests for one descriptor without leaking a lease', async () => {
    const release = vi.fn();
    let completeRegistration!: () => void;
    const registrationGate = new Promise<void>((resolve) => {
      completeRegistration = resolve;
    });
    const registerSource = vi.fn(async () => {
      await registrationGate;
      return {
        status: 'ready' as const,
        lease: { url: `openneko://resource/${'t'.repeat(32)}`, release },
      };
    });
    const service = createPreviewResourceProjectionService({
      resolveSource: vi.fn(async () => ({
        status: 'ready' as const,
        source: {
          kind: 'file' as const,
          absolutePath: '/authorized/video.webm',
          mediaType: 'video/webm',
          sourceFingerprint: 'stat:2:200',
          byteLength: 200,
        },
      })),
      registerSource,
    });
    const input = {
      descriptorId: 'preview-concurrent',
      source: { file: { authority: 'workspace' as const, path: 'video.webm' } },
      displayName: 'video.webm',
      owner: { surface: 'canvas' },
    };

    const first = service.project(input);
    const second = service.project(input);
    completeRegistration();

    expect((await first).status).toBe('ready');
    expect((await second).status).toBe('ready');
    expect(registerSource).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
    service.release(input.descriptorId);
    expect(release).toHaveBeenCalledOnce();
  });

  it('fences a registration that completes after its descriptor was released', async () => {
    const release = vi.fn();
    let completeRegistration!: () => void;
    const registrationGate = new Promise<void>((resolve) => {
      completeRegistration = resolve;
    });
    let registrationStarted!: () => void;
    const registrationStart = new Promise<void>((resolve) => {
      registrationStarted = resolve;
    });
    const service = createPreviewResourceProjectionService({
      resolveSource: vi.fn(async () => ({
        status: 'ready' as const,
        source: {
          kind: 'file' as const,
          absolutePath: '/authorized/audio.mp3',
          mediaType: 'audio/mpeg',
          sourceFingerprint: 'stat:3:300',
          byteLength: 300,
        },
      })),
      registerSource: vi.fn(async () => {
        registrationStarted();
        await registrationGate;
        return {
          status: 'ready' as const,
          lease: { url: `openneko://resource/${'u'.repeat(32)}`, release },
        };
      }),
    });
    const descriptorId = 'preview-release-race';
    const pending = service.project({
      descriptorId,
      source: { file: { authority: 'workspace', path: 'audio.mp3' } },
      displayName: 'audio.mp3',
      owner: { surface: 'agent' },
    });

    await registrationStart;
    service.release(descriptorId);
    completeRegistration();

    await expect(pending).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'preview-projection-released' },
    });
    expect(release).toHaveBeenCalledOnce();
  });
});
