import { describe, expect, it, vi } from 'vitest';

import { executeTextEmbedding } from './textEmbeddingRuntime';

const provider = {
  id: 'newapi',
  name: 'newapi',
  displayName: 'NewAPI',
  type: 'newapi' as const,
  apiUrl: 'https://gateway.example/v1',
  enabled: true,
  protocolProfile: 'newapi' as const,
  requiresApiKey: true,
};
const model = {
  id: 'embedding-model',
  name: 'text-embedding-3-small',
  providerId: 'newapi',
  type: 'llm' as const,
  capabilities: ['embedding'],
  enabled: true,
};

describe('executeTextEmbedding', () => {
  it('executes an exact NewAPI/OpenAI-compatible embedding binding', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      executeTextEmbedding(
        {
          purpose: 'text.embed',
          provider,
          model,
          credential: { type: 'api_key', key: 'secret' },
        },
        ['first', 'second'],
        { fetch },
      ),
    ).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(fetch).toHaveBeenCalledWith('https://gateway.example/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: ['first', 'second'] }),
    });
  });

  it('executes Ollama embeddings without a credential', async () => {
    const fetch = vi.fn(async (_url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body)) as { prompt: string };
      return new Response(
        JSON.stringify({ embedding: body.prompt === 'first' ? [0.1] : [0.2] }),
        { status: 200 },
      );
    });

    await expect(
      executeTextEmbedding(
        {
          purpose: 'text.embed',
          provider: {
            ...provider,
            id: 'ollama',
            name: 'ollama',
            type: 'ollama',
            apiUrl: 'http://localhost:11434/api',
            protocolProfile: 'ollama',
            requiresApiKey: false,
          },
          model: { ...model, providerId: 'ollama', name: 'nomic-embed-text' },
        },
        ['first', 'second'],
        { fetch: fetch as typeof globalThis.fetch },
      ),
    ).resolves.toEqual([[0.1], [0.2]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails visibly when an exact embedding credential is missing', async () => {
    const fetch = vi.fn();
    await expect(
      executeTextEmbedding({ purpose: 'text.embed', provider, model }, ['text'], { fetch }),
    ).rejects.toThrow('has no credential');
    expect(fetch).not.toHaveBeenCalled();
  });
});
