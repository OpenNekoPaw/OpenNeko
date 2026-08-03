import { describe, expect, it } from 'vitest';

import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from './application-settings-contract';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from './application-settings-state';

describe('Desktop application settings state codec', () => {
  it('creates Desktop-only defaults without Agent configuration', () => {
    expect(createDefaultDesktopApplicationSettingsState()).toEqual({
      schemaVersion: 2,
      storageRevision: 0,
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    });
  });

  it('migrates the pre-release restore default to Home without discarding other preferences', () => {
    expect(
      parseDesktopApplicationSettingsStoredState({
        schemaVersion: 1,
        storageRevision: 8,
        preferences: {
          theme: 'dark',
          locale: 'zh-cn',
          startupTarget: 'restore',
          resourceBrowserView: 'grid',
        },
      }),
    ).toEqual({
      schemaVersion: 2,
      storageRevision: 8,
      preferences: {
        theme: 'dark',
        locale: 'zh-cn',
        startupTarget: 'home',
        resourceBrowserView: 'grid',
      },
    });
  });

  it('preserves current restore preferences and rejects adjacent authorities', () => {
    expect(
      parseDesktopApplicationSettingsStoredState({
        schemaVersion: 2,
        storageRevision: 9,
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
        schemaVersion: 2,
        storageRevision: 9,
        preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
        agent: {},
      }),
    ).toThrow('unexpected fields');
  });
});
