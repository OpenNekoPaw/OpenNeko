import { describe, expect, it } from 'vitest';
import { createFakeExternalResearchProvider } from '../capability/fake-external-research-provider';

describe('createFakeExternalResearchProvider', () => {
  it('returns deterministic cited search and fetch results', async () => {
    const provider = createFakeExternalResearchProvider({ id: 'fake:test' });

    await expect(
      provider.search(
        { query: 'kimono silhouettes', mode: 'indexed', maxResults: 5 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      query: 'kimono silhouettes',
      providerId: 'fake:test',
      mode: 'indexed',
      sources: [
        expect.objectContaining({
          url: 'https://research.example.test/search/kimono%20silhouettes',
          providerId: 'fake:test',
          mode: 'indexed',
          searchedAt: '2026-07-10T00:00:00.000Z',
        }),
      ],
    });

    await expect(
      provider.fetch(
        { url: 'https://example.com/source', mode: 'live', maxContentTokens: 12000 },
        new AbortController().signal,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        url: 'https://example.com/source',
        providerId: 'fake:test',
        mode: 'live',
        source: expect.objectContaining({ providerId: 'fake:test', mode: 'live' }),
      }),
    );
  });

  it('fails visibly when cancelled', async () => {
    const provider = createFakeExternalResearchProvider();
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.search({ query: 'x', mode: 'indexed', maxResults: 1 }, controller.signal),
    ).rejects.toThrow('External research request aborted.');
  });
});
