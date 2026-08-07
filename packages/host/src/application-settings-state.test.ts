import { describe, expect, it } from 'vitest';

import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from './application-settings-contract';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
  readDesktopApplicationSettingsStateDiagnostics,
  serializeDesktopApplicationSettingsStoredState,
} from './application-settings-state';

describe('Desktop application settings state codec', () => {
  it('creates Desktop-only defaults without Agent configuration', () => {
    expect(createDefaultDesktopApplicationSettingsState()).toEqual({
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    });
  });

  it('preserves current preferences and unknown root metadata independently', () => {
    const state = {
      preferences: {
        theme: 'light',
        locale: 'system',
        startupTarget: 'restore',
        resourceBrowserView: 'list',
      },
      opaqueSourceMarker: { source: 'settings-fixture' },
    };

    const parsed = parseDesktopApplicationSettingsStoredState(state);

    expect(parsed).toMatchObject({ preferences: { startupTarget: 'restore' } });
    expect(readDesktopApplicationSettingsStateDiagnostics(parsed)).toEqual([
      {
        code: 'desktop-stored-state-metadata-retained',
        severity: 'warning',
        authorityKey: 'desktop.application-settings',
        fieldNames: ['opaqueSourceMarker'],
        message: expect.stringContaining('opaqueSourceMarker'),
      },
    ]);
    expect(serializeDesktopApplicationSettingsStoredState(parsed)).toEqual(state);
  });

  it('rejects settings whose required preferences are invalid', () => {
    expect(() =>
      parseDesktopApplicationSettingsStoredState({
        preferences: {
          ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          theme: 'unknown-theme',
        },
      }),
    ).toThrow();
    expect(() => parseDesktopApplicationSettingsStoredState({})).toThrow();
  });
});
