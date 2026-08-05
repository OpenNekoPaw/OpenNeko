import { describe, expect, it } from 'vitest';

import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from './application-settings-contract';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from './application-settings-state';

describe('Desktop application settings state codec', () => {
  it('creates Desktop-only defaults without Agent configuration', () => {
    expect(createDefaultDesktopApplicationSettingsState()).toEqual({
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    });
  });

  it('preserves current restore preferences and rejects adjacent authorities', () => {
    expect(
      parseDesktopApplicationSettingsStoredState({
        preferences: {
          theme: 'light',
          locale: 'system',
          startupTarget: 'restore',
          resourceBrowserView: 'list',
        },
      }),
    ).toMatchObject({ preferences: { startupTarget: 'restore' } });
    expect(() =>
      parseDesktopApplicationSettingsStoredState({
        preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
        agent: {},
      }),
    ).toThrow('unexpected fields');
  });
});
