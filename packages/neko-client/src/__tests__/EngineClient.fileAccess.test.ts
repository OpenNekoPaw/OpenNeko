import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '@neko/shared';
import { EngineClient, type RegisteredFile } from '../index';

function dispatchResponse(data: unknown): Response {
  return new Response(JSON.stringify({ id: 'req-1', status: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient file access helpers', () => {
  it('registers and unregisters files through files dispatch', async () => {
    const registered: RegisteredFile = {
      token: 'token-1',
      fileSizeBytes: 42,
      mimeType: 'video/mp4',
      purpose: 'media-decode',
      rangeUrl: '/v1/files/token-1',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }));
    const client = new EngineClient(3456);

    await expect(
      client.registerFile({ filePath: '/project/movie.mp4', purpose: 'media-decode' }),
    ).resolves.toEqual(registered);
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'files',
        action: 'register',
        options: { filePath: '/project/movie.mp4', purpose: 'media-decode' },
      }),
    );

    await expect(client.unregisterFile('token-1')).resolves.toBeUndefined();
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'files',
        action: 'unregister',
        id: 'token-1',
      }),
    );

    fetchMock.mockRestore();
  });

  it('cleans scoped registrations on success and failure', async () => {
    const registered: RegisteredFile = {
      token: 'token-2',
      fileSizeBytes: 7,
      mimeType: 'application/octet-stream',
      purpose: 'subtitle',
      rangeUrl: '/v1/files/token-2',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }))
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }));
    const client = new EngineClient(3456);

    await expect(
      client.withRegisteredFile({ source: '/media/movie.mkv', purpose: 'subtitle' }, async (file) =>
        file.token.toUpperCase(),
      ),
    ).resolves.toBe('TOKEN-2');
    await expect(
      client.withRegisteredFile('/media/movie.mkv', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const unregisterCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter((call) => String((call[1] as RequestInit).body).includes('unregister'));
    expect(unregisterCalls).toHaveLength(2);

    fetchMock.mockRestore();
  });

  it('resolves path variables before registering files', async () => {
    const registered: RegisteredFile = {
      token: 'token-3',
      fileSizeBytes: 64,
      mimeType: 'audio/flac',
      purpose: 'media-decode',
      rangeUrl: '/v1/files/token-3',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dispatchResponse(registered));
    const client = new EngineClient(3456);
    client.setPathResolver(new PathResolver(new Map([['A', '/library']])));

    await expect(
      client.registerFile({ filePath: '${A}/audio/song.flac', purpose: 'media-decode' }),
    ).resolves.toEqual(registered);

    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'files',
        action: 'register',
        options: { filePath: '/library/audio/song.flac', purpose: 'media-decode' },
      }),
    );

    fetchMock.mockRestore();
  });

  it('rejects workspace-relative file access before engine dispatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new EngineClient(3456);
    client.setPathResolver(new PathResolver(new Map([['A', '/library']])));

    await expect(
      client.registerFile({ filePath: 'audio/song.flac', purpose: 'media-decode' }),
    ).rejects.toThrow('workspace-relative paths require source document context');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it('rejects unresolved file access variables before engine dispatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new EngineClient(3456);

    await expect(
      client.registerFile({ filePath: '${MISSING}/song.flac', purpose: 'media-decode' }),
    ).rejects.toThrow('unresolved path variables require source document context');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it('rejects workspace-relative media execution sources before engine dispatch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new EngineClient(3456);

    await expect(client.probe('videos', 'cases/1080P.mp4')).rejects.toThrow(
      'workspace-relative paths require source document context',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it('reads byte ranges through the general file route', async () => {
    const rangeBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(rangeBytes, { status: 206 }));
    const client = new EngineClient(3456);
    const signal = new AbortController().signal;

    await expect(client.readFileRange('token/1', 4, 6, signal)).resolves.toEqual(rangeBytes);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3456/v1/files/token%2F1',
      expect.objectContaining({ headers: { Range: 'bytes=4-6' }, signal }),
    );

    fetchMock.mockRestore();
  });
});
