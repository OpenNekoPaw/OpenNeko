import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEmbedFn } from '../toolBootstrap';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const mocks = vi.hoisted(() => {
  const rootLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  rootLogger.child.mockReturnValue(rootLogger);
  return { rootLogger };
});

vi.mock('../../base', () => ({
  getRootLogger: () => mocks.rootLogger,
  getLogger: () => mocks.rootLogger,
}));

afterEach(() => vi.unstubAllGlobals());

describe('toolBootstrap', () => {
  it('executes only the explicit text.embed binding with shared credentials', async () => {
    const provider = {
      id: 'newapi',
      name: 'newapi',
      displayName: 'NewAPI',
      type: 'newapi',
      apiUrl: 'https://gateway.example/v1',
      enabled: true,
      protocolProfile: 'newapi',
      requiresApiKey: true,
    };
    const model = {
      id: 'embed-model',
      name: 'text-embedding-3-small',
      providerId: 'newapi',
      capabilities: ['embedding'],
      enabled: true,
    };
    const config = {
      resolveModelRefForPurpose: vi.fn(() => ({ providerId: 'newapi', modelId: 'embed-model' })),
      getProvider: vi.fn(() => provider),
      getModel: vi.fn(() => model),
    };
    const credentials = {
      replace: vi.fn(),
      read: vi.fn(async () => ({ type: 'api_key', key: 'secret' })),
    };
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] })),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(buildEmbedFn(config as never, credentials as never)(['text'])).resolves.toEqual([
      [0.1, 0.2],
    ]);
    expect(config.resolveModelRefForPurpose).toHaveBeenCalledWith('text.embed');
    expect(fetch).toHaveBeenCalledWith(
      'https://gateway.example/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ model: 'text-embedding-3-small', input: ['text'] }),
      }),
    );
  });

  it('does not fall back when text.embed has no explicit binding', async () => {
    const config = {
      resolveModelRefForPurpose: vi.fn(() => undefined),
      getProvider: vi.fn(),
      getModel: vi.fn(),
    };

    await expect(buildEmbedFn(config as never, {} as never)(['text'])).rejects.toThrow(
      'No explicit model binding is configured for text.embed.',
    );
    expect(config.getProvider).not.toHaveBeenCalled();
    expect(config.getModel).not.toHaveBeenCalled();
  });
});
