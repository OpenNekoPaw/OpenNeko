import { describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from './storage';

describe('global storage layout', () => {
  it('keeps Media Library connections separate from Asset Library storage', () => {
    const layout = resolveGlobalStorageLayout('/Users/fixture');

    expect(layout.assets).toBe('/Users/fixture/.neko/assets');
    expect(layout.mediaLibraries).toBe('/Users/fixture/.neko/media-libraries');
    expect(layout.mediaLibraries).not.toBe(layout.assets);
  });
});
