import { describe, expect, it } from 'vitest';
import { resolveProvider } from './resolve';

describe('resolveProvider', () => {
  it('does not synthesize unsupported media providers', () => {
    expect(
      resolveProvider('fal', { apiUrl: 'https://api.example.test', apiKey: 'test-key' }),
    ).toBeNull();
  });

  it('resolves native OpenAI-compatible paths without requiring a package media adapter', () => {
    const config = { apiUrl: 'https://api.example.test', apiKey: 'test-key' };

    expect(resolveProvider('openai', config)).toMatchObject({ type: 'openai', source: 'native' });
    expect(resolveProvider('newapi', config)).toMatchObject({ type: 'newapi', source: 'native' });
    expect(resolveProvider('oneapi', config)).toMatchObject({ type: 'oneapi', source: 'native' });
    expect(resolveProvider('generic', config)).toMatchObject({
      type: 'generic',
      source: 'native',
    });
    expect(resolveProvider('xai', config)).toMatchObject({ type: 'xai', source: 'native' });
  });

  it('resolves Kling through the compatible native path', () => {
    const resolved = resolveProvider('kling', {
      apiUrl: 'https://api.example.test',
      apiKey: 'test-key',
    });

    expect(resolved).toMatchObject({ type: 'kling', source: 'native' });
  });

  it('resolves H3 and Seedance as native async video models', () => {
    const minimax = resolveProvider('minimax', {
      apiUrl: 'https://api.minimaxi.com/v2',
      apiKey: 'test-key',
    });
    const bytedance = resolveProvider('bytedance', {
      apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'test-key',
    });

    expect(minimax?.video('MiniMax-H3')).toMatchObject({
      specificationVersion: 'v4',
      provider: 'minimax',
      modelId: 'MiniMax-H3',
    });
    expect(bytedance?.video('doubao-seedance-2-0-260128')).toMatchObject({
      specificationVersion: 'v4',
      modelId: 'doubao-seedance-2-0-260128',
    });
  });
});
