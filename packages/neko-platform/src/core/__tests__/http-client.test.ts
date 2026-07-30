import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, HttpClientError } from '../http-client';

describe('HttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wraps fetch network failures with cause and a sanitized URL', async () => {
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const fetchError = Object.assign(new TypeError('fetch failed'), { cause });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));

    const client = createHttpClient();

    await expect(
      client.request({
        method: 'POST',
        url: 'https://user:secret@gateway.example.test/v1/chat/completions?token=secret',
        headers: { Authorization: 'Bearer secret' },
        body: { model: 'gpt-5.5' },
      }),
    ).rejects.toMatchObject({
      name: 'HttpClientError',
      code: 'NETWORK_ERROR',
      retryable: true,
      url: 'https://gateway.example.test/v1/chat/completions?<redacted>',
      message: expect.stringContaining('cause=ECONNRESET: socket hang up'),
    } satisfies Partial<HttpClientError>);
  });
});
