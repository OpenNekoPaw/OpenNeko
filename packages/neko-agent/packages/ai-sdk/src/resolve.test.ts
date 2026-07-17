import { describe, expect, it } from 'vitest';
import { resolveProvider } from './resolve';

describe('resolveProvider', () => {
  it('does not synthesize unsupported media providers', () => {
    expect(
      resolveProvider('fal', { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' }),
    ).toBeNull();
  });

  it('resolves native OpenAI-compatible paths without requiring a package media adapter', () => {
    const config = { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' };

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
    const resolved = resolveProvider(
      'kling',
      { apiUrl: 'https://api.example.test/v1', apiKey: 'test-key' },
    );

    expect(resolved).toMatchObject({ type: 'kling', source: 'native' });
  });
});
