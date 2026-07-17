import type { ContentAccessRequest } from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';
import { createEngineContentAccessAdapter, readEnginePurpose } from '../engine-file-access';
import type { EngineClient } from '../EngineClient';

function request(enginePurpose?: string): ContentAccessRequest {
  return {
    ref: { kind: 'file', path: '/media/clip.mp4' },
    intent: 'edit-playback',
    target: 'engine-source',
    metadata: enginePurpose ? { enginePurpose } : undefined,
  };
}

describe('media engine file access', () => {
  it('accepts only retained media purposes', () => {
    expect(readEnginePurpose(request('media-decode'))).toBe('media-decode');
    expect(readEnginePurpose(request('subtitle'))).toBe('subtitle');
    expect(readEnginePurpose(request('document'))).toBe('other');
  });

  it('reads bounded media bytes through a scoped token', async () => {
    const unregisterFile = vi.fn(async (_token: string) => undefined);
    const registerFile = vi.fn(async (_input: unknown) => ({
      token: 'media-token',
      fileSizeBytes: 3,
      mimeType: 'video/mp4',
      purpose: 'media-decode',
      rangeUrl: '/v1/files/media-token',
    }));
    const engine = {
      registerFile,
      readFileRange: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      unregisterFile,
      async withRegisteredFile(
        input: unknown,
        task: (registered: Awaited<ReturnType<typeof registerFile>>) => Promise<unknown>,
      ) {
        const registered = await registerFile(input);
        try {
          return await task(registered);
        } finally {
          await unregisterFile(registered.token);
        }
      },
    } as unknown as EngineClient;
    const adapter = createEngineContentAccessAdapter({
      engineClientProvider: { getOptionalClient: async () => engine },
    });

    await expect(
      adapter.readProviderAssetBytes({
        request: request('media-decode'),
        filePath: '/media/clip.mp4',
      }),
    ).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]), sizeBytes: 3, mimeType: undefined });
    expect(unregisterFile).toHaveBeenCalledWith('media-token');
  });
});
