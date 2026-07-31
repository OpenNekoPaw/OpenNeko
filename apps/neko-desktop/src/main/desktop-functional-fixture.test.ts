import { describe, expect, it } from 'vitest';
import { resolveDesktopRuntimeHome } from './desktop-functional-fixture';

describe('Desktop functional fixture home', () => {
  it('keeps the system home for ordinary Desktop startup', () => {
    expect(
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: [],
        environment: {},
      }),
    ).toBe('/Users/example');
  });

  it('accepts only an explicitly enabled, isolated absolute fixture root', () => {
    expect(
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: ['--openneko-functional-fixture'],
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_HOME:
            '/private/tmp/openneko-desktop-functional-library-browser',
        },
      }),
    ).toBe('/private/tmp/openneko-desktop-functional-library-browser');

    for (const environment of [
      { OPENNEKO_DESKTOP_FUNCTIONAL_HOME: 'relative-fixture' },
      { OPENNEKO_DESKTOP_FUNCTIONAL_HOME: '/Users/example' },
    ]) {
      expect(() =>
        resolveDesktopRuntimeHome({
          systemHome: '/Users/example',
          argv: ['--openneko-functional-fixture'],
          environment,
        }),
      ).toThrow('functional fixture home');
    }
  });

  it('rejects an environment override without the explicit fixture argument', () => {
    expect(() =>
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: [],
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_HOME:
            '/private/tmp/openneko-desktop-functional-library-browser',
        },
      }),
    ).toThrow('explicit fixture argument');
  });
});
