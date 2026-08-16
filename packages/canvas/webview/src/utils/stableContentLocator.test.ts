import { describe, expect, it } from 'vitest';
import {
  readCanonicalContentLocator,
  readCanonicalContentLocatorKey,
} from './stableContentLocator';

describe('stable ContentLocator projection', () => {
  it('returns the same identity key for equivalent decoded locator objects', () => {
    const first = { kind: 'workspace-file', path: 'cases/test.mp4' };
    const second = structuredClone(first);

    expect(readCanonicalContentLocatorKey(first)).toBe(readCanonicalContentLocatorKey(second));
    expect(readCanonicalContentLocator(first)).toEqual(second);
  });

  it('does not project an invalid locator into media effects', () => {
    const invalid = { kind: 'workspace-file', path: '/Users/example/test.mp4' };

    expect(readCanonicalContentLocatorKey(invalid)).toBeUndefined();
    expect(readCanonicalContentLocator(invalid)).toBeUndefined();
  });

  it('projects a mounted Media Library workspace path as one canonical durable locator', () => {
    const mounted = { kind: 'workspace-file', path: 'neko/assets/References/cover.png' };

    expect(readCanonicalContentLocator(mounted)).toEqual(mounted);
    expect(readCanonicalContentLocatorKey(mounted)).toBeDefined();
  });
});
