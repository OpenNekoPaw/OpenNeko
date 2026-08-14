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
      locator: { kind: 'workspace-file', path: 'media/video.webm' },
      displayName: 'video.webm',
      owner: { surface: 'canvas' },
    });
    const image = await service.project({
      descriptorId: 'preview-image',
      locator: {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'book.epub' },
        entryPath: 'images/page.jpg',
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
        contentLocator: { kind: 'document-entry', entryPath: 'images/page.jpg' },
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
        locator: { kind: 'workspace-file', path: 'private/image.png' },
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
        locator: { kind: 'workspace-file', path: 'image.png' },
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
      locator: { kind: 'workspace-file' as const, path: 'audio.mp3' },
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
      locator: { kind: 'workspace-file' as const, path: 'video.webm' },
      displayName: 'video.webm',
      owner: { surface: 'canvas' },
    };

    expect((await service.project(input)).status).toBe('ready');
    expect((await service.project(input)).status).toBe('unavailable');
    expect(release).toHaveBeenCalledOnce();
  });
});
