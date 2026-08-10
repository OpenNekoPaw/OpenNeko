import { describe, expect, it } from 'vitest';
import { createMediaPlatform } from '../index';

describe('createMediaPlatform', () => {
  it('exposes only the canonical media generation service', () => {
    const platform = createMediaPlatform({
      configManager: {
        getProvider: () => undefined,
        getModel: () => undefined,
        getDefaultModelRef: () => undefined,
      },
      providerResolver: { resolveProvider: async () => undefined },
    });

    expect(Object.keys(platform)).toEqual(['service']);
    expect(platform.service).toBeDefined();
  });
});
