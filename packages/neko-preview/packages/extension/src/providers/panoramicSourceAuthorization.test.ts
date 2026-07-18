import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '@neko/shared';
import {
  PanoramicSourceAuthorizationError,
  authorizePanoramicImageSource,
  requirePanoramicImageSourceFormat,
} from './panoramicSourceAuthorization';

describe('panoramic source authorization', () => {
  it('rejects unsupported image formats before registration', () => {
    expect(() => requirePanoramicImageSourceFormat('/project/scene.txt')).toThrow(
      PanoramicSourceAuthorizationError,
    );
  });

  it('returns stable source identity separately from the authorized Webview URI', async () => {
    const authorization = {
      isAuthorizedPath: vi.fn(async () => true),
      toWebviewUri: vi.fn(async (_webview, source: string) => ({
        ok: true as const,
        kind: 'local' as const,
        source,
        uri: 'webview:/project/scene_360.png',
      })),
    };
    const result = await authorizePanoramicImageSource({
      sourcePath: '/project/scene_360.png',
      webview: {} as never,
      authorization: authorization as never,
      authorizedRoots: ['/project'],
      workspaceRoot: '/project',
      pathResolver: new PathResolver(),
      fileSystem: {
        stat: async () => ({ size: 1024, mtimeMs: 1234, isFile: true }),
        readHeader: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    });
    expect(result).toMatchObject({
      fingerprint: expect.any(String),
      mediaType: 'image/png',
      sizeBytes: 1024,
      webviewUri: 'webview:/project/scene_360.png',
      sourceRef: {
        source: { projectRelativePath: 'scene_360.png' },
      },
    });
    expect(JSON.stringify(result.sourceRef)).not.toContain('webview:');
  });

  it('fails visibly when the local source is not authorized', async () => {
    await expect(
      authorizePanoramicImageSource({
        sourcePath: '/private/scene.png',
        webview: {} as never,
        authorization: {
          isAuthorizedPath: vi.fn(async () => false),
          toWebviewUri: vi.fn(),
        } as never,
        authorizedRoots: ['/project'],
        fileSystem: {
          stat: vi.fn(),
          readHeader: vi.fn(),
        },
      }),
    ).rejects.toMatchObject({ code: 'source-unauthorized' });
  });
});
