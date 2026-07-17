import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewAPIImageModel } from './newapi-image-model';

describe('NewAPIImageModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not forward prompt-only style hints to the standard image generation endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        created: 0,
        data: [{ b64_json: 'image-bytes' }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const model = new NewAPIImageModel('gpt-image-2', {
      apiUrl: 'https://www.nekoapi.com/v1',
      apiKey: 'test-key',
    });

    await model.doGenerate({
      prompt: 'A playful cat. Style: natural',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {
        neko: {
          style: 'natural',
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    const init = calls[0]?.[1];
    if (!init) throw new Error('Expected NewAPI image generation to call fetch with init');
    expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(init.body))).toEqual(
      expect.not.objectContaining({ style: 'natural' }),
    );
  });

  it('normalizes DALL-E style quality hints for GPT image models', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        created: 0,
        data: [{ b64_json: 'image-bytes' }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const model = new NewAPIImageModel('gpt-image-2', {
      apiUrl: 'https://www.nekoapi.com/v1',
      apiKey: 'test-key',
    });

    await model.doGenerate({
      prompt: 'A playful cat',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {
        neko: {
          quality: 'hd',
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    const init = calls[0]?.[1];
    if (!init) throw new Error('Expected NewAPI image generation to call fetch with init');
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ quality: 'high' }));
  });

  it('downloads a same-origin URL-only result with provider authorization', async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/images/generations')) {
        return new Response(
          JSON.stringify({
            created: 0,
            data: [{ url: 'https://93.184.216.34/generated.png' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://93.184.216.34/generated.png') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key');
        return new Response(null, {
          status: 302,
          headers: { location: 'https://93.184.216.35/generated.png' },
        });
      }
      if (url === 'https://93.184.216.35/generated.png') {
        expect(new Headers(init?.headers).get('authorization')).toBeNull();
        return new Response(png, {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': String(png.byteLength) },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const model = new NewAPIImageModel('gpt-image-2', {
      apiUrl: 'https://93.184.216.34/v1',
      apiKey: 'test-key',
    });

    const result = await model.doGenerate({
      prompt: 'A playful cat',
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: undefined,
    });

    expect(result.images).toEqual([png]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
