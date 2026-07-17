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
});
